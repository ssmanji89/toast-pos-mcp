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
import { ApplicationRuntime } from "../src/runtime.js";
import { SalesCrossPageIdentityGuard } from "../src/sales-cross-page-identity.js";
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

test("first-use registry publication cannot expose location before matching provenance", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-location-publication-token",
      },
    }),
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
    () => 1_800_000_000_000,
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
