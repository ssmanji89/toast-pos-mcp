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
import {
  MAX_CASH_ENTRY_TYPES,
  MAX_CASH_ENTRY_TYPE_LENGTH,
  MAX_CASH_REFERENCE_KEYS,
  MAX_CASH_SOURCE_RECORDS,
} from "../src/cash-report-limits.js";
import { ReportComputationError } from "../src/report-core.js";
import { BUSINESS_DATE, deposit, entry, IDS } from "./support/cash-report-fixtures.js";

const CANONICAL_ENTRY_GUID = "00000000-0000-4000-8000-00000000a001";
const CANONICAL_DEPOSIT_GUID = "00000000-0000-4000-8000-00000000b001";
const COUNTERS = [
  ["NO_SALE", "noSaleCount"], ["CASH_IN", "cashInCount"], ["CASH_OUT", "cashOutCount"],
  ["CASH_COLLECTED", "cashCollectedCount"], ["TIP_OUT", "tipOutCount"], ["PAY_OUT", "payoutCount"],
  ["UNDO_PAY_OUT", "payoutCount"], ["DRIVER_REIMBURSEMENT", "reimbursementCount"],
  ["CLOSE_OUT_EXACT", "closeoutCount"], ["CLOSE_OUT_OVERAGE", "closeoutCount"],
  ["CLOSE_OUT_SHORTAGE", "closeoutCount"],
] as const;

test("cash fold keeps source facts, references, and type buckets distinct", () => {
  const result = foldCashSummary(foldInput({
    entries: cashEntryArraySchema.parse([
      entry({ guid: IDS.entryA, type: "CASH_IN", amount: 12.34 }),
      entry({ guid: IDS.entryB, type: "OPEN_TOAST_TYPE", amount: -2.34, undoes: IDS.entryA, cashDrawer: { guid: IDS.drawerMissing } }),
      entry({ guid: IDS.entryC, type: "NO_SALE", amount: 0, noSaleReason: { guid: IDS.noSaleReasonA } }),
    ]),
    deposits: cashDepositArraySchema.parse([deposit({ guid: IDS.depositA, amount: 10.5 })]),
    cashDrawers: cashDrawerArraySchema.parse([{ guid: IDS.drawerA }]),
    noSaleReasons: noSaleReasonArraySchema.parse([{ guid: IDS.noSaleReasonA }]),
  }));
  assert.equal(result.cashEntryAmountMinor, 1_000);
  assert.equal(result.depositAmountMinor, 1_050);
  assert.equal(result.noSaleCount, 1);
  assert.equal(result.observedReversalCount, 1);
  assert.deepEqual(result.cashDrawerReferences, [
    { drawerGuid: IDS.drawerA, entryCount: 2, resolved: true },
    { drawerGuid: IDS.drawerMissing, entryCount: 1, resolved: false },
  ]);
  assert.deepEqual(result.cashEntryTotalsByType.map(({ type }) => type), ["CASH_IN", "NO_SALE", "OPEN_TOAST_TYPE"]);
});

test("cash fold keeps distinct-record reversals and rejects canonical self references", () => {
  const accepted = foldCashSummary(foldInput({
    entries: cashEntryArraySchema.parse([entry({ guid: IDS.entryA }), entry({ guid: IDS.entryB, undoes: IDS.entryA })]),
    deposits: cashDepositArraySchema.parse([deposit({ guid: IDS.depositA }), deposit({ guid: IDS.depositB, undoes: IDS.depositA })]),
  }));
  assert.equal(accepted.observedReversalCount, 1);
  assert.equal(accepted.depositAmountMinor, 0);
  assertInvalid(foldInput({ entries: cashEntryArraySchema.parse([entry({ guid: CANONICAL_ENTRY_GUID.toUpperCase(), undoes: CANONICAL_ENTRY_GUID })]) }));
  assertInvalid(foldInput({ deposits: cashDepositArraySchema.parse([deposit({ guid: CANONICAL_DEPOSIT_GUID.toUpperCase(), undoes: CANONICAL_DEPOSIT_GUID })]) }));
});

test("cash fold preserves cross-date reversals and canonical duplicate identity guards", () => {
  const result = foldCashSummary(foldInput({
    entries: cashEntryArraySchema.parse([entry({ guid: IDS.entryB, amount: -7, undoes: IDS.entryA })]),
    deposits: cashDepositArraySchema.parse([deposit({ guid: IDS.depositB, amount: 10, undoes: IDS.depositA })]),
  }));
  assert.equal(result.cashEntryAmountMinor, -700);
  assert.equal(result.unresolvedCrossDateReversalCount, 1);
  assert.equal(result.depositAmountMinor, -1_000);
  assert.equal(result.unresolvedCrossDateDepositReversalCount, 1);
  assertCode(foldInput({ entries: cashEntryArraySchema.parse([entry({ guid: CANONICAL_ENTRY_GUID }), entry({ guid: CANONICAL_ENTRY_GUID.toUpperCase() })]) }), "cash_source_duplicate");
  assertCode(foldInput({ deposits: cashDepositArraySchema.parse([deposit({ guid: CANONICAL_DEPOSIT_GUID }), deposit({ guid: CANONICAL_DEPOSIT_GUID.toUpperCase() })]) }), "cash_source_duplicate");
});

test("cash fold counts all recognized types and tracks absent drawers", () => {
  for (const [type, counter] of COUNTERS) {
    assert.equal(foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse([entry({ type })]) }))[counter], 1, type);
  }
  const result = foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse([entry({ cashDrawer: null })]) }));
  assert.equal(result.cashEntriesWithoutDrawerCount, 1);
  assert.deepEqual(result.cashDrawerReferences, []);
});

test("cash source schemas and fold fail closed for malformed money and raw values", () => {
  assert.equal(cashEntryArraySchema.safeParse([{ ...entry({}), amount: 1.001 }]).success, true);
  assert.equal(cashEntryArraySchema.safeParse([{ ...entry({}), date: "2026-02-30T12:00:00-05:00" }]).success, false);
  assert.equal(cashDepositArraySchema.safeParse([{ ...deposit({}), amount: 0 }]).success, false);
  assert.equal(cashDrawerArraySchema.safeParse([{ guid: "not-a-guid" }]).success, false);
  assert.throws(() => foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse([entry({ amount: 1.001 })]) })), ReportComputationError);
  const serialized = JSON.stringify(foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse([{ ...entry({}), tokenMarker: "invented-token-marker" }]) })));
  assert.equal(serialized.includes("invented-token-marker"), false);
  assert.equal(serialized.includes("entries"), false);
});

test("cash source limits accept boundaries and deny boundary plus one", () => {
  assert.equal(cashEntryArraySchema.safeParse([entry({ type: "T".repeat(MAX_CASH_ENTRY_TYPE_LENGTH) })]).success, true);
  assert.equal(cashEntryArraySchema.safeParse([entry({ type: "T".repeat(MAX_CASH_ENTRY_TYPE_LENGTH + 1) })]).success, false);
  const records = Array.from({ length: MAX_CASH_SOURCE_RECORDS }, (_, index) => entry({ guid: guid(index) }));
  assert.equal(cashEntryArraySchema.safeParse(records).success, true);
  assert.equal(cashEntryArraySchema.safeParse([...records, entry({ guid: guid(MAX_CASH_SOURCE_RECORDS) })]).success, false);
  assert.doesNotThrow(() => foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse(records.slice(0, MAX_CASH_ENTRY_TYPES)) })));
  assertCode(foldInput({ entries: cashEntryArraySchema.parse(records.slice(0, MAX_CASH_ENTRY_TYPES + 1).map((value, index) => ({ ...value, type: `OPEN_${index}` }))) }), "cash_source_limit_exceeded");
  const references = records.slice(0, MAX_CASH_REFERENCE_KEYS + 1).map((value, index) => ({ ...value, cashDrawer: { guid: guid(index + 2_000) } }));
  assert.doesNotThrow(() => foldCashSummary(foldInput({ entries: cashEntryArraySchema.parse(references.slice(0, MAX_CASH_REFERENCE_KEYS)) })));
  assertCode(foldInput({ entries: cashEntryArraySchema.parse(references) }), "cash_source_limit_exceeded");
});

function foldInput(overrides: Partial<Parameters<typeof foldCashSummary>[0]>): Parameters<typeof foldCashSummary>[0] {
  return { businessDate: BUSINESS_DATE, entries: cashEntryArraySchema.parse([]), deposits: cashDepositArraySchema.parse([]), cashDrawers: cashDrawerArraySchema.parse([]), noSaleReasons: noSaleReasonArraySchema.parse([]), payoutReasons: payoutReasonArraySchema.parse([]), ...overrides };
}

function assertInvalid(input: Parameters<typeof foldCashSummary>[0]): void { assertCode(input, "cash_source_invalid"); }

function assertCode(input: Parameters<typeof foldCashSummary>[0], code: string): void {
  assert.throws(() => foldCashSummary(input), (error: unknown) => error instanceof ReportComputationError && error.code === code);
}

function guid(index: number): string { return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`; }
