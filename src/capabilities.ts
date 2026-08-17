import type { OAuthTokenManager } from "./auth.js";
import type { ToastLocation } from "./locations.js";

export const READ_ONLY_TOAST_SCOPES = [
  "restaurants:read",
  "config:read",
  "menus:read",
  "orders:read",
  "cashmgmt:read",
  "labor:read",
  "labor.employees:read",
  "stock:read",
] as const;

// Standard API OAuth scope exclusions only. Analytics guest-payment datasets
// and guest-linked payload fields are enforced at the Analytics request layer.
export const EXCLUDED_TOAST_SCOPES = [
  "guest.pi:read",
  "delivery_info.address:read",
] as const;

const MAX_SCOPE_LENGTH = 128;
const RESTAURANT_GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;

export type KnownReadOnlyToastScope = (typeof READ_ONLY_TOAST_SCOPES)[number];
export type ExcludedToastScope = (typeof EXCLUDED_TOAST_SCOPES)[number];

/** Narrow scope-only surface. The bearer token never enters this module. */
export interface ProvisionedScopeProvider {
  getProvisionedScopes(): Promise<readonly string[]>;
}

/**
 * Per-request preflight context for one already-validated active location.
 *
 * Toast exposes two independent scope authorities:
 * - the current authentication-token JWT says which scopes the API client is
 *   provisioned for globally;
 * - Partners `connectionScopes` says which scopes are granted for the chosen
 *   restaurant connection.
 *
 * `eligibleScopes` is their intersection after removing this product's
 * explicit Standard API scope exclusions. The raw authority evidence remains
 * available separately in `provisionedScopes` and `connectionScopes`.
 * This object is stateless and stores no observed 403 outcome because a
 * generic Toast 403 is not scope-specific.
 */
export interface CapabilityContext {
  readonly restaurantGuid: string;
  readonly provisionedScopes: readonly string[];
  readonly connectionScopes: readonly string[];
  readonly eligibleScopes: readonly string[];
}

export interface CapabilityRequirement {
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
}

export interface CapabilityEligible {
  readonly status: "eligible";
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
  readonly provisionedScopes: readonly string[];
  readonly connectionScopes: readonly string[];
  readonly eligibleScopes: readonly string[];
}

export type CapabilityDenialReason =
  | "excluded_scope_required"
  | "missing_scope"
  | "restaurant_mismatch";

export interface CapabilityDenial {
  readonly status: "denied";
  readonly reason: CapabilityDenialReason;
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
  readonly provisionedScopes: readonly string[];
  readonly connectionScopes: readonly string[];
  readonly eligibleScopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly missingProvisionedScopes: readonly string[];
  readonly missingConnectionScopes: readonly string[];
  readonly excludedScopes: readonly string[];
  readonly message: string;
}

export type CapabilityDecision = CapabilityEligible | CapabilityDenial;

const excludedScopeSet = new Set<string>(
  EXCLUDED_TOAST_SCOPES.map((scope) => scope.toLowerCase()),
);

/**
 * Build a preflight context from the same token owner and the exact active
 * restaurant context produced by T2 location discovery. No second restaurant
 * scope registry exists here; `ToastLocation.connectionScopes` is the source.
 */
export async function createCapabilityContext(
  scopeProvider: ProvisionedScopeProvider | OAuthTokenManager,
  location: ToastLocation,
): Promise<CapabilityContext> {
  const restaurantGuid = normalizeRestaurantGuid(location.restaurantGuid);
  const provisionedScopes = normalizeTrustedScopes(
    await scopeProvider.getProvisionedScopes(),
    "provisionedScopes",
  );
  const connectionScopes = normalizeTrustedScopes(
    location.connectionScopes,
    "connectionScopes",
  );
  const connectionScopeSet = new Set(connectionScopes);
  const eligibleScopes = freezeScopes(
    provisionedScopes.filter(
      (scope) =>
        connectionScopeSet.has(scope)
        && !excludedScopeSet.has(scope.toLowerCase()),
    ),
  );

  return Object.freeze({
    restaurantGuid,
    provisionedScopes,
    connectionScopes,
    eligibleScopes,
  });
}

/**
 * Decide only whether a bounded Standard API read is eligible to be attempted.
 * `eligible` is not endpoint authorization and is never report success. A
 * subsequent Toast 403 remains a request/report denial and does not mutate
 * this stateless model.
 */
export function decideCapability(
  context: CapabilityContext,
  requirement: CapabilityRequirement,
): CapabilityDecision {
  const restaurantGuid = normalizeRestaurantGuid(requirement.restaurantGuid);
  const contextRestaurantGuid = normalizeRestaurantGuid(context.restaurantGuid);
  const requiredScopes = normalizeTrustedScopes(
    requirement.requiredScopes,
    "requiredScopes",
  );
  const provisionedScopes = normalizeTrustedScopes(
    context.provisionedScopes,
    "provisionedScopes",
  );
  const connectionScopes = normalizeTrustedScopes(
    context.connectionScopes,
    "connectionScopes",
  );
  const eligibleScopes = normalizeTrustedScopes(
    context.eligibleScopes,
    "eligibleScopes",
  );

  if (restaurantGuid !== contextRestaurantGuid) {
    return denial({
      reason: "restaurant_mismatch",
      restaurantGuid,
      requiredScopes,
      provisionedScopes,
      connectionScopes,
      eligibleScopes,
    });
  }

  const excludedScopes = requiredScopes.filter((scope) =>
    excludedScopeSet.has(scope.toLowerCase()),
  );
  if (excludedScopes.length > 0) {
    return denial({
      reason: "excluded_scope_required",
      restaurantGuid,
      requiredScopes,
      provisionedScopes,
      connectionScopes,
      eligibleScopes,
      excludedScopes,
    });
  }

  const provisionedSet = new Set(provisionedScopes);
  const connectionSet = new Set(connectionScopes);
  const missingProvisionedScopes = requiredScopes.filter(
    (scope) => !provisionedSet.has(scope),
  );
  const missingConnectionScopes = requiredScopes.filter(
    (scope) => !connectionSet.has(scope),
  );
  const missingScopes = requiredScopes.filter(
    (scope) => !provisionedSet.has(scope) || !connectionSet.has(scope),
  );

  if (missingScopes.length > 0) {
    return denial({
      reason: "missing_scope",
      restaurantGuid,
      requiredScopes,
      provisionedScopes,
      connectionScopes,
      eligibleScopes,
      missingScopes,
      missingProvisionedScopes,
      missingConnectionScopes,
    });
  }

  return Object.freeze({
    status: "eligible" as const,
    restaurantGuid,
    requiredScopes,
    provisionedScopes,
    connectionScopes,
    eligibleScopes,
  });
}

function denial(options: {
  readonly reason: CapabilityDenialReason;
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
  readonly provisionedScopes: readonly string[];
  readonly connectionScopes: readonly string[];
  readonly eligibleScopes: readonly string[];
  readonly missingScopes?: readonly string[];
  readonly missingProvisionedScopes?: readonly string[];
  readonly missingConnectionScopes?: readonly string[];
  readonly excludedScopes?: readonly string[];
}): CapabilityDenial {
  return Object.freeze({
    status: "denied" as const,
    reason: options.reason,
    restaurantGuid: options.restaurantGuid,
    requiredScopes: freezeScopes(options.requiredScopes),
    provisionedScopes: freezeScopes(options.provisionedScopes),
    connectionScopes: freezeScopes(options.connectionScopes),
    eligibleScopes: freezeScopes(options.eligibleScopes),
    missingScopes: freezeScopes(options.missingScopes ?? []),
    missingProvisionedScopes: freezeScopes(
      options.missingProvisionedScopes ?? [],
    ),
    missingConnectionScopes: freezeScopes(
      options.missingConnectionScopes ?? [],
    ),
    excludedScopes: freezeScopes(options.excludedScopes ?? []),
    message: denialMessage(options.reason),
  });
}

function denialMessage(reason: CapabilityDenialReason): string {
  switch (reason) {
    case "excluded_scope_required":
      return "The requested report is denied because it requires Toast data outside this product boundary.";
    case "missing_scope":
      return "The requested report is denied because the API client or selected restaurant connection is not provisioned with every required scope.";
    case "restaurant_mismatch":
      return "The requested report is denied because the capability context belongs to a different Toast restaurant.";
  }
}

function normalizeTrustedScopes(
  scopes: readonly string[],
  fieldName: string,
): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    if (
      scope !== scope.trim() ||
      scope.length === 0 ||
      scope.length > MAX_SCOPE_LENGTH ||
      !SCOPE_PATTERN.test(scope)
    ) {
      throw new TypeError(
        `${fieldName} must contain only valid Toast scope strings.`,
      );
    }
    if (!seen.has(scope)) {
      seen.add(scope);
      normalized.push(scope);
    }
  }

  return freezeScopes(normalized);
}

function freezeScopes(scopes: readonly string[]): readonly string[] {
  return Object.freeze([...scopes]);
}

function normalizeRestaurantGuid(restaurantGuid: string): string {
  const normalized = restaurantGuid.toLowerCase();
  if (!RESTAURANT_GUID_PATTERN.test(normalized)) {
    throw new TypeError(
      "restaurantGuid must be a UUID-formatted Toast restaurant GUID.",
    );
  }
  return normalized;
}
