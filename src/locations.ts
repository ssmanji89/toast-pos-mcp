import { z } from "zod";

import type { RuntimeConfig } from "./config.js";
import type { ToastHttpClient } from "./transport.js";

const STANDARD_RESTAURANTS_PATH = "/restaurants/v1/restaurants";
const STANDARD_RESTAURANTS_RATE_LIMIT_KEY = "restaurants";

// A real IANA time zone identifier is never a bare UTC offset designator
// ("-05:00", "+05:30", "UTC-08:00", ...). Some current ICU/V8 builds accept
// these strings in `Intl.DateTimeFormat`'s `timeZone` option anyway, because
// TC39's "sanctioned" single-offset time zone extension to ECMA-402 has
// begun landing in newer engines (confirmed present on a current Node,
// absent on the Node 20 floor this project targets today; see the
// implementation note below). Rejecting this shape explicitly, before ever
// asking `Intl`, keeps rule 8's business-date foundation correct regardless
// of which ICU a given host ships, instead of depending on that variance.
const UTC_OFFSET_DESIGNATOR_PATTERN = /^(?:UTC|GMT)?[+-]\d{1,2}:?\d{2}$/i;

function isValidIanaTimeZone(candidate: string): boolean {
  if (UTC_OFFSET_DESIGNATOR_PATTERN.test(candidate)) {
    return false;
  }

  try {
    // `Intl.DateTimeFormat` throws a `RangeError` for a `timeZone` value its
    // ICU data does not recognize as a valid identifier. This is
    // deliberately not checked against a hardcoded zone list: the set of
    // valid IANA zones changes over time (renames, additions, deprecations)
    // and varies by platform ICU data, and a hardcoded list would drift out
    // of date. Delegating recognition to the host's own ICU accepts
    // legitimate zones broadly. See the ICU-portability implementation
    // note below for what this means on a minimal-ICU Node build.
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

// ICU-portability note, not sourced from Toast documentation: this
// validation depends on the host Node runtime shipping ICU time zone data.
// The officially distributed Node binaries (nodejs.org downloads, and the
// nvm-installed versions this project's gate is verified against per
// LOOP.md) always ship "full-icu" by default and always recognize the
// standard IANA zone set. A Node built from source with
// `--with-intl=small-icu` or `--with-intl=none` is a non-default,
// non-distributed configuration this project does not target; on such a
// build `Intl.DateTimeFormat` either lacks the `timeZone` option's full
// data or throws when constructed with one, which this code treats as an
// invalid zone and fails closed (rejecting every candidate, including
// legitimate ones) rather than silently accepting an unvalidated string.
// Failing closed by over-rejecting is the correct direction for rule 11;
// it never fabricates a false "valid" result. Operators are expected to run
// a standard full-icu Node distribution, consistent with this project's
// `engines.node` floor.
const restaurantGuidSchema = z.string().uuid();
const timeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidIanaTimeZone, {
    message:
      "must be a recognized IANA time zone identifier, not a fixed UTC offset or an unrecognized string",
  });
const toastRestaurantSchema = z
  .object({
    guid: restaurantGuidSchema,
    name: z.string().min(1),
    timeZone: timeZoneSchema,
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
