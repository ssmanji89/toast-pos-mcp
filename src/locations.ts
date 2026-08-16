import { z } from "zod";

import type { RuntimeConfig } from "./config.js";
import { ToastHttpError, type ToastHttpClient } from "./transport.js";

const RESTAURANT_DETAIL_PATH_PREFIX = "/restaurants/v1/restaurants";
const RESTAURANTS_RATE_LIMIT_KEY = "restaurants";
const MAX_SCOPE_LENGTH = 128;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;

// A real IANA time zone identifier is never a bare UTC offset designator
// ("-05:00", "+05:30", "UTC-08:00", ...). Some current ICU/V8 builds accept
// these strings in `Intl.DateTimeFormat`'s `timeZone` option anyway, because
// TC39's "sanctioned" single-offset time zone extension to ECMA-402 has
// begun landing in newer engines. Rejecting this shape explicitly before
// asking `Intl` keeps the business-date foundation independent of that
// runtime/version difference.
const UTC_OFFSET_DESIGNATOR_PATTERN = /^(?:UTC|GMT)?[+-]\d{1,2}:?\d{2}$/iu;

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
const optionalManagementGroupGuidSchema = z.union([
  z.string().uuid(),
  z.null(),
]);
const connectionScopeSchema = z
  .string()
  .min(1)
  .max(MAX_SCOPE_LENGTH)
  .refine(
    (scope) => scope === scope.trim() && SCOPE_PATTERN.test(scope),
    { message: "must be a normalized Toast scope string" },
  );
const timeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidIanaTimeZone, {
    message:
      "must be a recognized IANA time zone identifier, not a fixed UTC offset or an unrecognized string",
  });
const currencyCodeSchema = z.string().regex(CURRENCY_CODE_PATTERN);

/**
 * The Partners API response contains materially more data than reporting
 * needs, including partner-contact email and external reference fields.
 * Parsing with a narrow schema and constructing a new object is the privacy
 * boundary: those fields may exist transiently in the upstream body, but are
 * never retained in runtime location state.
 */
const partnerAccessSchema = z
  .object({
    restaurantGuid: restaurantGuidSchema,
    managementGroupGuid: optionalManagementGroupGuidSchema.optional(),
    deleted: z.boolean(),
    scopes: z.array(connectionScopeSchema),
  })
  .passthrough();
const partnerAccessResponseSchema = z.array(partnerAccessSchema);

const restaurantDetailSchema = z
  .object({
    guid: restaurantGuidSchema,
    general: z
      .object({
        archived: z.boolean().optional(),
        name: z.string().min(1),
        timeZone: timeZoneSchema,
        closeoutHour: z.number().int().min(0).max(12),
        currencyCode: currencyCodeSchema,
        managementGroupGuid: optionalManagementGroupGuidSchema.optional(),
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
  readonly managementGroupGuid: string | undefined;
  /**
   * Scope names granted for this specific restaurant connection by the
   * Partners accessible-restaurants source. T2-002 intersects these with
   * the current JWT's provisioned scopes before a data request is eligible.
   */
  readonly connectionScopes: readonly string[];
}

export interface ToastLocationDiscovery {
  readonly bootstrapRestaurantGuid: string;
  readonly locations: readonly ToastLocation[];
}

interface AccessibleRestaurantConnection {
  readonly restaurantGuid: string;
  readonly managementGroupGuid: string | undefined;
  readonly connectionScopes: readonly string[];
}

export type ToastLocationErrorCode =
  | "location_bootstrap_guid_required"
  | "location_bootstrap_guid_inaccessible"
  | "location_detail_guid_mismatch"
  | "location_discovery_source_unavailable"
  | "location_guid_repeated"
  | "location_management_group_mismatch"
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
    return this.#locationsByConfig.get(config)?.get(restaurantGuid.toLowerCase());
  }

  list(config: RuntimeConfig): readonly ToastLocation[] {
    return Object.freeze([
      ...(this.#locationsByConfig.get(config)?.values() ?? []),
    ]);
  }

  replace(config: RuntimeConfig, locations: readonly ToastLocation[]): void {
    const byGuid = new Map<string, ToastLocation>();

    for (const location of locations) {
      const restaurantGuid = location.restaurantGuid.toLowerCase();
      byGuid.set(
        restaurantGuid,
        Object.freeze({
          ...location,
          restaurantGuid,
          connectionScopes: Object.freeze([...location.connectionScopes]),
        }),
      );
    }

    this.#locationsByConfig.set(config, byGuid);
  }
}

export function createLocationRegistry(): ToastLocationRegistry {
  return new InMemoryToastLocationRegistry();
}

/**
 * Discover the active restaurant connections the current credential can
 * access, then hydrate report-critical context for every active restaurant
 * through the restaurant-scoped Restaurants API.
 *
 * No registry mutation occurs until the complete active set has been
 * validated. A failed detail request therefore leaves any previously known
 * complete registry intact rather than publishing a partial replacement.
 *
 * Toast's current public documentation is internally inconsistent about
 * whether Standard API credentials can call the Partners accessible-
 * restaurants endpoint. The API overview and Standard-credential guide say
 * they can; the dedicated Partners location-access guide says only partner
 * API accounts can. Until a live Standard credential resolves that conflict,
 * an authorization failure from this credential-wide source is surfaced as
 * `location_discovery_source_unavailable`. We deliberately do not fall back
 * to every restaurant in a management group: Standard credentials can be
 * configured for only a subset, so group membership is not proof of access.
 */
export async function discoverStandardLocations(options: {
  readonly config: RuntimeConfig;
  readonly registry: ToastLocationRegistry;
  readonly toastHttpClient: ToastHttpClient;
}): Promise<ToastLocationDiscovery> {
  const configuredBootstrapGuid = options.config.defaultRestaurantGuid;

  if (configuredBootstrapGuid === undefined) {
    throw new ToastLocationError(
      "location_bootstrap_guid_required",
      "Toast location discovery requires TOAST_DEFAULT_RESTAURANT_GUID as an explicit bootstrap restaurant GUID.",
    );
  }

  const bootstrapRestaurantGuid = configuredBootstrapGuid.toLowerCase();
  let partnerPayload: unknown;
  try {
    partnerPayload = await options.toastHttpClient.getAccessibleRestaurantsJson();
  } catch (error) {
    if (error instanceof ToastHttpError && error.upstreamStatus === 403) {
      throw new ToastLocationError(
        "location_discovery_source_unavailable",
        "The credential-wide Toast location discovery source is not authorized for this credential type.",
      );
    }

    throw error;
  }

  const connections = normalizeAccessibleRestaurantConnections(
    partnerPayload,
    bootstrapRestaurantGuid,
  );

  const locations: ToastLocation[] = [];
  for (const connection of connections) {
    const detailPayload = await options.toastHttpClient.getJson({
      path: `${RESTAURANT_DETAIL_PATH_PREFIX}/${connection.restaurantGuid}`,
      restaurantGuid: connection.restaurantGuid,
      query: { includeArchived: false },
      rateLimitKey: RESTAURANTS_RATE_LIMIT_KEY,
    });
    locations.push(normalizeRestaurantDetail(detailPayload, connection));
  }

  const frozenLocations = Object.freeze([...locations]);
  options.registry.replace(options.config, frozenLocations);

  return Object.freeze({
    bootstrapRestaurantGuid,
    locations: frozenLocations,
  });
}

function normalizeAccessibleRestaurantConnections(
  payload: unknown,
  bootstrapRestaurantGuid: string,
): readonly AccessibleRestaurantConnection[] {
  const parsed = partnerAccessResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidLocationResponse();
  }

  const seenGuids = new Set<string>();
  const activeConnections: AccessibleRestaurantConnection[] = [];
  let bootstrapWasPresentButDeleted = false;

  for (const partnerAccess of parsed.data) {
    const restaurantGuid = partnerAccess.restaurantGuid.toLowerCase();
    if (seenGuids.has(restaurantGuid)) {
      throw new ToastLocationError(
        "location_guid_repeated",
        "Toast Partners accessible-restaurants response contained a repeated restaurant GUID.",
      );
    }
    seenGuids.add(restaurantGuid);

    if (partnerAccess.deleted) {
      if (restaurantGuid === bootstrapRestaurantGuid) {
        bootstrapWasPresentButDeleted = true;
      }
      continue;
    }

    activeConnections.push(Object.freeze({
      restaurantGuid,
      managementGroupGuid:
        partnerAccess.managementGroupGuid?.toLowerCase() ?? undefined,
      connectionScopes: normalizeConnectionScopes(partnerAccess.scopes),
    }));
  }

  if (
    bootstrapWasPresentButDeleted
    || !activeConnections.some(
      (connection) => connection.restaurantGuid === bootstrapRestaurantGuid,
    )
  ) {
    throw new ToastLocationError(
      "location_bootstrap_guid_inaccessible",
      "Toast Partners accessible-restaurants response did not include the bootstrap restaurant GUID as an active accessible restaurant.",
    );
  }

  return Object.freeze(activeConnections);
}

function normalizeRestaurantDetail(
  payload: unknown,
  connection: AccessibleRestaurantConnection,
): ToastLocation {
  const parsed = restaurantDetailSchema.safeParse(payload);
  if (!parsed.success) {
    throw invalidLocationResponse();
  }

  const detailGuid = parsed.data.guid.toLowerCase();
  if (detailGuid !== connection.restaurantGuid) {
    throw new ToastLocationError(
      "location_detail_guid_mismatch",
      "Toast restaurant detail response did not match the requested restaurant GUID.",
    );
  }

  // `includeArchived=false` should keep archived locations out of a normal
  // success response. If an upstream implementation nevertheless returns an
  // explicitly archived object, fail closed instead of silently treating an
  // inactive restaurant as reportable.
  if (parsed.data.general.archived === true) {
    throw invalidLocationResponse();
  }

  const detailManagementGroupGuid =
    parsed.data.general.managementGroupGuid?.toLowerCase() ?? undefined;
  if (
    connection.managementGroupGuid !== undefined
    && detailManagementGroupGuid !== undefined
    && connection.managementGroupGuid !== detailManagementGroupGuid
  ) {
    throw new ToastLocationError(
      "location_management_group_mismatch",
      "Toast restaurant detail response disagreed with the accessible-restaurant management group.",
    );
  }

  return Object.freeze({
    restaurantGuid: connection.restaurantGuid,
    name: parsed.data.general.name,
    timezone: parsed.data.general.timeZone,
    closeoutHour: parsed.data.general.closeoutHour,
    currencyCode: parsed.data.general.currencyCode,
    managementGroupGuid:
      detailManagementGroupGuid ?? connection.managementGroupGuid,
    connectionScopes: connection.connectionScopes,
  });
}

function normalizeConnectionScopes(scopes: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    if (!seen.has(scope)) {
      seen.add(scope);
      normalized.push(scope);
    }
  }

  return Object.freeze(normalized);
}

function invalidLocationResponse(): ToastLocationError {
  return new ToastLocationError(
    "location_response_invalid",
    "Toast location source response was not usable for location discovery.",
  );
}
