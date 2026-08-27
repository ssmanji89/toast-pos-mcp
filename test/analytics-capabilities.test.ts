import assert from "node:assert/strict";
import test from "node:test";

import {
  createAnalyticsCapabilityContext,
  decideAnalyticsCapability,
} from "../src/capabilities.js";

function scopeProvider(scopes: unknown) {
  return {
    async getProvisionedScopes(): Promise<unknown> {
      return scopes;
    },
  };
}

test("Analytics capability accepts only enterprise-metrics:read", async () => {
  const decision = await decideAnalyticsCapability(
    scopeProvider(["enterprise-metrics:read", "future:open-scope"]),
  );

  assert.equal(decision.status, "allowed");
  assert.ok(Object.isFrozen(decision));
  assert.deepEqual(decision.scopes, ["enterprise-metrics:read", "future:open-scope"]);
});

test("Analytics capability denies missing or malformed scope data before source access", async () => {
  for (const scopes of [[], [" enterprise-metrics:read"], ["bad scope"], null]) {
    const decision = await decideAnalyticsCapability(scopeProvider(scopes));
    assert.equal(decision.status, "denied");
    assert.equal(decision.code, "analytics_scope_unavailable");
    assert.ok(Object.isFrozen(decision));
    assert.equal(JSON.stringify(decision).includes("enterprise-metrics:read"), false);
  }
});

test("Analytics capability does not use Standard connection scopes", () => {
  const context = createAnalyticsCapabilityContext([
    "enterprise-metrics:read",
  ]);

  assert.deepEqual(context.scopes, ["enterprise-metrics:read"]);
  assert.ok(Object.isFrozen(context));
  assert.equal("restaurantGuid" in context, false);
  assert.equal("connectionScopes" in context, false);
});

test("Analytics capability contexts retain separate frozen scope sets", () => {
  const first = createAnalyticsCapabilityContext(["enterprise-metrics:read"]);
  const second = createAnalyticsCapabilityContext([
    "enterprise-metrics:read",
    "separate:identity",
  ]);

  assert.notEqual(first.scopes, second.scopes);
  assert.equal(first.scopes.includes("separate:identity"), false);
  assert.ok(Object.isFrozen(first.scopes));
  assert.ok(Object.isFrozen(second.scopes));
});
