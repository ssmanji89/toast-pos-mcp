import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import type {
  ToastLocation,
  ToastLocationRegistry,
} from "../src/locations.js";
import type { NormalizedOrder } from "../src/orders-normalization.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { ReportComputationError } from "../src/report-core.js";
import {
  ApplicationRuntime,
  createApplicationRuntime,
} from "../src/runtime.js";
import { SalesCrossPageIdentityGuard } from "../src/sales-cross-page-identity.js";
import { ToastHttpError } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID =
  SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;

const IDS = {
  orderA: "00000000-0000-4000-8000-000000001001",
  orderB: "00000000-0000-4000-8000-000000001002",
  checkA: "00000000-0000-4000-8000-000000001003",
  checkB: "00000000-0000-4000-8000-000000001004",
  selectionA: "00000000-0000-4000-8000-000000001005",
  selectionB: "00000000-0000-4000-8000-000000001006",
  modifierA: "00000000-0000-4000-8000-000000001007",
  modifierB: "00000000-0000-4000-8000-000000001008",
  paymentA: "00000000-0000-4000-8000-000000001009",
  paymentB: "00000000-0000-4000-8000-000000001010",
  serviceA: "00000000-0000-4000-8000-000000001011",
  serviceB: "00000000-0000-4000-8000-000000001012",
} as const;

test("first-use registry publication cannot expose location before matching provenance", { timeout: 1_000 }, async () => {
  let now = 1_800_000_000_000;
  const sharedNow = (): number => {
    now += 1_000;
    return now;
  };
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-location-publication-token",
      },
    }),
    now: sharedNow,
  });
  const toastHttpClient = createRateLimitAwareToastHttpClient(
    config,
    tokenManager,
    {
      fetch: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/partners/v1/restaurants") {
          return jsonResponse([
            {
              restaurantGuid: RESTAURANT_GUID,
              managementGroupGuid: null,
              deleted: false,
              scopes: ["orders:read", "restaurants:read"],
            },
          ], "publication-partners-request");
        }
        if (
          url.pathname
          === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`
        ) {
          return jsonResponse({
            guid: RESTAURANT_GUID,
            general: {
              archived: false,
              name: "Publication Race Cafe",
              timeZone: "America/Chicago",
              closeoutHour: 4,
              currencyCode: "USD",
              managementGroupGuid: null,
            },
          }, "publication-restaurant-request");
        }
        return new Response("{}", { status: 404 });
      },
      random: () => 0,
      sleep: async () => undefined,
      now: sharedNow,
    },
  );

  let runtime!: ApplicationRuntime;
  let reentrantRead: ReturnType<ApplicationRuntime["getLocationContext"]>
    | undefined;
  let byGuid = new Map<string, ToastLocation>();

  const registry: ToastLocationRegistry = {
    get(_config, restaurantGuid) {
      return byGuid.get(restaurantGuid.toLowerCase());
    },
    list() {
      return Object.freeze([...byGuid.values()]);
    },
    replace(_config, locations) {
      byGuid = new Map(
        locations.map((location) => [location.restaurantGuid, location]),
      );

      // Re-enter the runtime at the exact publication boundary: registry has
      // been replaced, but discoverStandardLocations() has not returned yet.
      reentrantRead = runtime.getLocationContext(RESTAURANT_GUID);
    },
  };

  runtime = new ApplicationRuntime(
    config,
    tokenManager,
    toastHttpClient,
    registry,
    sharedNow,
    1,
  );

  const first = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.ok(reentrantRead, "replace hook must have exercised reentrant read");
  const second = await reentrantRead;

  assert.equal(first.location.restaurantGuid, RESTAURANT_GUID);
  assert.equal(second.location.restaurantGuid, RESTAURANT_GUID);
  assert.deepEqual(second.provenance, first.provenance);
  assert.equal(first.provenance.upstreamRequestIdCount, 2);
  assert.deepEqual(first.provenance.upstreamRequestIds, [
    "publication-partners-request",
    "publication-restaurant-request",
  ]);
});

test("location context refreshes at the bounded age and never serves stale context after a required refresh failure", async () => {
  let now = 1_800_000_000_000;
  let partnersCalls = 0;
  let restaurantCalls = 0;
  let authCalls = 0;
  let failRefresh = false;

  const runtime = createApplicationRuntime({
    env: SYNTHETIC_VALID_RUNTIME_ENV,
    now: () => now,
    locationContextMaxAgeMs: 1_000,
    maxAttempts: 1,
    random: () => 0,
    sleep: async () => undefined,
    authFetch: async () => {
      authCalls += 1;
      return jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-location-freshness-token",
      },
      });
    },
    dataFetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/partners/v1/restaurants") {
        partnersCalls += 1;
        if (failRefresh) {
          return new Response("{}", {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        return jsonResponse([
          {
            restaurantGuid: RESTAURANT_GUID,
            managementGroupGuid: null,
            deleted: false,
            scopes: ["orders:read", "restaurants:read"],
          },
        ], `freshness-partners-${partnersCalls}`);
      }
      if (
        url.pathname
        === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`
      ) {
        restaurantCalls += 1;
        return jsonResponse({
          guid: RESTAURANT_GUID,
          general: {
            archived: false,
            name: `Freshness Cafe ${restaurantCalls}`,
            timeZone: "America/Chicago",
            closeoutHour: 4,
            currencyCode: "USD",
            managementGroupGuid: null,
          },
        }, `freshness-restaurant-${restaurantCalls}`);
      }
      return new Response("{}", { status: 404 });
    },
  });

  const first = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.equal(first.location.name, "Freshness Cafe 1");
  assert.equal(first.freshness.ageMs, 0);
  assert.equal(first.freshness.maxAgeMs, 1_000);
  assert.equal(partnersCalls, 1);
  assert.equal(restaurantCalls, 1);
  assert.equal(authCalls, 1);

  now += 999;
  const stillFresh = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.equal(stillFresh.location.name, "Freshness Cafe 1");
  assert.equal(stillFresh.freshness.ageMs, 999);
  assert.equal(partnersCalls, 1);
  assert.equal(restaurantCalls, 1);

  now += 1;
  const refreshed = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.equal(refreshed.location.name, "Freshness Cafe 2");
  assert.equal(refreshed.freshness.ageMs, 0);
  assert.equal(partnersCalls, 2);
  assert.equal(restaurantCalls, 2);

  // The injected clock is shared by runtime freshness, transport provenance,
  // and OAuth token refresh. At this boundary it refreshes all three.
  now += 3_540_000;
  const tokenRefreshed = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.equal(tokenRefreshed.freshness.ageMs, 0);
  assert.equal(partnersCalls, 3);
  assert.equal(restaurantCalls, 3);
  assert.equal(authCalls, 2);

  now += 1_000;
  failRefresh = true;
  await assert.rejects(
    runtime.getLocationContext(RESTAURANT_GUID),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "request_failed");
      assert.equal(error.upstreamStatus, 503);
      return true;
    },
  );
  assert.equal(partnersCalls, 4);
  assert.equal(restaurantCalls, 3);

  // Old context still exists internally, but the next caller must try to
  // refresh again rather than silently serving it as current.
  failRefresh = false;
  const recovered = await runtime.getLocationContext(RESTAURANT_GUID);
  assert.equal(recovered.location.name, "Freshness Cafe 4");
  assert.equal(partnersCalls, 5);
  assert.equal(restaurantCalls, 4);
});

test("streaming sales guard rejects every T3-001 batch-global entity repeated on a later page", () => {
  const cases: readonly {
    readonly name: string;
    readonly second: Partial<IdentityIds>;
  }[] = [
    { name: "order", second: { order: IDS.orderA } },
    { name: "check", second: { check: IDS.checkA } },
    { name: "selection", second: { selection: IDS.selectionA } },
    { name: "nested modifier", second: { modifier: IDS.modifierA } },
    { name: "payment", second: { payment: IDS.paymentA } },
    { name: "service charge", second: { serviceCharge: IDS.serviceA } },
  ];

  for (const current of cases) {
    const guard = new SalesCrossPageIdentityGuard();
    guard.observeOrder(orderWithIds(firstPageIds()));

    assert.throws(
      () => guard.observeOrder(orderWithIds({
        ...secondPageIds(),
        ...current.second,
      })),
      (error: unknown) => {
        assert.ok(
          error instanceof ReportComputationError,
          `${current.name} duplicate must use report integrity error`,
        );
        assert.equal(error.code, "sales_duplicate_entity_across_pages");
        return true;
      },
      `${current.name} duplicate on page N+1 must fail closed`,
    );
  }
});

interface IdentityIds {
  readonly order: string;
  readonly check: string;
  readonly selection: string;
  readonly modifier: string;
  readonly payment: string;
  readonly serviceCharge: string;
}

function firstPageIds(): IdentityIds {
  return {
    order: IDS.orderA,
    check: IDS.checkA,
    selection: IDS.selectionA,
    modifier: IDS.modifierA,
    payment: IDS.paymentA,
    serviceCharge: IDS.serviceA,
  };
}

function secondPageIds(): IdentityIds {
  return {
    order: IDS.orderB,
    check: IDS.checkB,
    selection: IDS.selectionB,
    modifier: IDS.modifierB,
    payment: IDS.paymentB,
    serviceCharge: IDS.serviceB,
  };
}

function orderWithIds(ids: IdentityIds): NormalizedOrder {
  return {
    guid: ids.order,
    checks: [
      {
        guid: ids.check,
        payments: [{ guid: ids.payment }],
        appliedServiceCharges: [{ guid: ids.serviceCharge }],
        selections: [
          {
            guid: ids.selection,
            modifiers: [
              {
                guid: ids.modifier,
                modifiers: [],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as NormalizedOrder;
}

function jsonResponse(body: unknown, requestId?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "toast-request-id": requestId }),
    },
  });
}
