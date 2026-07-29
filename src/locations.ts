import { z } from "zod";

import type { RuntimeConfig } from "./config.js";
import type { ToastHttpClient } from "./transport.js";

const STANDARD_RESTAURANTS_PATH = "/restaurants/v1/restaurants";
const STANDARD_RESTAURANTS_RATE_LIMIT_KEY = "restaurants";

const restaurantGuidSchema = z.string().uuid();
const toastRestaurantSchema = z
  .object({
    guid: restaurantGuidSchema,
    name: z.string().min(1),
    timeZone: z.string().min(1),
    closeoutHour: z.number().int().min(0).max(23),
  })
  .passthrough();

const toastRestaurantsResponseSchema = z
  .object({
    restaurants: z.array(toastRestaurantSchema).min(1),
  })
  .passthrough();

export interface ToastLocation {
  readonly restaurantGuid: string;
  readonly name: string;
  readonly timezone: string;
  readonly closeoutHour: number;
}

export interface ToastLocationDiscovery {
  readonly bootstrapRestaurantGuid: string;
  readonly locations: readonly ToastLocation[];
}

export type ToastLocationErrorCode =
  | "location_bootstrap_guid_required"
  | "location_bootstrap_guid_inaccessible"
  | "location_guid_repeated"
  | "location_response_invalid";

export class ToastLocationError extends Error {
  readonly code: ToastLocationErrorCode;
  readonly retryable: false;

  constructor(code: ToastLocationErrorCode, message: string) {
    super(message);
    this.name = "ToastLocationError";
    this.code = code;
    this.retryable = false;
  }
}

export interface ToastLocationRegistry {
  get(config: RuntimeConfig, restaurantGuid: string): ToastLocation | undefined;
  list(config: RuntimeConfig): readonly ToastLocation[];
  replace(config: RuntimeConfig, locations: readonly ToastLocation[]): void;
}

class InMemoryToastLocationRegistry implements ToastLocationRegistry {
  #locationsByConfig = new WeakMap<RuntimeConfig, ReadonlyMap<string, ToastLocation>>();

  get(config: RuntimeConfig, restaurantGuid: string): ToastLocation | undefined {
    return this.#locationsByConfig.get(config)?.get(restaurantGuid);
  }

  list(config: RuntimeConfig): readonly ToastLocation[] {
    return Object.freeze([
      ...(this.#locationsByConfig.get(config)?.values() ?? []),
    ]);
  }

  replace(config: RuntimeConfig, locations: readonly ToastLocation[]): void {
    const byGuid = new Map<string, ToastLocation>();

    for (const location of locations) {
      byGuid.set(location.restaurantGuid, Object.freeze({ ...location }));
    }

    this.#locationsByConfig.set(config, byGuid);
  }
}

export function createLocationRegistry(): ToastLocationRegistry {
  return new InMemoryToastLocationRegistry();
}

export async function discoverStandardLocations(options: {
  readonly config: RuntimeConfig;
  readonly registry: ToastLocationRegistry;
  readonly toastHttpClient: ToastHttpClient;
}): Promise<ToastLocationDiscovery> {
  const bootstrapRestaurantGuid = options.config.defaultRestaurantGuid;

  if (bootstrapRestaurantGuid === undefined) {
    throw new ToastLocationError(
      "location_bootstrap_guid_required",
      "Toast location discovery requires TOAST_DEFAULT_RESTAURANT_GUID as an explicit bootstrap restaurant GUID.",
    );
  }

  const payload = await options.toastHttpClient.getJson({
    path: STANDARD_RESTAURANTS_PATH,
    restaurantGuid: bootstrapRestaurantGuid,
    rateLimitKey: STANDARD_RESTAURANTS_RATE_LIMIT_KEY,
  });
  const locations = normalizeStandardLocations(payload, bootstrapRestaurantGuid);

  options.registry.replace(options.config, locations);

  return Object.freeze({
    bootstrapRestaurantGuid,
    locations,
  });
}

function normalizeStandardLocations(
  payload: unknown,
  bootstrapRestaurantGuid: string,
): readonly ToastLocation[] {
  const parsed = toastRestaurantsResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ToastLocationError(
      "location_response_invalid",
      "Toast restaurants response was not usable for location discovery.",
    );
  }

  const seenGuids = new Set<string>();
  const locations: ToastLocation[] = [];

  for (const restaurant of parsed.data.restaurants) {
    if (seenGuids.has(restaurant.guid)) {
      throw new ToastLocationError(
        "location_guid_repeated",
        "Toast restaurants response contained a repeated restaurant GUID.",
      );
    }

    seenGuids.add(restaurant.guid);
    locations.push(Object.freeze({
      restaurantGuid: restaurant.guid,
      name: restaurant.name,
      timezone: restaurant.timeZone,
      closeoutHour: restaurant.closeoutHour,
    }));
  }

  if (!seenGuids.has(bootstrapRestaurantGuid)) {
    throw new ToastLocationError(
      "location_bootstrap_guid_inaccessible",
      "Toast restaurants response did not include the bootstrap restaurant GUID.",
    );
  }

  return Object.freeze(locations);
}
