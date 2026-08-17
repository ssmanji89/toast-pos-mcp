export type ToastRateLimitPrimary = "GLOBAL" | "API" | "ENDPOINT";

export interface ToastRateLimitRequestContext {
  /** Absent only for the one credential-scoped/headerless source. */
  readonly restaurantGuid: string | undefined;
  /** Stable API service key derived from the request path (orders, restaurants, partners, ...). */
  readonly apiKey: string;
  /** Stable repository-owned endpoint/limiter key. */
  readonly endpointKey: string;
}

export interface ToastRateLimitObservation {
  readonly primary: ToastRateLimitPrimary | undefined;
  readonly account: boolean;
  readonly remaining: number | undefined;
  readonly resetAtEpochMs: number | undefined;
  readonly retryAfterEpochMs: number | undefined;
}

/**
 * Hierarchical coordination is an all-current-header contract. Once
 * `X-Toast-RateLimit-By` identifies the scope of an observation, Remaining
 * and Reset must come from the same current `X-Toast-*` generation. Historical
 * aliases remain available only to the compatibility snapshot helpers below;
 * they can never fill a missing current companion and create production wait
 * state from mixed header generations.
 */
export function readToastRateLimitObservation(
  response: Response,
  nowEpochMs: number,
): ToastRateLimitObservation {
  const by = currentHeader(response, "x-toast-ratelimit-by");
  const parsedBy = parseRateLimitBy(by);

  return Object.freeze({
    primary: parsedBy.primary,
    account: parsedBy.account,
    remaining: currentNonNegativeIntegerHeader(
      response,
      "x-toast-ratelimit-remaining",
    ),
    resetAtEpochMs: currentAbsoluteEpochHeader(
      response,
      "x-toast-ratelimit-reset",
    ),
    retryAfterEpochMs: retryAfterEpochMs(response, nowEpochMs),
  });
}

/** Preserve the pre-existing public snapshot field when a limit header exists. */
export function readToastRateLimitLimit(response: Response): number | undefined {
  return nonNegativeIntegerHeader(
    response,
    "x-toast-ratelimit-limit",
    "toast-ratelimit-limit",
  );
}

export function readToastRateLimitRemaining(
  response: Response,
): number | undefined {
  return nonNegativeIntegerHeader(
    response,
    "x-toast-ratelimit-remaining",
    "toast-ratelimit-remaining",
  );
}

export function readToastRateLimitResetAtEpochMs(
  response: Response,
): number | undefined {
  return absoluteEpochHeader(
    response,
    "x-toast-ratelimit-reset",
    "toast-ratelimit-reset",
  );
}

export function readRetryAfterEpochMs(
  response: Response,
  nowEpochMs: number,
): number | undefined {
  return retryAfterEpochMs(response, nowEpochMs);
}

/**
 * Derive the Toast API service family from the first request-path segment.
 * This is deliberately source-derived rather than caller supplied: a report
 * handler cannot accidentally label an orders request as another API and
 * escape a known API-level wait.
 */
export function toastApiKeyFromPath(path: `/${string}`): string {
  const key = path.split("/").find((segment) => segment.length > 0);
  if (key === undefined || !/^[a-z0-9_-]+$/iu.test(key)) {
    throw new TypeError("Toast request path did not contain a usable API service key.");
  }
  return key.toLowerCase();
}

/**
 * Tracks only server-observed exhausted constraints. It does not invent a
 * token bucket or decrement `remaining` locally: Toast explicitly reports
 * only the one limit currently closest to exhaustion, so fabricated local
 * counters would claim knowledge the response did not provide.
 */
export class ToastRateLimitCoordinator {
  #waitUntilByConstraint = new Map<string, number>();

  record(
    context: ToastRateLimitRequestContext,
    observation: ToastRateLimitObservation,
  ): void {
    if (observation.primary === undefined) {
      return;
    }

    const key = constraintKey(
      context,
      observation.primary,
      observation.account,
    );
    const waitUntil = observation.retryAfterEpochMs
      ?? (observation.remaining === 0 ? observation.resetAtEpochMs : undefined);

    if (
      waitUntil === undefined
      || (observation.remaining !== 0
        && observation.retryAfterEpochMs === undefined)
    ) {
      // A fresh observation for this exact constraint says it is not
      // exhausted, or lacks enough current-header information to establish a
      // wait. Remove any stale locally retained wait rather than guessing.
      this.#waitUntilByConstraint.delete(key);
      return;
    }

    this.#waitUntilByConstraint.set(key, waitUntil);
  }

  /**
   * Return the longest applicable known wait. A request may simultaneously be
   * subject to restaurant/IP GLOBAL, API and ENDPOINT constraints plus
   * account-level API/ENDPOINT constraints. It is safe to proceed only when
   * every observed exhausted constraint has reset.
   */
  waitMilliseconds(
    context: ToastRateLimitRequestContext,
    nowEpochMs: number,
  ): number {
    let waitMs = 0;

    for (const key of applicableConstraintKeys(context)) {
      const waitUntil = this.#waitUntilByConstraint.get(key);
      if (waitUntil === undefined) {
        continue;
      }
      if (waitUntil <= nowEpochMs) {
        this.#waitUntilByConstraint.delete(key);
        continue;
      }
      waitMs = Math.max(waitMs, waitUntil - nowEpochMs);
    }

    return waitMs;
  }
}

function parseRateLimitBy(raw: string | null): {
  readonly primary: ToastRateLimitPrimary | undefined;
  readonly account: boolean;
} {
  if (raw === null) {
    return { primary: undefined, account: false };
  }

  const values = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const primary = values.find(
    (value): value is ToastRateLimitPrimary =>
      value === "GLOBAL" || value === "API" || value === "ENDPOINT",
  );

  return {
    primary,
    account: values.includes("ACCOUNT"),
  };
}

function applicableConstraintKeys(
  context: ToastRateLimitRequestContext,
): readonly string[] {
  const scoped = scopeKey(context.restaurantGuid);
  return [
    `${scoped}:GLOBAL`,
    `${scoped}:API:${context.apiKey}`,
    `${scoped}:ENDPOINT:${context.apiKey}:${context.endpointKey}`,
    `account:API:${context.apiKey}`,
    `account:ENDPOINT:${context.apiKey}:${context.endpointKey}`,
  ];
}

function constraintKey(
  context: ToastRateLimitRequestContext,
  primary: ToastRateLimitPrimary,
  account: boolean,
): string {
  if (account && primary !== "GLOBAL") {
    return primary === "API"
      ? `account:API:${context.apiKey}`
      : `account:ENDPOINT:${context.apiKey}:${context.endpointKey}`;
  }

  const scoped = scopeKey(context.restaurantGuid);
  if (primary === "GLOBAL") {
    return `${scoped}:GLOBAL`;
  }
  if (primary === "API") {
    return `${scoped}:API:${context.apiKey}`;
  }
  return `${scoped}:ENDPOINT:${context.apiKey}:${context.endpointKey}`;
}

function scopeKey(restaurantGuid: string | undefined): string {
  return restaurantGuid === undefined
    ? "credential"
    : `restaurant:${restaurantGuid}`;
}

function currentHeader(response: Response, name: string): string | null {
  return response.headers.get(name);
}

function currentNonNegativeIntegerHeader(
  response: Response,
  name: string,
): number | undefined {
  return parseNonNegativeInteger(currentHeader(response, name));
}

function currentAbsoluteEpochHeader(
  response: Response,
  name: string,
): number | undefined {
  const parsed = currentNonNegativeIntegerHeader(response, name);
  return parsed === undefined ? undefined : absoluteEpochMilliseconds(parsed);
}

function currentOrLegacyHeader(
  response: Response,
  currentName: string,
  legacyName: string,
): string | null {
  const current = currentHeader(response, currentName);
  return current !== null ? current : response.headers.get(legacyName);
}

function nonNegativeIntegerHeader(
  response: Response,
  currentName: string,
  legacyName: string,
): number | undefined {
  return parseNonNegativeInteger(
    currentOrLegacyHeader(response, currentName, legacyName),
  );
}

function parseNonNegativeInteger(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/u.test(raw.trim())) {
    return undefined;
  }

  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Toast now documents `X-Toast-RateLimit-Reset` as an absolute UNIX epoch.
 * Accept epoch seconds (normal form) and epoch milliseconds (defensive
 * compatibility), but never reinterpret a small value as a relative delay.
 */
function absoluteEpochHeader(
  response: Response,
  currentName: string,
  legacyName: string,
): number | undefined {
  const parsed = nonNegativeIntegerHeader(response, currentName, legacyName);
  return parsed === undefined ? undefined : absoluteEpochMilliseconds(parsed);
}

function absoluteEpochMilliseconds(value: number): number {
  return value > 9_999_999_999 ? value : value * 1000;
}

function retryAfterEpochMs(
  response: Response,
  nowEpochMs: number,
): number | undefined {
  const raw = response.headers.get("retry-after");
  if (raw === null) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (/^\d+$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      return nowEpochMs + seconds * 1000;
    }
  }

  const parsedDate = Date.parse(trimmed);
  return Number.isNaN(parsedDate) ? undefined : parsedDate;
}
