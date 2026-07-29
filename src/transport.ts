import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_CONFIGURATION_PAGE_COUNT = 100;
const DEFAULT_MAX_CONFIGURATION_RESTARTS = 1;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;

/**
 * Ceiling on any server-derived wait — a `Retry-After` value, a
 * `Toast-RateLimit-Reset` value fed back from a prior response, or the
 * corresponding absolute reset time replayed by `#waitForKnownRateLimit`
 * before a later request even attempts to fetch.
 *
 * `#maxRetryDelayMs` only ever bounded the client's own exponential/jitter
 * component; `Math.max(serverDelayMs ?? 0, jitteredDelayMs)` let an
 * unbounded server-supplied value dominate it completely. A `Retry-After:
 * 86400` or a stored reset 24 hours out produced sleeps of 86,400,000 ms —
 * in a locally run `stdio` server, an indefinite hang with no output.
 *
 * T0 research (`docs/research/toast-api-reporting-landscape.md`) documents
 * no per-call wait anywhere near this long; the longest documented Standard
 * API rate-limit window is the global 10,000-requests-per-15-minutes
 * ceiling. 15 minutes (900,000 ms) is chosen as a generous ceiling that
 * comfortably covers any plausible in-window wait this project's Standard
 * API traffic could legitimately be asked to honor, while still rejecting
 * the class of implausible values (a corrupted header, a hostile stand-in,
 * or a Toast-side incident reporting a reset far outside any documented
 * window) that would otherwise hang the process silently. Per AGENTS.md
 * rule 11, a wait beyond this ceiling fails closed with a structured,
 * non-retryable error instead of sleeping past it — surfacing loudly beats
 * hanging silently. See T1-004-R1-F2.
 */
const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type ToastApiFamily = "standard";

export interface ToastGetJsonRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly rateLimitKey: string;
  readonly apiFamily?: ToastApiFamily;
}

export interface ToastConfigurationPagesRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly rateLimitKey: string;
  readonly maxPages?: number;
  readonly maxRestarts?: number;
}

export interface ToastRateLimitSnapshot {
  readonly apiFamily: ToastApiFamily;
  readonly restaurantGuid: string;
  readonly key: string;
  readonly limit: number | undefined;
  readonly remaining: number | undefined;
  readonly resetAtEpochMs: number | undefined;
  readonly retryAfterEpochMs: number | undefined;
  readonly updatedAtEpochMs: number;
}

export type ToastHttpErrorCode =
  | "configuration_page_bound_exceeded"
  | "configuration_page_restart_exceeded"
  | "configuration_page_token_repeated"
  | "rate_limit_wait_exceeded"
  | "request_failed"
  | "request_network_error"
  | "response_invalid_json"
  | "token_acquisition_failed";

export class ToastHttpError extends Error {
  readonly apiFamily: ToastApiFamily;
  readonly code: ToastHttpErrorCode;
  readonly retryable: boolean;
  readonly upstreamRequestId: string | undefined;
  readonly upstreamStatus: number | undefined;

  constructor(
    code: ToastHttpErrorCode,
    message: string,
    options: {
      readonly apiFamily: ToastApiFamily;
      readonly retryable: boolean;
      readonly upstreamRequestId?: string;
      readonly upstreamStatus?: number;
    },
  ) {
    super(message);
    this.name = "ToastHttpError";
    this.apiFamily = options.apiFamily;
    this.code = code;
    this.retryable = options.retryable;
    this.upstreamRequestId = options.upstreamRequestId;
    this.upstreamStatus = options.upstreamStatus;
  }
}

export interface ToastHttpClientOptions {
  readonly baseRetryDelayMs?: number;
  readonly fetch?: typeof fetch;
  readonly maxAttempts?: number;
  readonly maxConfigurationPages?: number;
  readonly maxConfigurationRestarts?: number;
  readonly maxRateLimitWaitMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export class ToastHttpClient {
  #baseRetryDelayMs: number;
  #config: RuntimeConfig;
  #fetch: typeof fetch;
  #maxAttempts: number;
  #maxConfigurationPages: number;
  #maxConfigurationRestarts: number;
  #maxRateLimitWaitMs: number;
  #maxRetryDelayMs: number;
  #now: () => number;
  #random: () => number;
  #rateLimits = new Map<string, ToastRateLimitSnapshot>();
  #sleep: (milliseconds: number) => Promise<void>;
  #tokenManager: OAuthTokenManager;

  constructor(
    config: RuntimeConfig,
    tokenManager: OAuthTokenManager,
    options: ToastHttpClientOptions = {},
  ) {
    this.#config = config;
    this.#tokenManager = tokenManager;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
    this.#sleep = options.sleep ?? defaultSleep;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#maxConfigurationPages =
      options.maxConfigurationPages ?? DEFAULT_MAX_CONFIGURATION_PAGE_COUNT;
    this.#maxConfigurationRestarts =
      options.maxConfigurationRestarts ?? DEFAULT_MAX_CONFIGURATION_RESTARTS;
    this.#baseRetryDelayMs =
      options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    this.#maxRetryDelayMs =
      options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.#maxRateLimitWaitMs =
      options.maxRateLimitWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS;

    if (this.#maxAttempts < 1) {
      throw new RangeError("ToastHttpClient maxAttempts must be at least 1.");
    }
    if (this.#maxConfigurationPages < 1) {
      throw new RangeError(
        "ToastHttpClient maxConfigurationPages must be at least 1.",
      );
    }
    if (this.#maxConfigurationRestarts < 0) {
      throw new RangeError(
        "ToastHttpClient maxConfigurationRestarts must be at least 0.",
      );
    }
  }

  async getJson(request: ToastGetJsonRequest): Promise<unknown> {
    return (await this.#requestJson(request)).body;
  }

  async getConfigurationPagesJson(
    request: ToastConfigurationPagesRequest,
  ): Promise<readonly unknown[]> {
    const maxPages = request.maxPages ?? this.#maxConfigurationPages;
    const maxRestarts = request.maxRestarts ?? this.#maxConfigurationRestarts;
    if (maxPages < 1) {
      throw new RangeError("Toast configuration maxPages must be at least 1.");
    }
    if (maxRestarts < 0) {
      throw new RangeError(
        "Toast configuration maxRestarts must be at least 0.",
      );
    }

    let restartCount = 0;

    for (;;) {
      const pages: unknown[] = [];
      const seenTokens = new Set<string>();
      let pageToken: string | undefined;

      for (;;) {
        if (pages.length >= maxPages) {
          throw new ToastHttpError(
            "configuration_page_bound_exceeded",
            "Toast configuration page-token traversal exceeded the configured page bound.",
            { apiFamily: "standard", retryable: false },
          );
        }

        try {
          const response = await this.#requestJson({
            path: request.path,
            restaurantGuid: request.restaurantGuid,
            query: { ...request.query, pageToken },
            rateLimitKey: request.rateLimitKey,
            apiFamily: "standard",
          });

          pages.push(response.body);

          const nextToken = response.headers.get("toast-next-page-token");
          if (nextToken === null || nextToken === "") {
            return Object.freeze([...pages]);
          }
          if (seenTokens.has(nextToken) || nextToken === pageToken) {
            throw new ToastHttpError(
              "configuration_page_token_repeated",
              "Toast configuration page-token traversal returned a repeated or non-progressing page token.",
              { apiFamily: "standard", retryable: false },
            );
          }

          seenTokens.add(nextToken);
          pageToken = nextToken;
        } catch (error) {
          if (
            error instanceof ToastHttpError &&
            error.upstreamStatus === 409
          ) {
            if (restartCount >= maxRestarts) {
              throw new ToastHttpError(
                "configuration_page_restart_exceeded",
                "Toast configuration page-token traversal exceeded the configured 409 restart budget.",
                {
                  apiFamily: "standard",
                  retryable: false,
                  upstreamStatus: 409,
                  ...(error.upstreamRequestId !== undefined
                    ? { upstreamRequestId: error.upstreamRequestId }
                    : {}),
                },
              );
            }

            restartCount += 1;
            break;
          }

          throw error;
        }
      }
    }
  }

  async #requestJson(request: ToastGetJsonRequest): Promise<{
    readonly body: unknown;
    readonly headers: Headers;
  }> {
    const apiFamily = request.apiFamily ?? "standard";
    const stateKey = rateLimitStateKey(
      apiFamily,
      request.restaurantGuid,
      request.rateLimitKey,
    );
    let lastError: ToastHttpError | undefined;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      await this.#waitForKnownRateLimit(stateKey);

      // Acquire the authorization header in its own try/catch, outside the
      // fetch-transport try below. `getAuthorizationHeader()` never reaches
      // the network when it throws (an expired/invalid credential, a token
      // endpoint failure already classified by `auth.ts`, and so on); it is a
      // credential/config failure, not a Toast Data API transport hiccup.
      // Letting it fall into the network catch mischaracterized a permanent
      // credential failure as `request_network_error` with `retryable: true`,
      // which retried something AGENTS.md rule 11 requires to fail closed
      // instead. Deliberately do not read or interpolate the caught value,
      // matching the sanitization discipline in `auth.ts`.
      let authorizationHeader: string;
      try {
        authorizationHeader = await this.#tokenManager.getAuthorizationHeader();
      } catch {
        throw new ToastHttpError(
          "token_acquisition_failed",
          "Toast data request could not acquire an authorization header before the request was attempted.",
          { apiFamily, retryable: false },
        );
      }

      let response: Response;
      try {
        response = await this.#fetch(this.#buildUrl(request), {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: authorizationHeader,
            "toast-restaurant-external-id": request.restaurantGuid,
          },
        });
      } catch {
        lastError = new ToastHttpError(
          "request_network_error",
          "Toast data request failed before a response was received.",
          { apiFamily, retryable: true },
        );

        await this.#sleepBeforeRetry(attempt, undefined, apiFamily);
        continue;
      }

      this.#recordRateLimit(
        stateKey,
        apiFamily,
        request.restaurantGuid,
        request.rateLimitKey,
        response,
      );

      if (!response.ok) {
        const retryable = RETRYABLE_STATUSES.has(response.status);
        lastError = new ToastHttpError(
          "request_failed",
          "Toast data request returned an unsuccessful HTTP status.",
          {
            apiFamily,
            retryable,
            upstreamStatus: response.status,
            ...requestIdMetadata(response),
          },
        );

        if (!retryable || attempt === this.#maxAttempts) {
          throw lastError;
        }

        await this.#sleepBeforeRetry(
          attempt,
          retryDelayFromHeaders(response, this.#now()),
          apiFamily,
        );
        continue;
      }

      try {
        return {
          body: await response.json(),
          headers: response.headers,
        };
      } catch {
        throw new ToastHttpError(
          "response_invalid_json",
          "Toast data request returned a response that was not valid JSON.",
          {
            apiFamily,
            retryable: false,
            upstreamStatus: response.status,
            ...requestIdMetadata(response),
          },
        );
      }
    }

    throw lastError ?? new ToastHttpError(
      "request_network_error",
      "Toast data request failed before a response was received.",
      { apiFamily, retryable: true },
    );
  }

  getRateLimitSnapshot(
    apiFamily: ToastApiFamily,
    restaurantGuid: string,
    key: string,
  ): ToastRateLimitSnapshot | undefined {
    return this.#rateLimits.get(
      rateLimitStateKey(apiFamily, restaurantGuid, key),
    );
  }

  #buildUrl(request: ToastGetJsonRequest): string {
    const url = new URL(`https://${this.#config.apiHostname}${request.path}`);

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  #recordRateLimit(
    stateKey: string,
    apiFamily: ToastApiFamily,
    restaurantGuid: string,
    key: string,
    response: Response,
  ): void {
    const now = this.#now();
    const retryAfterEpochMs = retryAfterEpochMsFromHeaders(response, now);
    const snapshot: ToastRateLimitSnapshot = Object.freeze({
      apiFamily,
      restaurantGuid,
      key,
      limit: numericHeader(response, "toast-ratelimit-limit"),
      remaining: numericHeader(response, "toast-ratelimit-remaining"),
      resetAtEpochMs: epochHeader(response, "toast-ratelimit-reset"),
      retryAfterEpochMs,
      updatedAtEpochMs: now,
    });

    this.#rateLimits.set(stateKey, snapshot);
  }

  async #sleepBeforeRetry(
    attempt: number,
    serverDelayMs: number | undefined,
    apiFamily: ToastApiFamily,
  ): Promise<void> {
    if (attempt >= this.#maxAttempts) {
      return;
    }

    // A server-derived delay (Retry-After, or a rate-limit reset fed back
    // from a prior response) is honored up to the ceiling, but never past
    // it — clamping it down to the ceiling and retrying early would ignore
    // what Toast asked for and risk repeating the exact violation that
    // triggered the wait. See T1-004-R1-F2 and DEFAULT_MAX_RATE_LIMIT_WAIT_MS.
    if (serverDelayMs !== undefined && serverDelayMs > this.#maxRateLimitWaitMs) {
      throw new ToastHttpError(
        "rate_limit_wait_exceeded",
        "Toast requested a retry wait longer than the configured rate-limit wait ceiling.",
        { apiFamily, retryable: false },
      );
    }

    const exponentialDelayMs = Math.min(
      this.#maxRetryDelayMs,
      this.#baseRetryDelayMs * 2 ** (attempt - 1),
    );
    const jitteredDelayMs = Math.floor(exponentialDelayMs * this.#random());
    await this.#sleep(Math.max(serverDelayMs ?? 0, jitteredDelayMs));
  }

  async #waitForKnownRateLimit(stateKey: string): Promise<void> {
    const snapshot = this.#rateLimits.get(stateKey);
    if (snapshot?.retryAfterEpochMs === undefined) {
      return;
    }

    const waitMs = snapshot.retryAfterEpochMs - this.#now();
    if (waitMs <= 0) {
      return;
    }

    // Same ceiling as #sleepBeforeRetry, applied pre-flight: a stored reset
    // far in the future must not block an unrelated later call for its
    // full duration. See T1-004-R1-F2.
    if (waitMs > this.#maxRateLimitWaitMs) {
      throw new ToastHttpError(
        "rate_limit_wait_exceeded",
        "A stored Toast rate-limit reset is further in the future than the configured rate-limit wait ceiling.",
        { apiFamily: snapshot.apiFamily, retryable: false },
      );
    }

    await this.#sleep(waitMs);
  }
}

export function createToastHttpClient(
  config: RuntimeConfig,
  tokenManager: OAuthTokenManager,
  options: ToastHttpClientOptions = {},
): ToastHttpClient {
  return new ToastHttpClient(config, tokenManager, options);
}

function requestIdMetadata(
  response: Response,
): { readonly upstreamRequestId?: string } {
  const upstreamRequestId = response.headers.get("toast-request-id");
  return upstreamRequestId !== null ? { upstreamRequestId } : {};
}

function retryDelayFromHeaders(
  response: Response,
  now: number,
): number | undefined {
  const retryAfterEpochMs = retryAfterEpochMsFromHeaders(response, now);
  return retryAfterEpochMs === undefined
    ? undefined
    : Math.max(0, retryAfterEpochMs - now);
}

function retryAfterEpochMsFromHeaders(
  response: Response,
  now: number,
): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter !== null) {
    // RFC 7231 permits `Retry-After` as either delta-seconds or an HTTP-date.
    // Try delta-seconds first; only a string of digits parses as a safe
    // non-negative integer here, so an HTTP-date (which begins with a day
    // name, e.g. "Wed, 21 Oct 2026 07:28:00 GMT") correctly falls through
    // to the Date.parse fallback below rather than being misread. Without
    // that fallback, an HTTP-date yielded NaN and the header was silently
    // ignored, producing a sleep of 0 for a wait Toast asked for an hour
    // out. The clamp in #sleepBeforeRetry / #waitForKnownRateLimit (see
    // DEFAULT_MAX_RATE_LIMIT_WAIT_MS, T1-004-R1-F2) applies to whichever
    // form resolves here.
    const seconds = Number.parseInt(retryAfter, 10);
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      return now + seconds * 1000;
    }

    const parsedDateEpochMs = Date.parse(retryAfter);
    if (!Number.isNaN(parsedDateEpochMs)) {
      return parsedDateEpochMs;
    }
  }

  return numericHeader(response, "toast-ratelimit-remaining") === 0
    ? epochHeader(response, "toast-ratelimit-reset")
    : undefined;
}

function numericHeader(response: Response, name: string): number | undefined {
  const raw = response.headers.get(name);
  if (raw === null) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Interprets a Toast rate-limit "reset" header (currently only
 * `toast-ratelimit-reset`) as an absolute point in time, never a relative
 * delta — an original implementation assumption, not sourced from Toast
 * documentation. See the "Rate-limit-reset header semantics" note in
 * `docs/research/toast-api-reporting-landscape.md` for the full reasoning
 * and its consequence (a genuinely relative-delta value would be
 * misinterpreted as an already-past absolute timestamp and silently never
 * trigger a wait). See T1-004-R1-F4.
 */
function epochHeader(response: Response, name: string): number | undefined {
  const parsed = numericHeader(response, name);
  if (parsed === undefined) {
    return undefined;
  }

  return parsed > 9_999_999_999 ? parsed : parsed * 1000;
}

/**
 * Sole constructor of rate-limit map keys.
 *
 * AGENTS.md rule 6 ("Location isolation is mandatory") requires every cache
 * key to be explicitly bound to a restaurant GUID. `restaurantGuid` was
 * previously used only for the outbound `toast-restaurant-external-id`
 * header and never entered the key derived here, so two distinct
 * restaurants sharing a `rateLimitKey` (for example `"ordersBulk"`) shared
 * one rate-limit bucket: location A's exhausted quota blocked location B.
 * See T1-004-R1-S1 / T1-004-R1-F7.
 *
 * `restaurantGuid` is a required, non-optional parameter — not a caller
 * convention — so a bare `apiFamily:key` state key can no longer be
 * constructed from this module at all. Every caller of this function (both
 * within this file) must supply it.
 */
function rateLimitStateKey(
  apiFamily: ToastApiFamily,
  restaurantGuid: string,
  key: string,
): string {
  return `${apiFamily}:${restaurantGuid}:${key}`;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
