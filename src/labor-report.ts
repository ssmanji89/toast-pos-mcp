import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import {
  laborBreakTypesSchema,
  laborJobsSchema,
  laborTipWithholdingSchema,
  parseLaborTimeEntriesForBusinessDate,
  type LaborTimeEntryFact,
} from "./labor-report-source.js";
import type { ToastLocationDiscoveryProvenance } from "./locations.js";
import { normalizeOrdersPages } from "./orders-normalization.js";
import {
  STANDARD_REPORT_SCHEMA_VERSION,
  type ReportContextFreshness,
} from "./report-contract.js";
import {
  addMinorUnits,
  denialFromError,
  moneyToMinorUnits,
  ReportComputationError,
  ReportProvenanceCollector,
  type ReportDenial,
  type ReportProvenance,
} from "./report-core.js";
import type { ApplicationRuntime } from "./runtime.js";
import type { ToastDetailedJsonResult } from "./transport.js";

const REQUIRED_SCOPES = Object.freeze(["labor:read", "config:read", "orders:read"]);
const FORMULA_NOTES = Object.freeze([
  "Labor time-entry, job, break-type, and tip-withholding sources are Standard API facts scoped to the selected restaurant.",
  "Employee sales and payment tips are derived only from matching Orders server identifiers; no TimeEntry monetary field is used.",
  "Regular wages use hourly wage multiplied by regular hours in exact minor units. Overtime hours are reported without an overtime wage because Toast does not provide an applicable multiplier source.",
]);

export interface LaborSummaryAggregate {
  readonly timeEntryCount: number;
  readonly activeTimeEntryCount: number;
  readonly deletedTimeEntryCount: number;
  readonly archivedTimeEntryCount: number;
  readonly revisedTimeEntryCount: number;
  readonly salariedTimeEntryCount: number;
  readonly regularHours: number;
  readonly overtimeHours: number;
  readonly regularWagesMinor: number;
  readonly breakCount: number;
  readonly missedBreakCount: number;
  readonly ordersSalesMinor: number;
  readonly ordersTipsMinor: number;
  readonly ordersWithServerAttributionCount: number;
}

interface LaborSummaryBase {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly report: "labor_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string | undefined;
  readonly restaurantName: string | undefined;
  readonly businessDate: number;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number | undefined;
  readonly generatedAtEpochMs: number;
  readonly contextFreshness?: ReportContextFreshness;
  readonly contextProvenance?: ToastLocationDiscoveryProvenance;
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export interface LaborSummaryComplete extends LaborSummaryBase, LaborSummaryAggregate {
  readonly status: "complete";
  readonly restaurantGuid: string;
  readonly restaurantName: string;
  readonly effectiveBusinessDate: number;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly jobsSourceCount: number;
  readonly breakTypeSourceCount: number;
  readonly provenance: ReportProvenance;
}

export interface LaborSummaryIncomplete extends Omit<LaborSummaryComplete, "status"> {
  readonly status: "incomplete";
}

export interface LaborSummaryDenied extends LaborSummaryBase {
  readonly status: "denied";
  readonly denial: ReportDenial;
  readonly missingScopes: readonly string[];
  readonly missingProvisionedScopes: readonly string[];
  readonly missingConnectionScopes: readonly string[];
  readonly excludedScopes: readonly string[];
}

export type LaborSummaryResult =
  | LaborSummaryComplete
  | LaborSummaryIncomplete
  | LaborSummaryDenied;

interface MutableLaborFold {
  readonly employeeGuids: ReadonlySet<string>;
  readonly provenance: ReportProvenanceCollector;
  ordersSalesMinor: number;
  ordersTipsMinor: number;
  ordersWithServerAttributionCount: number;
  pagesProcessed: number;
}

export async function buildLaborSummaryReport(
  runtime: ApplicationRuntime,
  input: { readonly businessDate: number; readonly restaurantGuid?: string },
  options: { readonly signal?: AbortSignal } = {},
): Promise<LaborSummaryResult> {
  const generatedAtEpochMs = runtime.now();
  let restaurantGuid = input.restaurantGuid?.toLowerCase();
  let restaurantName: string | undefined;
  let contextFreshness: ReportContextFreshness | undefined;
  let contextProvenance: ToastLocationDiscoveryProvenance | undefined;
  let effectiveBusinessDate: number | undefined;

  try {
    assertBusinessDate(input.businessDate);
    effectiveBusinessDate = input.businessDate;
    const locationContext = await runtime.getLocationContext(input.restaurantGuid, {
      signal: options.signal,
    });
    const { location } = locationContext;
    restaurantGuid = location.restaurantGuid;
    restaurantName = location.name;
    contextFreshness = locationContext.freshness;
    contextProvenance = locationContext.provenance;

    const capability = decideCapability(
      await createCapabilityContext(runtime.tokenManager, location),
      { restaurantGuid: location.restaurantGuid, requiredScopes: REQUIRED_SCOPES },
    );
    if (capability.status === "denied") {
      return capabilityDenied(
        input.businessDate, generatedAtEpochMs, location.restaurantGuid, location.name,
        capability, contextFreshness, contextProvenance,
      );
    }

    const bounds = businessDateBounds(input.businessDate, location.timezone, location.closeoutHour);
    const provenance = new ReportProvenanceCollector();
    const timeEntryResult = await runtime.toastHttpClient.getJsonDetailedCancellable({
      path: "/labor/v1/timeEntries",
      restaurantGuid: location.restaurantGuid,
      query: {
        startDate: bounds.startDate,
        endDate: bounds.endDate,
        includeArchived: true,
        includeMissedBreaks: true,
      },
      rateLimitKey: "labor-time-entries",
    }, { signal: options.signal });
    assertRestaurantResult(timeEntryResult, location.restaurantGuid);
    provenance.add(timeEntryResult);
    const entries = parseRequiredTimeEntries(timeEntryResult.body, input.businessDate);

    const jobsResult = await runtime.toastHttpClient.getJsonDetailedCancellable({
      path: "/labor/v1/jobs",
      restaurantGuid: location.restaurantGuid,
      rateLimitKey: "labor-jobs",
    }, { signal: options.signal });
    assertRestaurantResult(jobsResult, location.restaurantGuid);
    provenance.add(jobsResult);
    const jobs = parseRequired(laborJobsSchema, jobsResult.body, "labor_jobs_source_invalid");

    const breakPages = await runtime.toastHttpClient.getConfigurationPagesDetailedCancellable({
      path: "/config/v2/breakTypes",
      restaurantGuid: location.restaurantGuid,
      rateLimitKey: "config-break-types",
    }, { signal: options.signal });
    const breakTypes = [] as unknown[];
    for (const page of breakPages) {
      assertRestaurantResult(page, location.restaurantGuid);
      provenance.add(page);
      const parsed = parseRequired(laborBreakTypesSchema, page.body, "labor_break_types_source_invalid");
      breakTypes.push(...parsed);
    }

    const withholdingResult = await runtime.toastHttpClient.getJsonDetailedCancellable({
      path: "/config/v2/tipWithholding",
      restaurantGuid: location.restaurantGuid,
      rateLimitKey: "config-tip-withholding",
    }, { signal: options.signal });
    assertRestaurantResult(withholdingResult, location.restaurantGuid);
    provenance.add(withholdingResult);
    parseRequired(laborTipWithholdingSchema, withholdingResult.body, "labor_tip_withholding_source_invalid");

    const aggregate = foldLaborFacts(entries);
    const orders = await foldOrdersAttribution(runtime, location, input.businessDate, entries, provenance, options.signal);
    const result = Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: aggregate.activeTimeEntryCount === 0 ? "complete" as const : "incomplete" as const,
      report: "labor_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: location.restaurantGuid,
      restaurantName: location.name,
      businessDate: input.businessDate,
      requestedBusinessDate: input.businessDate,
      effectiveBusinessDate: input.businessDate,
      currencyCode: location.currencyCode,
      timezone: location.timezone,
      closeoutHour: location.closeoutHour,
      generatedAtEpochMs,
      contextFreshness,
      contextProvenance,
      jobsSourceCount: jobs.length,
      breakTypeSourceCount: breakTypes.length,
      provenance: provenance.snapshot(),
      ...aggregate,
      ...orders,
      formulaNotes: FORMULA_NOTES,
      warnings: Object.freeze(aggregate.activeTimeEntryCount === 0 ? [] : [
        "Active validated time entries make this labor result incomplete; source failures remain denied.",
      ]),
    });
    return result.status === "complete" ? result : result;
  } catch (error) {
    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "denied" as const,
      report: "labor_summary" as const,
      source: "standard_api" as const,
      restaurantGuid,
      restaurantName,
      businessDate: input.businessDate,
      requestedBusinessDate: input.businessDate,
      effectiveBusinessDate,
      generatedAtEpochMs,
      ...(contextFreshness === undefined ? {} : { contextFreshness }),
      ...(contextProvenance === undefined ? {} : { contextProvenance }),
      denial: denialFromError(error),
      missingScopes: Object.freeze([]),
      missingProvisionedScopes: Object.freeze([]),
      missingConnectionScopes: Object.freeze([]),
      excludedScopes: Object.freeze([]),
      formulaNotes: FORMULA_NOTES,
      warnings: Object.freeze([]),
    });
  }
}

function parseRequired<T extends { safeParse: (value: unknown) => { readonly success: boolean; readonly data?: unknown } }>(
  schema: T,
  value: unknown,
  code: string,
): any {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ReportComputationError(code, "A required labor source payload was invalid.");
  }
  return parsed.data;
}

function parseRequiredTimeEntries(value: unknown, businessDate: number): readonly LaborTimeEntryFact[] {
  try {
    return parseLaborTimeEntriesForBusinessDate(value, businessDate);
  } catch {
    throw new ReportComputationError(
      "labor_time_entries_source_invalid",
      "A required labor time-entry source payload was invalid.",
    );
  }
}

function foldLaborFacts(entries: readonly LaborTimeEntryFact[]): Omit<LaborSummaryAggregate, "ordersSalesMinor" | "ordersTipsMinor" | "ordersWithServerAttributionCount"> {
  let activeTimeEntryCount = 0;
  let deletedTimeEntryCount = 0;
  let archivedTimeEntryCount = 0;
  let revisedTimeEntryCount = 0;
  let salariedTimeEntryCount = 0;
  let regularHours = 0;
  let overtimeHours = 0;
  let regularWagesMinor = 0;
  let breakCount = 0;
  let missedBreakCount = 0;
  let includedTimeEntryCount = 0;

  for (const entry of entries) {
    if (entry.deleted) {
      deletedTimeEntryCount += 1;
      continue;
    }
    includedTimeEntryCount += 1;
    if (entry.active) activeTimeEntryCount += 1;
    if (entry.archived) archivedTimeEntryCount += 1;
    if (entry.revised) revisedTimeEntryCount += 1;
    if (entry.hourlyWage === null) salariedTimeEntryCount += 1;
    regularHours += entry.regularHours;
    overtimeHours += entry.overtimeHours;
    if (entry.hourlyWage !== null) {
      regularWagesMinor = addMinorUnits(
        regularWagesMinor,
        multiplyRegularWage(entry.hourlyWage, entry.regularHours),
      );
    }
    breakCount += entry.breaks.length;
    missedBreakCount += entry.breaks.filter((laborBreak) => laborBreak.missed).length;
  }

  return Object.freeze({
    timeEntryCount: includedTimeEntryCount,
    activeTimeEntryCount,
    deletedTimeEntryCount,
    archivedTimeEntryCount,
    revisedTimeEntryCount,
    salariedTimeEntryCount,
    regularHours,
    overtimeHours,
    regularWagesMinor,
    breakCount,
    missedBreakCount,
  });
}

async function foldOrdersAttribution(
  runtime: ApplicationRuntime,
  location: { readonly restaurantGuid: string; readonly timezone: string; readonly closeoutHour: number; readonly currencyCode: string },
  businessDate: number,
  entries: readonly LaborTimeEntryFact[],
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<Pick<LaborSummaryAggregate, "ordersSalesMinor" | "ordersTipsMinor" | "ordersWithServerAttributionCount">> {
  const employeeGuids = new Set(entries.filter((entry) => !entry.deleted).map((entry) => entry.employeeGuid));
  const state: MutableLaborFold = {
    employeeGuids,
    provenance,
    ordersSalesMinor: 0,
    ordersTipsMinor: 0,
    ordersWithServerAttributionCount: 0,
    pagesProcessed: 0,
  };
  await runtime.toastHttpClient.foldOrdersBulkPagesCancellable({
    restaurantGuid: location.restaurantGuid,
    query: { businessDate },
    pageSize: 100,
  }, state, (foldState, page, pageNumber) => {
    assertRestaurantResult(page, location.restaurantGuid);
    const normalized = normalizeOrdersPages({
      location: { ...location, name: "" as string, managementGroupGuid: undefined, connectionScopes: Object.freeze([]) },
      query: { mode: "business_date", businessDate },
      pages: [page],
    });
    foldState.provenance.add(page);
    foldState.pagesProcessed = pageNumber;
    for (const order of normalized.orders) {
      if (order.deleted || order.voided || order.serverGuid === undefined || !foldState.employeeGuids.has(order.serverGuid)) continue;
      foldState.ordersWithServerAttributionCount += 1;
      for (const check of order.checks) {
        if (check.deleted || check.voided) continue;
        foldState.ordersSalesMinor = addMinorUnits(foldState.ordersSalesMinor, check.amountHundredths);
        for (const payment of check.payments) {
          if (payment.voided) continue;
          foldState.ordersTipsMinor = addMinorUnits(
            foldState.ordersTipsMinor,
            payment.tipAmountHundredths,
            -(payment.refund?.tipRefundAmountHundredths ?? 0),
          );
        }
      }
    }
    return foldState;
  }, { signal });
  return Object.freeze({
    ordersSalesMinor: state.ordersSalesMinor,
    ordersTipsMinor: state.ordersTipsMinor,
    ordersWithServerAttributionCount: state.ordersWithServerAttributionCount,
  });
}

function assertRestaurantResult(
  result: ToastDetailedJsonResult,
  restaurantGuid: string,
): void {
  if (
    result.scope.kind !== "restaurant"
    || result.scope.restaurantGuid.toLowerCase() !== restaurantGuid.toLowerCase()
  ) {
    throw new ReportComputationError(
      "labor_source_restaurant_mismatch",
      "A labor source result was not scoped to the selected restaurant.",
    );
  }
}

function capabilityDenied(
  businessDate: number,
  generatedAtEpochMs: number,
  restaurantGuid: string,
  restaurantName: string,
  denial: CapabilityDenial,
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
): LaborSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied",
    report: "labor_summary",
    source: "standard_api",
    restaurantGuid,
    restaurantName,
    businessDate,
    requestedBusinessDate: businessDate,
    effectiveBusinessDate: businessDate,
    generatedAtEpochMs,
    contextFreshness,
    contextProvenance,
    denial: Object.freeze({ code: `capability_${denial.reason}`, retryable: false, upstreamStatus: undefined, upstreamRequestId: undefined }),
    missingScopes: denial.missingScopes,
    missingProvisionedScopes: denial.missingProvisionedScopes,
    missingConnectionScopes: denial.missingConnectionScopes,
    excludedScopes: denial.excludedScopes,
    formulaNotes: FORMULA_NOTES,
    warnings: Object.freeze([]),
  });
}

function assertBusinessDate(value: number): void {
  const text = String(value);
  const date = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
  if (!/^\d{8}$/u.test(text) || date.getUTCFullYear() !== Number(text.slice(0, 4)) || date.getUTCMonth() !== Number(text.slice(4, 6)) - 1 || date.getUTCDate() !== Number(text.slice(6, 8))) {
    throw new ReportComputationError("report_business_date_invalid", "Report business date must be a real calendar date in yyyyMMdd form.");
  }
}

function businessDateBounds(businessDate: number, timeZone: string, closeoutHour: number): { readonly startDate: string; readonly endDate: string } {
  if (!Number.isInteger(closeoutHour) || closeoutHour < 0 || closeoutHour > 23) {
    throw new ReportComputationError("labor_closeout_hour_invalid", "Restaurant closeout hour was invalid.");
  }
  const text = String(businessDate);
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  return Object.freeze({
    startDate: zonedInstant(year, month, day, closeoutHour, timeZone),
    endDate: zonedInstant(year, month, day + 1, closeoutHour, timeZone),
  });
}

function zonedInstant(year: number, month: number, day: number, hour: number, timeZone: string): string {
  const target = Date.UTC(year, month - 1, day, hour);
  let epochMs = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit",
  });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    epochMs += target - observed;
  }
  return new Date(epochMs).toISOString();
}

function multiplyRegularWage(hourlyWage: number, regularHours: number): number {
  const wageMinor = moneyToMinorUnits(hourlyWage, "labor hourly wage");
  const result = wageMinor * regularHours;
  if (!Number.isSafeInteger(result)) {
    throw new ReportComputationError("labor_regular_wage_precision_invalid", "Regular wage could not be represented exactly in minor units.");
  }
  return result;
}
