import assert from "node:assert/strict";

const READINESS_MARKER = "installed-artifact-fetch-preload-ready";
const ROUTE_REJECT_MARKER = "installed-artifact-fetch-route-rejected";
const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_DATE = "20260816";
const EXECUTABLE_TEST_FETCH = process.env.TOAST_MCP_EXECUTABLE_TEST_FETCH === "true";

// This module is loaded only through NODE_OPTIONS in the installed-artifact
// test. It has no production imports and is intentionally excluded from npm.
console.error(`${READINESS_MARKER} execPath=${process.execPath} version=${process.version}`);

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
  );
  const headers = new Headers(init?.headers);

  if (url.pathname === "/authentication/v1/authentication/login") {
    return json({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: syntheticJwt(["orders:read", "restaurants:read"]),
      },
    });
  }

  if (url.pathname === "/partners/v1/restaurants") {
    assert.equal(headers.has("toast-restaurant-external-id"), false, "Partners location request must not have a restaurant header");
    return json([{
      restaurantGuid: RESTAURANT_GUID,
      managementGroupGuid: null,
      deleted: false,
      scopes: ["orders:read", "restaurants:read"],
    }]);
  }

  if (url.pathname === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`) {
    assertRestaurantHeader(headers);
    return json({
      guid: RESTAURANT_GUID,
      general: {
        archived: false,
        name: "Installed Artifact Test Cafe",
        timeZone: "America/Chicago",
        closeoutHour: 4,
        currencyCode: "USD",
        managementGroupGuid: null,
      },
    });
  }

  if (url.pathname === "/orders/v2/ordersBulk") {
    assertRestaurantHeader(headers);
    const businessDate = url.searchParams.get("businessDate");
    if (EXECUTABLE_TEST_FETCH && businessDate !== null) {
      return executableOrdersRoute(businessDate, init?.signal);
    }
    assert.equal(businessDate, BUSINESS_DATE, "orders request must keep the invented business date");
    return json([inventedOrder()]);
  }

  if (url.pathname === "/orders/v2/payments" && EXECUTABLE_TEST_FETCH) {
    assertRestaurantHeader(headers);
    const businessDate = url.searchParams.get("paidBusinessDate")
      ?? url.searchParams.get("refundBusinessDate")
      ?? url.searchParams.get("voidBusinessDate");
    if (businessDate === "20260817") return waitForAbort("gate60-payments", businessDate, init?.signal);
    return json([]);
  }

  console.error(`${ROUTE_REJECT_MARKER}:${url.pathname}`);
  throw new Error(`${ROUTE_REJECT_MARKER}: unmatched test-only route`);
};

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "toast-request-id": "installed-artifact-fixture-request",
    },
  });
}

function executableOrdersRoute(businessDate: string, signal: AbortSignal | null | undefined): Promise<Response> {
  if (businessDate === "20260815") return waitForAbort("gate60-orders", businessDate, signal);
  if (businessDate === "20260816") return waitForAbort("gate60-orders", businessDate, signal);
  if (businessDate === "20260819") {
    console.error("gate60-orders-rejected:20260819");
    throw new Error("gate60 invented source rejection");
  }
  console.error(`gate60-orders-resolved:${businessDate}`);
  return Promise.resolve(json([inventedOrder(Number(businessDate))]));
}

function waitForAbort(marker: string, businessDate: string, signal: AbortSignal | null | undefined): Promise<Response> {
  console.error(`${marker}-started:${businessDate}`);
  return new Promise<Response>((_resolve, reject) => {
    if (signal?.aborted) {
      console.error(`${marker}-aborted:${businessDate}`);
      reject(signal.reason);
      return;
    }
    signal?.addEventListener("abort", () => {
      console.error(`${marker}-aborted:${businessDate}`);
      reject(signal.reason);
    }, { once: true });
  });
}

function assertRestaurantHeader(headers: Headers): void {
  assert.equal(headers.get("toast-restaurant-external-id"), RESTAURANT_GUID, "restaurant-scoped request must retain its restaurant GUID");
}

function syntheticJwt(scope: readonly string[]): string {
  return `fixture.${Buffer.from(JSON.stringify({ scope })).toString("base64url")}.signature`;
}

function inventedOrder(businessDate = 20260816): object {
  return {
    guid: "00000000-0000-4000-8000-000000000802",
    businessDate,
    openedDate: "2026-08-16T12:00:00-0500",
    modifiedDate: "2026-08-16T12:30:00-0500",
    promisedDate: null,
    approvalStatus: "APPROVED",
    source: "In Store",
    server: { guid: "00000000-0000-4000-8000-000000000911" },
    revenueCenter: { guid: "00000000-0000-4000-8000-000000000816" },
    restaurantService: { guid: "00000000-0000-4000-8000-000000000817" },
    diningOption: { guid: "00000000-0000-4000-8000-000000000815" },
    numberOfGuests: 2,
    excessFood: false,
    deleted: false,
    voided: false,
    checks: [{
      guid: "00000000-0000-4000-8000-000000000803",
      amount: 10,
      taxAmount: 0.8,
      totalAmount: 10.8,
      taxExempt: false,
      deleted: false,
      voided: false,
      paymentStatus: "CLOSED",
      selections: [{
        guid: "00000000-0000-4000-8000-000000000804",
        item: { guid: "00000000-0000-4000-8000-000000000811" },
        itemGroup: { guid: "00000000-0000-4000-8000-000000000821" },
        salesCategory: { guid: "00000000-0000-4000-8000-000000000814" },
        diningOption: { guid: "00000000-0000-4000-8000-000000000815" },
        quantity: 1,
        unitOfMeasure: "NONE",
        selectionType: "NONE",
        price: 10,
        preDiscountPrice: 10,
        tax: 0.8,
        deferred: false,
        voided: false,
        appliedDiscounts: [],
        modifiers: [],
      }],
      payments: [],
      appliedServiceCharges: [],
      appliedDiscounts: [],
    }],
  };
}
