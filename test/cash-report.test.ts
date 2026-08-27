import assert from "node:assert/strict";
import test from "node:test";

import {
  cashDepositArraySchema,
  cashDrawerArraySchema,
  cashEntryArraySchema,
  noSaleReasonArraySchema,
  payoutReasonArraySchema,
} from "../src/cash-report-source.js";
import {
  buildCashSummaryReport,
  foldCashSummary,
} from "../src/cash-report.js";
import { ReportComputationError } from "../src/report-core.js";

const IDS = Object.freeze({
  entryA: "00000000-0000-4000-8000-000000004001",
  entryB: "00000000-0000-4000-8000-000000004002",
  entryC: "00000000-0000-4000-8000-000000004003",
  depositA: "00000000-0000-4000-8000-000000004004",
  depositB: "00000000-0000-4000-8000-000000004010",
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
    { drawerGuid: IDS.drawerA, entryCount: 2, resolved: true },
    { drawerGuid: IDS.drawerMissing, entryCount: 1, resolved: false },
  ]);
  assert.deepEqual(result.noSaleReasonReferences, [
    { reasonGuid: IDS.noSaleReasonA, entryCount: 1, resolved: true },
  ]);
});

test("cash fold reverses same-date deposits and preserves cross-date deposit reversal facts", () => {
  const base = {
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  };
  const sameDate = foldCashSummary({
    ...base,
    deposits: cashDepositArraySchema.parse([
      deposit({ guid: IDS.depositA, amount: 10 }),
      deposit({ guid: IDS.depositB, amount: 10, undoes: IDS.depositA }),
    ]),
  });
  assert.equal(sameDate.depositAmountMinor, 0);
  assert.equal(sameDate.observedDepositReversalCount, 1);
  assert.equal(sameDate.unresolvedCrossDateDepositReversalCount, 0);

  const crossDate = foldCashSummary({
    ...base,
    deposits: cashDepositArraySchema.parse([
      deposit({ guid: IDS.depositB, amount: 10, undoes: IDS.depositA }),
    ]),
  });
  assert.equal(crossDate.depositAmountMinor, -1_000);
  assert.equal(crossDate.observedDepositReversalCount, 1);
  assert.equal(crossDate.unresolvedCrossDateDepositReversalCount, 1);
});

test("cash fold allows an absent drawer and records the completeness fact", () => {
  const result = foldCashSummary({
    businessDate: BUSINESS_DATE,
    entries: cashEntryArraySchema.parse([entry({ cashDrawer: null })]),
    deposits: cashDepositArraySchema.parse([]),
    cashDrawers: cashDrawerArraySchema.parse([]),
    noSaleReasons: noSaleReasonArraySchema.parse([]),
    payoutReasons: payoutReasonArraySchema.parse([]),
  });
  assert.equal(result.cashEntriesWithoutDrawerCount, 1);
  assert.deepEqual(result.cashDrawerReferences, []);
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
  assert.equal(cashEntryArraySchema.safeParse([{ ...entry({}), cashDrawer: null }]).success, true);
  assert.equal(cashDepositArraySchema.safeParse([{ ...deposit({}), amount: 0 }]).success, false);
  assert.equal(cashDepositArraySchema.safeParse([{ ...deposit({}), amount: -1 }]).success, false);
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

test("cash builder performs capability preflight before restaurant-bound source reads", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const runtime = syntheticRuntime({
    calls,
    signal: controller.signal,
    provisionedScopes: ["cashmgmt:read", "config:read"],
  });

  const result = await buildCashSummaryReport(runtime, {
    businessDate: BUSINESS_DATE,
    restaurantGuid: RESTAURANT_GUID.toUpperCase(),
  }, { signal: controller.signal });

  assert.equal(result.status, "complete");
  assert.equal(result.report, "cash_summary");
  assert.equal(result.cashEntryAmountMinor, 100);
  assert.equal(result.depositAmountMinor, 200);
  assert.deepEqual(calls, [
    "location",
    "scopes",
    "cash-entries",
    "cash-deposits",
    "config-cash-drawers",
    "config-no-sale-reasons",
    "config-payout-reasons",
  ]);
  assert.deepEqual(result.provenance.upstreamRequestIds, [
    "synthetic-entries",
    "synthetic-deposits",
    "synthetic-cash-drawers",
    "synthetic-no-sale-reasons",
    "synthetic-payout-reasons",
  ]);
});

test("cash builder denies missing capability before any business-data request", async () => {
  const calls: string[] = [];
  const result = await buildCashSummaryReport(syntheticRuntime({
    calls,
    provisionedScopes: ["cashmgmt:read"],
  }), { businessDate: BUSINESS_DATE });

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "capability_missing_scope");
  assert.deepEqual(result.missingScopes, ["config:read"]);
  assert.deepEqual(calls, ["location", "scopes"]);
  assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false);
});

test("cash builder denies malformed, mismatched, cancelled, and incomplete sources", async () => {
  for (const scenario of ["malformed", "mismatched", "cancelled", "incomplete"] as const) {
    const result = await buildCashSummaryReport(syntheticRuntime({
      calls: [],
      provisionedScopes: ["cashmgmt:read", "config:read"],
      scenario,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "denied", scenario);
    assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false, scenario);
  }
});

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000004009";

function syntheticRuntime(options: {
  readonly calls: string[];
  readonly provisionedScopes: readonly string[];
  readonly signal?: AbortSignal;
  readonly scenario?: "malformed" | "mismatched" | "cancelled" | "incomplete";
}): any {
  const detail = (body: unknown, requestId: string, mismatched = false) => ({
    apiFamily: "standard" as const,
    body,
    scope: {
      kind: "restaurant" as const,
      restaurantGuid: mismatched ? IDS.drawerMissing : RESTAURANT_GUID,
    },
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: requestId,
  });
  const sourceBody = (path: string): unknown => {
    if (options.scenario === "malformed" && path === "/cashmgmt/v1/entries") return [{}];
    if (path === "/cashmgmt/v1/entries") return [entry({})];
    if (path === "/cashmgmt/v1/deposits") return [deposit({ amount: 2 })];
    return [];
  };
  return {
    now: () => 1_800_000_000_000,
    tokenManager: {
      getProvisionedScopes: async () => {
        options.calls.push("scopes");
        return options.provisionedScopes;
      },
    },
    getLocationContext: async (_restaurantGuid: string | undefined, input: { readonly signal?: AbortSignal }) => {
      options.calls.push("location");
      assert.equal(input.signal, options.signal);
      return {
        location: {
          restaurantGuid: RESTAURANT_GUID,
          name: "Synthetic Cash Cafe",
          timezone: "America/Chicago",
          closeoutHour: 4,
          currencyCode: "USD",
          connectionScopes: ["cashmgmt:read", "config:read"],
        },
        freshness: { retrievedThroughEpochMs: 1_800_000_000_000, ageMs: 0, maxAgeMs: 10_000 },
        provenance: { retrievedThroughEpochMs: 1_800_000_000_000, upstreamRequestIds: [], upstreamRequestIdCount: 0, upstreamRequestIdsTruncated: false },
      };
    },
    toastHttpClient: {
      getJsonDetailedCancellable: async (request: any, input: { readonly signal?: AbortSignal }) => {
        assert.equal(request.restaurantGuid, RESTAURANT_GUID);
        assert.equal(input.signal, options.signal);
        options.calls.push(request.rateLimitKey);
        if (options.scenario === "cancelled") throw new Error("cancelled");
        return detail(sourceBody(request.path), request.rateLimitKey === "cash-entries" ? "synthetic-entries" : "synthetic-deposits", options.scenario === "mismatched");
      },
      getConfigurationPagesDetailedCancellable: async (request: any, input: { readonly signal?: AbortSignal }) => {
        assert.equal(request.restaurantGuid, RESTAURANT_GUID);
        assert.equal(input.signal, options.signal);
        options.calls.push(request.rateLimitKey);
        if (options.scenario === "incomplete") return [];
        const values = request.rateLimitKey === "config-cash-drawers"
          ? [{ guid: IDS.drawerA }]
          : request.rateLimitKey === "config-no-sale-reasons"
            ? [{ guid: IDS.noSaleReasonA }]
            : [{ guid: IDS.payoutReasonA }];
        return [detail(values, `synthetic-${request.rateLimitKey.replace("config-", "")}`, options.scenario === "mismatched")];
      },
    },
  };
}

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
