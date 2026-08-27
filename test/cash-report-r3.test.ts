import assert from "node:assert/strict";
import test from "node:test";

import { buildCashSummaryReport } from "../src/cash-report.js";
import {
  type CashSourceKey,
  BUSINESS_DATE,
  syntheticCashRuntime,
} from "./support/cash-report-fixtures.js";

const SCOPES = ["cashmgmt:read", "config:read"];
const CONFIG_SOURCES = [
  "config-cash-drawers",
  "config-no-sale-reasons",
  "config-payout-reasons",
] as const;

test("cash builder isolates every later restaurant-scoped source", async () => {
  for (const source of ["cash-deposits", ...CONFIG_SOURCES] as const) {
    const calls: string[] = [];
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls, provisionedScopes: SCOPES, mismatchAt: source,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "denied", source);
    assert.equal(result.denial.code, "cash_source_invalid", source);
    assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false, source);
    assert.deepEqual(calls, callsThrough(source), source);
  }
});

test("cash builder denies an over-limit source before later requests", async () => {
  const calls: string[] = [];
  const result = await buildCashSummaryReport(syntheticCashRuntime({
    calls, provisionedScopes: SCOPES, oversizedAt: "cash-entries",
  }), { businessDate: BUSINESS_DATE });
  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "cash_source_invalid");
  assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false);
  assert.deepEqual(calls, ["location", "scopes", "cash-entries"]);
});

test("cash builder keeps two configuration pages in bounded provenance", async () => {
  for (const source of CONFIG_SOURCES) {
    const calls: string[] = [];
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls, provisionedScopes: SCOPES, twoPageAt: source,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "complete", source);
    assert.equal(result.provenance.upstreamRequestIds.includes(`${requestId(source)}-page-2`), true, source);
    assert.deepEqual(calls, completeCalls(), source);
  }
});

test("cash builder denies malformed or mismatched second configuration pages", async () => {
  for (const source of CONFIG_SOURCES) {
    for (const [name, pageOptions] of [
      ["malformed", { malformedSecondPage: true }],
      ["mismatched", { mismatchedSecondPage: true }],
    ] as const) {
      const calls: string[] = [];
      const result = await buildCashSummaryReport(syntheticCashRuntime({
        calls, provisionedScopes: SCOPES, twoPageAt: source, ...pageOptions,
      }), { businessDate: BUSINESS_DATE });
      assert.equal(result.status, "denied", `${source}:${name}`);
      assert.equal(result.denial.code, "cash_source_invalid", `${source}:${name}`);
      assert.equal(JSON.stringify(result).includes(`${requestId(source)}-page-2`), false, `${source}:${name}`);
      assert.deepEqual(calls, callsThrough(source), `${source}:${name}`);
    }
  }
});

function completeCalls(): readonly string[] {
  return ["location", "scopes", "cash-entries", "cash-deposits", ...CONFIG_SOURCES];
}

function callsThrough(source: CashSourceKey): readonly string[] {
  const calls = completeCalls();
  return calls.slice(0, calls.indexOf(source) + 1);
}

function requestId(source: typeof CONFIG_SOURCES[number]): string {
  return `synthetic-${source.replace("config-", "")}`;
}
