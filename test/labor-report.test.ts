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
import { ToastHttpError, type ToastDetailedJsonResult } from "../src/transport.js";

const G = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0").slice(-12)}`;
const EMPLOYEE_GUID = G(401);
const EXCLUDED_EMPLOYEE_GUID = G(402);
const JOB_GUID = G(403);
const EXCLUDED_JOB_GUID = G(404);
const BREAK_GUID = G(405);
const WITHHOLDING_GUID = G(406);

test("parses documented TimeEntry references and string business dates without retaining employee data", () => {
  const entry = parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260816)[0];

  assert.equal(entry?.employeeGuid, EMPLOYEE_GUID);
  assert.equal(entry?.jobGuid, JOB_GUID);
  assert.equal(entry?.businessDate, "20260816");
  assert.equal(entry?.active, false);
  assert.equal(entry?.breaks[0]?.breakTypeGuid, BREAK_GUID);
  assert.equal(entry?.breaks[0]?.missed, true);
  assert.ok(Object.isFrozen(entry));
  assert.ok(!JSON.stringify(entry).includes("synthetic-name-must-not-survive"));
  assert.ok(!JSON.stringify(entry).includes("synthetic-external-id-must-not-survive"));
});

test("rejects invalid documented reference and source business-date values", () => {
  const invalidDate = timeEntry();
  invalidDate.businessDate = "20260230";
  assert.equal(laborTimeEntryArraySchema.safeParse([invalidDate]).success, false);

  const invalidReference = timeEntry();
  invalidReference.employeeReference = { guid: EMPLOYEE_GUID };
  assert.equal(laborTimeEntryArraySchema.safeParse([invalidReference]).success, false);
  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260817));
});

test("validates documented Job, BreakType, and TipWithholding source shapes", () => {
  assert.equal(laborJobsSchema.safeParse([job()]).success, true);
  assert.equal(laborBreakTypesSchema.safeParse([breakType()]).success, true);
  assert.equal(laborTipWithholdingSchema.safeParse(tipWithholding()).success, true);
});

test("uses reportable jobs and payment facts, then applies tip withholding with defined fractional-hour rounding", async () => {
  const harness = laborRuntime({
    entries: [
      timeEntry({ regularHours: 0.5, overtimeHours: 0.25, hourlyWage: 10.01 }),
      timeEntry({ guid: G(407), employeeReference: reference(EXCLUDED_EMPLOYEE_GUID, "RestaurantUser"), jobReference: reference(EXCLUDED_JOB_GUID, "RestaurantJob"), regularHours: 2, hourlyWage: 20 }),
      timeEntry({ guid: G(408), outDate: null, hourlyWage: null, regularHours: 1 }),
      timeEntry({ guid: G(409), deleted: true, regularHours: 9, hourlyWage: 20 }),
    ],
  });
  const result = await buildLaborSummaryReport(harness.runtime, {
    businessDate: 20260816,
    restaurantGuid: harness.restaurantGuid,
  });

  assert.equal(result.status, "incomplete");
  assert.equal(result.regularHours, 1.5);
  assert.equal(result.overtimeHours, 0.75);
  assert.equal(result.regularWagesMinor, 501);
  assert.equal(result.salariedTimeEntryCount, 1);
  assert.equal(result.excludedJobTimeEntryCount, 1);
  assert.equal(result.deletedTimeEntryCount, 1);
  assert.equal(result.ordersSalesMinor, 901);
  assert.equal(result.ordersTipsMinor, 100);
  assert.equal(result.tipWithholdingMinor, 10);
  assert.equal(result.netOrdersTipsMinor, 90);
  assert.equal(result.tipWithholdingEnabled, true);
  assert.equal(result.ordersWithServerAttributionCount, 1);
  assert.equal(harness.requests[0]?.query?.includeArchived, true);
  assert.equal(harness.requests[0]?.query?.includeMissedBreaks, true);
  assert.equal(harness.requests.every((request) => request.restaurantGuid === harness.restaurantGuid), true);
  assert.ok(!JSON.stringify(result).includes(EMPLOYEE_GUID));
  assert.ok(!JSON.stringify(result).includes("synthetic-name-must-not-survive"));
});

test("denies before reads for missing scope, source failure, cancellation, and location mismatch", async () => {
  const missingScope = laborRuntime({ scopes: ["labor:read", "orders:read"] });
  const missing = await buildLaborSummaryReport(missingScope.runtime, { businessDate: 20260816, restaurantGuid: missingScope.restaurantGuid });
  assert.equal(missing.status, "denied");
  assert.deepEqual(missing.missingScopes, ["config:read"]);
  assert.equal(missingScope.requests.length, 0);

  for (const mode of ["sourceFailure", "cancelled", "locationMismatch"] as const) {
    const harness = laborRuntime({ [mode]: true });
    const result = await buildLaborSummaryReport(harness.runtime, { businessDate: 20260816, restaurantGuid: harness.restaurantGuid });
    assert.equal(result.status, "denied");
    assert.equal("regularHours" in result, false);
  }
});

function reference(guid: string, entityType: string): Record<string, unknown> {
  return { guid, entityType, externalId: "synthetic-external-id-must-not-survive" };
}

function timeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    guid: G(400), entityType: "TimeEntry", deleted: false,
    employeeReference: reference(EMPLOYEE_GUID, "RestaurantUser"),
    jobReference: reference(JOB_GUID, "RestaurantJob"),
    inDate: "2026-08-16T08:00:00.000-05:00", outDate: "2026-08-16T16:00:00.000-05:00",
    businessDate: "20260816", regularHours: 7.5, overtimeHours: 0.5, hourlyWage: null,
    modifiedDate: "2026-08-16T16:05:00.000-05:00",
    breaks: [{ guid: G(410), breakType: reference(BREAK_GUID, "BreakType"), paid: false, inDate: null, outDate: null, missed: true, waived: false, auditResponse: null }],
    employeeName: "synthetic-name-must-not-survive",
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { guid: JOB_GUID, entityType: "RestaurantJob", deleted: false, excludeFromReporting: false, tipped: true, wageFrequency: "FUTURE_WAGE_FREQUENCY", ...overrides };
}

function breakType(): Record<string, unknown> {
  return { guid: BREAK_GUID, entityType: "BreakType", active: true, paid: false, duration: 30, enforceMinimumTime: true, trackMissedBreaks: true, breakIntervalHrs: 4, breakIntervalMins: 0, trackBreakAcknowledgement: true, name: "synthetic-name-must-not-survive" };
}

function tipWithholding(): Record<string, unknown> {
  return { guid: WITHHOLDING_GUID, entityType: "TipWithholding", enabled: true, percentage: 0.1 };
}

function laborRuntime(options: {
  readonly entries?: readonly Record<string, unknown>[];
  readonly scopes?: readonly string[];
  readonly sourceFailure?: boolean;
  readonly cancelled?: boolean;
  readonly locationMismatch?: boolean;
} = {}) {
  const restaurantGuid = G(450);
  const requests: Array<Record<string, any>> = [];
  const configurationRequests: Array<Record<string, any>> = [];
  let orderRequests = 0;
  const location = { restaurantGuid, name: "Synthetic Labor Cafe", timezone: "America/Chicago", closeoutHour: 4, currencyCode: "USD", managementGroupGuid: undefined, connectionScopes: Object.freeze(options.scopes ?? ["labor:read", "config:read", "orders:read"]) };
  const runtime = {
    now: () => 1_800_000_000_000,
    getLocationContext: async () => ({ location, freshness: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, ageMs: 1_000, maxAgeMs: 60_000 }), provenance: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, upstreamRequestIds: Object.freeze(["synthetic-location"]), upstreamRequestIdCount: 1, upstreamRequestIdsTruncated: false }) }),
    tokenManager: { getProvisionedScopes: async () => options.scopes ?? ["labor:read", "config:read", "orders:read"] },
    toastHttpClient: {
      getJsonDetailedCancellable: async (request: Record<string, any>, requestOptions: { readonly signal?: AbortSignal }) => {
        requests.push(request);
        if (options.cancelled) throw new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false });
        if (options.sourceFailure) throw new ToastHttpError("response_invalid_json", "synthetic source failure", { apiFamily: "standard", retryable: false });
        const scopeGuid = options.locationMismatch ? G(499) : restaurantGuid;
        if (request.path === "/labor/v1/timeEntries") return result(options.entries ?? [timeEntry()], scopeGuid, "time-entries");
        if (request.path === "/labor/v1/jobs") return result([job(), job({ guid: EXCLUDED_JOB_GUID, excludeFromReporting: true })], scopeGuid, "jobs");
        if (request.path === "/config/v2/tipWithholding") return result(tipWithholding(), scopeGuid, "withholding");
        throw new Error(`Unexpected synthetic source path ${request.path}`);
      },
      getConfigurationPagesDetailedCancellable: async (request: Record<string, any>) => {
        configurationRequests.push(request);
        return [result([breakType()], restaurantGuid, "break-types")];
      },
      foldOrdersBulkPagesCancellable: async <T>(_request: Record<string, any>, state: T, consume: (state: T, page: ToastDetailedJsonResult, pageNumber: number) => T) => {
        orderRequests += 1;
        return consume(state, result([order()], restaurantGuid, "orders"), 1);
      },
    },
  };
  return { runtime: runtime as any, restaurantGuid, requests, configurationRequests, get orderRequests() { return orderRequests; } };
}

function order(): Record<string, unknown> {
  return {
    guid: G(460), businessDate: 20260816, server: { guid: EMPLOYEE_GUID, name: "synthetic-name-must-not-survive" }, excessFood: false, deleted: false, voided: false,
    checks: [{ guid: G(461), amount: 999, taxAmount: 0, totalAmount: 999, taxExempt: false, deleted: false, voided: false, paymentStatus: "PAID", selections: [], appliedServiceCharges: [], appliedDiscounts: [], payments: [
      { guid: G(462), type: "CREDIT", amount: 10.01, tipAmount: 1.25, paymentStatus: "PAID", refund: { refundAmount: 1, tipRefundAmount: 0.25 } },
      { guid: G(463), type: "CREDIT", amount: 7, tipAmount: 3, paymentStatus: "VOIDED" },
    ] }],
  };
}

function result(body: unknown, restaurantGuid: string, requestId: string): ToastDetailedJsonResult {
  return Object.freeze({ apiFamily: "standard", body, scope: Object.freeze({ kind: "restaurant" as const, restaurantGuid }), retrievedAtEpochMs: 1_800_000_000_000, upstreamRequestId: `synthetic-${requestId}` });
}
