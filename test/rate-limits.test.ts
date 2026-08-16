import assert from "node:assert/strict";
import test from "node:test";

import {
  makeRateLimitContext,
  parseNonNegativeIntegerHeader,
  parseRetryAfterEpochMs,
  parseToastRateLimitBy,
  parseToastResetEpochMs,
  ToastRateLimitCoordinator,
} from "../src/rate-limits.js";

const RESTAURANT_A = "00000000-0000-4000-8000-0000000000aa";
const RESTAURANT_B = "00000000-0000-4000-8000-0000000000bb";
const NOW = 100_000;

test("parses documented X-Toast-RateLimit-By forms case-insensitively", () => {
  assert.deepEqual(parseToastRateLimitBy("GLOBAL"), {
    primary: "GLOBAL",
    account: false,
    raw: ["GLOBAL"],
  });
  assert.deepEqual(parseToastRateLimitBy("api, account"), {
    primary: "API",
    account: true,
    raw: ["API", "ACCOUNT"],
  });
  assert.deepEqual(parseToastRateLimitBy("ENDPOINT,ACCOUNT"), {
    primary: "ENDPOINT",
    account: true,
    raw: ["ENDPOINT", "ACCOUNT"],
  });
});

test("treats missing, conflicting, and future By values conservatively as UNKNOWN", () => {
  assert.equal(parseToastRateLimitBy(null).primary, "UNKNOWN");
  assert.equal(parseToastRateLimitBy("").primary, "UNKNOWN");
  assert.equal(parseToastRateLimitBy("API,ENDPOINT").primary, "UNKNOWN");
  assert.deepEqual(parseToastRateLimitBy("FUTURE_SCOPE"), {
    primary: "UNKNOWN",
    account: false,
    raw: ["FUTURE_SCOPE"],
  });
});

test("parses documented reset as UNIX epoch seconds, never as epoch milliseconds heuristic", () => {
  assert.equal(parseToastResetEpochMs("105"), 105_000);
  assert.equal(parseToastResetEpochMs("1785326405"), 1_785_326_405_000);
  assert.equal(parseToastResetEpochMs("12000000000"), 12_000_000_000_000);
  assert.equal(parseToastResetEpochMs("-1"), undefined);
  assert.equal(parseToastResetEpochMs("n/a"), undefined);
});

test("parses Retry-After delta seconds and HTTP dates", () => {
  assert.equal(parseRetryAfterEpochMs("2", NOW), 102_000);
  const date = new Date(NOW + 5_000).toUTCString();
  assert.equal(parseRetryAfterEpochMs(date, NOW), Date.parse(date));
  assert.equal(parseRetryAfterEpochMs("not-a-date", NOW), undefined);
});

test("parses only complete non-negative integer remaining values", () => {
  assert.equal(parseNonNegativeIntegerHeader("0"), 0);
  assert.equal(parseNonNegativeIntegerHeader("19"), 19);
  assert.equal(parseNonNegativeIntegerHeader("19.5"), undefined);
  assert.equal(parseNonNegativeIntegerHeader("19junk"), undefined);
  assert.equal(parseNonNegativeIntegerHeader("-1"), undefined);
});

test("GLOBAL exhaustion learned on restaurant A applies to restaurant B and credential-scoped Partners discovery", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const ordersB = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_B,
  );
  const partners = makeRateLimitContext({
    path: "/partners/v1/restaurants",
    endpointKey: "restaurants",
    requestScope: { kind: "credential" },
  });

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("GLOBAL"),
    remaining: 0,
    resetAtEpochMs: 105_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersB), 105_000);
  assert.equal(coordinator.requiredWaitUntilEpochMs(partners), 105_000);
});

test("restaurant-scoped ENDPOINT exhaustion does not block the same endpoint for another restaurant", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const ordersB = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_B,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("ENDPOINT"),
    remaining: 0,
    resetAtEpochMs: 105_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersA), 105_000);
  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersB), undefined);
});

test("ENDPOINT,ACCOUNT exhaustion applies across restaurants for the same endpoint", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const ordersB = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_B,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("ENDPOINT, ACCOUNT"),
    remaining: 0,
    resetAtEpochMs: 106_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersB), 106_000);
});

test("API scope applies across endpoints in the same API but remains restaurant-scoped without ACCOUNT", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const bulkA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const orderA = restaurantContext(
    "/orders/v2/orders/anything",
    "orderDetail",
    RESTAURANT_A,
  );
  const orderB = restaurantContext(
    "/orders/v2/orders/anything",
    "orderDetail",
    RESTAURANT_B,
  );

  coordinator.record({
    context: bulkA,
    by: parseToastRateLimitBy("API"),
    remaining: 0,
    resetAtEpochMs: 107_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(orderA), 107_000);
  assert.equal(coordinator.requiredWaitUntilEpochMs(orderB), undefined);
});

test("API,ACCOUNT applies across restaurants but not a different API", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const ordersB = restaurantContext(
    "/orders/v2/orders/anything",
    "orderDetail",
    RESTAURANT_B,
  );
  const menusB = restaurantContext(
    "/menus/v2/menus",
    "menus",
    RESTAURANT_B,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("API, ACCOUNT"),
    remaining: 0,
    resetAtEpochMs: 108_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersB), 108_000);
  assert.equal(coordinator.requiredWaitUntilEpochMs(menusB), undefined);
});

test("multiple applicable buckets honor the furthest active reset", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("GLOBAL"),
    remaining: 0,
    resetAtEpochMs: 103_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });
  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("ENDPOINT"),
    remaining: 0,
    resetAtEpochMs: 109_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersA), 109_000);
});

test("Retry-After dominates reset in the same bucket", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("ENDPOINT"),
    remaining: 0,
    resetAtEpochMs: 104_000,
    retryAfterEpochMs: 110_000,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(ordersA), 110_000);
});

test("unknown server scope with timing is conservatively credential-wide", () => {
  const coordinator = new ToastRateLimitCoordinator();
  const ordersA = restaurantContext(
    "/orders/v2/ordersBulk",
    "ordersBulk",
    RESTAURANT_A,
  );
  const menusB = restaurantContext(
    "/menus/v2/menus",
    "menus",
    RESTAURANT_B,
  );

  coordinator.record({
    context: ordersA,
    by: parseToastRateLimitBy("FUTURE_SCOPE"),
    remaining: 0,
    resetAtEpochMs: 111_000,
    retryAfterEpochMs: undefined,
    observedAtEpochMs: NOW,
  });

  assert.equal(coordinator.requiredWaitUntilEpochMs(menusB), 111_000);
});

function restaurantContext(
  path: `/${string}`,
  endpointKey: string,
  restaurantGuid: string,
) {
  return makeRateLimitContext({
    path,
    endpointKey,
    requestScope: { kind: "restaurant", restaurantGuid },
  });
}
