export type ToastApiFamily = "standard" | "analytics";

export type ToastRequestScope =
  | {
      readonly kind: "restaurant";
      readonly restaurantGuid: string;
    }
  | {
      readonly kind: "credential";
    };

export interface ToastRateLimitRequestContext {
  readonly apiFamily: ToastApiFamily;
  readonly apiKey: string;
  readonly endpointKey: string;
  readonly requestScope: ToastRequestScope;
}

export type ToastRateLimitPrimaryScope =
  | "GLOBAL"
  | "API"
  | "ENDPOINT"
  | "UNKNOWN";

export interface ToastRateLimitBy {
  readonly primary: ToastRateLimitPrimaryScope;
  readonly account: boolean;
  readonly raw: readonly string[];
}

export interface ToastRateLimitObservation {
  readonly context: ToastRateLimitRequestContext;
  readonly by: ToastRateLimitBy;
  readonly remaining: number | undefined;
  readonly resetAtEpochMs: number | undefined;
  readonly retryAfterEpochMs: number | undefined;
  readonly observedAtEpochMs: number;
}

export interface ToastRateLimitSnapshot extends ToastRateLimitObservation {
  readonly bucketKey: string;
}

/**
 * One process-owned in-memory coordinator per Toast credential/runtime.
 *
 * Toast reports the bucket closest to exhaustion in `X-Toast-RateLimit-By`.
 * We therefore retain observations from multiple buckets instead of replacing
 * all rate-limit state with the most recent response. Before a request, every
 * bucket that can apply to that request is consulted and the latest required
 * wait is returned.
 *
 * GLOBAL and unknown-conservative buckets are deliberately cross-family so a
 * future Analytics adapter can share the same credential-wide throttle with
 * Standard traffic rather than creating a second pseudo-global limiter.
 */
export class ToastRateLimitCoordinator {
  #buckets = new Map<string, ToastRateLimitSnapshot>();

  record(observation: ToastRateLimitObservation): ToastRateLimitSnapshot {
    const bucketKey = bucketKeyForObservation(observation);
    const snapshot = Object.freeze({
      ...observation,
      by: freezeRateLimitBy(observation.by),
      context: freezeRequestContext(observation.context),
      bucketKey,
    });
    this.#buckets.set(bucketKey, snapshot);
    return snapshot;
  }

  applicableSnapshots(
    context: ToastRateLimitRequestContext,
  ): readonly ToastRateLimitSnapshot[] {
    const keys = applicableBucketKeys(context);
    const snapshots = keys
      .map((key) => this.#buckets.get(key))
      .filter((snapshot): snapshot is ToastRateLimitSnapshot =>
        snapshot !== undefined
      );
    return Object.freeze(snapshots);
  }

  requiredWaitUntilEpochMs(
    context: ToastRateLimitRequestContext,
  ): number | undefined {
    let waitUntil: number | undefined;

    for (const snapshot of this.applicableSnapshots(context)) {
      const candidate = effectiveWaitUntil(snapshot);
      if (
        candidate !== undefined &&
        (waitUntil === undefined || candidate > waitUntil)
      ) {
        waitUntil = candidate;
      }
    }

    return waitUntil;
  }

  get(bucketKey: string): ToastRateLimitSnapshot | undefined {
    return this.#buckets.get(bucketKey);
  }

  list(): readonly ToastRateLimitSnapshot[] {
    return Object.freeze([...this.#buckets.values()]);
  }
}

export function parseToastRateLimitBy(value: string | null): ToastRateLimitBy {
  if (value === null || value.trim().length === 0) {
    return freezeRateLimitBy({
      primary: "UNKNOWN",
      account: false,
      raw: [],
    });
  }

  const tokens = value
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter((token) => token.length > 0);
  const primaryTokens = tokens.filter(
    (token) => token === "GLOBAL" || token === "API" || token === "ENDPOINT",
  );
  const primary =
    primaryTokens.length === 1
      ? (primaryTokens[0] as "GLOBAL" | "API" | "ENDPOINT")
      : "UNKNOWN";

  return freezeRateLimitBy({
    primary,
    account: tokens.includes("ACCOUNT"),
    raw: tokens,
  });
}

export function parseNonNegativeIntegerHeader(
  value: string | null,
): number | undefined {
  if (value === null || !/^\d+$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Toast documents X-Toast-RateLimit-Reset as a UNIX timestamp in seconds. */
export function parseToastResetEpochMs(value: string | null): number | undefined {
  const seconds = parseNonNegativeIntegerHeader(value);
  return seconds === undefined ? undefined : seconds * 1000;
}

export function parseRetryAfterEpochMs(
  value: string | null,
  nowEpochMs: number,
): number | undefined {
  if (value === null) {
    return undefined;
  }

  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds) && seconds >= 0) {
      return nowEpochMs + seconds * 1000;
    }
  }

  const parsedDateEpochMs = Date.parse(value);
  return Number.isNaN(parsedDateEpochMs) ? undefined : parsedDateEpochMs;
}

export function makeRateLimitContext(options: {
  readonly apiFamily?: ToastApiFamily;
  readonly path: `/${string}`;
  readonly endpointKey: string;
  readonly requestScope: ToastRequestScope;
}): ToastRateLimitRequestContext {
  return Object.freeze({
    apiFamily: options.apiFamily ?? "standard",
    apiKey: apiKeyFromPath(options.path),
    endpointKey: options.endpointKey,
    requestScope: freezeRequestScope(options.requestScope),
  });
}

export function conservativeRateLimitBy(): ToastRateLimitBy {
  return freezeRateLimitBy({ primary: "UNKNOWN", account: false, raw: [] });
}

function effectiveWaitUntil(
  snapshot: ToastRateLimitSnapshot,
): number | undefined {
  if (snapshot.retryAfterEpochMs !== undefined) {
    return snapshot.retryAfterEpochMs;
  }

  return snapshot.remaining === 0 ? snapshot.resetAtEpochMs : undefined;
}

function bucketKeyForObservation(
  observation: ToastRateLimitObservation,
): string {
  const { context, by } = observation;

  switch (by.primary) {
    case "GLOBAL":
      return globalBucketKey();
    case "API":
      return by.account
        ? apiAccountBucketKey(context)
        : apiScopedBucketKey(context);
    case "ENDPOINT":
      return by.account
        ? endpointAccountBucketKey(context)
        : endpointScopedBucketKey(context);
    case "UNKNOWN":
      // If Toast gives rate-limit timing without a usable By scope, treating
      // it as process/credential-wide is deliberately conservative. The
      // alternative is silently weakening throttling because the client
      // cannot identify the narrower bucket.
      return unknownGlobalBucketKey();
  }
}

function applicableBucketKeys(
  context: ToastRateLimitRequestContext,
): readonly string[] {
  return Object.freeze([
    globalBucketKey(),
    unknownGlobalBucketKey(),
    apiAccountBucketKey(context),
    apiScopedBucketKey(context),
    endpointAccountBucketKey(context),
    endpointScopedBucketKey(context),
  ]);
}

function globalBucketKey(): string {
  return "GLOBAL";
}

function unknownGlobalBucketKey(): string {
  return "UNKNOWN_GLOBAL";
}

function apiAccountBucketKey(context: ToastRateLimitRequestContext): string {
  return `${context.apiFamily}:API:ACCOUNT:${context.apiKey}`;
}

function apiScopedBucketKey(context: ToastRateLimitRequestContext): string {
  return `${context.apiFamily}:API:${context.apiKey}:${scopeKey(context.requestScope)}`;
}

function endpointAccountBucketKey(context: ToastRateLimitRequestContext): string {
  return `${context.apiFamily}:ENDPOINT:ACCOUNT:${context.apiKey}:${context.endpointKey}`;
}

function endpointScopedBucketKey(context: ToastRateLimitRequestContext): string {
  return `${context.apiFamily}:ENDPOINT:${context.apiKey}:${context.endpointKey}:${scopeKey(context.requestScope)}`;
}

function scopeKey(scope: ToastRequestScope): string {
  return scope.kind === "restaurant"
    ? `restaurant:${scope.restaurantGuid.toLowerCase()}`
    : "credential";
}

function apiKeyFromPath(path: `/${string}`): string {
  const [firstSegment] = path.slice(1).split("/");
  if (firstSegment === undefined || firstSegment.length === 0) {
    throw new TypeError("Toast API path must contain an API-family segment.");
  }
  return firstSegment.toLowerCase();
}

function freezeRateLimitBy(by: ToastRateLimitBy): ToastRateLimitBy {
  return Object.freeze({
    primary: by.primary,
    account: by.account,
    raw: Object.freeze([...by.raw]),
  });
}

function freezeRequestContext(
  context: ToastRateLimitRequestContext,
): ToastRateLimitRequestContext {
  return Object.freeze({
    apiFamily: context.apiFamily,
    apiKey: context.apiKey,
    endpointKey: context.endpointKey,
    requestScope: freezeRequestScope(context.requestScope),
  });
}

function freezeRequestScope(scope: ToastRequestScope): ToastRequestScope {
  return scope.kind === "restaurant"
    ? Object.freeze({
        kind: "restaurant" as const,
        restaurantGuid: scope.restaurantGuid.toLowerCase(),
      })
    : Object.freeze({ kind: "credential" as const });
}
