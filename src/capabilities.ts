import type { RuntimeConfig } from "./config.js";

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

export const EXCLUDED_TOAST_SCOPES = [
  "guest.pi:read",
  "delivery_info.address:read",
] as const;

const JWT_SEGMENT_COUNT = 3;
const MAX_SCOPE_LENGTH = 128;
const RESTAURANT_GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/u;

export type KnownReadOnlyToastScope = (typeof READ_ONLY_TOAST_SCOPES)[number];
export type ExcludedToastScope = (typeof EXCLUDED_TOAST_SCOPES)[number];

export type CapabilityDenialReason =
  | "missing_scope"
  | "excluded_scope_required"
  | "toast_authorization_denied";

export interface DecodedScopeSet {
  readonly scopes: readonly string[];
}

export interface CapabilityView {
  readonly restaurantGuid: string;
  readonly advisoryScopes: readonly string[];
  readonly observedDeniedScopes: readonly string[];
}

export interface CapabilityGrant {
  readonly status: "granted";
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
}

export interface CapabilityDenial {
  readonly status: "denied";
  readonly reason: CapabilityDenialReason;
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
  readonly availableScopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly deniedScopes: readonly string[];
  readonly message: string;
}

export type CapabilityDecision = CapabilityGrant | CapabilityDenial;

export interface CapabilityRequirement {
  readonly restaurantGuid: string;
  readonly requiredScopes: readonly string[];
}

const excludedScopeSet = new Set<string>(EXCLUDED_TOAST_SCOPES);

const capabilityViewsByConfig = new WeakMap<
  RuntimeConfig,
  Map<string, CapabilityView>
>();

export function decodeScopesFromAccessToken(accessToken: string): DecodedScopeSet {
  const parts = accessToken.split(".");

  if (parts.length !== JWT_SEGMENT_COUNT) {
    return { scopes: [] };
  }

  const payload = readJwtPayload(parts[1]);

  if (payload === undefined) {
    return { scopes: [] };
  }

  return { scopes: normalizeScopes(scopeClaims(payload)) };
}

export function rememberCapabilityView(
  config: RuntimeConfig,
  view: CapabilityView,
): CapabilityView {
  const normalizedView = {
    restaurantGuid: normalizeRestaurantGuid(view.restaurantGuid),
    advisoryScopes: normalizeScopes(view.advisoryScopes),
    observedDeniedScopes: normalizeScopes(view.observedDeniedScopes),
  };

  let viewsByRestaurant = capabilityViewsByConfig.get(config);

  if (viewsByRestaurant === undefined) {
    viewsByRestaurant = new Map<string, CapabilityView>();
    capabilityViewsByConfig.set(config, viewsByRestaurant);
  }

  viewsByRestaurant.set(normalizedView.restaurantGuid, normalizedView);
  return normalizedView;
}

export function getRememberedCapabilityView(
  config: RuntimeConfig,
  restaurantGuid: string,
): CapabilityView | undefined {
  const normalizedRestaurantGuid = normalizeRestaurantGuid(restaurantGuid);
  return capabilityViewsByConfig.get(config)?.get(normalizedRestaurantGuid);
}

export function decideCapability(
  view: CapabilityView,
  requirement: CapabilityRequirement,
): CapabilityDecision {
  const restaurantGuid = normalizeRestaurantGuid(requirement.restaurantGuid);

  if (restaurantGuid !== normalizeRestaurantGuid(view.restaurantGuid)) {
    return denial(
      "toast_authorization_denied",
      restaurantGuid,
      requirement.requiredScopes,
      view.advisoryScopes,
      [],
      view.observedDeniedScopes,
    );
  }

  const requiredScopes = normalizeScopes(requirement.requiredScopes);
  const availableScopes = normalizeScopes(view.advisoryScopes);
  const deniedScopes = normalizeScopes(view.observedDeniedScopes);
  const availableScopeSet = new Set(availableScopes);
  const deniedScopeSet = new Set(deniedScopes);
  const excludedRequiredScopes = requiredScopes.filter((scope) =>
    excludedScopeSet.has(scope),
  );

  if (excludedRequiredScopes.length > 0) {
    return denial(
      "excluded_scope_required",
      restaurantGuid,
      requiredScopes,
      availableScopes,
      excludedRequiredScopes,
      deniedScopes,
    );
  }

  const missingScopes = requiredScopes.filter(
    (scope) => !availableScopeSet.has(scope),
  );

  if (missingScopes.length > 0) {
    return denial(
      "missing_scope",
      restaurantGuid,
      requiredScopes,
      availableScopes,
      missingScopes,
      deniedScopes,
    );
  }

  const contradictedScopes = requiredScopes.filter((scope) =>
    deniedScopeSet.has(scope),
  );

  if (contradictedScopes.length > 0) {
    return denial(
      "toast_authorization_denied",
      restaurantGuid,
      requiredScopes,
      availableScopes,
      contradictedScopes,
      deniedScopes,
    );
  }

  return {
    status: "granted" as const,
    restaurantGuid,
    requiredScopes,
  };
}

function denial(
  reason: CapabilityDenialReason,
  restaurantGuid: string,
  requiredScopes: readonly string[],
  availableScopes: readonly string[],
  missingScopes: readonly string[],
  deniedScopes: readonly string[],
): CapabilityDenial {
  return {
    status: "denied" as const,
    reason,
    restaurantGuid,
    requiredScopes: normalizeScopes(requiredScopes),
    availableScopes: normalizeScopes(availableScopes),
    missingScopes: normalizeScopes(missingScopes),
    deniedScopes: normalizeScopes(deniedScopes),
    message: denialMessage(reason),
  };
}

function denialMessage(reason: CapabilityDenialReason): string {
  switch (reason) {
    case "missing_scope":
      return "The requested report is denied because the credential does not advertise every required Toast read scope.";
    case "excluded_scope_required":
      return "The requested report is denied because it requires Toast data outside this product boundary.";
    case "toast_authorization_denied":
      return "The requested report is denied because observed Toast authorization does not support the requested capability for this restaurant.";
  }
}

function readJwtPayload(segment: string | undefined): Record<string, unknown> | undefined {
  if (segment === undefined) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(base64UrlToBase64(segment), "base64").toString(
      "utf8",
    );
    const payload: unknown = JSON.parse(decoded);

    if (typeof payload === "object" && payload !== null) {
      return payload as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function base64UrlToBase64(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const paddingLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${"=".repeat(paddingLength)}`;
}

function scopeClaims(payload: Record<string, unknown>): readonly unknown[] {
  return [payload.scope, payload.scp].flatMap((claim) => {
    if (typeof claim === "string") {
      return claim.split(/\s+/u);
    }

    if (Array.isArray(claim)) {
      return claim;
    }

    return [];
  });
}

function normalizeScopes(scopes: readonly unknown[]): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const scope of scopes) {
    if (typeof scope !== "string") {
      continue;
    }

    const trimmedScope = scope.trim();

    if (
      scope !== trimmedScope ||
      !isValidScope(trimmedScope) ||
      seen.has(trimmedScope)
    ) {
      continue;
    }

    seen.add(trimmedScope);
    normalized.push(trimmedScope);
  }

  return normalized;
}

function isValidScope(scope: string): boolean {
  return (
    scope.length <= MAX_SCOPE_LENGTH &&
    SCOPE_PATTERN.test(scope)
  );
}

function normalizeRestaurantGuid(restaurantGuid: string): string {
  const normalized = restaurantGuid.toLowerCase();

  if (!RESTAURANT_GUID_PATTERN.test(normalized)) {
    throw new TypeError("restaurantGuid must be a UUID-formatted Toast restaurant GUID.");
  }

  return normalized;
}
