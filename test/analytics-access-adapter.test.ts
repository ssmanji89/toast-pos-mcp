import assert from "node:assert/strict";
import test from "node:test";

import {
  AnalyticsAccessError,
  createAnalyticsAccessAdapter,
  validateAnalyticsRestaurantSelection,
} from "../src/analytics-access.js";
import { createApplicationRuntime } from "../src/runtime.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const FIRST_GUID = "11111111-1111-4111-8111-111111111111";
const SECOND_GUID = "22222222-2222-4222-8222-222222222222";
const CONTACT_MARKER = "invented-contact-marker-556a";
const TOKEN_MARKER = "invented-analytics-token-marker-556a";
const RAW_BODY_MARKER = "invented-raw-body-marker-556a";

function validResponse(restaurants: readonly Record<string, unknown>[] = [
  {
    restaurantGuid: FIRST_GUID,
    restaurantName: "Invented Analytics Restaurant One",
    active: true,
    testMode: false,
    archived: false,
    contact: CONTACT_MARKER,
    rawBody: RAW_BODY_MARKER,
  },
]) {
  return new Response(JSON.stringify({ restaurants }), { status: 200 });
}

function createAdapter(options: {
  readonly scopes?: unknown;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly identity?: object;
} = {}) {
  return createAnalyticsAccessAdapter({
    identity: options.identity ?? {},
    tokenManager: {
      async getAuthorizationHeader() {
        return `Bearer ${TOKEN_MARKER}`;
      },
      async getProvisionedScopes() {
        return options.scopes ?? ["enterprise-metrics:read"];
      },
    },
    hostname: "analytics.synthetic-toast-fixture.test",
    fetch: options.fetch ?? (async () => validResponse()),
    now: options.now ?? (() => 0),
    sleep: options.sleep ?? (async () => undefined),
  });
}

test("Analytics access preflights scope before its literal management-group GET", async () => {
  let fetchCalls = 0;
  const adapter = createAdapter({ scopes: [], fetch: async () => {
    fetchCalls += 1;
    return validResponse();
  } });

  await assert.rejects(
    adapter.refreshManagementGroupRestaurants(),
    (error: unknown) =>
      error instanceof AnalyticsAccessError &&
      error.code === "analytics_scope_unavailable",
  );
  assert.equal(fetchCalls, 0);
});

test("Analytics access uses one exact GET with no Standard restaurant header", async () => {
  const requests: Array<{ input: string; init: RequestInit }> = [];
  const adapter = createAdapter({ fetch: async (input, init) => {
    requests.push({ input: String(input), init: init ?? {} });
    return validResponse();
  } });

  const registry = await adapter.refreshManagementGroupRestaurants();
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.input,
    "https://analytics.synthetic-toast-fixture.test/era/v1/restaurants-information",
  );
  assert.equal(requests[0]?.init.method, "GET");
  assert.equal(new Headers(requests[0]?.init.headers).get("Toast-Restaurant-External-ID"), null);
  assert.equal(new Headers(requests[0]?.init.headers).get("authorization"), `Bearer ${TOKEN_MARKER}`);
  assert.ok(Object.isFrozen(registry));
  assert.equal(JSON.stringify(registry).includes(CONTACT_MARKER), false);
  assert.equal(JSON.stringify(registry).includes(RAW_BODY_MARKER), false);
  assert.equal(JSON.stringify(registry).includes(TOKEN_MARKER), false);
});

test("Analytics access sends cancellation to the source GET", async () => {
  const controller = new AbortController();
  const adapter = createAdapter({ fetch: async (_input, init) => {
    assert.equal(init?.signal, controller.signal);
    throw controller.signal.reason;
  } });
  controller.abort(new Error("invented cancellation"));

  await assert.rejects(adapter.refreshManagementGroupRestaurants({ signal: controller.signal }));
});

test("Analytics access validates atomically and rejects duplicate identifiers", async () => {
  let source = validResponse();
  const adapter = createAdapter({ fetch: async () => source });
  const first = await adapter.refreshManagementGroupRestaurants();
  source = validResponse([
    { restaurantGuid: FIRST_GUID, restaurantName: "One", active: true, testMode: false, archived: false },
    { restaurantGuid: FIRST_GUID.toUpperCase(), restaurantName: "Repeated", active: true, testMode: false, archived: false },
  ]);

  await assert.rejects(
    adapter.refreshManagementGroupRestaurants(),
    (error: unknown) => error instanceof AnalyticsAccessError && error.code === "analytics_response_invalid",
  );
  assert.equal(adapter.currentRegistry(), first);
  assert.ok(Object.isFrozen(first.restaurants));
  assert.ok(Object.isFrozen(first.restaurants[0]));
});

test("Analytics access rejects malformed source records without publication", async () => {
  const adapter = createAdapter({ fetch: async () => validResponse([
    { restaurantGuid: "not-a-guid", restaurantName: "Bad", active: true, testMode: false, archived: false },
  ]) });
  await assert.rejects(
    adapter.refreshManagementGroupRestaurants(),
    (error: unknown) => error instanceof AnalyticsAccessError && error.code === "analytics_response_invalid",
  );
  assert.equal(adapter.currentRegistry(), undefined);
});

test("Analytics selected sets require a canonical non-empty UUID subset", async () => {
  const registry = await createAdapter({ fetch: async () => validResponse([
    { restaurantGuid: FIRST_GUID, restaurantName: "One", active: true, testMode: false, archived: false },
    { restaurantGuid: SECOND_GUID, restaurantName: "Two", active: false, testMode: true, archived: false },
  ]) }).refreshManagementGroupRestaurants();

  const selection = validateAnalyticsRestaurantSelection(registry, [SECOND_GUID.toUpperCase(), FIRST_GUID]);
  assert.deepEqual(selection.restaurantGuids, [FIRST_GUID, SECOND_GUID]);
  assert.ok(Object.isFrozen(selection));
  for (const invalid of [[], [FIRST_GUID, FIRST_GUID], ["not-a-guid"], ["33333333-3333-4333-8333-333333333333"]]) {
    assert.throws(() => validateAnalyticsRestaurantSelection(registry, invalid));
  }
});

test("Analytics identities do not share registry or limiter state", async () => {
  const firstIdentity = {};
  const secondIdentity = {};
  let firstCalls = 0;
  let secondCalls = 0;
  const first = createAdapter({ identity: firstIdentity, fetch: async () => { firstCalls += 1; return validResponse(); } });
  const second = createAdapter({ identity: secondIdentity, fetch: async () => { secondCalls += 1; return validResponse([{ restaurantGuid: SECOND_GUID, restaurantName: "Two", active: true, testMode: false, archived: false }]); } });

  await first.refreshManagementGroupRestaurants();
  await second.refreshManagementGroupRestaurants();
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 1);
  assert.equal(first.currentRegistry()?.restaurants[0]?.restaurantGuid, FIRST_GUID);
  assert.equal(second.currentRegistry()?.restaurants[0]?.restaurantGuid, SECOND_GUID);
});

test("Analytics access enforces the documented endpoint limiter", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const adapter = createAdapter({
    now: () => now,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); now += milliseconds; },
  });
  for (let count = 0; count < 6; count += 1) {
    await adapter.refreshManagementGroupRestaurants();
  }
  assert.deepEqual(sleeps, [1000]);
});

test("Analytics runtime composition remains internal and leaves Standard location state separate", () => {
  const standardRuntime = createApplicationRuntime({ env: SYNTHETIC_VALID_RUNTIME_ENV });
  const analyticsRuntime = createApplicationRuntime({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_ANALYTICS_API_HOSTNAME: "analytics.synthetic-toast-fixture.test",
      TOAST_ANALYTICS_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
      TOAST_ANALYTICS_CLIENT_ID: "invented-runtime-client-id-556a",
      TOAST_ANALYTICS_CLIENT_SECRET: "invented-runtime-secret-556a",
    },
  });
  assert.equal(standardRuntime.analyticsAccess, undefined);
  assert.ok(analyticsRuntime.analyticsAccess);
  assert.notEqual(analyticsRuntime.analyticsAccess, analyticsRuntime.locationRegistry);
  assert.equal("analyticsAccess" in analyticsRuntime.toastHttpClient, false);
});
