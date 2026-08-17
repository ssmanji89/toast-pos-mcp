import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 250;
const PARTNERS_ACCESSIBLE_RESTAURANTS_PATH = "/partners/v1/restaurants";
const PARTNERS_ACCESSIBLE_RESTAURANTS_RATE_LIMIT_KEY = "partnersAccessibleRestaurants";

/**
 * `DEFAULT_MAX_CONFIGURATION_PAGE_COUNT` and `DEFAULT_MAX_CONFIGURATION_RESTARTS`
 * compose with `DEFAULT_MAX_ATTEMPTS` (`#requestJson`'s own per-request retry
 * ceiling) into the true worst-case raw fetch-call count for a single
 * `getConfigurationPagesJson` traversal. Each page-token traversal attempt
 * fetches at most `maxPages` pages; a scoped 409 restart (see
 * `getConfigurationPagesDetailed`) discards the partial page set and starts a
 * fresh traversal attempt, up to `maxRestarts` times, so the traversal
 * fetches at most `maxPages * (maxRestarts + 1)` page requests. Every one of
 * those page requests is itself retried by `#requestJson` up to
 * `maxAttempts` times on a retryable status. With the defaults below
 * (`maxPages=100`, `maxRestarts=1`, `maxAttempts=3`), that is
 * `100 * (1 + 1) = 200` page-fetch attempts, composing to a true worst case
 * of `100 * 3 * 2 = 600` raw `fetch` calls. This is finite and bounded, and
 * in practice a single 409 or a run of retryable statuses is rare — but it
 * had never been written down anywhere before this comment. See
 * T1-005-R1-F5.
 */
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

/**
 * Ceiling on the caller-supplied 409 restart budget for configuration
 * page-token traversal (constructor-level `maxConfigurationRestarts` or the
 * per-call `maxRestarts` override).
 *
 * Unlike a `Retry-After` header or a rate-limit reset, this value is never
 * server-derived — it is always caller-supplied — so severity is lower than
 * `DEFAULT_MAX_RATE_LIMIT_WAIT_MS`. But it had no ceiling at all, only a
 * `>= 0` floor: an oversized value has no fail-closed signal of its own and
 * directly multiplies worst-case request count, because each restart
 * re-fetches the entire page set from scratch (up to `maxPages` requests,
 * each itself subject to `#requestJson`'s own `maxAttempts` retries — see
 * the composed worst-case comment beside `DEFAULT_MAX_CONFIGURATION_PAGE_COUNT`
 * and `DEFAULT_MAX_CONFIGURATION_RESTARTS` below).
 *
 * A scoped 409 restart exists for a transient event — a restaurant
 * publishing configuration changes mid-traversal — that is expected to
 * resolve within a handful of attempts; the default of 1 already covers
 * ordinary operation. This ceiling is generous relative to that default
 * (an order of magnitude higher) while still rejecting an implausible
 * caller-supplied value loudly, per AGENTS.md rule 11, rather than
 * silently admitting one that would blow up the composed worst case. See
 * T1-005-R1-F4.
 */
const MAX_ALLOWED_CONFIGURATION_RESTARTS = 10;

/**
 * `DEFAULT_MAX_ORDERS_BULK_PAGES` and `MAX_ALLOWED_ORDERS_BULK_PAGES` are the
 * `/ordersBulk` Link-traversal analog of `DEFAULT_MAX_CONFIGURATION_PAGE_COUNT`
 * above. `maxPages` was previously a required, fully caller-supplied field
 * with no default and no ceiling at all -- worst-case raw fetch count was
 * `maxPages * maxAttempts` with `maxPages` uncapped from either direction.
 * `/ordersBulk` has no 409-restart budget (`docs/architecture/public-use-
 * boundary.md` states the configuration 409-restart rule does not apply to
 * `/ordersBulk`), so the composed worst case is simpler than the
 * configuration traversal's: with the defaults below (`maxPages=100`,
 * `maxAttempts=3`), that is `100 * 3 = 300` raw `fetch` calls; at the
 * ceiling (`maxPages=1000`), `1000 * 3 = 3000` -- still finite and bounded.
 * The ceiling is an order of magnitude above the default, the same
 * proportion `MAX_ALLOWED_CONFIGURATION_RESTARTS` uses relative to
 * `DEFAULT_MAX_CONFIGURATION_RESTARTS`, generous enough for ordinary
 * operation while still rejecting an implausible caller-supplied value
 * loudly per AGENTS.md rule 11. The legacy array-returning compatibility
 * APIs still retain every page by definition; production report paths must
 * instead consume `foldOrdersBulkPages`, which hands each proven page to one
 * sequential consumer before requesting the next page and keeps raw-page
 * residency bounded by consumer state rather than total page count. See #31.
 */
const DEFAULT_MAX_ORDERS_BULK_PAGES = 100;
const MAX_ALLOWED_ORDERS_BULK_PAGES = 1_000;

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type ToastApiFamily = "standard";

export interface ToastGetJsonRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly rateLimitKey: string;
  readonly apiFamily?: ToastApiFamily;
}

/**
 * This private request shape is the only route that may omit a restaurant
 * GUID. Both its path and limiter key are literal types. Do not generalize it
 * into a public headerless GET helper: restaurant-scoped requests are the
 * default Toast boundary, and the one credential-scoped discovery source is
 * deliberately allowlisted while Toast's Standard/Partners documentation
 * conflict remains release-gated by issue #28.
 */
interface ToastCredentialScopedGetJsonRequest {
  readonly path: typeof PARTNERS_ACCESSIBLE_RESTAURANTS_PATH;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly rateLimitKey: typeof PARTNERS_ACCESSIBLE_RESTAURANTS_RATE_LIMIT_KEY;
  readonly apiFamily?: ToastApiFamily;
}

type ToastInternalGetJsonRequest =
  | ToastGetJsonRequest
  | ToastCredentialScopedGetJsonRequest;

export interface ToastConfigurationPagesRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly rateLimitKey: string;
  readonly maxPages?: number;
  readonly maxRestarts?: number;
}

export interface ToastOrdersBulkPagesRequest {
  readonly restaurantGuid: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly pageSize: number;
  // Optional as of T1-006-R1-F4: previously required with no upper bound,
  // so worst-case raw fetch count (`maxPages * maxAttempts`) was uncapped
  // on the caller's side. Now defaults to `DEFAULT_MAX_ORDERS_BULK_PAGES`
  // and is rejected above `MAX_ALLOWED_ORDERS_BULK_PAGES` either way. See
  // the composed worst-case comment beside `DEFAULT_MAX_ORDERS_BULK_PAGES`.
  readonly maxPages?: number;
}

/**
 * Cancellation for the sequential `/ordersBulk` fold is cooperative between
 * pages. The signal is checked before each page request and immediately after
 * each consumer invocation. An already-owned fetch may finish, but an
 * observed cancellation can never start another page.
 */
export interface ToastOrdersBulkFoldOptions {
  readonly signal?: AbortSignal;
}

export type ToastOrdersBulkPageConsumer<TState> = (
  state: TState,
  page: ToastDetailedJsonResult,
  pageNumber: number,
) => TState | Promise<TState>;

/**
 * Success-path metadata needed by deterministic report envelopes. A request
 * ID is optional because Toast's public documentation does not establish that
 * every successful response carries one. `retrievedAtEpochMs` is sampled only
 * after the successful JSON body has been parsed; retry/failed-attempt timing
 * is deliberately excluded from this result.
 */
export interface ToastDetailedJsonResult {
  readonly body: unknown;
  readonly retrievedAtEpochMs: number;
  readonly upstreamRequestId: string | undefined;
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

export interface ToastCredentialRateLimitSnapshot {
  readonly apiFamily: ToastApiFamily;
  readonly scope: "credential";
  readonly key: string;
  readonly limit: number | undefined;
  readonly remaining: number | undefined;
  readonly resetAtEpochMs: number | undefined;
  readonly retryAfterEpochMs: number | undefined;
  readonly updatedAtEpochMs: number;
}

type StoredRateLimitSnapshot =
  | ToastRateLimitSnapshot
  | ToastCredentialRateLimitSnapshot;

export type ToastHttpErrorCode =
  | "configuration_page_bound_exceeded"
  | "configuration_page_restart_exceeded"
  | "configuration_page_token_repeated"
  | "pagination_integrity_failed"
  | "rate_limit_wait_exceeded"
  | "request_cancelled"
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

/**
 * Narrow internal fetch-preflight error used only by the rate-limit-aware
 * Standard client wrapper. `#requestJson` preserves this exact class through
 * its fetch catch; every other thrown fetch value is still normalized to
 * `request_network_error`, so arbitrary custom-fetch exceptions do not gain
 * a trusted bypass into the transport's public error surface.
 */
export class ToastRateLimitPreflightError extends ToastHttpError {
  constructor() {
    super(
      "rate_limit_wait_exceeded",
      "A known Toast rate-limit reset is further in the future than the configured rate-limit wait ceiling.",
      { apiFamily: "standard", retryable: false },
    );
    this.name = "ToastRateLimitPreflightError";
  }
}

export interface ToastHttpClientOptions {
  readonly baseRetryDelayMs?: number;
  readonly fetch?: typeof fetch;
  readonly maxAttempts?: number;
  readonly maxConfigurationPages?: number;
  readonly maxConfigurationRestarts?: number;
  readonly maxOrdersBulkPages?: number;
  readonly maxRateLimitWaitMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

interface JsonResponseResult {
  readonly body: unknown;
  readonly headers: Headers;
  readonly retrievedAtEpochMs: number;
  readonly upstreamRequestId: string | undefined;
  readonly url: string;
}

export class ToastHttpClient {
  #baseRetryDelayMs: number;
  #config: RuntimeConfig;
  #fetch: typeof fetch;
  #maxAttempts: number;
  #maxConfigurationPages: number;
  #maxConfigurationRestarts: number;
  #maxOrdersBulkPages: number;
  #maxRateLimitWaitMs: number;
  #maxRetryDelayMs: number;
  #now: () => number;
  #random: () => number;
  #rateLimits = new Map<string, StoredRateLimitSnapshot>();
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
    this.#maxOrdersBulkPages =
      options.maxOrdersBulkPages ?? DEFAULT_MAX_ORDERS_BULK_PAGES;
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
    if (this.#maxConfigurationRestarts > MAX_ALLOWED_CONFIGURATION_RESTARTS) {
      throw new RangeError(
        `ToastHttpClient maxConfigurationRestarts must not exceed ${MAX_ALLOWED_CONFIGURATION_RESTARTS}.`,
      );
    }
    if (this.#maxOrdersBulkPages < 1) {
      throw new RangeError(
        "ToastHttpClient maxOrdersBulkPages must be at least 1.",
      );
    }
    if (this.#maxOrdersBulkPages > MAX_ALLOWED_ORDERS_BULK_PAGES) {
      throw new RangeError(
        `ToastHttpClient maxOrdersBulkPages must not exceed ${MAX_ALLOWED_ORDERS_BULK_PAGES}.`,
      );
    }
  }

  /** Backward-compatible body-only projection. */
  async getJson(request: ToastGetJsonRequest): Promise<unknown> {
    return (await this.getJsonDetailed(request)).body;
  }

  async getJsonDetailed(
    request: ToastGetJsonRequest,
  ): Promise<ToastDetailedJsonResult> {
    return detailedResult(await this.#requestJson(request));
  }

  /**
   * The only credential-scoped Standard-family read currently authorized by
   * the repository. The path and limiter key are hard-coded so callers
   * cannot turn this into a generic headerless Toast request primitive.
   *
   * It intentionally omits `Toast-Restaurant-External-ID`; otherwise it
   * reuses the exact OAuth, retry, rate-limit, status, JSON, and sanitization
   * path used by every restaurant-scoped Standard read. Whether Standard API
   * credentials are actually authorized for this Partners endpoint is
   * explicitly release-gated by issue #28 because Toast's current public
   * documentation contradicts itself on that point.
   */
  async getAccessibleRestaurantsJson(): Promise<unknown> {
    return (await this.getAccessibleRestaurantsJsonDetailed()).body;
  }

  async getAccessibleRestaurantsJsonDetailed(): Promise<ToastDetailedJsonResult> {
    return detailedResult(await this.#requestJson({
      path: PARTNERS_ACCESSIBLE_RESTAURANTS_PATH,
      rateLimitKey: PARTNERS_ACCESSIBLE_RESTAURANTS_RATE_LIMIT_KEY,
      apiFamily: "standard",
    }));
  }

  /** Backward-compatible body-only projection of retained pages. */
  async getConfigurationPagesJson(
    request: ToastConfigurationPagesRequest,
  ): Promise<readonly unknown[]> {
    const pages = await this.getConfigurationPagesDetailed(request);
    return Object.freeze(pages.map((page) => page.body));
  }

  async getConfigurationPagesDetailed(
    request: ToastConfigurationPagesRequest,
  ): Promise<readonly ToastDetailedJsonResult[]> {
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
    if (maxRestarts > MAX_ALLOWED_CONFIGURATION_RESTARTS) {
      throw new RangeError(
        `Toast configuration maxRestarts must not exceed ${MAX_ALLOWED_CONFIGURATION_RESTARTS}.`,
      );
    }

    let restartCount = 0;

    for (;;) {
      // This array is scoped to one traversal attempt. A scoped 409 breaks
      // out to a fresh attempt, so both stale bodies and their success
      // metadata are discarded together rather than leaking into the result.
      const pages: ToastDetailedJsonResult[] = [];
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

          pages.push(detailedResult(response));

          const nextToken = response.headers.get("toast-next-page-token");
          if (nextToken === null || nextToken === "") {
            return Object.freeze([...pages]);
          }
          // Toast page tokens are treated as case-sensitive opaque values,
          // compared and stored by exact string equality — deliberately,
          // not by accident. Toast's pagination documentation does not
          // state that `Toast-Next-Page-Token` is safe to compare
          // case-insensitively, and common opaque-token encodings (base64,
          // base64url, and similar) are legitimately case-sensitive: two
          // tokens differing only by case can be genuinely distinct values
          // encoding different pagination cursors, not the same cursor
          // twice. Normalizing case before comparing/storing would risk
          // treating two truly distinct tokens as identical and silently
          // discarding real pages — a worse failure mode than the one this
          // guards against.
          //
          // The accepted trade-off: two next-tokens differing only by case
          // (e.g. "TOKEN-X" then "token-x") are treated as progress rather
          // than caught as an immediate repeat. This traversal is still
          // fail-closed either way — a genuine loop that happens to differ
          // only by case degrades from a fast rejection after ~2 requests
          // to a slower one bounded by `maxPages`
          // (`configuration_page_bound_exceeded`), never an unbounded loop.
          // See T1-005-R1-F1.
          // `nextToken === pageToken` was previously checked here alongside
          // `seenTokens.has(nextToken)`, but it is dead: `pageToken` is only
          // ever assigned a value immediately after that same value was
          // added to `seenTokens` on the prior iteration (see the
          // `seenTokens.add(nextToken); pageToken = nextToken;` pair below),
          // so `pageToken` is always already a member of `seenTokens` by the
          // time this check runs. `seenTokens.has(nextToken)` alone
          // therefore already catches every case the redundant clause
          // caught. Confirmed by removing it: zero regressions across all
          // traversal tests. See T1-005-R1-F2.
          if (seenTokens.has(nextToken)) {
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

  /** Backward-compatible body-only projection of retained pages. */
  async getOrdersBulkPages(
    request: ToastOrdersBulkPagesRequest,
  ): Promise<unknown[]> {
    const pages = await this.getOrdersBulkPagesDetailed(request);
    // Preserve the historical mutable array wrapper even though detailed
    // metadata/page entries are immutable.
    return pages.map((page) => page.body);
  }

  /**
   * Compatibility projection for bounded internal/backfill callers that need
   * all raw pages at once. The single `/ordersBulk` Link/retry traversal now
   * lives in `foldOrdersBulkPages`; this wrapper intentionally opts back into
   * accumulation without maintaining a second pagination implementation.
   */
  async getOrdersBulkPagesDetailed(
    request: ToastOrdersBulkPagesRequest,
  ): Promise<readonly ToastDetailedJsonResult[]> {
    const pages = await this.foldOrdersBulkPages(
      request,
      [] as ToastDetailedJsonResult[],
      (accumulator, page) => {
        accumulator.push(page);
        return accumulator;
      },
    );
    return Object.freeze([...pages]);
  }

  /**
   * Traverse `/ordersBulk` once and hand each fully parsed, provenance-bearing
   * page to one sequential consumer before the next page is requested. This
   * production path does not retain a raw-page array; only the consumer's
   * explicit state survives between pages.
   *
   * All T1-006 Link/path/query/pageSize/+1/max-page guards remain in this same
   * loop. Consumer failure propagates immediately. Cancellation is checked
   * before every fetch and after every consumer so it cannot silently produce
   * a completed state after an observed abort.
   */
  async foldOrdersBulkPages<TState>(
    request: ToastOrdersBulkPagesRequest,
    initialState: TState,
    consumePage: ToastOrdersBulkPageConsumer<TState>,
    options: ToastOrdersBulkFoldOptions = {},
  ): Promise<TState> {
    if (
      !Number.isInteger(request.pageSize)
      || request.pageSize < 1
      || request.pageSize > 100
    ) {
      throw paginationIntegrityError(
        "ordersBulk pageSize must be an integer between 1 and 100.",
      );
    }
    // T1-006-R1-F4: `maxPages` was previously required with no default and
    // no ceiling. It is now optional (defaulting to
    // `DEFAULT_MAX_ORDERS_BULK_PAGES`) and rejected above
    // `MAX_ALLOWED_ORDERS_BULK_PAGES` regardless of whether the caller
    // supplied it explicitly or relied on the default -- see the composed
    // worst-case comment beside `DEFAULT_MAX_ORDERS_BULK_PAGES`.
    const maxPages = request.maxPages ?? this.#maxOrdersBulkPages;
    if (!Number.isInteger(maxPages) || maxPages < 1) {
      throw paginationIntegrityError(
        "ordersBulk maxPages must be a positive integer.",
      );
    }
    if (maxPages > MAX_ALLOWED_ORDERS_BULK_PAGES) {
      throw paginationIntegrityError(
        `ordersBulk maxPages must not exceed ${MAX_ALLOWED_ORDERS_BULK_PAGES}.`,
      );
    }

    const boundedQuery = normalizedBoundedQuery(request.query);
    let state = initialState;
    let pagesProcessed = 0;
    let page = 1;

    while (true) {
      throwIfOrdersBulkCancelled(options.signal);

      if (pagesProcessed >= maxPages) {
        throw paginationIntegrityError(
          "ordersBulk pagination exceeded the configured page bound.",
        );
      }

      const result = await this.#requestJson({
        path: "/orders/v2/ordersBulk",
        restaurantGuid: request.restaurantGuid,
        query: {
          ...request.query,
          page,
          pageSize: request.pageSize,
        },
        rateLimitKey: "ordersBulk",
      });

      state = await consumePage(state, detailedResult(result), page);
      pagesProcessed += 1;

      throwIfOrdersBulkCancelled(options.signal);

      // T1-006-R1-F2: strict +1 progression remains the sole load-bearing
      // duplicate/repeat guard. It proves every fetched page number and URL
      // are unique while the bounded query/pageSize stay invariant, so a
      // second visited-page set would still be dead code on the fold path.
      const nextUrl = linkRelations(result.headers).get("next");
      if (nextUrl === undefined) {
        return state;
      }

      const parsedNextUrl = parsePaginationUrl(nextUrl, result.url);
      assertOrdersBulkNextUrl(
        parsedNextUrl,
        boundedQuery,
        request.pageSize,
        page,
      );

      page = Number(parsedNextUrl.searchParams.get("page"));
    }
  }

  async #requestJson(
    request: ToastInternalGetJsonRequest,
  ): Promise<JsonResponseResult> {
    const apiFamily = request.apiFamily ?? "standard";
    const restaurantGuid =
      "restaurantGuid" in request ? request.restaurantGuid : undefined;
    const stateKey = restaurantGuid === undefined
      ? credentialRateLimitStateKey(apiFamily, request.rateLimitKey)
      : rateLimitStateKey(apiFamily, restaurantGuid, request.rateLimitKey);
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
      const url = this.#buildUrl(request);
      try {
        const headers: Record<string, string> = {
          accept: "application/json",
          authorization: authorizationHeader,
        };
        if (restaurantGuid !== undefined) {
          headers["toast-restaurant-external-id"] = restaurantGuid;
        }

        response = await this.#fetch(url, {
          method: "GET",
          headers,
        });
      } catch (error) {
        if (error instanceof ToastRateLimitPreflightError) {
          throw error;
        }

        lastError = new ToastHttpError(
          "request_network_error",
          "Toast data request failed before a response was received.",
          { apiFamily, retryable: true },
        );

        await this.#sleepBeforeRetry(attempt, undefined, apiFamily);
        continue;
      }

      if (restaurantGuid === undefined) {
        this.#recordCredentialRateLimit(
          stateKey,
          apiFamily,
          request.rateLimitKey,
          response,
        );
      } else {
        this.#recordRateLimit(
          stateKey,
          apiFamily,
          restaurantGuid,
          request.rateLimitKey,
          response,
        );
      }

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
        const body = await response.json();
        return {
          body,
          headers: response.headers,
          retrievedAtEpochMs: this.#now(),
          upstreamRequestId: requestIdFromResponse(response),
          url,
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
    const snapshot = this.#rateLimits.get(
      rateLimitStateKey(apiFamily, restaurantGuid, key),
    );
    return snapshot !== undefined && "restaurantGuid" in snapshot
      ? snapshot
      : undefined;
  }

  getCredentialRateLimitSnapshot(
    apiFamily: ToastApiFamily,
    key: string,
  ): ToastCredentialRateLimitSnapshot | undefined {
    const snapshot = this.#rateLimits.get(
      credentialRateLimitStateKey(apiFamily, key),
    );
    return snapshot !== undefined && "scope" in snapshot
      ? snapshot
      : undefined;
  }

  #buildUrl(request: ToastInternalGetJsonRequest): string {
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

  #recordCredentialRateLimit(
    stateKey: string,
    apiFamily: ToastApiFamily,
    key: string,
    response: Response,
  ): void {
    const now = this.#now();
    const retryAfterEpochMs = retryAfterEpochMsFromHeaders(response, now);
    const snapshot: ToastCredentialRateLimitSnapshot = Object.freeze({
      apiFamily,
      scope: "credential",
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

function detailedResult(result: JsonResponseResult): ToastDetailedJsonResult {
  return Object.freeze({
    body: result.body,
    retrievedAtEpochMs: result.retrievedAtEpochMs,
    upstreamRequestId: result.upstreamRequestId,
  });
}

function requestIdFromResponse(response: Response): string | undefined {
  return response.headers.get("toast-request-id") ?? undefined;
}

function requestIdMetadata(
  response: Response,
): { readonly upstreamRequestId?: string } {
  const upstreamRequestId = requestIdFromResponse(response);
  return upstreamRequestId === undefined ? {} : { upstreamRequestId };
}

function throwIfOrdersBulkCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ToastHttpError(
      "request_cancelled",
      "Toast ordersBulk page traversal was cancelled before completion.",
      { apiFamily: "standard", retryable: false },
    );
  }
}

function paginationIntegrityError(message: string): ToastHttpError {
  return new ToastHttpError("pagination_integrity_failed", message, {
    apiFamily: "standard",
    retryable: false,
  });
}

function normalizedBoundedQuery(
  query: ToastGetJsonRequest["query"],
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && key !== "page" && key !== "pageSize") {
      result.set(key, String(value));
    }
  }
  return result;
}

/**
 * Splits `input` on top-level occurrences of `delimiter` — occurrences
 * outside a `"..."` quoted-string. RFC 8288 (`rel`, and any other Link
 * parameter) permits a quoted-string value to itself contain the comma that
 * separates link-values or the semicolon that separates link-params (for
 * example `title="foo, bar; baz"`), so a naive `String.split` on either
 * delimiter would incorrectly split inside such a value. Quoted-pair
 * escapes (`\"`, `\\`, ...) are honored so an escaped quote does not
 * prematurely end the quoted region.
 */
function splitOutsideQuotes(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === "\\" && i + 1 < input.length) {
        current += char + input[i + 1];
        i += 1;
        continue;
      }
      if (char === "\"") {
        inQuotes = false;
      }
      current += char;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      current += char;
      continue;
    }

    if (char === delimiter) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

interface ParsedLinkValue {
  readonly target: string;
  readonly params: ReadonlyMap<string, string>;
}

/**
 * Parses one RFC 8288 link-value (`<target-uri> *( ";" link-param )`).
 * Throws on any structural deviation — an unclosed `<...>`, no `<...>` at
 * all, or a parameter with no `=` — rather than silently returning an
 * incomplete result. Parameter names are returned lower-cased; parameter
 * values are unquoted and unescaped when the RFC 8288 quoted-string form is
 * used, and returned verbatim when the RFC 8288 unquoted-token form is
 * used (`rel=next` is explicitly legal, not just `rel="next"`).
 */
function parseLinkValue(segment: string): ParsedLinkValue {
  const trimmed = segment.trim();
  const targetMatch = /^<([^<>]*)>/u.exec(trimmed);
  if (targetMatch === null || (targetMatch[1] ?? "").length === 0) {
    throw new Error("link-value is missing a well-formed <target-uri>");
  }

  const target = targetMatch[1] ?? "";
  const rest = trimmed.slice(targetMatch[0].length).trim();
  const params = new Map<string, string>();

  if (rest.length > 0) {
    if (!rest.startsWith(";")) {
      throw new Error("link-value has content after <target-uri> that is not a parameter");
    }

    for (const rawParam of splitOutsideQuotes(rest.slice(1), ";")) {
      const paramTrimmed = rawParam.trim();
      if (paramTrimmed.length === 0) {
        // A stray "; ;" or trailing ";" — tolerated as an empty parameter
        // slot rather than treated as a structural failure.
        continue;
      }

      const equalsIndex = paramTrimmed.indexOf("=");
      if (equalsIndex === -1) {
        throw new Error("link-param is missing '='");
      }

      const name = paramTrimmed.slice(0, equalsIndex).trim().toLowerCase();
      let value = paramTrimmed.slice(equalsIndex + 1).trim();
      if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
        value = value.slice(1, -1).replace(/\\(.)/gu, "$1");
      }

      if (name.length === 0 || value.length === 0) {
        throw new Error("link-param has an empty name or value");
      }

      params.set(name, value);
    }
  }

  return { target, params };
}

/**
 * Parses the `Link` response header into a relation-type -> target-URI map,
 * matching relation types and parameter names case-insensitively and
 * accepting `rel` as either the RFC 8288 quoted-string or unquoted-token
 * form, in any parameter position and alongside any other parameter.
 *
 * T1-006-R1-F1 / T1-006-R1-S1: the prior implementation used
 * `/^\s*<([^>]+)>\s*;\s*rel="([^"]+)"\s*$/u`, which matched only a segment
 * that was *exactly* `<url>; rel="value"` — quoted, `rel`-only, `rel`-first,
 * case-sensitive. Every other RFC 8288-legal shape (`rel=next` unquoted,
 * `Rel="Next"`, `REL="NEXT"`, an extra parameter before or after `rel`, two
 * `Link` headers joined by the Fetch API) silently produced an empty
 * relation map — structurally indistinguishable from a genuinely absent
 * header — so an otherwise-complete traversal reported success after only
 * page 1. Per AGENTS.md rule 11 and the completion contract in
 * `docs/architecture/public-use-boundary.md` ("return `partial` or `denied`
 * when completion cannot be proven"), a `Link` header that is present but
 * does not parse as valid RFC 8288 syntax must fail closed rather than be
 * treated as absent — thrown here as `pagination_integrity_failed` with a
 * static message, never interpolating the raw header value.
 */
function linkRelations(headers: Headers): ReadonlyMap<string, string> {
  const header = headers.get("link");
  if (header === null) {
    return new Map();
  }
  if (header.trim().length === 0) {
    // An empty Link header is legitimately equivalent to an absent one —
    // there is nothing to parse and nothing to fail closed on.
    return new Map();
  }

  const result = new Map<string, string>();

  for (const segment of splitOutsideQuotes(header, ",")) {
    if (segment.trim().length === 0) {
      throw paginationIntegrityError(
        "ordersBulk pagination received a Link header that could not be parsed.",
      );
    }

    let parsed: ParsedLinkValue;
    try {
      parsed = parseLinkValue(segment);
    } catch {
      throw paginationIntegrityError(
        "ordersBulk pagination received a Link header that could not be parsed.",
      );
    }

    const relParam = parsed.params.get("rel");
    if (relParam === undefined) {
      // A structurally valid link-value with no `rel` parameter at all is
      // not this traversal's concern; it simply contributes no relation.
      continue;
    }

    // RFC 8288 allows `rel` to hold a space-separated list of relation
    // types sharing one target URI.
    for (const relType of relParam.split(/\s+/u)) {
      if (relType.length === 0) {
        continue;
      }
      const relTypeLower = relType.toLowerCase();
      if (!result.has(relTypeLower)) {
        result.set(relTypeLower, parsed.target);
      }
    }
  }

  return result;
}

function parsePaginationUrl(nextUrl: string, baseUrl: string): URL {
  try {
    return new URL(nextUrl, baseUrl);
  } catch {
    throw paginationIntegrityError(
      "ordersBulk pagination received an unusable next Link URL.",
    );
  }
}

function assertOrdersBulkNextUrl(
  nextUrl: URL,
  boundedQuery: ReadonlyMap<string, string>,
  pageSize: number,
  currentPage: number,
): void {
  if (nextUrl.pathname !== "/orders/v2/ordersBulk") {
    throw paginationIntegrityError(
      "ordersBulk pagination next Link changed the endpoint path.",
    );
  }

  // T1-006-R1-F2: this single check -- the next page must equal exactly
  // `currentPage + 1` -- is the sole load-bearing duplicate/repeat guard.
  // The fold path preserves that invariant: every page number is strictly
  // increasing and the bounded query/pageSize are unchanged, so a separate
  // visited-page set remains dead code unless this +1 rule is deliberately
  // relaxed by a future reviewed change.
  const nextPageText = nextUrl.searchParams.get("page");
  const nextPage = nextPageText === null ? NaN : Number(nextPageText);
  if (!Number.isInteger(nextPage) || nextPage !== currentPage + 1) {
    throw paginationIntegrityError(
      "ordersBulk pagination next Link did not advance to a new page.",
    );
  }

  if (nextUrl.searchParams.get("pageSize") !== String(pageSize)) {
    throw paginationIntegrityError(
      "ordersBulk pagination next Link changed pageSize.",
    );
  }

  const nextBoundedQuery = normalizedBoundedQuery(
    Object.fromEntries(nextUrl.searchParams.entries()),
  );
  if (!sameQuery(boundedQuery, nextBoundedQuery)) {
    throw paginationIntegrityError(
      "ordersBulk pagination next Link changed the bounded query.",
    );
  }
}

function sameQuery(
  left: ReadonlyMap<string, string>,
  right: ReadonlyMap<string, string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
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
    // Require the complete trimmed value to be digits before treating it as
    // delta-seconds; a malformed value such as `10junk` must not silently
    // become ten seconds. HTTP-date remains the second accepted form.
    const trimmedRetryAfter = retryAfter.trim();
    if (/^\d+$/u.test(trimmedRetryAfter)) {
      const seconds = Number(trimmedRetryAfter);
      if (Number.isSafeInteger(seconds) && seconds >= 0) {
        return now + seconds * 1000;
      }
    }

    const parsedDateEpochMs = Date.parse(trimmedRetryAfter);
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
 * Restaurant-scoped rate-limit keys remain structurally bound to restaurant
 * GUID, closing T1-004-R1-S1/F7. The `:restaurant:` namespace added by the
 * T2-001 repair is intentionally disjoint from the one allowlisted
 * credential-wide source's `:credential:` namespace below, so
 * credential-scoped discovery can never block or inherit a restaurant bucket.
 *
 * Do not remove restaurant GUID from this key when adding future transports:
 * AGENTS.md rule 6 requires location isolation for every cache/state key.
 */
function rateLimitStateKey(
  apiFamily: ToastApiFamily,
  restaurantGuid: string,
  key: string,
): string {
  return `${apiFamily}:restaurant:${restaurantGuid}:${key}`;
}

/**
 * Credential-scoped state is safe only because each ToastHttpClient instance
 * is permanently bound to one RuntimeConfig/token-manager identity and this
 * namespace cannot collide with `rateLimitStateKey`. A future generic shared
 * limiter would need an explicit credential identity in the key instead of
 * inheriting this instance-local assumption.
 */
function credentialRateLimitStateKey(
  apiFamily: ToastApiFamily,
  key: string,
): string {
  return `${apiFamily}:credential:${key}`;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
