import {
  createOAuthTokenManager,
  type OAuthFetch,
  type OAuthTokenManager,
} from "./auth.js";
import {
  loadRuntimeConfig,
  type RuntimeConfig,
  type RuntimeConfigSource,
} from "./config.js";
import {
  createLocationRegistry,
  discoverStandardLocations,
  type ToastLocation,
  type ToastLocationDiscovery,
  type ToastLocationDiscoveryProvenance,
  type ToastLocationRegistry,
} from "./locations.js";
import { createRateLimitAwareToastHttpClient } from "./rate-limited-client.js";
import type { ToastHttpClient, ToastHttpClientOptions } from "./transport.js";

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
}

export interface ApplicationLocationContext {
  readonly location: ToastLocation;
  readonly provenance: ToastLocationDiscoveryProvenance;
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
  readonly config: RuntimeConfig;
  readonly locationRegistry: ToastLocationRegistry;
  readonly now: () => number;
  readonly toastHttpClient: ToastHttpClient;
  readonly tokenManager: OAuthTokenManager;

  #locationDiscoveryInFlight: Promise<ToastLocationDiscovery> | undefined;
  #locationProvenance: ToastLocationDiscoveryProvenance | undefined;

  constructor(
    config: RuntimeConfig,
    tokenManager: OAuthTokenManager,
    toastHttpClient: ToastHttpClient,
    locationRegistry: ToastLocationRegistry,
    now: () => number,
  ) {
    this.config = config;
    this.tokenManager = tokenManager;
    this.toastHttpClient = toastHttpClient;
    this.locationRegistry = locationRegistry;
    this.now = now;
  }

  async getLocation(requestedRestaurantGuid?: string): Promise<ToastLocation> {
    return (await this.getLocationContext(requestedRestaurantGuid)).location;
  }

  async getLocationContext(
    requestedRestaurantGuid?: string,
  ): Promise<ApplicationLocationContext> {
    const restaurantGuid = (
      requestedRestaurantGuid ?? this.config.defaultRestaurantGuid
    )?.toLowerCase();

    if (restaurantGuid === undefined) {
      throw new ApplicationRuntimeError(
        "runtime_default_restaurant_required",
        "A Toast reporting tool requires an explicit restaurant GUID or TOAST_DEFAULT_RESTAURANT_GUID.",
      );
    }

    let location = this.locationRegistry.get(this.config, restaurantGuid);
    if (location === undefined && this.locationRegistry.list(this.config).length === 0) {
      await this.#ensureLocationDiscovery();
      location = this.locationRegistry.get(this.config, restaurantGuid);
    }

    if (location === undefined) {
      throw new ApplicationRuntimeError(
        "runtime_restaurant_inaccessible",
        "The requested Toast restaurant is not present in the validated active location context.",
      );
    }
    if (this.#locationProvenance === undefined) {
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
      provenance: this.#locationProvenance,
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
    });
    this.#locationDiscoveryInFlight = discovery;

    try {
      const result = await discovery;
      this.#locationProvenance = result.provenance;
      return result;
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

  return new ApplicationRuntime(
    config,
    tokenManager,
    toastHttpClient,
    createLocationRegistry(),
    now,
  );
}
