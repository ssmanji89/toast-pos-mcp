import assert from "node:assert/strict";
import test from "node:test";

import { buildCashSummaryReport } from "../src/cash-report.js";
import { createApplicationRuntime } from "../src/runtime.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";
import {
  BUSINESS_DATE,
  createSourceEntryBarrier,
  deposit,
  entry,
  IDS,
  RESTAURANT_GUID,
  syntheticCashRuntime,
} from "./support/cash-report-fixtures.js";

test("cash builder performs capability preflight before restaurant-bound source reads", async () => {
  const calls: string[] = [];
  const controller = new AbortController();
  const runtime = syntheticCashRuntime({
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
  const result = await buildCashSummaryReport(syntheticCashRuntime({
    calls,
    provisionedScopes: ["cashmgmt:read"],
  }), { businessDate: BUSINESS_DATE });

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "capability_missing_scope");
  assert.deepEqual(result.missingScopes, ["config:read"]);
  assert.deepEqual(calls, ["location", "scopes"]);
  assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false);
});

test("cash builder denies malformed sources and incomplete traversal", async () => {
  for (const [name, options] of [
    ["malformed-entry", { malformedAt: "cash-entries" }],
    ["malformed-deposit", { malformedAt: "cash-deposits" }],
    ["malformed-drawers", { malformedAt: "config-cash-drawers" }],
    ["malformed-no-sale-reasons", { malformedAt: "config-no-sale-reasons" }],
    ["malformed-payout-reasons", { malformedAt: "config-payout-reasons" }],
    ["incomplete", { incomplete: true }],
  ] as const) {
    const result = await buildCashSummaryReport(syntheticCashRuntime({
      calls: [],
      provisionedScopes: ["cashmgmt:read", "config:read"],
      ...options,
    }), { businessDate: BUSINESS_DATE });
    assert.equal(result.status, "denied", name);
    assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false, name);
  }
});

test("cash builder stops after a real AbortController cancels the first source read", { timeout: 1_000 }, async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const sourceBarrier = createSourceEntryBarrier();
  const report = buildCashSummaryReport(syntheticCashRuntime({
    calls,
    signal: controller.signal,
    provisionedScopes: ["cashmgmt:read", "config:read"],
    abort: true,
    sourceBarrier,
  }), { businessDate: BUSINESS_DATE }, { signal: controller.signal });

  await sourceBarrier.wait();
  controller.abort();
  const result = await report;

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "request_cancelled");
  assert.deepEqual(calls, ["location", "scopes", "cash-entries"]);
});

test("cash builder preserves a retryable Toast HTTP denial and stops later requests", async () => {
  const businessPaths: string[] = [];
  const runtime = createCashHttpRuntime(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/cashmgmt/") || url.pathname.startsWith("/config/")) {
      businessPaths.push(url.pathname);
    }
    if (url.pathname === "/cashmgmt/v1/entries") return new Response("{}", {
      status: 503,
      headers: { "toast-request-id": "synthetic-cash-503" },
    });
    return cashBootstrapResponse(url.pathname);
  });
  const result = await buildCashSummaryReport(runtime, {
    businessDate: BUSINESS_DATE,
    restaurantGuid: RESTAURANT_GUID,
  });

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "request_failed", JSON.stringify(result));
  assert.equal(result.denial.retryable, true);
  assert.equal(result.denial.upstreamStatus, 503);
  assert.equal(result.denial.upstreamRequestId, "synthetic-cash-503");
  assert.equal(JSON.stringify(result).includes("cashEntryAmountMinor"), false);
  assert.deepEqual(businessPaths, ["/cashmgmt/v1/entries"]);
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

function createCashHttpRuntime(dataFetch: typeof fetch) {
  return createApplicationRuntime({
    env: { ...SYNTHETIC_VALID_RUNTIME_ENV, TOAST_DEFAULT_RESTAURANT_GUID: RESTAURANT_GUID },
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
    dataFetch,
  });
}

function cashBootstrapResponse(path: string): Response {
  if (path === "/partners/v1/restaurants") return jsonResponse([{
    restaurantGuid: RESTAURANT_GUID,
    managementGroupGuid: null,
    deleted: false,
    scopes: ["cashmgmt:read", "config:read", "restaurants:read"],
  }]);
  if (path === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`) return jsonResponse({
    guid: RESTAURANT_GUID,
    general: { archived: false, name: "Synthetic Cash Cafe", timeZone: "America/Chicago", closeoutHour: 4, currencyCode: "USD", managementGroupGuid: null },
  });
  return new Response("{}", { status: 404 });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
