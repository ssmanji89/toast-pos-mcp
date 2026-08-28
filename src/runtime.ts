import {
  createAnalyticsOAuthTokenManager,
  createOAuthTokenManager,
  type OAuthFetch,
  type OAuthTokenManager,
} from "./auth.js";
import {
  getAnalyticsRuntimeConfig,
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigSource,
} from "./config.js";
import {
  createAnalyticsAccessAdapter,
  type AnalyticsAccessAdapter,
} from "./analytics-access.js";
import {
  createAnalyticsReportJobAdapter,
  type AnalyticsReportJobAdapter,
} from "./analytics-report-jobs.js";
import { StandardDimensionContextProvider } from "./dimension-context.js";
import {
  createLocationRegistry,
  discoverStandardLocations,
  type ToastLocation,
  type ToastLocationDiscovery,
  type ToastLocationDiscoveryProvenance,
  type ToastLocationRegistry,
} from "./locations.js";
import {
  createRateLimitAwareToastHttpClient,
  type RateLimitAwareToastHttpClient,
} from "./rate-limited-client.js";
import {
  DEFAULT_LOCATION_CONTEXT_MAX_AGE_MS,
  type ReportContextFreshness,
} from "./report-contract.js";
import {
  ToastHttpError,
  type ToastHttpClientOptions,
} from "./transport.js";
import { createServer } from "./server.js";

export interface ApplicationRuntimeOptions {
  readonly env?: RuntimeConfigSource;
  readonly authFetch?: OAuthFetch;
  readonly dataFetch?: typeof fetch;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly maxAttempts?: number;
  readonly maxOrdersBulkPages?: number;
  readonly maxRateLimitWaitMs?: number;
  readonly locationContextMaxAgeMs?: number;
}

export interface ApplicationLocationContext {
  readonly location: ToastLocation;
  readonly provenance: ToastLocationDiscoveryProvenance;
  readonly freshness: ReportContextFreshness;
}

export interface ApplicationLocationContextOptions {
  /**
   * Report callers commonly forward another optional options object. Accept a
   * present undefined here, then treat it exactly like absence at runtime;
   * no base transport contract is widened by this report-facing boundary.
   */
  readonly signal?: AbortSignal | undefined;
}

export type ApplicationRuntimeErrorCode =
  | "runtime_default_restaurant_required"
  | "runtime_location_provenance_missing"
  | "runtime_restaurant_inaccessible";

export class ApplicationRuntimeError extends Error {
  readonly code: ApplicationRuntimeErrorCode;
  readonly retryable: false;

  constructor(code: ApplicationRuntimeErrorCode, message: string) {
    super(message);
    this.name = "ApplicationRuntimeError";
    this.code = code;
    this.retryable = false;
  }
}

/**
 * One process-owned runtime identity shared by every MCP server instance that
 * `serveStdio(factory)` creates for this process. MCP connection/session state
 * belongs to the SDK-created server instance; Toast application state does not.
 *
 * The same exact RuntimeConfig object owns the credential WeakMap identity,
 * token manager, HTTP client, location registry, and the provenance for the
 * exact registry generation currently published. Tool handlers never reload
 * environment variables or construct "equivalent" config objects.
 */
export class ApplicationRuntime {
  readonly analyticsAccess: AnalyticsAccessAdapter | undefined;
  /** Internal T5-002 seam. T5-003 alone may present it through MCP. */
  readonly analyticsReportJobs: AnalyticsReportJobAdapter | undefined;
  readonly config: RuntimeConfig;
  readonly dimensionContextProvider: StandardDimensionContextProvider;
  readonly locationContextMaxAgeMs: number;
  readonly locationRegistry: ToastLocationRegistry;
  readonly now: () => number;
  readonly toastHttpClient: RateLimitAwareToastHttpClient;
  readonly tokenManager: OAuthTokenManager;

  /**
   * This promise is not the raw discovery promise. It resolves only after the
   * discovered registry generation and its provenance have both been bound to
   * this runtime, so every concurrent first-use/refresh waiter observes one
   * atomic context publication.
   */
  #locationDiscoveryInFlight: Promise<ToastLocationDiscovery> | undefined;
  #locationProvenance: ToastLocationDiscoveryProvenance | undefined;

  constructor(
    config: RuntimeConfig,
    tokenManager: OAuthTokenManager,
    toastHttpClient: RateLimitAwareToastHttpClient,
    locationRegistry: ToastLocationRegistry,
    now: () => number,
    locationContextMaxAgeMs = DEFAULT_LOCATION_CONTEXT_MAX_AGE_MS,
    dimensionContextProvider = new StandardDimensionContextProvider(
      toastHttpClient,
      now,
    ),
    analyticsAccess: AnalyticsAccessAdapter | undefined = undefined,
    analyticsReportJobs: AnalyticsReportJobAdapter | undefined = undefined,
  ) {
    if (
      !Number.isSafeInteger(locationContextMaxAgeMs)
      || locationContextMaxAgeMs <= 0
    ) {
      throw new RangeError(
        "ApplicationRuntime locationContextMaxAgeMs must be a positive safe integer.",
      );
    }

    this.config = config;
    this.tokenManager = tokenManager;
    this.toastHttpClient = toastHttpClient;
    this.locationRegistry = locationRegistry;
    this.now = now;
    this.locationContextMaxAgeMs = locationContextMaxAgeMs;
    this.dimensionContextProvider = dimensionContextProvider;
    this.analyticsAccess = analyticsAccess;
    this.analyticsReportJobs = analyticsReportJobs;
  }

  async getLocation(
    requestedRestaurantGuid?: string,
    options: ApplicationLocationContextOptions = {},
  ): Promise<ToastLocation> {
    return (await this.getLocationContext(requestedRestaurantGuid, options)).location;
  }

  async getLocationContext(
    requestedRestaurantGuid?: string,
    options: ApplicationLocationContextOptions = {},
  ): Promise<ApplicationLocationContext> {
    throwIfRuntimeRequestCancelled(options.signal);

    const restaurantGuid = (
      requestedRestaurantGuid ?? this.config.defaultRestaurantGuid
    )?.toLowerCase();

    if (restaurantGuid === undefined) {
      throw new ApplicationRuntimeError(
        "runtime_default_restaurant_required",
        "A Toast reporting tool requires an explicit restaurant GUID or TOAST_DEFAULT_RESTAURANT_GUID.",
      );
    }

    // Never serve a registry generation while its owning discovery is still
    // publishing provenance. discoverStandardLocations() replaces the registry
    // just before its promise resolves, so consulting the registry first would
    // expose a registry-without-provenance race window.
    let waitedForDiscovery = false;
    if (this.#locationDiscoveryInFlight !== undefined) {
      await waitForSharedDiscovery(
        this.#locationDiscoveryInFlight,
        options.signal,
      );
      throwIfRuntimeRequestCancelled(options.signal);
      waitedForDiscovery = true;
    }

    // Toast recommends polling Partners connections a few times per day and
    // Restaurants configuration at least daily. A stale generation is not
    // allowed to back a `complete` report: refresh first, and propagate a
    // refresh failure rather than silently serving the older context.
    if (!waitedForDiscovery && this.#locationContextIsStale()) {
      await waitForSharedDiscovery(this.#ensureLocationDiscovery(), options.signal);
      throwIfRuntimeRequestCancelled(options.signal);
    }

    let location = this.locationRegistry.get(this.config, restaurantGuid);
    if (location === undefined && this.locationRegistry.list(this.config).length === 0) {
      // Location discovery is process-owned shared bootstrap state. One MCP
      // request may stop waiting for it, but must not abort the shared
      // discovery another concurrent request may still require.
      await waitForSharedDiscovery(this.#ensureLocationDiscovery(), options.signal);
      throwIfRuntimeRequestCancelled(options.signal);
      location = this.locationRegistry.get(this.config, restaurantGuid);
    }

    if (location === undefined) {
      throw new ApplicationRuntimeError(
        "runtime_restaurant_inaccessible",
        "The requested Toast restaurant is not present in the validated active location context.",
      );
    }
    const provenance = this.#locationProvenance;
    if (provenance === undefined) {
      // A location without provenance could only be introduced through a
      // future/manual registry mutation outside the reviewed runtime path.
      // Do not silently bless it as production report context.
      throw new ApplicationRuntimeError(
        "runtime_location_provenance_missing",
        "The validated Toast location context did not have matching source provenance.",
      );
    }

    return Object.freeze({
      location,
      provenance,
      freshness: this.#freshness(provenance),
    });
  }

  #locationContextIsStale(): boolean {
    const provenance = this.#locationProvenance;
    if (provenance === undefined) {
      return false;
    }
    const ageMs = this.now() - provenance.retrievedThroughEpochMs;
    // A clock rollback invalidates the age calculation; one fresh discovery
    // re-bases provenance to the same injected clock rather than declaring an
    // unprovable negative age current.
    return ageMs < 0 || ageMs >= this.locationContextMaxAgeMs;
  }

  #freshness(
    provenance: ToastLocationDiscoveryProvenance,
  ): ReportContextFreshness {
    return Object.freeze({
      retrievedThroughEpochMs: provenance.retrievedThroughEpochMs,
      ageMs: Math.max(0, this.now() - provenance.retrievedThroughEpochMs),
      maxAgeMs: this.locationContextMaxAgeMs,
    });
  }

  async #ensureLocationDiscovery(): Promise<ToastLocationDiscovery> {
    if (this.#locationDiscoveryInFlight !== undefined) {
      return this.#locationDiscoveryInFlight;
    }

    const discovery = discoverStandardLocations({
      config: this.config,
      registry: this.locationRegistry,
      toastHttpClient: this.toastHttpClient,
    }).then((result) => {
      // Bind provenance inside the exact promise stored in
      // #locationDiscoveryInFlight. No waiter can observe resolution before
      // this assignment has happened.
      this.#locationProvenance = result.provenance;
      return result;
    });
    this.#locationDiscoveryInFlight = discovery;

    try {
      return await discovery;
    } finally {
      if (this.#locationDiscoveryInFlight === discovery) {
        this.#locationDiscoveryInFlight = undefined;
      }
    }
  }
}

export function createApplicationRuntime(
  options: ApplicationRuntimeOptions = {},
): ApplicationRuntime {
  const config = loadRuntimeConfig(options.env ?? process.env);
  const now = options.now ?? Date.now;
  const tokenManager = createOAuthTokenManager(config, {
    ...(options.authFetch !== undefined ? { fetch: options.authFetch } : {}),
    now,
  });

  const transportOptions: ToastHttpClientOptions = {
    ...(options.dataFetch !== undefined ? { fetch: options.dataFetch } : {}),
    ...(options.maxAttempts !== undefined
      ? { maxAttempts: options.maxAttempts }
      : {}),
    ...(options.maxOrdersBulkPages !== undefined
      ? { maxOrdersBulkPages: options.maxOrdersBulkPages }
      : {}),
    ...(options.maxRateLimitWaitMs !== undefined
      ? { maxRateLimitWaitMs: options.maxRateLimitWaitMs }
      : {}),
    ...(options.random !== undefined ? { random: options.random } : {}),
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    now,
  };
  const toastHttpClient = createRateLimitAwareToastHttpClient(
    config,
    tokenManager,
    transportOptions,
  );
  const analyticsConfig = getAnalyticsRuntimeConfig(config);
  const analyticsTokenManager = analyticsConfig === undefined
    ? undefined
    : createAnalyticsOAuthTokenManager(analyticsConfig, {
        ...(options.authFetch !== undefined ? { fetch: options.authFetch } : {}),
        now,
      });
  const analyticsAccess = analyticsConfig === undefined || analyticsTokenManager === undefined
    ? undefined
    : createAnalyticsAccessAdapter({
      identity: analyticsConfig,
      tokenManager: analyticsTokenManager,
      hostname: analyticsConfig.apiHostname,
      ...(options.dataFetch !== undefined ? { fetch: options.dataFetch } : {}),
      now,
      ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    });
  const analyticsReportJobs = analyticsConfig === undefined
    || analyticsTokenManager === undefined
    || analyticsAccess === undefined
    ? undefined
    : createAnalyticsReportJobAdapter({
      access: analyticsAccess,
      identity: analyticsConfig,
      tokenManager: analyticsTokenManager,
      hostname: analyticsConfig.apiHostname,
      ...(options.dataFetch !== undefined ? { fetch: options.dataFetch } : {}),
      now,
      ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    });

  return new ApplicationRuntime(
    config,
    tokenManager,
    toastHttpClient,
    createLocationRegistry(),
    now,
    options.locationContextMaxAgeMs ?? DEFAULT_LOCATION_CONTEXT_MAX_AGE_MS,
    undefined,
    analyticsAccess,
    analyticsReportJobs,
  );
}

/** Compatibility factory for transport-composition tests without report tools. */
export function createRuntime(
  config: RuntimeConfig,
  tokenManager: OAuthTokenManager,
  options: ToastHttpClientOptions = {},
) {
  const toastHttpClient = createRateLimitAwareToastHttpClient(
    config,
    tokenManager,
    options,
  );
  return Object.freeze({ toastHttpClient, server: createServer() });
}

async function waitForSharedDiscovery(
  discovery: Promise<ToastLocationDiscovery>,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal === undefined) {
    await discovery;
    return;
  }
  throwIfRuntimeRequestCancelled(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    const onAbort = (): void => finish(requestCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    discovery.then(() => finish(), (error: unknown) => finish(error));
  });
}

function throwIfRuntimeRequestCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw requestCancelledError();
}

function requestCancelledError(): ToastHttpError {
  return new ToastHttpError(
    "request_cancelled",
    "Toast reporting request was cancelled before completion.",
    { apiFamily: "standard", retryable: false },
  );
}
