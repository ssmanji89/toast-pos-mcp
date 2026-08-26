import assert from "node:assert/strict";
import test from "node:test";

import type { ToastLocation } from "../src/locations.js";
import {
  normalizeOrdersPages,
  OrdersNormalizationError,
} from "../src/orders-normalization.js";
import {
  addExactDecimals,
  exactDecimalFromNumber,
  exactDecimalToString,
} from "../src/exact-decimal.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

type Raw = Record<string, any>;

const guid = (id: number): string =>
  `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0").slice(-12)}`;
const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: guid(1001),
  name: "Synthetic PR 34 Remediation Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["orders:read"]),
});

test("rejects non-Standard, credential-scoped, and other-restaurant Orders pages", () => {
  const invalidPages: ToastDetailedJsonResult[] = [
    page({ apiFamily: "analytics" } as unknown as Partial<ToastDetailedJsonResult>),
    page({ scope: { kind: "credential" } }),
    page({ scope: { kind: "restaurant", restaurantGuid: guid(1002) } }),
  ];

  for (const invalidPage of invalidPages) {
    assert.throws(() => normalize(invalidPage), (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_source_invalid");
      return true;
    });
  }
});

test("rejects an empty successful request ID and an invalid selected location GUID", () => {
  assertSourceInvalid(() => normalize(page({ upstreamRequestId: "" })));
  assertSourceInvalid(() => normalizeOrdersPages({
    location: { ...LOCATION, restaurantGuid: "not-a-guid" },
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page({ scope: { kind: "restaurant", restaurantGuid: "not-a-guid" } })],
  }));
});

test("rejects an aggregate currency amount outside the safe integer boundary", () => {
  const raw = order();
  raw.checks[0].amount = Number.MAX_SAFE_INTEGER;
  assert.throws(() => normalize(page({ body: [raw] })), (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_money_precision_invalid");
    return true;
  });
});

test("uses currency-hundredths names for fixed-two-decimal totals", () => {
  const batch = normalize(page());
  const check = JSON.parse(JSON.stringify(batch.orders[0]?.checks[0])) as {
    amountHundredths: number | undefined;
  };

  assert.equal(check.amountHundredths, 1000);
});

test("enforces each supported source identity boundary independently", () => {
  const cases: readonly [string, (first: Raw, second: Raw) => void][] = [
    ["order", (first, second) => { second.guid = first.guid; }],
    ["check", (first, second) => { second.checks[0].guid = first.checks[0].guid; }],
    ["selection", (first, second) => { second.checks[0].selections[0].guid = first.checks[0].selections[0].guid; }],
    ["payment", (first, second) => { second.checks[0].payments[0].guid = first.checks[0].payments[0].guid; }],
    ["service charge", (first, second) => { second.checks[0].appliedServiceCharges[0].guid = first.checks[0].appliedServiceCharges[0].guid; }],
  ];

  for (const [, duplicate] of cases) {
    const first = detailedOrder(1010);
    const second = detailedOrder(1020);
    duplicate(first, second);
    assertDuplicate(() => normalize(page({ body: [first, second] })));
  }

  const checkDiscounts = detailedOrder(1030);
  checkDiscounts.checks[0].appliedDiscounts.push({ ...checkDiscounts.checks[0].appliedDiscounts[0] });
  assertDuplicate(() => normalize(page({ body: [checkDiscounts] })));

  const selectionDiscounts = detailedOrder(1040);
  const discounts = selectionDiscounts.checks[0].selections[0].appliedDiscounts;
  discounts.push({ ...discounts[0] });
  assertDuplicate(() => normalize(page({ body: [selectionDiscounts] })));
});

test("rejects a duplicate order GUID before independent child identities can mask it", () => {
  const first = detailedOrder(1070);
  const second = detailedOrder(1080);
  second.guid = first.guid;

  assertDuplicate(() => normalize(page({ body: [first, second] })));
});

test("retains an unknown service-charge category", () => {
  const raw = detailedOrder(1090);
  raw.checks[0].appliedServiceCharges[0].serviceChargeCategory = "FUTURE_CATEGORY";

  const batch = normalize(page({ body: [raw] }));
  assert.equal(batch.orders[0]?.checks[0]?.appliedServiceCharges[0]?.serviceChargeCategory, "FUTURE_CATEGORY");
});

test("retains required applied-tax GUIDs and rejects cross-surface duplicates", () => {
  const raw = detailedOrder(1050);
  const appliedTaxGuid = guid(1058);
  raw.checks[0].selections[0].appliedTaxes = [{
    guid: appliedTaxGuid,
    taxRate: { guid: guid(1059) },
    taxAmount: 0.075,
  }];
  raw.checks[0].appliedServiceCharges[0].appliedTaxes = [{
    guid: appliedTaxGuid,
    taxRate: { guid: guid(1060) },
    taxAmount: 0.625,
  }];

  assertDuplicate(() => normalize(page({ body: [raw] })));

  raw.checks[0].appliedServiceCharges[0].appliedTaxes[0].guid = guid(1061);
  const batch = normalize(page({ body: [raw] }));
  const normalizedTax = JSON.parse(JSON.stringify(
    batch.orders[0]?.checks[0]?.selections[0]?.appliedTaxes[0],
  )) as { guid: string | undefined };
  assert.equal(normalizedTax.guid, appliedTaxGuid);
});

test("rejects an applied tax without its required GUID", () => {
  const raw = detailedOrder(1062);
  raw.checks[0].selections[0].appliedTaxes = [{
    taxRate: { guid: guid(1063) },
    taxAmount: 0.075,
  }];

  assertSourceInvalid(() => normalize(page({ body: [raw] })));
});

test("exact decimal operations retain exponent, mixed scale, negative, and empty identity semantics", () => {
  assert.deepEqual(exactDecimalFromNumber(1.2e3), { coefficient: "1200", scale: 0 });
  assert.equal(exactDecimalToString(addExactDecimals([
    exactDecimalFromNumber(1.2), exactDecimalFromNumber(0.03),
  ])), "1.23");
  assert.equal(exactDecimalToString(exactDecimalFromNumber(-0.05)), "-0.05");
  assert.deepEqual(addExactDecimals([]), { coefficient: "0", scale: 0 });
});

test("exact decimal conversion canonicalizes zero", () => {
  assert.deepEqual(exactDecimalFromNumber(0), { coefficient: "0", scale: 0 });
});

test("exact decimal conversion expands Number exponent notation", () => {
  const positiveExponent = 1e21;
  const negativeExponent = 1e-7;
  assert.match(String(positiveExponent), /e/u);
  assert.match(String(negativeExponent), /e/u);
  assert.deepEqual(exactDecimalFromNumber(positiveExponent), {
    coefficient: "1000000000000000000000",
    scale: 0,
  });
  assert.deepEqual(exactDecimalFromNumber(negativeExponent), {
    coefficient: "1",
    scale: 7,
  });
});

test("exact decimal addition removes trailing coefficient zeroes", () => {
  assert.deepEqual(addExactDecimals([
    { coefficient: "12", scale: 1 },
    { coefficient: "8", scale: 1 },
  ]), { coefficient: "2", scale: 0 });
});

test("exact decimal rendering prefixes a positive fraction with zero", () => {
  assert.equal(exactDecimalToString({ coefficient: "5", scale: 2 }), "0.05");
});

test("exact decimal addition returns frozen values", () => {
  assert.ok(Object.isFrozen(addExactDecimals([
    { coefficient: "1", scale: 1 },
    { coefficient: "2", scale: 1 },
  ])));
  assert.ok(Object.isFrozen(addExactDecimals([])));
});

test("exact decimal operations reject non-canonical inputs", () => {
  for (const value of [
    { coefficient: "1.2", scale: 1 },
    { coefficient: "1", scale: -1 },
    { coefficient: "1", scale: Number.NaN },
  ]) {
    assert.throws(() => exactDecimalToString(value));
    assert.throws(() => addExactDecimals([value]));
  }
});

test("exact decimal operations reject redundant coefficient forms", () => {
  for (const value of [
    { coefficient: "001", scale: 0 },
    { coefficient: "-0", scale: 0 },
    { coefficient: "1200", scale: 3 },
  ]) {
    assert.throws(() => exactDecimalToString(value));
    assert.throws(() => addExactDecimals([value]));
  }
});

test("exact decimal sources reject non-finite numbers", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => exactDecimalFromNumber(value));
  }
});

test("propagates the selected location timezone and closeout hour", () => {
  const location = { ...LOCATION, timezone: "America/Denver", closeoutHour: 0 };
  const batch = normalizeOrdersPages({
    location,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page()],
  });
  assert.equal(batch.timezone, "America/Denver");
  assert.equal(batch.closeoutHour, 0);
});

function normalize(result: ToastDetailedJsonResult) {
  return normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [result],
  });
}

function page(overrides: Partial<ToastDetailedJsonResult> = {}): ToastDetailedJsonResult {
  return Object.freeze({
    apiFamily: "standard",
    body: [order()],
    scope: Object.freeze({ kind: "restaurant" as const, restaurantGuid: LOCATION.restaurantGuid }),
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: "synthetic-remediation-request",
    ...overrides,
  });
}

function order(): Raw {
  return {
    guid: guid(1003), businessDate: 20260816, excessFood: false, deleted: false, voided: false,
    checks: [{
      guid: guid(1004), amount: 10, taxAmount: 0, totalAmount: 10, taxExempt: false,
      deleted: false, voided: false, paymentStatus: "CLOSED",
      selections: [{
        guid: guid(1005), quantity: 1, price: 10, preDiscountPrice: 10,
        deferred: false, voided: false, appliedDiscounts: [], modifiers: [],
      }], payments: [], appliedServiceCharges: [], appliedDiscounts: [],
    }],
  };
}

function detailedOrder(offset: number): Raw {
  const raw = order();
  raw.guid = guid(offset);
  raw.checks[0].guid = guid(offset + 1);
  raw.checks[0].selections[0].guid = guid(offset + 2);
  raw.checks[0].payments = [{ guid: guid(offset + 3), type: "CASH", amount: 10, tipAmount: 0 }];
  raw.checks[0].appliedServiceCharges = [{
    guid: guid(offset + 4), chargeAmount: 1, serviceCharge: { guid: guid(offset + 5) }, gratuity: false,
  }];
  raw.checks[0].appliedDiscounts = [{
    guid: guid(offset + 6), discountAmount: 1, nonTaxDiscountAmount: 1,
  }];
  raw.checks[0].selections[0].appliedDiscounts = [{
    guid: guid(offset + 7), discountAmount: 1, nonTaxDiscountAmount: 1,
  }];
  return raw;
}

function assertSourceInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_source_invalid");
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
