import { z } from "zod";

import {
  decideAnalyticsCapability,
  type AnalyticsProvisionedScopeProvider,
} from "./capabilities.js";

const ANALYTICS_RESTAURANT_INFORMATION_PATH =
  "/era/v1/restaurants-information" as const;
const MAX_REQUESTS_PER_SECOND = 5;
const MAX_REQUESTS_PER_MINUTE = 30;
const restaurantGuidSchema = z.string().uuid();
const analyticsRestaurantResponseSchema = z.object({
  restaurants: z.array(z.object({
    restaurantGuid: restaurantGuidSchema,
    restaurantName: z.string().min(1),
    active: z.boolean(),
    testMode: z.boolean(),
    archived: z.boolean(),
  })),
});
interface AnalyticsIdentityState {
  registry: AnalyticsRestaurantRegistry | undefined;
  requestEpochMs: number[];
}
const stateByAnalyticsIdentity = new WeakMap<object, AnalyticsIdentityState>();
const registryOwnerByRegistry = new WeakMap<AnalyticsRestaurantRegistry, object>();
const selectionOwnerBySelection = new WeakMap<AnalyticsRestaurantSelection, object>();

export interface AnalyticsRestaurant {
  readonly restaurantGuid: string;
  readonly restaurantName: string;
  readonly active: boolean;
  readonly testMode: boolean;
  readonly archived: boolean;
}

export interface AnalyticsRestaurantRegistry {
  readonly restaurants: readonly AnalyticsRestaurant[];
}

export interface AnalyticsRestaurantSelection {
  readonly restaurantGuids: readonly string[];
}

export type AnalyticsAccessErrorCode =
  | "analytics_scope_unavailable"
  | "analytics_response_invalid"
  | "analytics_request_failed"
  | "analytics_selection_invalid";

export class AnalyticsAccessError extends Error {
  readonly code: AnalyticsAccessErrorCode;
  constructor(code: AnalyticsAccessErrorCode, message: string) {
    super(message);
    this.name = "AnalyticsAccessError";
    this.code = code;
  }
}

export interface AnalyticsTokenManager extends AnalyticsProvisionedScopeProvider {
  getAuthorizationHeader(): Promise<string>;
}

export interface AnalyticsAccessAdapterOptions {
  readonly identity: object;
  readonly tokenManager: AnalyticsTokenManager;
  readonly hostname: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** Closed Analytics source. This slice permits only restaurant-information GET. */
export class AnalyticsAccessAdapter {
  #fetch: typeof fetch;
  #hostname: string;
  #identity: object;
  #now: () => number;
  #state: AnalyticsIdentityState;
  #sleep: (milliseconds: number) => Promise<void>;
  #tokenManager: AnalyticsTokenManager;

  constructor(options: AnalyticsAccessAdapterOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#hostname = options.hostname;
    this.#identity = options.identity;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? (async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#tokenManager = options.tokenManager;
    this.#state = stateByAnalyticsIdentity.get(
      analyticsIdentityStateKey(options.identity),
    )
      ?? { registry: undefined, requestEpochMs: [] };
    stateByAnalyticsIdentity.set(
      analyticsIdentityStateKey(options.identity),
      this.#state,
    );
  }

  currentRegistry(): AnalyticsRestaurantRegistry | undefined {
    return this.#state.registry;
  }

  async refreshManagementGroupRestaurants(options: { readonly signal?: AbortSignal } = {}): Promise<AnalyticsRestaurantRegistry> {
    throwIfAnalyticsRequestCancelled(options.signal);
    const decision = await decideAnalyticsCapability(this.#tokenManager);
    if (decision.status === "denied") {
      throw new AnalyticsAccessError("analytics_scope_unavailable", "Analytics access is denied because enterprise-metrics:read is not provisioned.");
    }
    await this.#waitForEndpointCapacity(options.signal);
    let response: Response;
    try {
      response = await this.#fetch(
        `https://${this.#hostname}${ANALYTICS_RESTAURANT_INFORMATION_PATH}`,
        {
          method: "GET",
          headers: { authorization: await this.#tokenManager.getAuthorizationHeader() },
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
        },
      );
    } catch {
      throw analyticsRequestFailure();
    }
    if (!response.ok) {
      throw new AnalyticsAccessError("analytics_request_failed", "Analytics restaurant-information request did not succeed.");
    }
    let body: unknown;
    try { body = await response.json(); } catch {
      throw new AnalyticsAccessError("analytics_response_invalid", "Analytics restaurant-information response was not valid JSON.");
    }
    const registry = bindAnalyticsRegistry(
      normalizeAnalyticsRegistry(body),
      this.#identity,
    );
    this.#state.registry = registry;
    return registry;
  }

  assertSelectionForCurrentIdentity(
    selection: AnalyticsRestaurantSelection,
  ): void {
    if (selectionOwnerBySelection.get(selection) !== this.#identity) {
      throw selectionError();
    }
  }

  async #waitForEndpointCapacity(signal: AbortSignal | undefined): Promise<void> {
    throwIfAnalyticsRequestCancelled(signal);
    const now = this.#now();
    this.#state.requestEpochMs = this.#state.requestEpochMs.filter((at) => at > now - 60_000);
    const secondCount = this.#state.requestEpochMs.filter((at) => at > now - 1_000).length;
    if (secondCount >= MAX_REQUESTS_PER_SECOND || this.#state.requestEpochMs.length >= MAX_REQUESTS_PER_MINUTE) {
      const boundary = secondCount >= MAX_REQUESTS_PER_SECOND
        ? this.#state.requestEpochMs[this.#state.requestEpochMs.length - secondCount]! + 1_000
        : this.#state.requestEpochMs[0]! + 60_000;
      await this.#sleep(Math.max(1, boundary - now));
      throwIfAnalyticsRequestCancelled(signal);
      return this.#waitForEndpointCapacity(signal);
    }
    this.#state.requestEpochMs.push(now);
  }
}

export function createAnalyticsAccessAdapter(
  options: AnalyticsAccessAdapterOptions,
): AnalyticsAccessAdapter {
  return new AnalyticsAccessAdapter(options);
}

export function validateAnalyticsRestaurantSelection(
  registry: AnalyticsRestaurantRegistry,
  restaurantGuids: readonly string[],
): AnalyticsRestaurantSelection {
  const identity: object | undefined = registryOwnerByRegistry.get(registry);
  if (identity === undefined) throw selectionError();
  if (restaurantGuids.length === 0) throw selectionError();
  const registryByGuid = new Set(registry.restaurants.map((restaurant) => restaurant.restaurantGuid));
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const restaurantGuid of restaurantGuids) {
    if (!restaurantGuidSchema.safeParse(restaurantGuid).success) {
      throw selectionError();
    }
    const guid = restaurantGuid.toLowerCase();
    if (seen.has(guid) || !registryByGuid.has(guid)) {
      throw selectionError();
    }
    seen.add(guid);
    normalized.push(guid);
  }
  normalized.sort();
  const selection = Object.freeze({ restaurantGuids: Object.freeze(normalized) });
  selectionOwnerBySelection.set(selection, identity);
  return selection;
}

function bindAnalyticsRegistry(
  registry: AnalyticsRestaurantRegistry,
  identity: object,
): AnalyticsRestaurantRegistry {
  registryOwnerByRegistry.set(registry, identity);
  return registry;
}

function analyticsIdentityStateKey(identity: object): object {
  return identity;
}

function normalizeAnalyticsRegistry(payload: unknown): AnalyticsRestaurantRegistry {
  const parsed = analyticsRestaurantResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AnalyticsAccessError("analytics_response_invalid", "Analytics restaurant-information response did not match the required restaurant schema.");
  const seenRestaurantGuids = new Set<string>();
  const restaurants: AnalyticsRestaurant[] = [];
  for (const source of parsed.data.restaurants) {
    const restaurantGuid = source.restaurantGuid.toLowerCase();
    if (seenRestaurantGuids.has(restaurantGuid)) {
      throw new AnalyticsAccessError("analytics_response_invalid", "Analytics restaurant-information response contained a repeated restaurant GUID.");
    }
    seenRestaurantGuids.add(restaurantGuid);
    restaurants.push(Object.freeze({ restaurantGuid, restaurantName: source.restaurantName, active: source.active, testMode: source.testMode, archived: source.archived }));
  }
  return Object.freeze({ restaurants: Object.freeze(restaurants) });
}

function selectionError(): AnalyticsAccessError {
  return new AnalyticsAccessError("analytics_selection_invalid", "Analytics restaurant selection must be a non-empty unique UUID subset of the validated management-group registry.");
}

function throwIfAnalyticsRequestCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw analyticsRequestFailure();
}

function analyticsRequestFailure(): AnalyticsAccessError {
  return new AnalyticsAccessError(
    "analytics_request_failed",
    "Analytics restaurant-information request did not complete.",
  );
}
