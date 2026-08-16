import { z } from "zod";

import type { RuntimeConfig } from "./config.js";
import type {
  ToastDetailedJsonResult,
  ToastHttpClient,
} from "./transport.js";

const STANDARD_RESTAURANT_DETAIL_LIMITER_KEY = "restaurantInfo";
const MIN_CLOSEOUT_HOUR = 0;
const MAX_CLOSEOUT_HOUR = 12;
const MAX_SCOPE_LENGTH = 128;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;

// A real IANA time zone identifier is never a bare UTC offset designator
// ("-05:00", "+05:30", "UTC-08:00", ...). Some current ICU/V8 builds accept
// these strings in `Intl.DateTimeFormat`'s `timeZone` option. Rejecting this
// shape explicitly keeps rule 8's business-date foundation independent of
// which ICU version the host ships.
const UTC_OFFSET_DESIGNATOR_PATTERN = /^(?:UTC|GMT)?[+-]\d{1,2}:?\d{2}$/i;

function isValidIanaTimeZone(candidate: string): boolean {
  if (UTC_OFFSET_DESIGNATOR_PATTERN.test(candidate)) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

const restaurantGuidSchema = z.string().uuid();
const optionalManagementGroupGuidSchema = z
  .string()
  .uuid()
  .nullable()
  .optional();
const timeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidIanaTimeZone, {
    message:
      "must be a recognized IANA time zone identifier, not a fixed UTC offset or an unrecognized string",
  });
const connectionScopeSchema = z
  .string()
  .min(1)
  .max(MAX_SCOPE_LENGTH)
  .refine(
    (scope) => scope === scope.trim() && SCOPE_PATTERN.test(scope),
    "must be a valid Toast scope string",
  );

/**
 * Minimal projection of Toast's PartnerAccessExternalRep. The upstream object
 * can contain partner contact/email/external-reference/timestamp fields; none
 * of those survive this schema projection into the reporting runtime.
 */
const partnerAccessRestaurantSchema = z
  .object({
    restaurantGuid: restaurantGuidSchema,
    managementGroupGuid: optionalManagementGroupGuidSchema,
    scopes: z.array(connectionScopeSchema),
    deleted: z.boolean().optional(),
  })
  .passthrough();
const partnerAccessResponseSchema = z.array(partnerAccessRestaurantSchema);

/** Minimal report-critical projection of Toast RestaurantInfo. */
const restaurantInfoSchema = z
  .object({
    guid: restaurantGuidSchema,
    general: z
      .object({
        name: z.string().min(1),
        timeZone: timeZoneSchema,
        closeoutHour: z
          .number()
          .int()
          .min(MIN_CLOSEOUT_HOUR)
          .max(MAX_CLOSEOUT_HOUR),
        currencyCode: z
          .string()
          .regex(CURRENCY_CODE_PATTERN),
        managementGroupGuid: optionalManagementGroupGuidSchema,
      })
      .passthrough(),
  })
  .passthrough();

export interface ToastLocation {
  readonly restaurantGuid: string;
  readonly name: string;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly currencyCode: string;
  readonly managementGroupGuid?: string;
  readonly connectionScopes: readonly string[];
  readonly contextRetrievedAtEpochMs: number;
}

export interface ToastLocationDiscovery {
  readonly bootstrapRestaurantGuid: string;
  readonly locations: readonly ToastLocation[];
  readonly accessibleRestaurantsRetrievedAtEpochMs: number;
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
  #locationsByConfig = new WeakMap<
    RuntimeConfig,
    ReadonlyMap<string, ToastLocation>
  >();

  get(config: RuntimeConfig, restaurantGuid: string): ToastLocation | undefined {
    return this.#locationsByConfig
      .get(config)
      ?.get(restaurantGuid.toLowerCase());
  }

  list(config: RuntimeConfig): readonly ToastLocation[] {
    return Object.freeze([
      ...(this.#locationsByConfig.get(config)?.values() ?? []),
    ]);
  }

  replace(config: RuntimeConfig, locations: readonly ToastLocation[]): void {
    const byGuid = new Map<string, ToastLocation>();

    for (const location of locations) {
      const frozenLocation = freezeLocation(location);
      byGuid.set(frozenLocation.restaurantGuid, frozenLocation);
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

  const accessibleResponse =
    await options.toastHttpClient.getAccessibleRestaurantsJsonDetailed();
  const accessible = normalizeAccessibleRestaurants(
    accessibleResponse,
    bootstrapRestaurantGuid,
  );
  const locations: ToastLocation[] = [];

  // Sequential hydration is deliberate. It shares the same Toast transport and
  // rate-limit coordinator, avoids an uncontrolled burst for a large selected
  // location set, and publishes nothing until every active connection is valid.
  for (const connection of accessible) {
    const detail = await options.toastHttpClient.getJsonDetailed({
      path: `/restaurants/v1/restaurants/${connection.restaurantGuid}`,
      restaurantGuid: connection.restaurantGuid,
      rateLimitKey: STANDARD_RESTAURANT_DETAIL_LIMITER_KEY,
    });
    locations.push(normalizeRestaurantDetail(connection, detail));
  }

  // Atomic publication: any Partners/detail parsing or request failure above
  // leaves the previously complete registry untouched.
  options.registry.replace(options.config, locations);

  return Object.freeze({
    bootstrapRestaurantGuid: bootstrapRestaurantGuid.toLowerCase(),
    locations: Object.freeze([...locations]),
    accessibleRestaurantsRetrievedAtEpochMs:
      accessibleResponse.retrievedAtEpochMs,
  });
}

interface AccessibleRestaurantConnection {
  readonly restaurantGuid: string;
  readonly managementGroupGuid?: string;
  readonly connectionScopes: readonly string[];
}

function normalizeAccessibleRestaurants(
  response: ToastDetailedJsonResult,
  bootstrapRestaurantGuid: string,
): readonly AccessibleRestaurantConnection[] {
  const parsed = partnerAccessResponseSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidLocationResponse();
  }

  const seen = new Set<string>();
  const active: AccessibleRestaurantConnection[] = [];
  const normalizedBootstrap = bootstrapRestaurantGuid.toLowerCase();
  let bootstrapWasDeleted = false;

  for (const restaurant of parsed.data) {
    const restaurantGuid = restaurant.restaurantGuid.toLowerCase();
    if (seen.has(restaurantGuid)) {
      throw new ToastLocationError(
        "location_guid_repeated",
        "Toast accessible-restaurants response contained a repeated restaurant GUID.",
      );
    }
    seen.add(restaurantGuid);

    if (restaurant.deleted === true) {
      if (restaurantGuid === normalizedBootstrap) {
        bootstrapWasDeleted = true;
      }
      continue;
    }

    active.push(
      Object.freeze({
        restaurantGuid,
        ...(restaurant.managementGroupGuid != null
          ? {
              managementGroupGuid:
                restaurant.managementGroupGuid.toLowerCase(),
            }
          : {}),
        connectionScopes: normalizeConnectionScopes(restaurant.scopes),
      }),
    );
  }

  if (
    bootstrapWasDeleted ||
    !active.some(
      (restaurant) => restaurant.restaurantGuid === normalizedBootstrap,
    )
  ) {
    throw new ToastLocationError(
      "location_bootstrap_guid_inaccessible",
      "Toast accessible-restaurants response did not include the bootstrap restaurant as an active accessible location.",
    );
  }

  return Object.freeze(active);
}

function normalizeRestaurantDetail(
  connection: AccessibleRestaurantConnection,
  response: ToastDetailedJsonResult,
): ToastLocation {
  const parsed = restaurantInfoSchema.safeParse(response.body);
  if (!parsed.success) {
    throw invalidLocationResponse();
  }

  const restaurantGuid = parsed.data.guid.toLowerCase();
  if (restaurantGuid !== connection.restaurantGuid) {
    throw invalidLocationResponse();
  }

  const detailManagementGroupGuid =
    parsed.data.general.managementGroupGuid?.toLowerCase();
  if (
    connection.managementGroupGuid !== undefined &&
    detailManagementGroupGuid !== undefined &&
    connection.managementGroupGuid !== detailManagementGroupGuid
  ) {
    throw invalidLocationResponse();
  }

  return freezeLocation({
    restaurantGuid,
    name: parsed.data.general.name,
    timezone: parsed.data.general.timeZone,
    closeoutHour: parsed.data.general.closeoutHour,
    currencyCode: parsed.data.general.currencyCode,
    managementGroupGuid:
      detailManagementGroupGuid ?? connection.managementGroupGuid,
    connectionScopes: connection.connectionScopes,
    contextRetrievedAtEpochMs: response.retrievedAtEpochMs,
  });
}

function normalizeConnectionScopes(scopes: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(scopes)]);
}

function freezeLocation(location: ToastLocation): ToastLocation {
  return Object.freeze({
    restaurantGuid: location.restaurantGuid.toLowerCase(),
    name: location.name,
    timezone: location.timezone,
    closeoutHour: location.closeoutHour,
    currencyCode: location.currencyCode,
    ...(location.managementGroupGuid !== undefined
      ? { managementGroupGuid: location.managementGroupGuid.toLowerCase() }
      : {}),
    connectionScopes: Object.freeze([...location.connectionScopes]),
    contextRetrievedAtEpochMs: location.contextRetrievedAtEpochMs,
  });
}

function invalidLocationResponse(): ToastLocationError {
  return new ToastLocationError(
    "location_response_invalid",
    "Toast location context response was not usable for reporting.",
  );
}
