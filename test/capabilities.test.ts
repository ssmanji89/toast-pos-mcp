import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import {
  createOAuthTokenManager,
  ToastAuthError,
} from "../src/auth.js";
import {
  createCapabilityContext,
  decideCapability,
} from "../src/capabilities.js";
import { loadRuntimeConfig } from "../src/config.js";
import type { ToastLocation } from "../src/locations.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const LOCATION_A = "00000000-0000-4000-8000-000000000601";
const LOCATION_B = "00000000-0000-4000-8000-000000000602";
const TOKEN_MARKER = "synthetic-capability-token-marker-must-not-leak";

const location = (
  restaurantGuid: string,
  connectionScopes: readonly string[],
): ToastLocation => Object.freeze({
  restaurantGuid,
  name: "Synthetic Capability Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze([...connectionScopes]),
});

test("preflight intersects current JWT provisioned scopes with the selected restaurant connection", async () => {
  const provider = scopeProvider(["orders:read", "config:read", "future.scope:read"]);
  const context = await createCapabilityContext(
    provider,
    location(LOCATION_A, ["orders:read", "future.scope:read"]),
  );

  assert.deepEqual(context.provisionedScopes, [
    "orders:read",
    "config:read",
    "future.scope:read",
  ]);
  assert.deepEqual(context.connectionScopes, [
    "orders:read",
    "future.scope:read",
  ]);
  assert.deepEqual(context.eligibleScopes, [
    "orders:read",
    "future.scope:read",
  ]);

  assert.equal(
    decideCapability(context, {
      restaurantGuid: LOCATION_A,
      requiredScopes: ["orders:read"],
    }).status,
    "eligible",
  );

  const denied = decideCapability(context, {
    restaurantGuid: LOCATION_A,
    requiredScopes: ["config:read"],
  });
  assert.equal(denied.status, "denied");
  if (denied.status === "denied") {
    assert.equal(denied.reason, "missing_scope");
    assert.deepEqual(denied.missingScopes, ["config:read"]);
    assert.deepEqual(denied.missingProvisionedScopes, []);
    assert.deepEqual(denied.missingConnectionScopes, ["config:read"]);
  }
});

test("the same client scope set can be eligible at one restaurant and denied at another", async () => {
  const provider = scopeProvider(["orders:read", "config:read"]);
  const contextA = await createCapabilityContext(
    provider,
    location(LOCATION_A, ["orders:read", "config:read"]),
  );
  const contextB = await createCapabilityContext(
    provider,
    location(LOCATION_B, ["config:read"]),
  );

  assert.equal(decideCapability(contextA, {
    restaurantGuid: LOCATION_A,
    requiredScopes: ["orders:read"],
  }).status, "eligible");

  const deniedB = decideCapability(contextB, {
    restaurantGuid: LOCATION_B,
    requiredScopes: ["orders:read"],
  });
  assert.equal(deniedB.status, "denied");
  if (deniedB.status === "denied") {
    assert.deepEqual(deniedB.missingProvisionedScopes, []);
    assert.deepEqual(deniedB.missingConnectionScopes, ["orders:read"]);
  }
});

test("missing JWT provisioning and missing restaurant grant are reported separately", async () => {
  const context = await createCapabilityContext(
    scopeProvider(["config:read"]),
    location(LOCATION_A, ["orders:read"]),
  );

  const decision = decideCapability(context, {
    restaurantGuid: LOCATION_A,
    requiredScopes: ["orders:read", "config:read"],
  });
  assert.equal(decision.status, "denied");
  if (decision.status === "denied") {
    assert.deepEqual(decision.missingScopes, ["orders:read", "config:read"]);
    assert.deepEqual(decision.missingProvisionedScopes, ["orders:read"]);
    assert.deepEqual(decision.missingConnectionScopes, ["config:read"]);
  }
});

test("product-excluded Standard scopes deny even when both authorities grant them", async () => {
  const context = await createCapabilityContext(
    scopeProvider(["GUEST.PI:READ", "orders:read"]),
    location(LOCATION_A, ["GUEST.PI:READ", "orders:read"]),
  );
  const decision = decideCapability(context, {
    restaurantGuid: LOCATION_A,
    requiredScopes: ["GUEST.PI:READ"],
  });

  assert.equal(decision.status, "denied");
  if (decision.status === "denied") {
    assert.equal(decision.reason, "excluded_scope_required");
    assert.deepEqual(decision.excludedScopes, ["GUEST.PI:READ"]);
    assert.deepEqual(decision.missingScopes, []);
  }
});

test("restaurant mismatch denies before reusable capability state can cross locations", async () => {
  const context = await createCapabilityContext(
    scopeProvider(["orders:read"]),
    location(LOCATION_A, ["orders:read"]),
  );
  const decision = decideCapability(context, {
    restaurantGuid: LOCATION_B,
    requiredScopes: ["orders:read"],
  });
  assert.equal(decision.status, "denied");
  if (decision.status === "denied") {
    assert.equal(decision.reason, "restaurant_mismatch");
  }
});

test("zero-scope operations remain eligible only for the same restaurant", async () => {
  const context = await createCapabilityContext(
    scopeProvider([]),
    location(LOCATION_A, []),
  );
  assert.equal(decideCapability(context, {
    restaurantGuid: LOCATION_A,
    requiredScopes: [],
  }).status, "eligible");
});

test("context and every scope collection are frozen", async () => {
  const context = await createCapabilityContext(
    scopeProvider(["orders:read"]),
    location(LOCATION_A, ["orders:read"]),
  );
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.provisionedScopes));
  assert.ok(Object.isFrozen(context.connectionScopes));
  assert.ok(Object.isFrozen(context.eligibleScopes));
});

test("invalid trusted scope strings fail closed rather than being filtered away", async () => {
  await assert.rejects(
    createCapabilityContext(
      scopeProvider([" orders:read"]),
      location(LOCATION_A, ["orders:read"]),
    ),
    TypeError,
  );
  await assert.rejects(
    createCapabilityContext(
      scopeProvider(["orders:read"]),
      location(LOCATION_A, ["orders:read", "bad scope"]),
    ),
    TypeError,
  );
});

test("real OAuthTokenManager exposes JWT scopes without exposing the bearer token", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const token = jwtWithScopes(["orders:read", "config:read"]);
  const manager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: token,
      },
    }),
  });
  const context = await createCapabilityContext(
    manager,
    location(LOCATION_A, ["orders:read"]),
  );

  assert.deepEqual(context.provisionedScopes, ["orders:read", "config:read"]);
  const rendered = `${JSON.stringify(context)} ${inspect(context, { depth: null })}`;
  assert.ok(!rendered.includes(token));
  assert.ok(!rendered.includes(TOKEN_MARKER));
});

test("malformed JWT scope payload fails closed without leaking token content", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const badToken = `${TOKEN_MARKER}.not-base64.${TOKEN_MARKER}`;
  const manager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: badToken,
      },
    }),
  });

  await assert.rejects(
    createCapabilityContext(manager, location(LOCATION_A, ["orders:read"])),
    (error: unknown) => {
      assert.ok(error instanceof ToastAuthError);
      assert.equal(error.code, "token_response_invalid");
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(TOKEN_MARKER));
      return true;
    },
  );
});

function scopeProvider(scopes: readonly string[]) {
  return {
    getProvisionedScopes: async (): Promise<readonly string[]> =>
      Object.freeze([...scopes]),
  };
}

function jwtWithScopes(scopes: readonly string[]): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return `${encode({ alg: "none", marker: TOKEN_MARKER })}.${encode({ scope: scopes })}.${TOKEN_MARKER}`;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
