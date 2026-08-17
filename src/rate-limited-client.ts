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
} from "./transport.js";

const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;
const UUID_PATH_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export interface RateLimitAwareToastHttpClientOptions extends ToastHttpClientOptions {
  /** Shared coordinator injection is useful for exact behavioral tests. */
  readonly rateLimitCoordinator?: ToastRateLimitCoordinator;
}

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

  // Serializing only the Standard-data fetch seam makes each completed Toast
  // response visible to the coordinator before another data request performs
  // its preflight. This closes the concurrent-handler race without inventing
  // request reservations or decrementing quota values Toast did not report.
  // OAuth token exchange is outside this queue and has its own Toast limits.
  let fetchTail: Promise<void> = Promise.resolve();

  const coordinatedFetch: typeof fetch = async (input, init) =>
    withSerializedTurn(fetchTail, (nextTail) => {
      fetchTail = nextTail;
    }, async () => {
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

      const waitMs = coordinator.waitMilliseconds(context, now());
      if (waitMs > maxWaitMs) {
        // Return a static synthetic 429 through the normal Toast transport path
        // instead of throwing from fetch. `ToastHttpClient` will apply its
        // existing server-wait ceiling and surface `rate_limit_wait_exceeded`
        // without misclassifying this as a network error or leaking state.
        return new Response("{}", {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(Math.ceil(waitMs / 1000)),
          },
        });
      }
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      const response = await underlyingFetch(input, init);
      coordinator.record(
        context,
        readToastRateLimitObservation(response, now()),
      );

      return withCurrentRateLimitAliases(response);
    });

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
