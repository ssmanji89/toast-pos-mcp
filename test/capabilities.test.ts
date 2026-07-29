import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import {
  decideCapability,
  decodeScopesFromAccessToken,
  getRememberedCapabilityView,
  rememberCapabilityView,
  type CapabilityView,
} from "../src/capabilities.js";
import { loadRuntimeConfig } from "../src/config.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_A = "00000000-0000-4000-8000-0000000000aa";
const RESTAURANT_B = "00000000-0000-4000-8000-0000000000bb";
const SYNTHETIC_TOKEN_MARKER = "synthetic-token-marker-do-not-leak";

test("decodes scope and scp claims from a JWT payload while preserving unknown scope strings", () => {
  const decoded = decodeScopesFromAccessToken(
    jwt({
      scope:
        "orders:read menus:read synthetic.future.scope:read orders:read",
      scp: ["cashmgmt:read", "labor.employees:read", "menus:read"],
    }),
  );

  assert.deepEqual(decoded.scopes, [
    "orders:read",
    "menus:read",
    "synthetic.future.scope:read",
    "cashmgmt:read",
    "labor.employees:read",
  ]);
});

test("returns an empty scope set for opaque, malformed, and non-object tokens without leaking token text", () => {
  for (const token of [
    SYNTHETIC_TOKEN_MARKER,
    "not-json.bm90LWpzb24.signature",
    jwt(["orders:read"]),
  ]) {
    const decoded = decodeScopesFromAccessToken(token);

    assert.deepEqual(decoded.scopes, []);
    assert.ok(!inspect(decoded).includes(SYNTHETIC_TOKEN_MARKER));
  }
});

test("filters invalid scope claim entries deterministically", () => {
  const decoded = decodeScopesFromAccessToken(
    jwt({
      scope: " orders:read\tbad/scope\talso:read ",
      scp: [
        "menus:read",
        "",
        " has-space",
        "x".repeat(129),
        42,
        "menus:read",
      ],
    }),
  );

  assert.deepEqual(decoded.scopes, [
    "orders:read",
    "also:read",
    "menus:read",
  ]);
});

test("grants a capability only when every required read scope is available for the same restaurant", () => {
  const view = capabilityView({
    restaurantGuid: RESTAURANT_A,
    advisoryScopes: ["orders:read", "menus:read", "synthetic.future.scope:read"],
  });

  assert.deepEqual(
    decideCapability(view, {
      restaurantGuid: RESTAURANT_A.toUpperCase(),
      requiredScopes: ["menus:read", "orders:read"],
    }),
    {
      status: "granted",
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["menus:read", "orders:read"],
    },
  );
});

test("denies missing scopes with a deterministic denial instead of an empty successful result", () => {
  const view = capabilityView({
    advisoryScopes: ["orders:read"],
  });

  assert.deepEqual(
    decideCapability(view, {
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["orders:read", "menus:read"],
    }),
    {
      status: "denied",
      reason: "missing_scope",
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["orders:read", "menus:read"],
      availableScopes: ["orders:read"],
      missingScopes: ["menus:read"],
      deniedScopes: [],
      message:
        "The requested report is denied because the credential does not advertise every required Toast read scope.",
    },
  );
});

test("denies excluded guest-linked scopes even when an over-scoped token advertises them", () => {
  const view = capabilityView({
    advisoryScopes: ["orders:read", "guest.pi:read"],
  });

  assert.deepEqual(
    decideCapability(view, {
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["guest.pi:read"],
    }),
    {
      status: "denied",
      reason: "excluded_scope_required",
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["guest.pi:read"],
      availableScopes: ["orders:read", "guest.pi:read"],
      missingScopes: ["guest.pi:read"],
      deniedScopes: [],
      message:
        "The requested report is denied because it requires Toast data outside this product boundary.",
    },
  );
});

test("denies when observed Toast authorization contradicts advisory scopes", () => {
  const view = capabilityView({
    advisoryScopes: ["orders:read", "menus:read"],
    observedDeniedScopes: ["menus:read"],
  });

  assert.deepEqual(
    decideCapability(view, {
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["orders:read", "menus:read"],
    }),
    {
      status: "denied",
      reason: "toast_authorization_denied",
      restaurantGuid: RESTAURANT_A,
      requiredScopes: ["orders:read", "menus:read"],
      availableScopes: ["orders:read", "menus:read"],
      missingScopes: ["menus:read"],
      deniedScopes: ["menus:read"],
      message:
        "The requested report is denied because observed Toast authorization does not support the requested capability for this restaurant.",
    },
  );
});

test("denies a restaurant mismatch instead of reusing capability state across locations", () => {
  const view = capabilityView({
    restaurantGuid: RESTAURANT_A,
    advisoryScopes: ["orders:read"],
  });

  assert.deepEqual(
    decideCapability(view, {
      restaurantGuid: RESTAURANT_B,
      requiredScopes: ["orders:read"],
    }),
    {
      status: "denied",
      reason: "toast_authorization_denied",
      restaurantGuid: RESTAURANT_B,
      requiredScopes: ["orders:read"],
      availableScopes: ["orders:read"],
      missingScopes: [],
      deniedScopes: [],
      message:
        "The requested report is denied because observed Toast authorization does not support the requested capability for this restaurant.",
    },
  );
});

test("rejects invalid restaurant GUIDs before a capability can be granted", () => {
  const view = capabilityView({
    advisoryScopes: ["orders:read"],
  });

  assert.throws(
    () =>
      decideCapability(view, {
        restaurantGuid: "not-a-guid",
        requiredScopes: ["orders:read"],
      }),
    TypeError,
  );
});

test("binds remembered capability views to runtime config identity and restaurant GUID", () => {
  const configA = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const configB = loadRuntimeConfig({
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_CLIENT_ID: "synthetic-client-id-0002",
  });
  const viewA = rememberCapabilityView(
    configA,
    capabilityView({
      restaurantGuid: RESTAURANT_A.toUpperCase(),
      advisoryScopes: ["orders:read"],
    }),
  );
  const viewB = rememberCapabilityView(
    configA,
    capabilityView({
      restaurantGuid: RESTAURANT_B,
      advisoryScopes: ["menus:read"],
    }),
  );

  assert.equal(getRememberedCapabilityView(configA, RESTAURANT_A), viewA);
  assert.equal(getRememberedCapabilityView(configA, RESTAURANT_B), viewB);
  assert.equal(getRememberedCapabilityView(configB, RESTAURANT_A), undefined);
  assert.equal(getRememberedCapabilityView(configA, "00000000-0000-4000-8000-0000000000cc"), undefined);
});

function capabilityView(
  overrides: Partial<CapabilityView> = {},
): CapabilityView {
  return {
    restaurantGuid: RESTAURANT_A,
    advisoryScopes: [],
    observedDeniedScopes: [],
    ...overrides,
  };
}

function jwt(payload: unknown): string {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url(payload),
    "synthetic-signature",
  ].join(".");
}

function base64Url(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8")
    .toString("base64url");
}
