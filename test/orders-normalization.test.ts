import assert from "node:assert/strict";
import test from "node:test";

import type { ToastLocation } from "../src/locations.js";
import {
  normalizeOrdersPages,
  OrdersNormalizationError,
} from "../src/orders-normalization.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000301";
const ORDER_GUID = "00000000-0000-4000-8000-000000000302";
const CHECK_GUID = "00000000-0000-4000-8000-000000000303";
const SELECTION_GUID = "00000000-0000-4000-8000-000000000304";
const MODIFIER_GUID = "00000000-0000-4000-8000-000000000305";
const NESTED_MODIFIER_GUID = "00000000-0000-4000-8000-000000000306";
const PAYMENT_GUID = "00000000-0000-4000-8000-000000000307";
const SERVICE_CHARGE_GUID = "00000000-0000-4000-8000-000000000308";
const SERVICE_CHARGE_CONFIG_GUID = "00000000-0000-4000-8000-000000000309";
const DISCOUNT_GUID = "00000000-0000-4000-8000-000000000310";
const DISCOUNT_CONFIG_GUID = "00000000-0000-4000-8000-000000000311";
const ITEM_GUID = "00000000-0000-4000-8000-000000000312";
const ITEM_GROUP_GUID = "00000000-0000-4000-8000-000000000313";
const SALES_CATEGORY_GUID = "00000000-0000-4000-8000-000000000314";
const OTHER_PAYMENT_GUID = "00000000-0000-4000-8000-000000000315";
const SENSITIVE_MARKER = "synthetic-guest-card-marker-must-not-survive";

const LOCATION: ToastLocation = Object.freeze({
  restaurantGuid: RESTAURANT_GUID,
  name: "Synthetic Normalization Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze(["orders:read"]),
});

test("normalizes a production-shaped Orders page into immutable minor-unit records", () => {
  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [
      page([validOrder()], 1_800_000_000_123, "synthetic-request-1"),
    ],
  });

  assert.equal(batch.source, "standard_api");
  assert.equal(batch.restaurantGuid, RESTAURANT_GUID);
  assert.equal(batch.currencyCode, "USD");
  assert.equal(batch.pageCount, 1);
  assert.equal(batch.recordCount, 1);
  assert.deepEqual(batch.pages, [
    {
      pageNumber: 1,
      recordCount: 1,
      retrievedAtEpochMs: 1_800_000_000_123,
      upstreamRequestId: "synthetic-request-1",
    },
  ]);

  const order = batch.orders[0];
  assert.ok(order);
  assert.equal(order.businessDate, 20260816);
  assert.equal(order.approvalStatus, "FUTURE_ENUM_VALUE");
  assert.equal(order.source, "Synthetic Future Source");
  assert.equal(order.scheduled, false);

  const check = order.checks[0];
  assert.ok(check);
  assert.equal(check.amountMinor, 1010);
  assert.equal(check.taxAmountMinor, 85);
  assert.equal(check.totalAmountMinor, 1095);
  assert.equal(check.paymentStatus, "FUTURE_CHECK_STATUS");

  const selection = check.selections[0];
  assert.ok(selection);
  assert.equal(selection.quantity, 0.5);
  assert.equal(selection.priceMinor, 325);
  assert.equal(selection.preDiscountPriceMinor, 400);
  assert.equal(selection.selectionType, "FUTURE_SELECTION_TYPE");
  assert.equal(selection.unitOfMeasure, "KG");
  assert.equal(selection.item?.guid, ITEM_GUID);
  assert.equal(selection.itemGroup?.guid, ITEM_GROUP_GUID);
  assert.equal(selection.salesCategory?.guid, SALES_CATEGORY_GUID);
  assert.equal(selection.modifiers[0]?.guid, MODIFIER_GUID);
  assert.equal(
    selection.modifiers[0]?.modifiers[0]?.guid,
    NESTED_MODIFIER_GUID,
  );

  const payment = check.payments[0];
  assert.ok(payment);
  assert.equal(payment.type, "FUTURE_PAYMENT_TYPE");
  assert.equal(payment.amountMinor, 1010);
  assert.equal(payment.tipAmountMinor, 125);
  assert.equal(payment.refund?.refundAmountMinor, 225);
  assert.equal(payment.refund?.tipRefundAmountMinor, 50);
  assert.equal(payment.otherPayment?.guid, OTHER_PAYMENT_GUID);

  const charge = check.appliedServiceCharges[0];
  assert.ok(charge);
  assert.equal(charge.chargeAmountMinor, 145);
  assert.equal(charge.serviceChargeCategory, "SERVICE_CHARGE");
  assert.equal(charge.serviceCharge.guid, SERVICE_CHARGE_CONFIG_GUID);

  assert.ok(Object.isFrozen(batch));
  assert.ok(Object.isFrozen(batch.orders));
  assert.ok(Object.isFrozen(order));
  assert.ok(Object.isFrozen(check.selections));
  assert.ok(Object.isFrozen(selection));
  assert.ok(Object.isFrozen(selection.modifiers));
});

test("preserves lifecycle, deferred, scheduled, refund, and unresolved-reference state", () => {
  const raw = validOrder();
  raw.promisedDate = "2026-08-17T18:30:00-05:00";
  raw.deleted = true;
  raw.voided = true;
  raw.voidDate = "2026-08-16T19:00:00-05:00";
  raw.voidBusinessDate = 20260816;
  raw.checks[0].deleted = true;
  raw.checks[0].voided = true;
  raw.checks[0].selections[0].deferred = true;
  raw.checks[0].selections[0].voided = true;
  raw.checks[0].selections[0].item = {
    guid: null,
    multiLocationId: "synthetic-unresolved-item-multi-location-id",
  };

  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: {
      mode: "modified_window",
      startDate: "2026-08-16T00:00:00Z",
      endDate: "2026-08-17T00:00:00Z",
    },
    pages: [page([raw])],
  });

  const order = batch.orders[0];
  assert.ok(order?.scheduled);
  assert.equal(order?.deleted, true);
  assert.equal(order?.voided, true);
  assert.equal(order?.voidBusinessDate, 20260816);
  assert.equal(order?.checks[0]?.deleted, true);
  assert.equal(order?.checks[0]?.voided, true);
  assert.equal(order?.checks[0]?.selections[0]?.deferred, true);
  assert.equal(order?.checks[0]?.selections[0]?.voided, true);
  assert.deepEqual(order?.checks[0]?.selections[0]?.item, {
    guid: undefined,
    multiLocationId: "synthetic-unresolved-item-multi-location-id",
  });
});

test("strips guest, delivery, card, free-text, and transaction markers by construction", () => {
  const raw = validOrder();
  Object.assign(raw, {
    customer: { email: SENSITIVE_MARKER },
    deliveryInfo: {
      address1: SENSITIVE_MARKER,
      notes: SENSITIVE_MARKER,
    },
    thirdPartyProviderInfo: { name: SENSITIVE_MARKER },
  });
  Object.assign(raw.checks[0], {
    customer: { phone: SENSITIVE_MARKER },
    tabName: SENSITIVE_MARKER,
  });
  Object.assign(raw.checks[0].selections[0], {
    displayName: SENSITIVE_MARKER,
    specialRequest: SENSITIVE_MARKER,
  });
  Object.assign(raw.checks[0].payments[0], {
    first6Digits: SENSITIVE_MARKER,
    last4Digits: SENSITIVE_MARKER,
    cardPaymentId: SENSITIVE_MARKER,
    tenderTransactionGuid: SENSITIVE_MARKER,
    networkTransactionIdentifier: SENSITIVE_MARKER,
    cardType: SENSITIVE_MARKER,
    houseAccount: { guid: SENSITIVE_MARKER },
  });

  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([raw])],
  });

  assert.ok(!JSON.stringify(batch).includes(SENSITIVE_MARKER));
  assert.ok(!deepValues(batch).some((value) => value === SENSITIVE_MARKER));
});

test("fails closed instead of rounding source currency values with unsupported precision", () => {
  const raw = validOrder();
  raw.checks[0].amount = 10.101;

  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "business_date", businessDate: 20260816 },
      pages: [page([raw])],
    }),
    (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_money_precision_invalid");
      return true;
    },
  );
});

test("converts large safe two-decimal currency values without binary accumulation semantics", () => {
  const raw = validOrder();
  raw.checks[0].amount = 123456789012.34;

  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([raw])],
  });

  assert.equal(batch.orders[0]?.checks[0]?.amountMinor, 12345678901234);
});

test("preserves arbitrarily deep modifier structure without recursive call-stack dependence", () => {
  const depth = 3_000;
  const raw = validOrder();
  let current = raw.checks[0].selections[0];
  current.modifiers = [];

  for (let index = 0; index < depth; index += 1) {
    const next = validSelection(
      deterministicGuid(10_000 + index),
      0.01,
      0.01,
    );
    current.modifiers = [next];
    current = next;
  }

  const batch = normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([raw])],
  });

  let normalized = batch.orders[0]?.checks[0]?.selections[0];
  let observedDepth = 0;
  while (normalized?.modifiers[0] !== undefined) {
    observedDepth += 1;
    normalized = normalized.modifiers[0];
  }
  assert.equal(observedDepth, depth);
});

test("rejects duplicate order and nested selection identifiers instead of double-counting", () => {
  const first = validOrder();
  const duplicateOrder = validOrder();

  assertDuplicate(() => normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([first, duplicateOrder])],
  }));

  const nestedDuplicate = validOrder();
  nestedDuplicate.checks[0].selections[0].modifiers = [
    validSelection(SELECTION_GUID, 1, 1),
  ];
  assertDuplicate(() => normalizeOrdersPages({
    location: LOCATION,
    query: { mode: "business_date", businessDate: 20260816 },
    pages: [page([nestedDuplicate])],
  }));
});

test("rejects malformed second records without returning a partial normalized batch", () => {
  const malformed = validOrder();
  delete (malformed.checks[0] as { totalAmount?: number }).totalAmount;

  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "business_date", businessDate: 20260816 },
      pages: [page([validOrder(), malformed])],
    }),
    (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_source_invalid");
      return true;
    },
  );
});

test("validates query mode, source page metadata, and location currency context", () => {
  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "business_date", businessDate: 20260230 },
      pages: [page([])],
    }),
    (error: unknown) => {
      assert.ok(error instanceof OrdersNormalizationError);
      assert.equal(error.code, "orders_business_date_invalid");
      return true;
    },
  );

  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: {
        mode: "modified_window",
        startDate: "2026-08-17T00:00:00Z",
        endDate: "2026-08-16T00:00:00Z",
      },
      pages: [page([])],
    }),
    OrdersNormalizationError,
  );

  assert.throws(
    () => normalizeOrdersPages({
      location: { ...LOCATION, currencyCode: "usd" },
      query: { mode: "business_date", businessDate: 20260816 },
      pages: [page([])],
    }),
    OrdersNormalizationError,
  );

  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "business_date", businessDate: 20260816 },
      pages: [],
    }),
    OrdersNormalizationError,
  );

  assert.throws(
    () => normalizeOrdersPages({
      location: LOCATION,
      query: { mode: "business_date", businessDate: 20260816 },
      pages: [page([], -1)],
    }),
    OrdersNormalizationError,
  );
});

function validOrder() {
  return {
    guid: ORDER_GUID,
    businessDate: 20260816,
    openedDate: "2026-08-16T12:00:00-05:00",
    modifiedDate: "2026-08-16T12:30:00-05:00",
    promisedDate: null as string | null,
    approvalStatus: "FUTURE_ENUM_VALUE",
    source: "Synthetic Future Source",
    diningOption: { guid: "00000000-0000-4000-8000-000000000316" },
    revenueCenter: { guid: "00000000-0000-4000-8000-000000000317" },
    restaurantService: { guid: "00000000-0000-4000-8000-000000000318" },
    excessFood: false,
    deleted: false,
    voided: false,
    checks: [
      {
        guid: CHECK_GUID,
        amount: 10.1,
        taxAmount: 0.85,
        totalAmount: 10.95,
        deleted: false,
        voided: false,
        paymentStatus: "FUTURE_CHECK_STATUS",
        selections: [
          {
            ...validSelection(SELECTION_GUID, 3.25, 4),
            quantity: 0.5,
            unitOfMeasure: "KG",
            selectionType: "FUTURE_SELECTION_TYPE",
            tax: 0.3,
            item: { guid: ITEM_GUID },
            itemGroup: { guid: ITEM_GROUP_GUID },
            salesCategory: { guid: SALES_CATEGORY_GUID },
            appliedDiscounts: [
              {
                guid: DISCOUNT_GUID,
                discountAmount: 0.75,
                nonTaxDiscountAmount: 0.7,
                discount: { guid: DISCOUNT_CONFIG_GUID },
                discountType: "FUTURE_DISCOUNT_TYPE",
                processingState: "FUTURE_DISCOUNT_STATE",
              },
            ],
            modifiers: [
              {
                ...validSelection(MODIFIER_GUID, 0.5, 0.5),
                modifiers: [
                  validSelection(NESTED_MODIFIER_GUID, 0.25, 0.25),
                ],
              },
            ],
          },
        ],
        payments: [
          {
            guid: PAYMENT_GUID,
            type: "FUTURE_PAYMENT_TYPE",
            amount: 10.1,
            tipAmount: 1.25,
            paidDate: "2026-08-16T12:31:00-05:00",
            paidBusinessDate: 20260816,
            paymentStatus: "FUTURE_PAYMENT_STATUS",
            refundStatus: "PARTIAL",
            refund: {
              refundAmount: 2.25,
              tipRefundAmount: 0.5,
              refundDate: "2026-08-16T13:00:00-05:00",
              refundBusinessDate: 20260816,
            },
            otherPayment: { guid: OTHER_PAYMENT_GUID },
          },
        ],
        appliedServiceCharges: [
          {
            guid: SERVICE_CHARGE_GUID,
            chargeAmount: 1.45,
            serviceCharge: { guid: SERVICE_CHARGE_CONFIG_GUID },
            chargeType: "FUTURE_CHARGE_TYPE",
            gratuity: false,
            serviceChargeCategory: null,
          },
        ],
        appliedDiscounts: [],
      },
    ],
  };
}

function validSelection(guid: string, price: number, preDiscountPrice: number) {
  return {
    guid,
    quantity: 1,
    unitOfMeasure: "NONE",
    selectionType: "NONE",
    price,
    preDiscountPrice,
    deferred: false,
    voided: false,
    appliedDiscounts: [],
    modifiers: [] as ReturnType<typeof validSelection>[],
  };
}

function page(
  body: unknown,
  retrievedAtEpochMs = 1_800_000_000_000,
  upstreamRequestId?: string,
): ToastDetailedJsonResult {
  return Object.freeze({ body, retrievedAtEpochMs, upstreamRequestId });
}

function assertDuplicate(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof OrdersNormalizationError);
    assert.equal(error.code, "orders_duplicate_entity");
    return true;
  });
}

function deterministicGuid(index: number): string {
  const suffix = index.toString(16).padStart(12, "0").slice(-12);
  return `00000000-0000-4000-8000-${suffix}`;
}

function deepValues(value: unknown): unknown[] {
  const values: unknown[] = [];
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();
    values.push(current);
    if (Array.isArray(current)) {
      stack.push(...current);
    } else if (current !== null && typeof current === "object") {
      stack.push(...Object.values(current));
    }
  }

  return values;
}
