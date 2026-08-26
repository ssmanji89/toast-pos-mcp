import assert from "node:assert/strict";
import test from "node:test";

import type { ToastLocation } from "../src/locations.js";
import {
  normalizeOrdersPages,
  OrdersNormalizationError,
} from "../src/orders-normalization.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000401";
const ORDER_GUID = "00000000-0000-4000-8000-000000000402";
const CHECK_GUID = "00000000-0000-4000-8000-000000000403";
const SELECTION_GUID = "00000000-0000-4000-8000-000000000404";

const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: RESTAURANT_GUID,
  name: "Synthetic Review Fix Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["orders:read"]),
});

test("retains guest count and selection-level dining option without retaining free text", () => {
  const raw = baseOrder();
  raw.numberOfGuests = 7;
  raw.diningOption = {
    guid: null,
    multiLocationId: "synthetic-order-dining-option",
    name: "must-not-be-copied",
  };
  raw.checks[0].selections[0].diningOption = {
    guid: null,
    multiLocationId: "synthetic-selection-dining-option",
    name: "must-not-be-copied",
  };

  const batch = normalize([raw]);
  const order = batch.orders[0];
  const selection = order?.checks[0]?.selections[0];

  assert.equal(order?.numberOfGuests, 7);
  assert.deepEqual(order?.diningOption, {
    guid: undefined,
    multiLocationId: "synthetic-order-dining-option",
  });
  assert.deepEqual(selection?.diningOption, {
    guid: undefined,
    multiLocationId: "synthetic-selection-dining-option",
  });
  assert.ok(!JSON.stringify(batch).includes("must-not-be-copied"));
});

test("rejects negative guest counts as malformed source", () => {
  const raw = baseOrder();
  raw.numberOfGuests = -1;

  assert.throws(() => normalize([raw]), (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_source_invalid");
    return true;
  });
});

test("accepts Toast-style ISO timestamps with Z and colonless numeric offsets", () => {
  const zulu = baseOrder();
  zulu.openedDate = "2026-08-16T12:34:56.123Z";
  zulu.modifiedDate = "2026-08-16T12:35:56Z";

  const offset = baseOrder("00000000-0000-4000-8000-000000000406");
  offset.checks[0].guid = "00000000-0000-4000-8000-000000000407";
  offset.checks[0].selections[0].guid = "00000000-0000-4000-8000-000000000408";
  offset.openedDate = "2026-08-16T12:34:56.123-0500";
  offset.modifiedDate = "2026-08-16T12:35:56-05:00";

  const batch = normalize([zulu, offset]);
  assert.equal(batch.orders.length, 2);
});

test("rejects human-readable or zone-less timestamps in source records", () => {
  for (const invalidTimestamp of [
    "August 16, 2026 12:34 PM",
    "2026-08-16T12:34:56",
    "2026/08/16 12:34:56Z",
  ]) {
    const raw = baseOrder();
    raw.openedDate = invalidTimestamp;

    assert.throws(() => normalize([raw]), (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_source_invalid");
      return true;
    });
  }
});

test("modified-window query uses the same zoned ISO contract", () => {
  assert.doesNotThrow(() => normalizeOrdersPages({
    location: LOCATION,
    query: {
      mode: "modified_window",
      startDate: "2026-08-16T00:00:00-0500",
      endDate: "2026-08-17T00:00:00-05:00",
    },
    pages: [page([])],
  }));

  for (const invalid of [
    {
      startDate: "August 16, 2026",
      endDate: "2026-08-17T00:00:00Z",
    },
    {
      startDate: "2026-08-16T00:00:00",
      endDate: "2026-08-17T00:00:00Z",
    },
  ]) {
    assert.throws(() => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "modified_window", ...invalid },
      pages: [page([])],
    }), (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_query_invalid");
      return true;
    });
  }
});

test("modified-window query rejects invalid calendar days and accepts leap days", () => {
  assert.throws(() => normalizeOrdersPages({
    location: LOCATION,
    query: {
      mode: "modified_window",
      startDate: "2026-02-30T00:00:00Z",
      endDate: "2026-03-03T00:00:00Z",
    },
    pages: [page([])],
  }), (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_query_invalid");
    return true;
  });

  assert.doesNotThrow(() => normalizeOrdersPages({
    location: LOCATION,
    query: {
      mode: "modified_window",
      startDate: "2028-02-29T00:00:00Z",
      endDate: "2028-03-01T00:00:00Z",
    },
    pages: [page([])],
  }));
});

function normalize(rawOrders: readonly unknown[]) {
  return normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page(rawOrders)],
  });
}

function page(body: unknown): ToastDetailedJsonResult {
  return Object.freeze({
    apiFamily: "standard",
    body,
    scope: Object.freeze({ kind: "restaurant", restaurantGuid: RESTAURANT_GUID }),
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: undefined,
  });
}

function baseOrder(guid = ORDER_GUID): Record<string, any> {
  return {
    guid,
    businessDate: 20260816,
    openedDate: "2026-08-16T12:00:00-05:00",
    modifiedDate: "2026-08-16T12:30:00-05:00",
    promisedDate: null,
    approvalStatus: "APPROVED",
    source: "In Store",
    excessFood: false,
    deleted: false,
    voided: false,
    checks: [{
      guid: CHECK_GUID,
      amount: 10,
      taxAmount: 0.8,
      totalAmount: 10.8,
      taxExempt: false,
      deleted: false,
      voided: false,
      paymentStatus: "CLOSED",
      selections: [{
        guid: SELECTION_GUID,
        quantity: 1,
        unitOfMeasure: "NONE",
        selectionType: "NONE",
        price: 10,
        preDiscountPrice: 10,
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
