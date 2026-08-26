import assert from "node:assert/strict";
import test from "node:test";

import type { ToastLocation } from "../src/locations.js";
import {
  normalizeOrdersPages,
  OrdersNormalizationError,
} from "../src/orders-normalization.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

type Raw = Record<string, any>;

const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: guid(801),
  name: "Synthetic R3 Integrity Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["orders:read"]),
});

test("business-date mode rejects missing or mismatched Order.businessDate", () => {
  const missing = order(810, 811, 812);
  delete missing.businessDate;
  assertBusinessDateMismatch(missing);

  const mismatched = order(820, 821, 822);
  mismatched.businessDate = 20260815;
  assertBusinessDateMismatch(mismatched);
});

test("business-date mode accepts a scheduled order when Toast businessDate matches the requested day", () => {
  const scheduled = order(830, 831, 832);
  scheduled.approvalStatus = "FUTURE";
  scheduled.promisedDate = "2026-08-16T20:00:00-05:00";

  const batch = normalizeBusinessDate([scheduled]);
  assert.equal(batch.orders[0]?.scheduled, true);
  assert.equal(batch.orders[0]?.businessDate, 20260816);
});

test("modified-window mode may legitimately contain multiple Toast business dates", () => {
  const first = order(840, 841, 842);
  first.businessDate = 20260815;
  const second = order(850, 851, 852);
  second.businessDate = 20260816;

  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: {
      mode: "modified_window",
      startDate: "2026-08-15T00:00:00Z",
      endDate: "2026-08-17T00:00:00Z",
    },
    pages: [page([first, second])],
  });
  assert.deepEqual(batch.orders.map((value) => value.businessDate), [
    20260815,
    20260816,
  ]);
});

test("check GUID uniqueness is enforced across distinct orders in one batch", () => {
  const first = order(860, 861, 862);
  const second = order(870, 861, 872);

  assertDuplicate(() => normalizeBusinessDate([first, second]));
});

test("nested selection GUID uniqueness is enforced across distinct orders in one batch", () => {
  const first = order(880, 881, 882);
  first.checks[0].selections[0].modifiers = [selection(889)];

  const second = order(890, 891, 892);
  second.checks[0].selections[0].modifiers = [selection(889)];

  assertDuplicate(() => normalizeBusinessDate([first, second]));
});

test("omitted taxExempt uses Toast's documented false default while explicit true survives", () => {
  const omitted = order(900, 901, 902);
  delete omitted.checks[0].taxExempt;
  const explicit = order(910, 911, 912);
  explicit.checks[0].taxExempt = true;

  const batch = normalizeBusinessDate([omitted, explicit]);
  assert.equal(batch.orders[0]?.checks[0]?.taxExempt, false);
  assert.equal(batch.orders[1]?.checks[0]?.taxExempt, true);
});

test("non-boolean taxExempt still fails source validation", () => {
  const invalid = order(920, 921, 922);
  invalid.checks[0].taxExempt = "false";

  assert.throws(() => normalizeBusinessDate([invalid]), (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_source_invalid");
    return true;
  });
});

function assertBusinessDateMismatch(raw: Raw): void {
  assert.throws(() => normalizeBusinessDate([raw]), (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_business_date_mismatch");
    return true;
  });
}

function assertDuplicate(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_duplicate_entity");
    return true;
  });
}

function normalizeBusinessDate(rawOrders: readonly unknown[]) {
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
    scope: Object.freeze({ kind: "restaurant", restaurantGuid: LOCATION.restaurantGuid }),
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: "synthetic-r3-request",
  });
}

function order(orderId: number, checkId: number, selectionId: number): Raw {
  return {
    guid: guid(orderId),
    businessDate: 20260816,
    openedDate: "2026-08-16T10:00:00-05:00",
    modifiedDate: "2026-08-16T10:01:00-05:00",
    promisedDate: null,
    approvalStatus: "APPROVED",
    source: "In Store",
    excessFood: false,
    deleted: false,
    voided: false,
    checks: [{
      guid: guid(checkId),
      amount: 10,
      taxAmount: 0.8,
      totalAmount: 10.8,
      taxExempt: false,
      deleted: false,
      voided: false,
      paymentStatus: "CLOSED",
      selections: [selection(selectionId)],
      payments: [],
      appliedServiceCharges: [],
      appliedDiscounts: [],
    }],
  };
}

function selection(id: number): Raw {
  return {
    guid: guid(id),
    quantity: 1,
    unitOfMeasure: "NONE",
    selectionType: "NONE",
    price: 10,
    preDiscountPrice: 10,
    deferred: false,
    voided: false,
    appliedDiscounts: [],
    appliedTaxes: [],
    modifiers: [],
  };
}

function guid(id: number): string {
  return `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0").slice(-12)}`;
}
