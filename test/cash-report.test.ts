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
import { createApplicationRuntime } from "../src/runtime.js";
import { ToastHttpError } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

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

  assert.equal(result.status, "complete", JSON.stringify(result));
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

test("cash builder denies each malformed source and incomplete traversal", async () => {
  for (const scenario of [
    "malformed-entry",
    "malformed-deposit",
    "malformed-drawers",
    "malformed-no-sale-reasons",
    "malformed-payout-reasons",
    "mismatched",
    "incomplete",
  ] as const) {
    const result = await buildCashSummaryReport(syntheticRuntime({
      calls: [],
      provisionedScopes: ["cashmgmt:read", "config:read"],
      scenario,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "denied", scenario);
    assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false, scenario);
  }
});

test("cash builder stops after a real AbortController cancels the first source read", async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  let sourceStarted!: () => void;
  const sourceStartedPromise = new Promise<void>((resolve) => { sourceStarted = resolve; });
  const report = buildCashSummaryReport(syntheticRuntime({
    calls,
    signal: controller.signal,
    provisionedScopes: ["cashmgmt:read", "config:read"],
    scenario: "abort",
    onSourceStart: sourceStarted,
  }), { businessDate: BUSINESS_DATE }, { signal: controller.signal });

  await sourceStartedPromise;
  controller.abort();
  const result = await report;

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "request_cancelled");
  assert.deepEqual(calls, ["location", "scopes", "cash-entries"]);
});

test("cash builder sends documented business paths, dates, and restaurant headers", async () => {
  const requests: { readonly path: string; readonly businessDate: string | null; readonly restaurantGuid: string | null }[] = [];
  const runtime = createApplicationRuntime({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_DEFAULT_RESTAURANT_GUID: RESTAURANT_GUID,
    },
    now: () => 1_800_000_000_000,
    maxAttempts: 1,
    random: () => 0,
    sleep: async () => undefined,
    authFetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3_600,
        accessToken: "eyJhbGciOiJub25lIn0.eyJzY29wZSI6WyJjYXNobWdtdDpyZWFkIiwiY29uZmlnOnJlYWQiXX0.synthetic",
      },
    }),
    dataFetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/cashmgmt/") || url.pathname.startsWith("/config/")) {
        requests.push({
          path: url.pathname,
          businessDate: url.searchParams.get("businessDate"),
          restaurantGuid: new Headers(init?.headers).get("toast-restaurant-external-id"),
        });
      }
      if (url.pathname === "/partners/v1/restaurants") return jsonResponse([{
        restaurantGuid: RESTAURANT_GUID,
        managementGroupGuid: null,
        deleted: false,
        scopes: ["cashmgmt:read", "config:read", "restaurants:read"],
      }]);
      if (url.pathname === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`) return jsonResponse({
        guid: RESTAURANT_GUID,
        general: { archived: false, name: "Synthetic Cash Cafe", timeZone: "America/Chicago", closeoutHour: 4, currencyCode: "USD", managementGroupGuid: null },
      });
      if (url.pathname === "/cashmgmt/v1/entries") return jsonResponse([entry({})]);
      if (url.pathname === "/cashmgmt/v1/deposits") return jsonResponse([deposit({ amount: 2 })]);
      if (url.pathname === "/config/v2/cashDrawers") return jsonResponse([{ guid: IDS.drawerA }]);
      if (url.pathname === "/config/v2/noSaleReasons") return jsonResponse([{ guid: IDS.noSaleReasonA }]);
      if (url.pathname === "/config/v2/payoutReasons") return jsonResponse([{ guid: IDS.payoutReasonA }]);
      return new Response("{}", { status: 404 });
    },
  });

  const result = await buildCashSummaryReport(runtime, {
    businessDate: BUSINESS_DATE,
    restaurantGuid: RESTAURANT_GUID,
  });
  assert.equal(result.status, "complete", JSON.stringify(result));
  assert.deepEqual(requests, [
    { path: "/cashmgmt/v1/entries", businessDate: String(BUSINESS_DATE), restaurantGuid: RESTAURANT_GUID },
    { path: "/cashmgmt/v1/deposits", businessDate: String(BUSINESS_DATE), restaurantGuid: RESTAURANT_GUID },
    { path: "/config/v2/cashDrawers", businessDate: null, restaurantGuid: RESTAURANT_GUID },
    { path: "/config/v2/noSaleReasons", businessDate: null, restaurantGuid: RESTAURANT_GUID },
    { path: "/config/v2/payoutReasons", businessDate: null, restaurantGuid: RESTAURANT_GUID },
  ]);
});

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000004009";

function syntheticRuntime(options: {
  readonly calls: string[];
  readonly provisionedScopes: readonly string[];
  readonly signal?: AbortSignal;
  readonly scenario?: "malformed-entry" | "malformed-deposit" | "malformed-drawers" | "malformed-no-sale-reasons" | "malformed-payout-reasons" | "mismatched" | "incomplete" | "abort";
  readonly onSourceStart?: () => void;
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
    if (options.scenario === "malformed-entry" && path === "/cashmgmt/v1/entries") return [{}];
    if (options.scenario === "malformed-deposit" && path === "/cashmgmt/v1/deposits") return [{}];
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
        assert.deepEqual(request.query, { businessDate: BUSINESS_DATE });
        assert.equal(request.path, request.rateLimitKey === "cash-entries" ? "/cashmgmt/v1/entries" : "/cashmgmt/v1/deposits");
        if (options.scenario === "abort") {
          options.onSourceStart?.();
          return await new Promise<never>((_resolve, reject) => {
            input.signal?.addEventListener("abort", () => reject(new ToastHttpError(
              "request_cancelled",
              "Synthetic source request cancelled.",
              { apiFamily: "standard", retryable: false },
            )), { once: true });
          });
        }
        return detail(sourceBody(request.path), request.rateLimitKey === "cash-entries" ? "synthetic-entries" : "synthetic-deposits", options.scenario === "mismatched");
      },
      getConfigurationPagesDetailedCancellable: async (request: any, input: { readonly signal?: AbortSignal }) => {
        assert.equal(request.restaurantGuid, RESTAURANT_GUID);
        assert.equal(input.signal, options.signal);
        options.calls.push(request.rateLimitKey);
        if (options.scenario === "incomplete") return [];
        assert.equal(request.query, undefined);
        assert.equal(request.path, request.rateLimitKey === "config-cash-drawers"
          ? "/config/v2/cashDrawers"
          : request.rateLimitKey === "config-no-sale-reasons"
            ? "/config/v2/noSaleReasons"
            : "/config/v2/payoutReasons");
        const values = request.rateLimitKey === "config-cash-drawers"
          ? options.scenario === "malformed-drawers" ? [{}] : [{ guid: IDS.drawerA }]
          : request.rateLimitKey === "config-no-sale-reasons"
            ? options.scenario === "malformed-no-sale-reasons" ? [{}] : [{ guid: IDS.noSaleReasonA }]
            : options.scenario === "malformed-payout-reasons" ? [{}] : [{ guid: IDS.payoutReasonA }];
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
