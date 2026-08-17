import assert from "node:assert/strict";
import test from "node:test";

import {
  createCapabilityContext,
  decideCapability,
} from "../src/capabilities.js";
import type { ToastLocation } from "../src/locations.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000701";

const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: RESTAURANT_GUID,
  name: "Synthetic Capability Policy Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["guest.pi:read", "orders:read"]),
});

test("product-excluded scopes remain visible as Toast authority evidence but never as eligible product scopes", async () => {
  const context = await createCapabilityContext(
    {
      getProvisionedScopes: async () =>
        Object.freeze(["guest.pi:read", "orders:read"]),
    },
    LOCATION,
  );

  assert.deepEqual(context.provisionedScopes, ["guest.pi:read", "orders:read"]);
  assert.deepEqual(context.connectionScopes, ["guest.pi:read", "orders:read"]);
  assert.deepEqual(context.eligibleScopes, ["orders:read"]);

  const decision = decideCapability(context, {
    restaurantGuid: RESTAURANT_GUID,
    requiredScopes: ["guest.pi:read"],
  });
  assert.equal(decision.status, "denied");
  if (decision.status === "denied") {
    assert.equal(decision.reason, "excluded_scope_required");
    assert.deepEqual(decision.excludedScopes, ["guest.pi:read"]);
    assert.deepEqual(decision.eligibleScopes, ["orders:read"]);
  }
});
