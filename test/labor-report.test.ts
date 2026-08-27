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

test("preserves optional job and break references while rejecting invalid required references and duplicate TimeEntry GUIDs", () => {
  const invalidDate = timeEntry();
  invalidDate.businessDate = "20260230";
  assert.equal(laborTimeEntryArraySchema.safeParse([invalidDate]).success, false);

  const invalidReference = timeEntry();
  invalidReference.employeeReference = { entityType: "RestaurantUser" };
  assert.equal(laborTimeEntryArraySchema.safeParse([invalidReference]).success, false);
  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260817));

  const optionalReferences = timeEntry({ jobReference: undefined, breaks: [{ guid: G(411), paid: false, inDate: null, outDate: null, missed: false, waived: false, auditResponse: null }] });
  const parsed = parseLaborTimeEntriesForBusinessDate([optionalReferences], 20260816)[0];
  assert.equal(parsed?.jobGuid, undefined);
  assert.equal(parsed?.breaks[0]?.breakTypeGuid, undefined);
  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry(), timeEntry()], 20260816));
});

test("accepts optional Job and BreakType fields while retaining required source identities", () => {
  assert.equal(laborJobsSchema.safeParse([job()]).success, true);
  assert.equal(laborBreakTypesSchema.safeParse([breakType()]).success, true);
  assert.equal(laborTipWithholdingSchema.safeParse(tipWithholding()).success, true);
  assert.equal(laborJobsSchema.safeParse([{ guid: JOB_GUID }]).success, true);
  assert.equal(laborBreakTypesSchema.safeParse([{ guid: BREAK_GUID }]).success, true);
  assert.equal(laborJobsSchema.safeParse([{ excludeFromReporting: false }]).success, false);
  assert.equal(laborBreakTypesSchema.safeParse([{ active: true }]).success, false);
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
  assert.equal(result.ordersTipsMinor, 300);
  assert.equal(result.tipWithholdingBasisMinor, 100);
  assert.equal(result.tipWithholdingMinor, 10);
  assert.equal(result.netOrdersTipsMinor, 290);
  assert.equal(result.tipWithholdingEnabled, true);
  assert.equal(result.ordersWithServerAttributionCount, 1);
  assert.equal(harness.requests[0]?.query?.includeArchived, true);
  assert.equal(harness.requests[0]?.query?.includeMissedBreaks, true);
  assert.equal(harness.requests.every((request) => request.restaurantGuid === harness.restaurantGuid), true);
  assert.equal(harness.configurationRequests.every((request) => request.restaurantGuid === harness.restaurantGuid), true);
  assert.ok(!JSON.stringify(result).includes(EMPLOYEE_GUID));
  assert.ok(!JSON.stringify(result).includes("synthetic-name-must-not-survive"));
});

test("records location context, every source request, and complete retrieval provenance", async () => {
  const harness = laborRuntime();
  const result = await buildLaborSummaryReport(harness.runtime, {
    businessDate: 20260816,
    restaurantGuid: harness.restaurantGuid,
  });

  assert.equal(result.status, "complete");
  assert.deepEqual(result.contextFreshness, {
    retrievedThroughEpochMs: 1_799_999_999_000,
    ageMs: 1_000,
    maxAgeMs: 60_000,
  });
  assert.deepEqual(result.contextProvenance, {
    retrievedThroughEpochMs: 1_799_999_999_000,
    upstreamRequestIds: ["synthetic-location"],
    upstreamRequestIdCount: 1,
    upstreamRequestIdsTruncated: false,
  });
  assert.deepEqual(result.provenance, {
    retrievedThroughEpochMs: 1_800_000_000_000,
    upstreamRequestIds: [
      "synthetic-time-entries",
      "synthetic-jobs",
      "synthetic-break-types-0",
      "synthetic-withholding",
      "synthetic-orders-0",
    ],
    upstreamRequestIdCount: 5,
    upstreamRequestIdsTruncated: false,
  });
  assert.deepEqual(harness.requests, [
    {
      path: "/labor/v1/timeEntries",
      restaurantGuid: harness.restaurantGuid,
      query: {
        startDate: "2026-08-16T09:00:00.000Z",
        endDate: "2026-08-17T09:00:00.000Z",
        includeArchived: true,
        includeMissedBreaks: true,
      },
      rateLimitKey: "labor-time-entries",
    },
    {
      path: "/labor/v1/jobs",
      restaurantGuid: harness.restaurantGuid,
      query: { jobIds: JOB_GUID },
      rateLimitKey: "labor-jobs",
    },
    {
      path: "/config/v2/tipWithholding",
      restaurantGuid: harness.restaurantGuid,
      rateLimitKey: "config-tip-withholding",
    },
    {
      restaurantGuid: harness.restaurantGuid,
      query: { businessDate: 20260816 },
      pageSize: 100,
    },
  ]);
  assert.deepEqual(harness.configurationRequests, [{
    path: "/config/v2/breakTypes",
    restaurantGuid: harness.restaurantGuid,
    rateLimitKey: "config-break-types",
  }]);
});

test("denies before every business read when any required scope is missing", async () => {
  for (const scopes of [
    ["config:read", "orders:read"],
    ["labor:read", "orders:read"],
    ["labor:read", "config:read"],
  ]) {
    const harness = laborRuntime({ scopes });
    const result = await buildLaborSummaryReport(harness.runtime, { businessDate: 20260816, restaurantGuid: harness.restaurantGuid });
    assert.equal(result.status, "denied");
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.configurationRequests.length, 0);
    assert.equal(harness.orderRequests, 0);
  }
});

test("denies source failures, restaurant mismatch, and staged cancellation without later requests", async () => {
  for (const mode of ["sourceFailure", "locationMismatch"] as const) {
    const harness = laborRuntime({ [mode]: true });
    const result = await buildLaborSummaryReport(harness.runtime, { businessDate: 20260816, restaurantGuid: harness.restaurantGuid });
    assert.equal(result.status, "denied");
    assert.equal("regularHours" in result, false);
  }

  for (const stage of ["timeEntries", "jobs", "breakTypes", "tipWithholding", "orders"] as const) {
    const controller = new AbortController();
    const harness = laborRuntime({ cancelAt: stage, expectedSignal: controller.signal });
    const result = await buildLaborSummaryReport(harness.runtime, { businessDate: 20260816, restaurantGuid: harness.restaurantGuid }, { signal: controller.signal });
    assert.equal(result.status, "denied");
    assert.equal(harness.signals.every((signal) => signal === controller.signal), true);
    assert.deepEqual(harness.calledStages, stagesThrough(stage));
  }
});

test("propagates cancellation into deferred location resolution before any source request", async () => {
  const controller = new AbortController();
  const harness = laborRuntime({ deferLocation: true });
  const report = buildLaborSummaryReport(
    harness.runtime,
    { businessDate: 20260816, restaurantGuid: harness.restaurantGuid },
    { signal: controller.signal },
  );

  assert.deepEqual(harness.locationSignals, [controller.signal]);
  controller.abort();

  const result = await report;
  assert.equal(result.status, "denied");
  assert.equal(result.denial.code, "request_cancelled");
  assert.deepEqual(harness.calledStages, []);
  assert.equal(harness.requests.length, 0);
  assert.equal(harness.configurationRequests.length, 0);
  assert.equal(harness.orderRequests, 0);
});

test("uses closeout-hour bounds across DST and rejects unresolved jobs and repeated Orders identities", async () => {
  const dst = laborRuntime({ businessDate: 20261031 });
  const dstResult = await buildLaborSummaryReport(dst.runtime, { businessDate: 20261031, restaurantGuid: dst.restaurantGuid });
  assert.notEqual(dstResult.status, "denied");
  assert.deepEqual(dst.requests[0]?.query, {
    startDate: "2026-10-31T09:00:00.000Z",
    endDate: "2026-11-01T10:00:00.000Z",
    includeArchived: true,
    includeMissedBreaks: true,
  });

  const unresolved = laborRuntime({ omitRequestedJob: true });
  assert.equal((await buildLaborSummaryReport(unresolved.runtime, { businessDate: 20260816, restaurantGuid: unresolved.restaurantGuid })).status, "denied");

  const repeated = laborRuntime({ ordersPages: [[order()], [order()]] });
  const repeatedResult = await buildLaborSummaryReport(repeated.runtime, { businessDate: 20260816, restaurantGuid: repeated.restaurantGuid });
  assert.equal(repeatedResult.status, "denied");
  assert.equal(repeatedResult.denial.code, "sales_duplicate_entity_across_pages");
});

test("loads distinct referenced jobs in batches of at most one hundred", async () => {
  const entries = Array.from({ length: 101 }, (_, index) => timeEntry({
    guid: G(600 + index),
    jobReference: reference(G(800 + index), "RestaurantJob"),
  }));
  const harness = laborRuntime({ entries, includeRequestedJobs: true });
  const result = await buildLaborSummaryReport(harness.runtime, { businessDate: 20260816, restaurantGuid: harness.restaurantGuid });

  assert.notEqual(result.status, "denied");
  const jobRequests = harness.requests.filter((request) => request.path === "/labor/v1/jobs");
  assert.deepEqual(jobRequests.map((request) => request.query.jobIds.split(",").length), [100, 1]);
  assert.equal(new Set(jobRequests.flatMap((request) => request.query.jobIds.split(","))).size, 101);
});

test("marks unresolved optional references incomplete and denies unresolved formula fields", async () => {
  const unresolved = laborRuntime({ entries: [
    timeEntry({ jobReference: undefined, breaks: [] }),
    timeEntry({ guid: G(412), breaks: [{ guid: G(411), paid: false, inDate: null, outDate: null, missed: true, waived: false, auditResponse: null }] }),
  ] });
  const incomplete = await buildLaborSummaryReport(unresolved.runtime, { businessDate: 20260816, restaurantGuid: unresolved.restaurantGuid });
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.unresolvedJobTimeEntryCount, 1);
  assert.equal(incomplete.unresolvedBreakTypeCount, 1);
  assert.equal(unresolved.requests.filter((request) => request.path === "/labor/v1/jobs").length, 1);

  const jobWithoutFlag = job();
  delete jobWithoutFlag.excludeFromReporting;
  const missingFormulaField = laborRuntime({ jobResponse: [jobWithoutFlag] });
  const denied = await buildLaborSummaryReport(missingFormulaField.runtime, { businessDate: 20260816, restaurantGuid: missingFormulaField.restaurantGuid });
  assert.equal(denied.status, "denied");
  assert.equal(denied.denial.code, "labor_job_reporting_flag_unresolved");
});

test("denies duplicate and non-exact TimeEntry, Job, and BreakType source identities", async () => {
  const duplicateEntries = laborRuntime({ entries: [timeEntry(), timeEntry()] });
  assert.equal((await buildLaborSummaryReport(duplicateEntries.runtime, { businessDate: 20260816, restaurantGuid: duplicateEntries.restaurantGuid })).status, "denied");

  const duplicateJob = laborRuntime({ jobResponse: [job(), job()] });
  assert.equal((await buildLaborSummaryReport(duplicateJob.runtime, { businessDate: 20260816, restaurantGuid: duplicateJob.restaurantGuid })).status, "denied");

  const extraJob = laborRuntime({ jobResponse: [job(), job({ guid: EXCLUDED_JOB_GUID })] });
  assert.equal((await buildLaborSummaryReport(extraJob.runtime, { businessDate: 20260816, restaurantGuid: extraJob.restaurantGuid })).status, "denied");

  const repeatedBreakType = laborRuntime({ breakTypePages: [[breakType()], [breakType()]] });
  const repeatedBreakTypeResult = await buildLaborSummaryReport(repeatedBreakType.runtime, { businessDate: 20260816, restaurantGuid: repeatedBreakType.restaurantGuid });
  assert.equal(repeatedBreakTypeResult.status, "denied");
  assert.equal(repeatedBreakTypeResult.denial.code, "labor_break_type_duplicate");
});

test("uses checked decimal totals for fractional accumulation and overflow denial", async () => {
  const fractional = laborRuntime({ entries: [
    timeEntry({ guid: G(500), regularHours: 0.1, overtimeHours: 0.2 }),
    timeEntry({ guid: G(501), regularHours: 0.2, overtimeHours: 0.1 }),
  ] });
  const fractionalResult = await buildLaborSummaryReport(fractional.runtime, { businessDate: 20260816, restaurantGuid: fractional.restaurantGuid });
  assert.notEqual(fractionalResult.status, "denied");
  if (fractionalResult.status === "denied") throw new Error("Expected fractional labor result.");
  assert.equal(fractionalResult.regularHours, 0.3);
  assert.equal(fractionalResult.overtimeHours, 0.3);

  const overflow = laborRuntime({ entries: [
    timeEntry({ guid: G(502), regularHours: Number.MAX_VALUE }),
    timeEntry({ guid: G(503), regularHours: Number.MAX_VALUE }),
  ] });
  const overflowResult = await buildLaborSummaryReport(overflow.runtime, { businessDate: 20260816, restaurantGuid: overflow.restaurantGuid });
  assert.equal(overflowResult.status, "denied");
  assert.equal(overflowResult.denial.code, "labor_decimal_total_overflow");
});

test("preserves absent hourly wages as unresolved and only explicit null as salaried", async () => {
  const absentWage = laborRuntime({ entries: [timeEntry({ hourlyWage: undefined })] });
  const absentResult = await buildLaborSummaryReport(absentWage.runtime, { businessDate: 20260816, restaurantGuid: absentWage.restaurantGuid });
  assert.equal(absentResult.status, "incomplete");
  assert.equal(absentResult.unresolvedHourlyWageTimeEntryCount, 1);
  assert.equal(absentResult.salariedTimeEntryCount, 0);

  const nullWage = laborRuntime({ entries: [timeEntry({ hourlyWage: null })] });
  const nullResult = await buildLaborSummaryReport(nullWage.runtime, { businessDate: 20260816, restaurantGuid: nullWage.restaurantGuid });
  assert.equal(nullResult.status, "complete");
  assert.equal(nullResult.salariedTimeEntryCount, 1);
  assert.equal(nullResult.unresolvedHourlyWageTimeEntryCount, 0);
});

test("rejects duplicate TimeEntryBreak identities and marks unmatched BreakType references incomplete", async () => {
  const duplicateWithinEntry = timeEntry({ breaks: [
    { guid: G(411), breakType: reference(BREAK_GUID, "BreakType"), paid: false, inDate: null, outDate: null, missed: false, waived: false, auditResponse: null },
    { guid: G(411), breakType: reference(BREAK_GUID, "BreakType"), paid: false, inDate: null, outDate: null, missed: false, waived: false, auditResponse: null },
  ] });
  assert.throws(() => parseLaborTimeEntriesForBusinessDate([duplicateWithinEntry], 20260816));
  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry(), timeEntry({ guid: G(412), breaks: [{ guid: BREAK_GUID, breakType: reference(BREAK_GUID, "BreakType"), paid: false, inDate: null, outDate: null, missed: false, waived: false, auditResponse: null }] })], 20260816));

  const unmatchedBreakType = laborRuntime({ entries: [timeEntry({ breaks: [{ guid: G(413), breakType: reference(G(414), "BreakType"), paid: false, inDate: null, outDate: null, missed: true, waived: false, auditResponse: null }] })] });
  const unmatchedResult = await buildLaborSummaryReport(unmatchedBreakType.runtime, { businessDate: 20260816, restaurantGuid: unmatchedBreakType.restaurantGuid });
  assert.equal(unmatchedResult.status, "incomplete");
  assert.equal(unmatchedResult.unresolvedBreakTypeCount, 1);
});

test("uses exact sub-nanounit half-up multiplication for wages and tip withholding", async () => {
  const precise = laborRuntime({
    entries: [timeEntry({ hourlyWage: 100_000_000, regularHours: 0.00000000005 })],
    tipWithholdingPercentage: 0.00000000005,
    ordersPages: [[preciseTipOrder()]],
  });
  const result = await buildLaborSummaryReport(precise.runtime, { businessDate: 20260816, restaurantGuid: precise.restaurantGuid });
  assert.notEqual(result.status, "denied");
  if (result.status === "denied") throw new Error("Expected precise labor result.");
  assert.equal(result.regularWagesMinor, 1);
  assert.equal(result.tipWithholdingMinor, 1);
});

test("enforces the full-report distinct Job bound before Jobs requests", async () => {
  const atBoundEntries = Array.from({ length: 1_000 }, (_, index) => timeEntry({ guid: G(1_000 + index), jobReference: reference(G(2_000 + index), "RestaurantJob") }));
  const atBound = laborRuntime({ entries: atBoundEntries, includeRequestedJobs: true });
  const atBoundResult = await buildLaborSummaryReport(atBound.runtime, { businessDate: 20260816, restaurantGuid: atBound.restaurantGuid });
  assert.notEqual(atBoundResult.status, "denied");
  assert.equal(atBound.requests.filter((request) => request.path === "/labor/v1/jobs").length, 10);

  const aboveBoundEntries = Array.from({ length: 1_001 }, (_, index) => timeEntry({ guid: G(4_000 + index), jobReference: reference(G(6_000 + index), "RestaurantJob") }));
  const aboveBound = laborRuntime({ entries: aboveBoundEntries, includeRequestedJobs: true });
  const aboveBoundResult = await buildLaborSummaryReport(aboveBound.runtime, { businessDate: 20260816, restaurantGuid: aboveBound.restaurantGuid });
  assert.equal(aboveBoundResult.status, "denied");
  assert.equal(aboveBoundResult.denial.code, "labor_jobs_request_bound_exceeded");
  assert.equal(aboveBound.requests.filter((request) => request.path === "/labor/v1/jobs").length, 0);
});

function reference(guid: string, entityType: string): Record<string, unknown> {
  return { guid, entityType, externalId: "synthetic-external-id-must-not-survive" };
}

function timeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const entryGuid = typeof overrides.guid === "string" ? overrides.guid : G(400);
  const breakGuid = G(Number.parseInt(entryGuid.slice(-12), 16) + 5);
  return {
    guid: entryGuid, entityType: "TimeEntry", deleted: false,
    employeeReference: reference(EMPLOYEE_GUID, "RestaurantUser"),
    jobReference: reference(JOB_GUID, "RestaurantJob"),
    inDate: "2026-08-16T08:00:00.000-05:00", outDate: "2026-08-16T16:00:00.000-05:00",
    businessDate: "20260816", regularHours: 7.5, overtimeHours: 0.5, hourlyWage: null,
    modifiedDate: "2026-08-16T16:05:00.000-05:00",
    breaks: [{ guid: breakGuid, breakType: reference(BREAK_GUID, "BreakType"), paid: false, inDate: null, outDate: null, missed: true, waived: false, auditResponse: null }],
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

function tipWithholding(percentage = 0.1): Record<string, unknown> {
  return { guid: WITHHOLDING_GUID, entityType: "TipWithholding", enabled: true, percentage };
}

function laborRuntime(options: {
  readonly entries?: readonly Record<string, unknown>[];
  readonly scopes?: readonly string[];
  readonly sourceFailure?: boolean;
  readonly locationMismatch?: boolean;
  readonly deferLocation?: boolean;
  readonly cancelAt?: "timeEntries" | "jobs" | "breakTypes" | "tipWithholding" | "orders";
  readonly expectedSignal?: AbortSignal;
  readonly businessDate?: number;
  readonly omitRequestedJob?: boolean;
  readonly includeRequestedJobs?: boolean;
  readonly jobResponse?: readonly Record<string, unknown>[];
  readonly breakTypePages?: readonly (readonly Record<string, unknown>[])[];
  readonly tipWithholdingPercentage?: number;
  readonly ordersPages?: readonly (readonly Record<string, unknown>[])[];
} = {}) {
  const restaurantGuid = G(450);
  const requests: Array<Record<string, any>> = [];
  const configurationRequests: Array<Record<string, any>> = [];
  const signals: Array<AbortSignal | undefined> = [];
  const locationSignals: Array<AbortSignal | undefined> = [];
  const calledStages: string[] = [];
  let orderRequests = 0;
  const location = { restaurantGuid, name: "Synthetic Labor Cafe", timezone: "America/Chicago", closeoutHour: 4, currencyCode: "USD", managementGroupGuid: undefined, connectionScopes: Object.freeze(options.scopes ?? ["labor:read", "config:read", "orders:read"]) };
  const runtime = {
    now: () => 1_800_000_000_000,
    getLocationContext: async (_requestedRestaurantGuid: string | undefined, requestOptions: { readonly signal?: AbortSignal } = {}) => {
      locationSignals.push(requestOptions.signal);
      if (options.deferLocation) await rejectWhenAborted(requestOptions.signal);
      return { location, freshness: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, ageMs: 1_000, maxAgeMs: 60_000 }), provenance: Object.freeze({ retrievedThroughEpochMs: 1_799_999_999_000, upstreamRequestIds: Object.freeze(["synthetic-location"]), upstreamRequestIdCount: 1, upstreamRequestIdsTruncated: false }) };
    },
    tokenManager: { getProvisionedScopes: async () => options.scopes ?? ["labor:read", "config:read", "orders:read"] },
    toastHttpClient: {
      getJsonDetailedCancellable: async (request: Record<string, any>, requestOptions: { readonly signal?: AbortSignal }) => {
        requests.push(request);
        signals.push(requestOptions.signal);
        const stage = request.path === "/labor/v1/timeEntries" ? "timeEntries" : request.path === "/labor/v1/jobs" ? "jobs" : "tipWithholding";
        calledStages.push(stage);
        if (options.cancelAt === stage) throw new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false });
        if (options.sourceFailure) throw new ToastHttpError("response_invalid_json", "synthetic source failure", { apiFamily: "standard", retryable: false });
        const scopeGuid = options.locationMismatch ? G(499) : restaurantGuid;
        if (request.path === "/labor/v1/timeEntries") return result(options.entries ?? [timeEntry({ businessDate: String(options.businessDate ?? 20260816) })], scopeGuid, "time-entries");
        if (request.path === "/labor/v1/jobs") return result(options.jobResponse ?? jobsForRequest(request, options), scopeGuid, "jobs");
        if (request.path === "/config/v2/tipWithholding") return result(tipWithholding(options.tipWithholdingPercentage), scopeGuid, "withholding");
        throw new Error(`Unexpected synthetic source path ${request.path}`);
      },
      getConfigurationPagesDetailedCancellable: async (request: Record<string, any>, requestOptions: { readonly signal?: AbortSignal }) => {
        configurationRequests.push(request);
        signals.push(requestOptions.signal);
        calledStages.push("breakTypes");
        if (options.cancelAt === "breakTypes") throw new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false });
        return (options.breakTypePages ?? [[breakType()]]).map((page, index) => result(page, restaurantGuid, `break-types-${index}`));
      },
      foldOrdersBulkPagesCancellable: async <T>(request: Record<string, any>, state: T, consume: (state: T, page: ToastDetailedJsonResult, pageNumber: number) => T, requestOptions: { readonly signal?: AbortSignal }) => {
        orderRequests += 1;
        requests.push(request);
        signals.push(requestOptions.signal);
        calledStages.push("orders");
        if (options.cancelAt === "orders") throw new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false });
        const pages = options.ordersPages ?? [[{ ...order(), businessDate: options.businessDate ?? 20260816 }]];
        return pages.reduce((foldState, page, index) => consume(foldState, result(page, restaurantGuid, `orders-${index}`), index + 1), state);
      },
    },
  };
  return { runtime: runtime as any, restaurantGuid, requests, configurationRequests, signals, locationSignals, calledStages, get orderRequests() { return orderRequests; } };
}

function rejectWhenAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) {
      reject(new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false }));
      return;
    }
    signal?.addEventListener("abort", () => {
      reject(new ToastHttpError("request_cancelled", "synthetic cancellation", { apiFamily: "standard", retryable: false }));
    }, { once: true });
  });
}

function order(): Record<string, unknown> {
  return {
    guid: G(460), businessDate: 20260816, server: { guid: EMPLOYEE_GUID, name: "synthetic-name-must-not-survive" }, excessFood: false, deleted: false, voided: false,
    checks: [{ guid: G(461), amount: 999, taxAmount: 0, totalAmount: 999, taxExempt: false, deleted: false, voided: false, paymentStatus: "PAID", selections: [], appliedServiceCharges: [], appliedDiscounts: [], payments: [
      { guid: G(462), type: "CREDIT", amount: 10.01, tipAmount: 1.25, paymentStatus: "PAID", refund: { refundAmount: 1, tipRefundAmount: 0.25 } },
      { guid: G(463), type: "CREDIT", amount: 7, tipAmount: 3, paymentStatus: "VOIDED" },
      { guid: G(464), type: "CASH", amount: 0, tipAmount: 2, paymentStatus: "PAID" },
    ] }],
  };
}

function preciseTipOrder(): Record<string, unknown> {
  return {
    guid: G(470), businessDate: 20260816, server: { guid: EMPLOYEE_GUID }, excessFood: false, deleted: false, voided: false,
    checks: [{ guid: G(471), amount: 100_000_000, taxAmount: 0, totalAmount: 100_000_000, taxExempt: false, deleted: false, voided: false, paymentStatus: "PAID", selections: [], appliedServiceCharges: [], appliedDiscounts: [], payments: [
      { guid: G(472), type: "CREDIT", amount: 100_000_000, tipAmount: 100_000_000, paymentStatus: "PAID" },
    ] }],
  };
}

function jobsForRequest(request: Record<string, any>, options: { readonly omitRequestedJob?: boolean; readonly includeRequestedJobs?: boolean }): readonly Record<string, unknown>[] {
  const requested = String(request.query?.jobIds ?? "").split(",").filter(Boolean);
  if (options.omitRequestedJob) return [];
  if (options.includeRequestedJobs) return requested.map((guid) => job({ guid }));
  return requested.map((guid) => job({ guid, excludeFromReporting: guid === EXCLUDED_JOB_GUID }));
}

function stagesThrough(stage: "timeEntries" | "jobs" | "breakTypes" | "tipWithholding" | "orders"): readonly string[] {
  const stages = ["timeEntries", "jobs", "breakTypes", "tipWithholding", "orders"];
  return stages.slice(0, stages.indexOf(stage) + 1);
}

function result(body: unknown, restaurantGuid: string, requestId: string): ToastDetailedJsonResult {
  return Object.freeze({ apiFamily: "standard", body, scope: Object.freeze({ kind: "restaurant" as const, restaurantGuid }), retrievedAtEpochMs: 1_800_000_000_000, upstreamRequestId: `synthetic-${requestId}` });
}
