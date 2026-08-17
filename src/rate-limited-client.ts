import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import {
  readToastRateLimitLimit,
  readToastRateLimitObservation,
  readToastRateLimitRemaining,
  readToastRateLimitResetAtEpochMs,
  ToastRateLimitCoordinator,
  toastApiKeyFromPath,
} from "./rate-limit.js";
import {
  createToastHttpClient,
  type ToastHttpClient,
  type ToastHttpClientOptions,
  ToastRateLimitPreflightError,
} from "./transport.js";

const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface RateLimitAwareToastHttpClientOptions extends ToastHttpClientOptions {
  /** Shared coordinator injection is useful for exact behavioral tests. */
  readonly rateLimitCoordinator?: ToastRateLimitCoordinator;
}

type SerializedFetchDecision =
  | { readonly kind: "wait"; readonly milliseconds: number }
  | { readonly kind: "response"; readonly response: Response };

/**
 * Production constructor for the Standard Toast transport.
 *
 * The underlying `ToastHttpClient` remains the sole owner of OAuth header
 * attachment, retry behavior, pagination, JSON parsing, public snapshots, and
 * error normalization. This factory wraps only its fetch seam so current
 * Toast hierarchy observations can coordinate *all* request paths issued by
 * that one process-owned client.
 */
export function createRateLimitAwareToastHttpClient(
  config: RuntimeConfig,
  tokenManager: OAuthTokenManager,
  options: RateLimitAwareToastHttpClientOptions = {},
): ToastHttpClient {
  const {
    rateLimitCoordinator,
    ...transportOptions
  } = options;
  const coordinator = rateLimitCoordinator ?? new ToastRateLimitCoordinator();
  const underlyingFetch = transportOptions.fetch ?? fetch;
  const now = transportOptions.now ?? Date.now;
  const sleep = transportOptions.sleep ?? defaultSleep;
  const maxWaitMs =
    transportOptions.maxRateLimitWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS;

  // Each actual Standard-data fetch is serialized through the point where its
  // response headers are observed. Positive rate-limit sleeps are deliberately
  // outside the turn: a waiting restaurant releases the queue, sleeps, then
  // re-enters and rechecks, so an unrelated location does not inherit its
  // delay. OAuth token exchange is outside this queue and has separate limits.
  let fetchTail: Promise<void> = Promise.resolve();

  const coordinatedFetch: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );
    const headers = new Headers(init?.headers);
    const restaurantGuid =
      headers.get("toast-restaurant-external-id")?.toLowerCase() ?? undefined;
    const context = Object.freeze({
      restaurantGuid,
      apiKey: toastApiKeyFromPath(url.pathname as `/${string}`),
      endpointKey: endpointKeyFromPath(url.pathname),
    });

    for (;;) {
      const decision = await withSerializedTurn(
        fetchTail,
        (nextTail) => {
          fetchTail = nextTail;
        },
        async (): Promise<SerializedFetchDecision> => {
          const waitMs = coordinator.waitMilliseconds(context, now());
          if (waitMs > maxWaitMs) {
            // Throw a dedicated internal preflight error before any upstream
            // request. ToastHttpClient preserves only this exact subclass;
            // every unrelated custom-fetch exception stays a network error.
            throw new ToastRateLimitPreflightError();
          }
          if (waitMs > 0) {
            return { kind: "wait", milliseconds: waitMs };
          }

          const response = await underlyingFetch(input, init);
          coordinator.record(
            context,
            readToastRateLimitObservation(response, now()),
          );

          return {
            kind: "response",
            response: withCurrentRateLimitAliases(response),
          };
        },
      );

      if (decision.kind === "response") {
        return decision.response;
      }

      // Sleep after releasing the serialized turn, then re-enter and recheck
      // because another request may have updated this constraint meanwhile.
      await sleep(decision.milliseconds);
    }
  };

  return createToastHttpClient(config, tokenManager, {
    ...transportOptions,
    fetch: coordinatedFetch,
  });
}

/**
 * Run one task after the previous serialized Standard-data fetch has fully
 * returned and published its rate-limit observation. `tail` never inherits a
 * task rejection: the release promise is resolved in `finally`, so a network
 * failure cannot deadlock every later request.
 */
async function withSerializedTurn<T>(
  tail: Promise<void>,
  publishTail: (tail: Promise<void>) => void,
  task: () => Promise<T>,
): Promise<T> {
  let release!: () => void;
  const currentTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previousTurn = tail;
  publishTail(previousTurn.then(() => currentTurn));

  await previousTurn;
  try {
    return await task();
  } finally {
    release();
  }
}

/**
 * Current Toast headers take precedence, but the reviewed transport's public
 * snapshot API still reads the historical unprefixed names. Mirror only
 * successfully parsed current values. If a current header is present but
 * malformed, delete the legacy alias rather than letting the old permissive
 * parser reinterpret malformed authoritative data.
 */
function withCurrentRateLimitAliases(response: Response): Response {
  const headers = new Headers(response.headers);
  mirrorCurrentNumericHeader(
    response,
    headers,
    "x-toast-ratelimit-remaining",
    "toast-ratelimit-remaining",
    readToastRateLimitRemaining(response),
  );
  mirrorCurrentNumericHeader(
    response,
    headers,
    "x-toast-ratelimit-reset",
    "toast-ratelimit-reset",
    readToastRateLimitResetAtEpochMs(response),
  );
  mirrorCurrentNumericHeader(
    response,
    headers,
    "x-toast-ratelimit-limit",
    "toast-ratelimit-limit",
    readToastRateLimitLimit(response),
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function mirrorCurrentNumericHeader(
  response: Response,
  headers: Headers,
  currentName: string,
  legacyName: string,
  parsedValue: number | undefined,
): void {
  if (response.headers.get(currentName) === null) {
    return;
  }
  if (parsedValue === undefined) {
    headers.delete(legacyName);
    return;
  }
  headers.set(legacyName, String(parsedValue));
}

/**
 * Normalize entity identifiers out of endpoint identity. `/payments/A` and
 * `/payments/B` are one endpoint constraint; `/payments` and `/ordersBulk`
 * remain distinct.
 */
function endpointKeyFromPath(pathname: string): string {
  return pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => UUID_PATH_SEGMENT.test(segment) ? ":id" : segment.toLowerCase())
    .join("/");
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
