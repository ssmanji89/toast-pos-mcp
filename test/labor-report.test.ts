import assert from "node:assert/strict";
import test from "node:test";

import {
  laborBreakTypesSchema,
  laborJobsSchema,
  laborTimeEntryArraySchema,
  laborTipWithholdingSchema,
  parseLaborTimeEntriesForBusinessDate,
} from "../src/labor-report-source.js";
import { buildLaborSummaryReport } from "../src/labor-report.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";

const G = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0").slice(-12)}`;

const EMPLOYEE_GUID = G(401);
const JOB_GUID = G(402);
const BREAK_GUID = G(403);

test("validates and retains labor lifecycle facts without human-readable employee data", () => {
  const result = parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260816);
  const entry = result[0];

  assert.equal(entry?.employeeGuid, EMPLOYEE_GUID);
  assert.equal(entry?.jobGuid, JOB_GUID);
  assert.equal(entry?.state, "FUTURE_TIME_ENTRY_STATE");
  assert.equal(entry?.archived, true);
  assert.equal(entry?.revised, true);
  assert.equal(entry?.deleted, false);
  assert.equal(entry?.active, false);
  assert.equal(entry?.hourlyWage, null);
  assert.equal(entry?.breaks[0]?.state, "FUTURE_BREAK_STATE");
  assert.equal(entry?.breaks[0]?.missed, true);
  assert.ok(Object.isFrozen(entry));
  assert.ok(!JSON.stringify(entry).includes("synthetic-name-must-not-survive"));
});

test("rejects invalid source timestamps and business-date mismatches", () => {
  const malformed = timeEntry();
  malformed.inDate = "not-a-zoned-timestamp";
  assert.equal(laborTimeEntryArraySchema.safeParse([malformed]).success, false);

  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260817));
});

test("accepts open-string job, break, and withholding configuration values", () => {
  assert.equal(laborJobsSchema.safeParse([{ guid: JOB_GUID, name: "omit", state: "FUTURE_JOB_STATE" }]).success, true);
  assert.equal(laborBreakTypesSchema.safeParse([{ guid: BREAK_GUID, state: "FUTURE_BREAK_TYPE_STATE" }]).success, true);
  assert.equal(laborTipWithholdingSchema.safeParse({ state: "FUTURE_WITHHOLDING_STATE", percentage: 0.15 }).success, true);
});

test("builds an aggregate incomplete labor report from scoped source facts and Orders attribution", async () => {
  const controller = new AbortController();
  const harness = laborRuntime({
    entries: [timeEntry(), { ...timeEntry(), guid: G(405), outDate: null, hourlyWage: 20, regularHours: 2, overtimeHours: 1 }],
  });
  const result = await buildLaborSummaryReport(harness.runtime, {
    businessDate: 20260816,
    restaurantGuid: harness.restaurantGuid,
  }, { signal: controller.signal });

  assert.equal(result.status, "incomplete");
  assert.equal(result.activeTimeEntryCount, 1);
  assert.equal(result.regularHours, 9.5);
  assert.equal(result.overtimeHours, 1.5);
  assert.equal(result.regularWagesMinor, 4000);
  assert.equal(result.salariedTimeEntryCount, 1);
  assert.equal(result.ordersSalesMinor, 1000);
  assert.equal(result.ordersTipsMinor, 125);
  assert.deepEqual(harness.requests.map((request) => request.path), [
    "/labor/v1/timeEntries",
    "/labor/v1/jobs",
    "/config/v2/tipWithholding",
  ]);
  assert.equal(harness.configurationRequests[0]?.path, "/config/v2/breakTypes");
  assert.equal(harness.requests[0]?.query?.includeArchived, true);
  assert.equal(harness.requests[0]?.query?.includeMissedBreaks, true);
  assert.equal(harness.requests[0]?.restaurantGuid, harness.restaurantGuid);
  assert.equal(harness.signals.every((signal) => signal === controller.signal), true);
  assert.ok(result.formulaNotes.some((note) => note.includes("overtime wage")));
  assert.ok(!JSON.stringify(result).includes(EMPLOYEE_GUID));
  assert.ok(!JSON.stringify(result).includes("synthetic-name-must-not-survive"));
});

test("denies before business reads when required labor capability is missing", async () => {
  const harness = laborRuntime({ scopes: ["labor:read", "orders:read"] });
  const result = await buildLaborSummaryReport(harness.runtime, {
    businessDate: 20260816,
    restaurantGuid: harness.restaurantGuid,
  });

  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "capability_missing_scope");
  assert.deepEqual(result.missingScopes, ["config:read"]);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.configurationRequests.length, 0);
  assert.equal(harness.orderRequests, 0);
});

test("denies malformed or incomplete required source data without returning an incomplete zero report", async () => {
  const harness = laborRuntime({ entries: [{ ...timeEntry(), inDate: "invalid" }] });
  const result = await buildLaborSummaryReport(harness.runtime, {
    businessDate: 20260816,
    restaurantGuid: harness.restaurantGuid,
  });

  assert.equal(result.status, "denied");
  assert.notEqual(result.denial.code, "report_internal_failure");
  assert.equal("activeTimeEntryCount" in result, false);
});

function timeEntry(): Record<string, unknown> {
  return {
    guid: G(400),
    employeeGuid: EMPLOYEE_GUID,
    jobGuid: JOB_GUID,
    businessDate: 20260816,
    inDate: "2026-08-16T08:00:00-05:00",
    outDate: "2026-08-16T16:00:00-05:00",
    state: "FUTURE_TIME_ENTRY_STATE",
    revised: true,
    archived: true,
    deleted: false,
    regularHours: 7.5,
    overtimeHours: 0.5,
    hourlyWage: null,
    breaks: [{
      breakTypeGuid: BREAK_GUID,
      state: "FUTURE_BREAK_STATE",
      minutes: 30,
      missed: true,
    }],
    employeeName: "synthetic-name-must-not-survive",
    externalEmployeeId: "synthetic-external-id-must-not-survive",
  };
}

function laborRuntime(options: {
  readonly entries?: readonly Record<string, unknown>[];
  readonly scopes?: readonly string[];
} = {}) {
  const restaurantGuid = G(450);
  const requests: Array<Record<string, any>> = [];
  const configurationRequests: Array<Record<string, any>> = [];
  const signals: Array<AbortSignal | undefined> = [];
  let orderRequests = 0;
  const location = {
    restaurantGuid,
    name: "Synthetic Labor Cafe",
    timezone: "America/Chicago",
    closeoutHour: 4,
    currencyCode: "USD",
    managementGroupGuid: undefined,
    connectionScopes: Object.freeze(options.scopes ?? ["labor:read", "config:read", "orders:read"]),
  };
  const timeEntries = options.entries ?? [timeEntry()];
  const runtime = {
    now: () => 1_800_000_000_000,
    getLocationContext: async () => ({
      location,
      freshness: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, ageMs: 1_000, maxAgeMs: 60_000 }),
      provenance: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, upstreamRequestIds: Object.freeze(["synthetic-location"]), upstreamRequestIdCount: 1, upstreamRequestIdsTruncated: false }),
    }),
    tokenManager: {
      getProvisionedScopes: async () => options.scopes ?? ["labor:read", "config:read", "orders:read"],
    },
    toastHttpClient: {
      getJsonDetailedCancellable: async (request: Record<string, any>, requestOptions: { readonly signal?: AbortSignal }) => {
        requests.push(request);
        signals.push(requestOptions.signal);
        if (request.path === "/labor/v1/timeEntries") return result(timeEntries, restaurantGuid, "time-entries");
        if (request.path === "/labor/v1/jobs") return result([{ guid: JOB_GUID, state: "FUTURE_JOB_STATE" }], restaurantGuid, "jobs");
        if (request.path === "/config/v2/tipWithholding") return result({ state: "FUTURE_WITHHOLDING_STATE", percentage: 0.15 }, restaurantGuid, "withholding");
        throw new Error(`Unexpected synthetic source path ${request.path}`);
      },
      getConfigurationPagesDetailedCancellable: async (request: Record<string, any>, requestOptions: { readonly signal?: AbortSignal }) => {
        configurationRequests.push(request);
        signals.push(requestOptions.signal);
        return [result([{ guid: BREAK_GUID, state: "FUTURE_BREAK_TYPE_STATE" }], restaurantGuid, "break-types")];
      },
      foldOrdersBulkPagesCancellable: async <T>(request: Record<string, any>, state: T, consume: (state: T, page: ToastDetailedJsonResult, pageNumber: number) => T, requestOptions: { readonly signal?: AbortSignal }) => {
        orderRequests += 1;
        signals.push(requestOptions.signal);
        return consume(state, result([order()], restaurantGuid, "orders"), 1);
      },
    },
  };
  return { runtime: runtime as any, restaurantGuid, requests, configurationRequests, signals, get orderRequests() { return orderRequests; } };
}

function order(): Record<string, unknown> {
  return {
    guid: G(460), businessDate: 20260816, server: { guid: EMPLOYEE_GUID, name: "synthetic-name-must-not-survive" },
    excessFood: false, deleted: false, voided: false,
    checks: [{
      guid: G(461), amount: 10, taxAmount: 0, totalAmount: 10, taxExempt: false, deleted: false, voided: false,
      paymentStatus: "PAID", selections: [], appliedServiceCharges: [], appliedDiscounts: [],
      payments: [{ guid: G(462), type: "CREDIT", amount: 10, tipAmount: 1.25 }],
    }],
  };
}

function result(body: unknown, restaurantGuid: string, requestId: string): ToastDetailedJsonResult {
  return Object.freeze({
    apiFamily: "standard", body,
    scope: Object.freeze({ kind: "restaurant" as const, restaurantGuid }),
    retrievedAtEpochMs: 1_800_000_000_000,
    upstreamRequestId: `synthetic-${requestId}`,
  });
}
