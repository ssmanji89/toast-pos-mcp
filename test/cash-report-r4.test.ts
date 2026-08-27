import assert from "node:assert/strict";
import test from "node:test";

import { buildCashSummaryReport } from "../src/cash-report.js";
import {
  cashDepositArraySchema,
  cashDrawerArraySchema,
  cashEntryArraySchema,
  noSaleReasonArraySchema,
  payoutReasonArraySchema,
} from "../src/cash-report-source.js";
import {
  type CashSourceKey,
  BUSINESS_DATE,
  deposit,
  entry,
  IDS,
  syntheticCashRuntime,
} from "./support/cash-report-fixtures.js";

const SCOPES = ["cashmgmt:read", "config:read"];
const CONFIG_SOURCES = [
  "config-cash-drawers",
  "config-no-sale-reasons",
  "config-payout-reasons",
] as const;

test("cash source schemas strip unknown raw fields and GUID reference fields", () => {
  const parsedEntry = cashEntryArraySchema.parse([entry({
    rawEntryField: "synthetic-raw-entry",
    cashDrawer: { guid: IDS.drawerA, rawReferenceField: "synthetic-raw-reference" },
    noSaleReason: { guid: IDS.noSaleReasonA, rawReferenceField: "synthetic-raw-reference" },
    payoutReason: { guid: IDS.payoutReasonA, rawReferenceField: "synthetic-raw-reference" },
  })])[0]!;
  assert.equal("rawEntryField" in parsedEntry, false);
  assert.deepEqual(parsedEntry.cashDrawer, { guid: IDS.drawerA });
  assert.deepEqual(parsedEntry.noSaleReason, { guid: IDS.noSaleReasonA });
  assert.deepEqual(parsedEntry.payoutReason, { guid: IDS.payoutReasonA });
  assert.equal("rawReferenceField" in parsedEntry.cashDrawer!, false);
  assert.equal("rawReferenceField" in parsedEntry.noSaleReason!, false);
  assert.equal("rawReferenceField" in parsedEntry.payoutReason!, false);

  const parsedDeposit = cashDepositArraySchema.parse([deposit({ rawDepositField: "synthetic-raw-deposit" })])[0]!;
  const parsedDrawer = cashDrawerArraySchema.parse([{ guid: IDS.drawerA, rawDrawerField: "synthetic-raw-drawer" }])[0]!;
  const parsedNoSaleReason = noSaleReasonArraySchema.parse([{ guid: IDS.noSaleReasonA, rawReasonField: "synthetic-raw-reason" }])[0]!;
  const parsedPayoutReason = payoutReasonArraySchema.parse([{ guid: IDS.payoutReasonA, rawReasonField: "synthetic-raw-reason" }])[0]!;
  assert.equal("rawDepositField" in parsedDeposit, false);
  assert.equal("rawDrawerField" in parsedDrawer, false);
  assert.equal("rawReasonField" in parsedNoSaleReason, false);
  assert.equal("rawReasonField" in parsedPayoutReason, false);
});

test("cash builder accepts every configuration aggregate boundary", async () => {
  for (const source of CONFIG_SOURCES) {
    const calls: string[] = [];
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls, provisionedScopes: SCOPES, twoPageAt: source, configurationPageSizes: [500, 500],
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "complete", source);
    assert.deepEqual(calls, completeCalls(), source);
  }
});

test("cash builder accepts every valid empty configuration source", async () => {
  for (const source of CONFIG_SOURCES) {
    const calls: string[] = [];
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls, provisionedScopes: SCOPES, emptyAt: source,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "complete", source);
    assert.deepEqual(calls, completeCalls(), source);
  }
});

test("cash builder denies every configuration aggregate boundary plus one before later sources", async () => {
  for (const source of CONFIG_SOURCES) {
    const calls: string[] = [];
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls, provisionedScopes: SCOPES, twoPageAt: source, configurationPageSizes: [501, 500],
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "denied", source);
    assert.equal(result.denial.code, "cash_source_invalid", source);
    assert.deepEqual(calls, callsThrough(source), source);
  }
});

function completeCalls(): readonly string[] {
  return ["location", "scopes", "cash-entries", "cash-deposits", ...CONFIG_SOURCES];
}

function callsThrough(source: CashSourceKey): readonly string[] {
  const calls = completeCalls();
  return calls.slice(0, calls.indexOf(source) + 1);
}
