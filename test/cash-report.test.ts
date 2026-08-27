import assert from "node:assert/strict";
import test from "node:test";

import {
  cashDepositArraySchema,
  cashDrawerArraySchema,
  cashEntryArraySchema,
  noSaleReasonArraySchema,
  payoutReasonArraySchema,
} from "../src/cash-report-source.js";
import { foldCashSummary } from "../src/cash-report.js";
import { ReportComputationError } from "../src/report-core.js";

const IDS = Object.freeze({
  entryA: "00000000-0000-4000-8000-000000004001",
  entryB: "00000000-0000-4000-8000-000000004002",
  entryC: "00000000-0000-4000-8000-000000004003",
  depositA: "00000000-0000-4000-8000-000000004004",
  drawerA: "00000000-0000-4000-8000-000000004005",
  drawerMissing: "00000000-0000-4000-8000-000000004006",
  noSaleReasonA: "00000000-0000-4000-8000-000000004007",
  payoutReasonA: "00000000-0000-4000-8000-000000004008",
});

const BUSINESS_DATE = 20260827;

test("cash fold keeps source types, reversals, deposits, and references distinct", () => {
  const result = foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([
      entry({ guid: IDS.entryA, type: "CASH_IN", amount: 12.34 }),
      entry({
        guid: IDS.entryB,
        type: "OPEN_TOAST_TYPE",
        amount: -2.34,
        undoes: IDS.entryA,
        cashDrawer: { guid: IDS.drawerMissing },
      }),
      entry({
        guid: IDS.entryC,
        type: "NO_SALE",
        amount: 0,
        noSaleReason: { guid: IDS.noSaleReasonA },
      }),
    ]),
    deposits: cashDepositArraySchema.parse([
      deposit({ guid: IDS.depositA, amount: 10.5 }),
    ]),
    cashDrawers: cashDrawerArraySchema.parse([{ guid: IDS.drawerA }]),
    noSaleReasons: noSaleReasonArraySchema.parse([{ guid: IDS.noSaleReasonA }]),
    payoutReasons: payoutReasonArraySchema.parse([{ guid: IDS.payoutReasonA }]),
  });

  assert.equal(result.cashEntryCount, 3);
  assert.equal(result.depositCount, 1);
  assert.equal(result.cashEntryAmountMinor, 1_000);
  assert.equal(result.depositAmountMinor, 1_050);
  assert.equal(result.noSaleCount, 1);
  assert.equal(result.observedReversalCount, 1);
  assert.equal(result.unresolvedCrossDateReversalCount, 0);
  assert.deepEqual(result.cashEntryTotalsByType, [
    { type: "CASH_IN", entryCount: 1, amountMinor: 1_234 },
    { type: "NO_SALE", entryCount: 1, amountMinor: 0 },
    { type: "OPEN_TOAST_TYPE", entryCount: 1, amountMinor: -234 },
  ]);
  assert.deepEqual(result.cashDrawerReferences, [
    { drawerGuid: IDS.drawerA, entryCount: 2, depositCount: 0, resolved: true },
    { drawerGuid: IDS.drawerMissing, entryCount: 1, depositCount: 0, resolved: false },
  ]);
  assert.deepEqual(result.noSaleReasonReferences, [
    { reasonGuid: IDS.noSaleReasonA, entryCount: 1, resolved: true },
  ]);
});

test("cash fold keeps a cross-date reversal as an observed fact without netting", () => {
  const result = foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([
      entry({ guid: IDS.entryB, type: "CASH_OUT", amount: -7, undoes: IDS.entryA }),
    ]),
    deposits: cashDepositArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  });

  assert.equal(result.cashEntryAmountMinor, -700);
  assert.equal(result.observedReversalCount, 1);
  assert.equal(result.unresolvedCrossDateReversalCount, 1);
});

test("cash source schemas fail closed on malformed input", () => {
  assert.equal(cashEntryArraySchema.safeParse([{
    ...entry({}),
    amount: 1.001,
  }]).success, true, "schemas retain numeric precision checks for the fold");
  assert.equal(cashEntryArraySchema.safeParse([{ ...entry({}), date: "2026-02-30T12:00:00-05:00" }]).success, false);
  assert.equal(cashEntryArraySchema.safeParse([{ ...entry({}), guid: "not-a-guid" }]).success, false);
  assert.equal(cashDrawerArraySchema.safeParse([{ guid: "not-a-guid" }]).success, false);
  assert.equal(noSaleReasonArraySchema.safeParse([{ guid: "not-a-guid" }]).success, false);
  assert.equal(payoutReasonArraySchema.safeParse([{ guid: "not-a-guid" }]).success, false);
});

test("cash fold rejects non-two-decimal money and overflow", () => {
  assert.throws(() => foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([entry({ amount: 1.001 })]),
    deposits: cashDepositArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  }), ReportComputationError);
  assert.throws(() => foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([
      entry({ guid: IDS.entryA, amount: Number.MAX_SAFE_INTEGER / 100 }),
      entry({ guid: IDS.entryB, amount: 1 }),
    ]),
    deposits: cashDepositArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  }), ReportComputationError);
});

test("cash results strip raw source and sensitive markers during serialization", () => {
  const result = foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([{
      ...entry({}),
      guestMarker: "invented-guest-marker",
      employeeMarker: "invented-employee-marker",
      cardMarker: "invented-card-marker",
      tokenMarker: "invented-token-marker",
      contactMarker: "invented-contact-marker",
    }]),
    deposits: cashDepositArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  });
  const serialized = JSON.stringify(result);
  for (const marker of ["guest", "employee", "card", "token", "contact"]) {
    assert.equal(serialized.includes(`invented-${marker}-marker`), false);
  }
  assert.equal(serialized.includes("entries"), false);
});

function entry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    guid: IDS.entryA,
    businessDate: BUSINESS_DATE,
    date: "2026-08-27T12:00:00-05:00",
    amount: 1,
    type: "CASH_IN",
    cashDrawer: { guid: IDS.drawerA },
    ...overrides,
  };
}

function deposit(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    guid: IDS.depositA,
    date: "2026-08-27T15:00:00-05:00",
    amount: 1,
    ...overrides,
  };
}
