import type { OAuthTokenManager } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import {
  conservativeRateLimitBy,
  makeRateLimitContext,
  parseNonNegativeIntegerHeader,
  parseRetryAfterEpochMs,
  parseToastRateLimitBy,
  parseToastResetEpochMs,
  ToastRateLimitCoordinator,
  type ToastRateLimitRequestContext,
  type ToastRateLimitSnapshot,
  type ToastRequestScope,
} from "./rate-limits.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_RETRY_DELAY_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;
const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_CONFIGURATION_PAGES = 100;
const DEFAULT_MAX_CONFIGURATION_RESTARTS = 1;
const MAX_ALLOWED_CONFIGURATION_RESTARTS = 3;
const DEFAULT_MAX_ORDERS_BULK_PAGES = 1_000;
const MAX_ALLOWED_ORDERS_BULK_PAGES = 1_000;
const PARTNERS_ACCESSIBLE_RESTAURANTS_PATH = "/partners/v1/restaurants";
const PARTNERS_ACCESSIBLE_RESTAURANTS_LIMITER_KEY = "partnersRestaurants";

export type ToastApiFamily = "standard";

export type ToastHttpErrorCode =
  | "token_acquisition_failed"
  | "request_network_error"
  | "request_failed"
  | "response_invalid_json"
  | "rate_limit_wait_exceeded"
  | "configuration_page_bound_exceeded"
  | "configuration_page_token_repeated"
  | "configuration_page_restart_exceeded"
  | "pagination_integrity_failed";

export interface ToastGetJsonRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  readonly rateLimitKey: string;
  readonly apiFamily?: ToastApiFamily;
}

export interface ToastConfigurationPagesRequest {
  readonly path: `/${string}`;
  readonly restaurantGuid: string;
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  readonly rateLimitKey: string;
  readonly maxPages?: number;
  readonly maxRestarts?: number;
}

export interface ToastOrdersBulkPagesRequest {
  readonly restaurantGuid: string;
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  readonly pageSize: number;
  readonly maxPages?: number;
}

export interface ToastDetailedJsonResult {
  readonly body: unknown;
  readonly url: string;
  readonly retrievedAtEpochMs: number;
  readonly upstreamRequestId?: string;
}

export interface ToastHttpClientOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly maxAttempts?: number;
  readonly baseRetryDelayMs?: number;
  readonly maxRetryDelayMs?: number;
  readonly maxRateLimitWaitMs?: number;
  readonly maxConfigurationPages?: number;
  readonly maxConfigurationRestarts?: number;
  readonly maxOrdersBulkPages?: number;
  /**
   * Optional process-owned coordinator. Passing the same instance to future
   * Standard/Analytics clients preserves Toast GLOBAL throttling across API
   * families instead of creating one pseudo-global limiter per adapter.
   */
  readonly rateLimitCoordinator?: ToastRateLimitCoordinator;
}

export class ToastHttpError extends Error {
  readonly code: ToastHttpErrorCode;
  readonly apiFamily: ToastApiFamily;
  readonly retryable: boolean;
  readonly upstreamStatus: number | undefined;
  readonly upstreamRequestId: string | undefined;

  constructor(
    code: ToastHttpErrorCode,
    message: string,
    options: {
      readonly apiFamily: ToastApiFamily;
      readonly retryable: boolean;
      readonly upstreamStatus?: number;
      readonly upstreamRequestId?: string;
    },
  ) {
    super(message);
    this.name = "ToastHttpError";
    this.code = code;
    this.apiFamily = options.apiFamily;
    this.retryable = options.retryable;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamRequestId = options.upstreamRequestId;
  }
}

interface InternalJsonResponseResult extends ToastDetailedJsonResult {
  readonly headers: Headers;
}

interface InternalJsonRequest {
  readonly path: `/${string}`;
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >;
  readonly rateLimitKey: string;
  readonly requestScope: ToastRequestScope;
}

const RETRYABLE_STATUSES = new Set([
  408,
  429,
  500,
  502,
  503,
  504,
]);

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
  #rateLimits: ToastRateLimitCoordinator;
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
      options.maxConfigurationPages ?? DEFAULT_MAX_CONFIGURATION_PAGES;
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
    this.#rateLimits =
      options.rateLimitCoordinator ?? new ToastRateLimitCoordinator();

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

  async getJson(request: ToastGetJsonRequest): Promise<unknown> {
    return (await this.getJsonDetailed(request)).body;
  }

  async getJsonDetailed(
    request: ToastGetJsonRequest,
  ): Promise<ToastDetailedJsonResult> {
    return publicDetailedResult(
      await this.#requestJson({
        path: request.path,
        query: request.query,
        rateLimitKey: request.rateLimitKey,
        requestScope: {
          kind: "restaurant",
          restaurantGuid: request.restaurantGuid,
        },
      }),
    );
  }

  /**
   * Credential-scoped Standard-access location discovery.
   *
   * This is intentionally not an arbitrary headerless GET primitive. Toast's
   * Standard access guide authorizes Partners GET for the client's selected
   * location set; every other Standard data path remains restaurant-scoped.
   */
  async getAccessibleRestaurantsJson(): Promise<unknown> {
    return (await this.getAccessibleRestaurantsJsonDetailed()).body;
  }

  async getAccessibleRestaurantsJsonDetailed(): Promise<ToastDetailedJsonResult> {
    return publicDetailedResult(
      await this.#requestJson({
        path: PARTNERS_ACCESSIBLE_RESTAURANTS_PATH,
        rateLimitKey: PARTNERS_ACCESSIBLE_RESTAURANTS_LIMITER_KEY,
        requestScope: { kind: "credential" },
      }),
    );
  }

  async getConfigurationPagesJson(
    request: ToastConfigurationPagesRequest,
  ): Promise<readonly unknown[]> {
    return (await this.getConfigurationPagesDetailed(request)).map(
      (page) => page.body,
    );
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
            query: { ...request.query, pageToken },
            rateLimitKey: request.rateLimitKey,
            requestScope: {
              kind: "restaurant",
              restaurantGuid: request.restaurantGuid,
            },
          });

          pages.push(publicDetailedResult(response));

          const nextToken = response.headers.get("toast-next-page-token");
          if (nextToken === null || nextToken === "") {
            return Object.freeze([...pages]);
          }
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
            // `pages` and its success metadata belong to the stale page set.
            // Breaking to the outer loop discards both atomically.
            break;
          }

          throw error;
        }
      }
    }
  }

  async getOrdersBulkPages(
    request: ToastOrdersBulkPagesRequest,
  ): Promise<unknown[]> {
    return (await this.getOrdersBulkPagesDetailed(request)).map(
      (page) => page.body,
    );
  }

  async getOrdersBulkPagesDetailed(
    request: ToastOrdersBulkPagesRequest,
  ): Promise<readonly ToastDetailedJsonResult[]> {
    if (
      !Number.isInteger(request.pageSize) ||
      request.pageSize < 1 ||
      request.pageSize > 100
    ) {
      throw paginationIntegrityError(
        "ordersBulk pageSize must be an integer between 1 and 100.",
      );
    }
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
    const pages: ToastDetailedJsonResult[] = [];
    let page = 1;

    while (true) {
      if (pages.length >= maxPages) {
        throw paginationIntegrityError(
          "ordersBulk pagination exceeded the configured page bound.",
        );
      }

      const result = await this.#requestJson({
        path: "/orders/v2/ordersBulk",
        query: {
          ...request.query,
          page,
          pageSize: request.pageSize,
        },
        rateLimitKey: "ordersBulk",
        requestScope: {
          kind: "restaurant",
          restaurantGuid: request.restaurantGuid,
        },
      });

      pages.push(publicDetailedResult(result));

      const nextUrl = linkRelations(result.headers).get("next");
      if (nextUrl === undefined) {
        return Object.freeze([...pages]);
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

  getRateLimitSnapshots(): readonly ToastRateLimitSnapshot[] {
    return this.#rateLimits.list();
  }

  getRateLimitCoordinator(): ToastRateLimitCoordinator {
    return this.#rateLimits;
  }

  async #requestJson(request: InternalJsonRequest): Promise<InternalJsonResponseResult> {
    const apiFamily: ToastApiFamily = "standard";
    const rateLimitContext = makeRateLimitContext({
      path: request.path,
      endpointKey: request.rateLimitKey,
      requestScope: request.requestScope,
    });
    let lastError: ToastHttpError | undefined;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      await this.#waitForKnownRateLimit(rateLimitContext);

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

      const url = this.#buildUrl(request);
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: "GET",
          headers: requestHeaders(authorizationHeader, request.requestScope),
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

      const retrievedAtEpochMs = this.#now();
      this.#recordRateLimit(rateLimitContext, response, retrievedAtEpochMs);

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
          retryDelayFromHeaders(response, retrievedAtEpochMs),
          apiFamily,
        );
        continue;
      }

      try {
        const body = await response.json();
        return Object.freeze({
          body,
          headers: response.headers,
          url,
          retrievedAtEpochMs,
          ...requestIdMetadata(response),
        });
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

    throw (
      lastError ??
      new ToastHttpError(
        "request_network_error",
        "Toast data request failed before a response was received.",
        { apiFamily, retryable: true },
      )
    );
  }

  #buildUrl(request: InternalJsonRequest): string {
    const url = new URL(`https://${this.#config.apiHostname}${request.path}`);

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  #recordRateLimit(
    context: ToastRateLimitRequestContext,
    response: Response,
    observedAtEpochMs: number,
  ): void {
    const byHeader = response.headers.get("x-toast-ratelimit-by");
    const remaining = parseNonNegativeIntegerHeader(
      response.headers.get("x-toast-ratelimit-remaining"),
    );
    const resetAtEpochMs = parseToastResetEpochMs(
      response.headers.get("x-toast-ratelimit-reset"),
    );
    const retryAfterEpochMs = parseRetryAfterEpochMs(
      response.headers.get("retry-after"),
      observedAtEpochMs,
    );

    if (
      byHeader === null &&
      remaining === undefined &&
      resetAtEpochMs === undefined &&
      retryAfterEpochMs === undefined
    ) {
      return;
    }

    this.#rateLimits.record({
      context,
      by:
        byHeader === null
          ? conservativeRateLimitBy()
          : parseToastRateLimitBy(byHeader),
      remaining,
      resetAtEpochMs,
      retryAfterEpochMs,
      observedAtEpochMs,
    });
  }

  async #sleepBeforeRetry(
    attempt: number,
    serverDelayMs: number | undefined,
    apiFamily: ToastApiFamily,
  ): Promise<void> {
    if (attempt >= this.#maxAttempts) {
      return;
    }

    if (
      serverDelayMs !== undefined &&
      serverDelayMs > this.#maxRateLimitWaitMs
    ) {
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

  async #waitForKnownRateLimit(
    context: ToastRateLimitRequestContext,
  ): Promise<void> {
    const waitUntilEpochMs = this.#rateLimits.requiredWaitUntilEpochMs(context);
    if (waitUntilEpochMs === undefined) {
      return;
    }

    const waitMs = waitUntilEpochMs - this.#now();
    if (waitMs <= 0) {
      return;
    }

    if (waitMs > this.#maxRateLimitWaitMs) {
      throw new ToastHttpError(
        "rate_limit_wait_exceeded",
        "A stored Toast rate-limit reset is further in the future than the configured rate-limit wait ceiling.",
        { apiFamily: "standard", retryable: false },
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

function publicDetailedResult(
  result: InternalJsonResponseResult,
): ToastDetailedJsonResult {
  return Object.freeze({
    body: result.body,
    url: result.url,
    retrievedAtEpochMs: result.retrievedAtEpochMs,
    ...(result.upstreamRequestId !== undefined
      ? { upstreamRequestId: result.upstreamRequestId }
      : {}),
  });
}

function requestHeaders(
  authorizationHeader: string,
  requestScope: ToastRequestScope,
): Record<string, string> {
  return requestScope.kind === "restaurant"
    ? {
        accept: "application/json",
        authorization: authorizationHeader,
        "toast-restaurant-external-id": requestScope.restaurantGuid,
      }
    : {
        accept: "application/json",
        authorization: authorizationHeader,
      };
}

function requestIdMetadata(
  response: Response,
): { readonly upstreamRequestId?: string } {
  const upstreamRequestId = response.headers.get("toast-request-id");
  return upstreamRequestId !== null ? { upstreamRequestId } : {};
}

function retryDelayFromHeaders(
  response: Response,
  nowEpochMs: number,
): number | undefined {
  const retryAt = parseRetryAfterEpochMs(
    response.headers.get("retry-after"),
    nowEpochMs,
  );
  const resetAt = parseToastResetEpochMs(
    response.headers.get("x-toast-ratelimit-reset"),
  );
  const candidates = [retryAt, resetAt]
    .filter((value): value is number => value !== undefined)
    .map((value) => Math.max(0, value - nowEpochMs));

  return candidates.length === 0 ? undefined : Math.max(...candidates);
}

function paginationIntegrityError(message: string): ToastHttpError {
  return new ToastHttpError("pagination_integrity_failed", message, {
    apiFamily: "standard",
    retryable: false,
  });
}

function normalizedBoundedQuery(
  query:
    | Readonly<Record<string, string | number | boolean | undefined>>
    | undefined,
): ReadonlyMap<string, string> {
  const normalized = new Map<string, string>();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && key !== "page" && key !== "pageSize") {
      normalized.set(key, String(value));
    }
  }

  return normalized;
}

function assertOrdersBulkNextUrl(
  nextUrl: URL,
  boundedQuery: ReadonlyMap<string, string>,
  pageSize: number,
  currentPage: number,
): void {
  if (nextUrl.pathname !== "/orders/v2/ordersBulk") {
    throw paginationIntegrityError(
      "ordersBulk next link changed the endpoint path.",
    );
  }

  const pageValues = nextUrl.searchParams.getAll("page");
  const pageSizeValues = nextUrl.searchParams.getAll("pageSize");
  if (pageValues.length !== 1 || pageSizeValues.length !== 1) {
    throw paginationIntegrityError(
      "ordersBulk next link must contain exactly one page and pageSize value.",
    );
  }

  const nextPage = parsePositiveInteger(pageValues[0]);
  const nextPageSize = parsePositiveInteger(pageSizeValues[0]);
  if (nextPage !== currentPage + 1) {
    throw paginationIntegrityError(
      "ordersBulk next link did not advance to the immediately following page.",
    );
  }
  if (nextPageSize !== pageSize) {
    throw paginationIntegrityError(
      "ordersBulk next link changed the bounded pageSize.",
    );
  }

  const actualBoundedQuery = new Map<string, string>();
  for (const [key, value] of nextUrl.searchParams.entries()) {
    if (key !== "page" && key !== "pageSize") {
      if (actualBoundedQuery.has(key)) {
        throw paginationIntegrityError(
          "ordersBulk next link repeated a bounded query parameter.",
        );
      }
      actualBoundedQuery.set(key, value);
    }
  }

  if (!sameStringMap(actualBoundedQuery, boundedQuery)) {
    throw paginationIntegrityError(
      "ordersBulk next link changed the original bounded query.",
    );
  }
}

function parsePositiveInteger(value: string | undefined): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw paginationIntegrityError(
      "ordersBulk next link contained an invalid page value.",
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw paginationIntegrityError(
      "ordersBulk next link contained an invalid page value.",
    );
  }

  return parsed;
}

function sameStringMap(
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

function linkRelations(headers: Headers): ReadonlyMap<string, string> {
  const values = linkHeaderValues(headers);
  if (values.length === 0) {
    return new Map();
  }

  const relations = new Map<string, string>();
  for (const value of values) {
    const entries = splitLinkHeader(value);
    for (const entry of entries) {
      const parsed = parseLinkEntry(entry);
      for (const relation of parsed.relations) {
        if (relations.has(relation)) {
          throw paginationIntegrityError(
            "Toast Link header contained a repeated relation.",
          );
        }
        relations.set(relation, parsed.target);
      }
    }
  }

  return relations;
}

function linkHeaderValues(headers: Headers): string[] {
  const nodeHeaders = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  const raw = nodeHeaders.raw?.();
  if (raw !== undefined) {
    const values = Object.entries(raw)
      .filter(([name]) => name.toLowerCase() === "link")
      .flatMap(([, values]) => values);
    if (values.length > 0) {
      return values;
    }
  }

  const combined = headers.get("link");
  return combined === null ? [] : [combined];
}

function splitLinkHeader(value: string): string[] {
  const entries: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && inQuotes) {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"' && !inAngle) {
      inQuotes = !inQuotes;
      current += character;
      continue;
    }
    if (character === "<" && !inQuotes) {
      inAngle = true;
      current += character;
      continue;
    }
    if (character === ">" && !inQuotes) {
      inAngle = false;
      current += character;
      continue;
    }
    if (character === "," && !inQuotes && !inAngle) {
      if (current.trim().length === 0) {
        throw paginationIntegrityError(
          "Toast Link header contained an empty entry.",
        );
      }
      entries.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (inQuotes || inAngle || escaped || current.trim().length === 0) {
    throw paginationIntegrityError("Toast Link header was malformed.");
  }
  entries.push(current.trim());
  return entries;
}

function parseLinkEntry(entry: string): {
  readonly target: string;
  readonly relations: readonly string[];
} {
  if (!entry.startsWith("<")) {
    throw paginationIntegrityError("Toast Link header entry was malformed.");
  }
  const closing = entry.indexOf(">");
  if (closing <= 1) {
    throw paginationIntegrityError("Toast Link header entry was malformed.");
  }

  const target = entry.slice(1, closing);
  const parameters = parseLinkParameters(entry.slice(closing + 1));
  const relValue = parameters
    .filter(([name]) => name.toLowerCase() === "rel")
    .map(([, value]) => value);
  if (relValue.length !== 1 || relValue[0] === undefined) {
    throw paginationIntegrityError(
      "Toast Link header entry did not contain exactly one rel parameter.",
    );
  }

  const relations = relValue[0]
    .trim()
    .split(/\s+/u)
    .filter((relation) => relation.length > 0)
    .map((relation) => relation.toLowerCase());
  if (relations.length === 0) {
    throw paginationIntegrityError(
      "Toast Link header entry contained an empty rel parameter.",
    );
  }

  return { target, relations };
}

function parseLinkParameters(value: string): Array<[string, string]> {
  const parameters: Array<[string, string]> = [];
  let index = 0;

  while (index < value.length) {
    while (/\s/u.test(value[index] ?? "")) {
      index += 1;
    }
    if (index >= value.length) {
      break;
    }
    if (value[index] !== ";") {
      throw paginationIntegrityError("Toast Link header parameter was malformed.");
    }
    index += 1;
    while (/\s/u.test(value[index] ?? "")) {
      index += 1;
    }

    const nameStart = index;
    while (index < value.length && /[!#$%&'*+.^_`|~0-9A-Za-z-]/u.test(value[index] ?? "")) {
      index += 1;
    }
    if (index === nameStart) {
      throw paginationIntegrityError("Toast Link header parameter name was malformed.");
    }
    const name = value.slice(nameStart, index);
    while (/\s/u.test(value[index] ?? "")) {
      index += 1;
    }
    if (value[index] !== "=") {
      throw paginationIntegrityError("Toast Link header parameter was malformed.");
    }
    index += 1;
    while (/\s/u.test(value[index] ?? "")) {
      index += 1;
    }

    let parameterValue = "";
    if (value[index] === '"') {
      index += 1;
      let closed = false;
      while (index < value.length) {
        const character = value[index];
        if (character === "\\") {
          const escaped = value[index + 1];
          if (escaped === undefined) {
            throw paginationIntegrityError("Toast Link header quoted parameter was malformed.");
          }
          parameterValue += escaped;
          index += 2;
          continue;
        }
        if (character === '"') {
          index += 1;
          closed = true;
          break;
        }
        parameterValue += character;
        index += 1;
      }
      if (!closed) {
        throw paginationIntegrityError("Toast Link header quoted parameter was malformed.");
      }
    } else {
      const valueStart = index;
      while (index < value.length && value[index] !== ";") {
        if (value[index] === ",") {
          break;
        }
        index += 1;
      }
      parameterValue = value.slice(valueStart, index).trim();
      if (parameterValue.length === 0) {
        throw paginationIntegrityError("Toast Link header parameter value was empty.");
      }
    }

    parameters.push([name, parameterValue]);
  }

  return parameters;
}

function parsePaginationUrl(value: string, baseUrl: string): URL {
  try {
    return new URL(value, baseUrl);
  } catch {
    throw paginationIntegrityError("Toast pagination returned an unusable next URL.");
  }
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
