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
 * fetches at most `maxPages` pages; a scoped 409 restart discards the partial
 * page set and starts a fresh traversal attempt, up to `maxRestarts` times.
 */
const DEFAULT_MAX_CONFIGURATION_PAGE_COUNT = 100;
const DEFAULT_MAX_CONFIGURATION_RESTARTS = 1;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;
const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;
const MAX_ALLOWED_CONFIGURATION_RESTARTS = 10;
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
  readonly maxPages?: number;
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

  async getJson(request: ToastGetJsonRequest): Promise<unknown> {
    return (await this.#requestJson(request)).body;
  }

  /**
   * The only credential-scoped Standard API read currently authorized by
   * the repository. The path and limiter key are hard-coded so callers
   * cannot turn this into a generic headerless Toast request primitive.
   *
   * Standard API credentials use the Partners API to enumerate accessible
   * restaurant connections. Unlike restaurant-scoped requests, this call
   * intentionally omits `Toast-Restaurant-External-ID`; it otherwise reuses
   * the exact OAuth, retry, rate-limit, status, JSON, and sanitization path
   * used by every other Standard API read.
   */
  async getAccessibleRestaurantsJson(): Promise<unknown> {
    return (await this.#requestJson({
      path: PARTNERS_ACCESSIBLE_RESTAURANTS_PATH,
      rateLimitKey: PARTNERS_ACCESSIBLE_RESTAURANTS_RATE_LIMIT_KEY,
      apiFamily: "standard",
    })).body;
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
    if (maxRestarts > MAX_ALLOWED_CONFIGURATION_RESTARTS) {
      throw new RangeError(
        `Toast configuration maxRestarts must not exceed ${MAX_ALLOWED_CONFIGURATION_RESTARTS}.`,
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

  async getOrdersBulkPages(
    request: ToastOrdersBulkPagesRequest,
  ): Promise<unknown[]> {
    if (
      !Number.isInteger(request.pageSize)
      || request.pageSize < 1
      || request.pageSize > 100
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
    const pages: unknown[] = [];
    let page = 1;

    while (true) {
      if (pages.length >= maxPages) {
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

      pages.push(result.body);

      const nextUrl = linkRelations(result.headers).get("next");
      if (nextUrl === undefined) {
        return pages;
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
      } catch {
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
        return {
          body: await response.json(),
          headers: response.headers,
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

function linkRelations(headers: Headers): ReadonlyMap<string, string> {
  const header = headers.get("link");
  if (header === null || header.trim().length === 0) {
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
      continue;
    }

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

function epochHeader(response: Response, name: string): number | undefined {
  const parsed = numericHeader(response, name);
  if (parsed === undefined) {
    return undefined;
  }

  return parsed > 9_999_999_999 ? parsed : parsed * 1000;
}

function rateLimitStateKey(
  apiFamily: ToastApiFamily,
  restaurantGuid: string,
  key: string,
): string {
  return `${apiFamily}:restaurant:${restaurantGuid}:${key}`;
}

function credentialRateLimitStateKey(
  apiFamily: ToastApiFamily,
  key: string,
): string {
  // Each ToastHttpClient instance is permanently bound to one RuntimeConfig
  // and token manager, so this key is credential-scoped without inventing a
  // restaurant GUID. It can never collide with a restaurant-scoped key.
  return `${apiFamily}:credential:${key}`;
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
