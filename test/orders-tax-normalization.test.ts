import assert from "node:assert/strict";
import test from "node:test";

import {
  addExactDecimals,
  exactDecimalFromNumber,
  exactDecimalToString,
} from "../src/exact-decimal.js";
import type { ToastLocation } from "../src/locations.js";
import { normalizeOrdersPages } from "../src/orders-normalization.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

const G = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0").slice(-12)}`;
const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: G(501),
  name: "Synthetic Tax Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["orders:read"]),
});

test("retains check tax-exempt state and exact selection/service-charge tax components", () => {
  const raw = orderFixture();
  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([raw])],
  });

  const check = batch.orders[0]?.checks[0];
  assert.equal(check?.taxExempt, true);

  const selectionTaxes = check?.selections[0]?.appliedTaxes;
  assert.deepEqual(selectionTaxes, [
    {
      taxRate: { guid: G(510), multiLocationId: undefined },
      rate: { coefficient: "75", scale: 4 },
      taxAmount: { coefficient: "75", scale: 3 },
      type: "PERCENT",
      facilitatorCollectAndRemitTax: false,
    },
    {
      taxRate: { guid: G(511), multiLocationId: undefined },
      rate: { coefficient: "625", scale: 4 },
      taxAmount: { coefficient: "625", scale: 3 },
      type: "FUTURE_TAX_TYPE",
      facilitatorCollectAndRemitTax: undefined,
    },
  ]);

  const serviceTax = check?.appliedServiceCharges[0]?.appliedTaxes[0];
  assert.deepEqual(serviceTax, {
    taxRate: { guid: undefined, multiLocationId: "synthetic-tax-rate-ref" },
    rate: { coefficient: "25", scale: 2 },
    taxAmount: { coefficient: "-125", scale: 3 },
    type: "EXTERNAL",
    facilitatorCollectAndRemitTax: true,
  });

  // Human-readable tax/jurisdiction fields are not copied across the privacy
  // boundary; configuration lookup owns display labels.
  assert.ok(!JSON.stringify(batch).includes("Synthetic tax name must not survive"));
  assert.ok(!JSON.stringify(batch).includes("Synthetic jurisdiction must not survive"));
});

test("exact decimals add sub-cent values without binary floating-point accumulation", () => {
  const first = exactDecimalFromNumber(0.075);
  const second = exactDecimalFromNumber(0.625);
  const negative = exactDecimalFromNumber(-0.125);

  assert.deepEqual(first, { coefficient: "75", scale: 3 });
  assert.deepEqual(second, { coefficient: "625", scale: 3 });
  assert.deepEqual(negative, { coefficient: "-125", scale: 3 });
  assert.equal(exactDecimalToString(addExactDecimals([first, second])), "0.7");
  assert.equal(
    exactDecimalToString(addExactDecimals([first, second, negative])),
    "0.575",
  );
});

test("exact decimal representation is canonical, frozen, and JSON-safe", () => {
  const values = [
    exactDecimalFromNumber(10),
    exactDecimalFromNumber(10.5),
    exactDecimalFromNumber(0.000001),
    exactDecimalFromNumber(1e6),
    exactDecimalFromNumber(-0),
  ];

  assert.deepEqual(values, [
    { coefficient: "10", scale: 0 },
    { coefficient: "105", scale: 1 },
    { coefficient: "1", scale: 6 },
    { coefficient: "1000000", scale: 0 },
    { coefficient: "0", scale: 0 },
  ]);
  assert.ok(values.every(Object.isFrozen));
  assert.doesNotThrow(() => JSON.stringify(values));
});

test("ordinary aggregate currency totals remain two-decimal minor units", () => {
  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([orderFixture()])],
  });
  const check = batch.orders[0]?.checks[0];
  assert.equal(check?.taxAmountMinor, 70);
  assert.equal(check?.selections[0]?.taxMinor, 70);
  assert.equal(check?.appliedServiceCharges[0]?.chargeAmountMinor, 100);
});

function page(body: unknown): ToastDetailedJsonResult {
  return Object.freeze({
    apiFamily: "standard",
    body,
    scope: Object.freeze({ kind: "restaurant", restaurantGuid: LOCATION.restaurantGuid }),
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: "synthetic-tax-request",
  });
}

function orderFixture(): Record<string, any> {
  return {
    guid: G(502),
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
      guid: G(503),
      amount: 10,
      taxAmount: 0.7,
      totalAmount: 10.7,
      taxExempt: true,
      deleted: false,
      voided: false,
      paymentStatus: "CLOSED",
      selections: [{
        guid: G(504),
        quantity: 1,
        unitOfMeasure: "NONE",
        selectionType: "NONE",
        price: 10,
        preDiscountPrice: 10,
        tax: 0.7,
        deferred: false,
        voided: false,
        appliedDiscounts: [],
        appliedTaxes: [
          {
            guid: G(508),
            taxRate: { guid: G(510) },
            name: "Synthetic tax name must not survive",
            rate: 0.0075,
            taxAmount: 0.075,
            type: "PERCENT",
            facilitatorCollectAndRemitTax: false,
            jurisdiction: "Synthetic jurisdiction must not survive",
          },
          {
            guid: G(509),
            taxRate: { guid: G(511) },
            rate: 0.0625,
            taxAmount: 0.625,
            type: "FUTURE_TAX_TYPE",
          },
        ],
        modifiers: [],
      }],
      payments: [],
      appliedServiceCharges: [{
        guid: G(505),
        chargeAmount: 1,
        serviceCharge: { guid: G(506) },
        chargeType: "FIXED",
        gratuity: false,
        serviceChargeCategory: "SERVICE_CHARGE",
        appliedTaxes: [{
          guid: G(507),
          taxRate: {
            guid: null,
            multiLocationId: "synthetic-tax-rate-ref",
          },
          rate: 0.25,
          taxAmount: -0.125,
          type: "EXTERNAL",
          facilitatorCollectAndRemitTax: true,
        }],
      }],
      appliedDiscounts: [],
    }],
  };
}
