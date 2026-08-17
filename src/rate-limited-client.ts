import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import {
  readToastRateLimitObservation,
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
  const coordinator = options.rateLimitCoordinator ?? new ToastRateLimitCoordinator();
  const underlyingFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const maxWaitMs = options.maxRateLimitWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS;

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
  };

  return createToastHttpClient(config, tokenManager, {
    ...options,
    fetch: coordinatedFetch,
  });
}

/**
 * Current Toast headers take precedence, but the reviewed transport's public
 * snapshot API still reads the historical unprefixed names. Mirror the
 * current values into those aliases on the Response handed to the transport.
 * This keeps the compatibility API useful without letting a legacy header
 * override an authoritative current value.
 */
function withCurrentRateLimitAliases(response: Response): Response {
  const headers = new Headers(response.headers);
  mirrorCurrentHeader(
    headers,
    "x-toast-ratelimit-remaining",
    "toast-ratelimit-remaining",
  );
  mirrorCurrentHeader(
    headers,
    "x-toast-ratelimit-reset",
    "toast-ratelimit-reset",
  );
  mirrorCurrentHeader(
    headers,
    "x-toast-ratelimit-limit",
    "toast-ratelimit-limit",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function mirrorCurrentHeader(
  headers: Headers,
  currentName: string,
  legacyName: string,
): void {
  const current = headers.get(currentName);
  if (current !== null) {
    headers.set(legacyName, current);
  }
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
