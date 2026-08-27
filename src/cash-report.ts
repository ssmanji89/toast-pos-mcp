import {
  cashDepositArraySchema,
  cashDrawerArraySchema,
  cashEntryArraySchema,
  noSaleReasonArraySchema,
  payoutReasonArraySchema,
  type CashDepositSource,
  type CashDrawerSource,
  type CashEntrySource,
  type NoSaleReasonSource,
  type PayoutReasonSource,
} from "./cash-report-source.js";
import {
  assertValidBusinessDate,
  cashSourceInvalid,
  foldCashSummary,
  type CashSummaryFold,
  type CashSummaryFoldInput,
} from "./cash-report-fold.js";
export {
  cashSourceInvalid,
  foldCashSummary,
  type CashDrawerReference,
  type CashEntryTypeTotal,
  type CashReasonReference,
  type CashSummaryFold,
  type CashSummaryFoldInput,
} from "./cash-report-fold.js";
import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import type { ToastLocationDiscoveryProvenance } from "./locations.js";
import type { ToastLocation } from "./locations.js";
import {
  STANDARD_REPORT_SCHEMA_VERSION,
  type ReportContextFreshness,
} from "./report-contract.js";
import {
  denialFromError,
  ReportProvenanceCollector,
  type ReportDenial,
  type ReportProvenance,
} from "./report-core.js";
import type { ApplicationRuntime } from "./runtime.js";
import type { ToastDetailedJsonResult } from "./transport.js";

const CASH_FORMULA_NOTES = Object.freeze([
  "Cash entries and deposits are separate Cash Management source facts; this report does not calculate guest cash payments or expected deposits.",
  "Amounts use exact two-decimal minor units. Open Toast cash-entry types remain separate aggregate buckets.",
  "A reversal is paired only when its undoes GUID is present in this invocation; cross-business-date reversals remain observed source facts.",
]);

const CASH_WARNINGS = Object.freeze([
  "Cash entry and deposit records are source-attributed Cash Management facts. They are not guest payment totals.",
]);

export interface CashSummaryComplete extends CashSummaryFold {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "complete";
  readonly report: "cash_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string;
  readonly restaurantName: string;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly currencyCode: string;
  readonly generatedAtEpochMs: number;
  readonly contextFreshness: ReportContextFreshness;
  readonly contextProvenance: ToastLocationDiscoveryProvenance;
  readonly provenance: ReportProvenance;
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export interface CashSummaryDenied {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "denied";
  readonly report: "cash_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string | undefined;
  readonly restaurantName: string | undefined;
  readonly businessDate: number;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number | undefined;
  readonly generatedAtEpochMs: number;
  readonly contextFreshness?: ReportContextFreshness;
  readonly contextProvenance?: ToastLocationDiscoveryProvenance;
  readonly denial: ReportDenial;
  readonly missingScopes: readonly string[];
  readonly missingProvisionedScopes: readonly string[];
  readonly missingConnectionScopes: readonly string[];
  readonly excludedScopes: readonly string[];
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export type CashSummaryResult = CashSummaryComplete | CashSummaryDenied;

interface CashReportState {
  readonly generatedAtEpochMs: number;
  readonly businessDate: number;
  resolvedRestaurantGuid: string | undefined;
  restaurantName: string | undefined;
  contextFreshness: ReportContextFreshness | undefined;
  contextProvenance: ToastLocationDiscoveryProvenance | undefined;
  effectiveBusinessDate: number | undefined;
}

interface ResolvedCashReportContext {
  readonly location: ToastLocation;
  readonly capability: ReturnType<typeof decideCapability>;
  readonly contextFreshness: ReportContextFreshness;
  readonly contextProvenance: ToastLocationDiscoveryProvenance;
}

interface LoadedCashSummary {
  readonly fold: CashSummaryFold;
  readonly provenance: ReportProvenance;
}

export async function buildCashSummaryReport(
  runtime: ApplicationRuntime,
  input: {
    readonly businessDate: number;
    readonly restaurantGuid?: string;
  },
  options: { readonly signal?: AbortSignal } = {},
): Promise<CashSummaryResult> {
  const state: CashReportState = {
    generatedAtEpochMs: runtime.now(),
    businessDate: input.businessDate,
    resolvedRestaurantGuid: input.restaurantGuid?.toLowerCase(),
    restaurantName: undefined,
    contextFreshness: undefined,
    contextProvenance: undefined,
    effectiveBusinessDate: undefined,
  };
  try {
    const context = await resolveCashReportContext(runtime, input, options.signal, state);
    if (context.capability.status === "denied") {
      return capabilityDenied(
        input.businessDate,
        state.generatedAtEpochMs,
        context.location.restaurantGuid,
        context.location.name,
        context.capability,
        context.contextFreshness,
        context.contextProvenance,
      );
    }
    return completeCashSummary(
      state,
      context,
      await loadCashSummaryFold(runtime, context.location.restaurantGuid, input.businessDate, options.signal),
    );
  } catch (error) {
    return deniedCashSummary(state, error);
  }
}

async function resolveCashReportContext(
  runtime: ApplicationRuntime,
  input: { readonly businessDate: number; readonly restaurantGuid?: string },
  signal: AbortSignal | undefined,
  state: CashReportState,
): Promise<ResolvedCashReportContext> {
  assertValidBusinessDate(input.businessDate);
  state.effectiveBusinessDate = input.businessDate;
  const locationContext = await runtime.getLocationContext(input.restaurantGuid, { signal });
  const { location, freshness: contextFreshness, provenance: contextProvenance } = locationContext;
  state.resolvedRestaurantGuid = location.restaurantGuid;
  state.restaurantName = location.name;
  state.contextFreshness = contextFreshness;
  state.contextProvenance = contextProvenance;
  const capability = decideCapability(
    await createCapabilityContext(runtime.tokenManager, location),
    {
      restaurantGuid: location.restaurantGuid,
      requiredScopes: ["cashmgmt:read", "config:read"],
    },
  );
  return Object.freeze({ location, capability, contextFreshness, contextProvenance });
}

async function loadCashSummaryFold(
  runtime: ApplicationRuntime,
  restaurantGuid: string,
  businessDate: number,
  signal: AbortSignal | undefined,
): Promise<LoadedCashSummary> {
  const provenance = new ReportProvenanceCollector();
  const entries = await readCashResult(
    runtime, "/cashmgmt/v1/entries", restaurantGuid, businessDate,
    "cash-entries", provenance, signal,
  );
  const deposits = await readCashResult(
    runtime, "/cashmgmt/v1/deposits", restaurantGuid, businessDate,
    "cash-deposits", provenance, signal,
  );
  const cashDrawers = await readConfigurationPages(
    runtime, "/config/v2/cashDrawers", restaurantGuid,
    "config-cash-drawers", provenance, signal,
  );
  const noSaleReasons = await readConfigurationPages(
    runtime, "/config/v2/noSaleReasons", restaurantGuid,
    "config-no-sale-reasons", provenance, signal,
  );
  const payoutReasons = await readConfigurationPages(
    runtime, "/config/v2/payoutReasons", restaurantGuid,
    "config-payout-reasons", provenance, signal,
  );
  return Object.freeze({
    fold: foldCashSummary({
      businessDate,
      entries: parseEntries(entries.body),
      deposits: parseDeposits(deposits.body),
      cashDrawers: parseConfigurationPages(cashDrawers, parseCashDrawers),
      noSaleReasons: parseConfigurationPages(noSaleReasons, parseNoSaleReasons),
      payoutReasons: parseConfigurationPages(payoutReasons, parsePayoutReasons),
    }),
    provenance: provenance.snapshot(),
  });
}

function completeCashSummary(
  state: CashReportState,
  context: ResolvedCashReportContext,
  loaded: LoadedCashSummary,
): CashSummaryComplete {
  const { location } = context;
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "complete" as const,
    report: "cash_summary" as const,
    source: "standard_api" as const,
    restaurantGuid: location.restaurantGuid,
    restaurantName: location.name,
    requestedBusinessDate: state.businessDate,
    effectiveBusinessDate: state.businessDate,
    timezone: location.timezone,
    closeoutHour: location.closeoutHour,
    currencyCode: location.currencyCode,
    generatedAtEpochMs: state.generatedAtEpochMs,
    contextFreshness: context.contextFreshness,
    contextProvenance: context.contextProvenance,
    provenance: loaded.provenance,
    formulaNotes: CASH_FORMULA_NOTES,
    warnings: cashWarnings(loaded.fold),
    ...loaded.fold,
  });
}

function deniedCashSummary(state: CashReportState, error: unknown): CashSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "cash_summary" as const,
    source: "standard_api" as const,
    restaurantGuid: state.resolvedRestaurantGuid,
    restaurantName: state.restaurantName,
    businessDate: state.businessDate,
    requestedBusinessDate: state.businessDate,
    effectiveBusinessDate: state.effectiveBusinessDate,
    generatedAtEpochMs: state.generatedAtEpochMs,
    ...(state.contextFreshness === undefined ? {} : { contextFreshness: state.contextFreshness }),
    ...(state.contextProvenance === undefined ? {} : { contextProvenance: state.contextProvenance }),
    denial: denialFromError(error),
    missingScopes: Object.freeze([]),
    missingProvisionedScopes: Object.freeze([]),
    missingConnectionScopes: Object.freeze([]),
    excludedScopes: Object.freeze([]),
    formulaNotes: CASH_FORMULA_NOTES,
    warnings: CASH_WARNINGS,
  });
}

function cashWarnings(fold: CashSummaryFold): readonly string[] {
  const unresolvedCount =
    fold.unresolvedCrossDateReversalCount
    + fold.unresolvedCrossDateDepositReversalCount;
  if (unresolvedCount === 0) return CASH_WARNINGS;
  return Object.freeze([
    ...CASH_WARNINGS,
    `${unresolvedCount} observed reversal reference(s) point outside this business-date invocation and were not netted.`,
  ]);
}

async function readCashResult(
  runtime: ApplicationRuntime,
  path: `/${string}`,
  restaurantGuid: string,
  businessDate: number,
  rateLimitKey: string,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<ToastDetailedJsonResult> {
  const result = await runtime.toastHttpClient.getJsonDetailedCancellable(
    { path, restaurantGuid, query: { businessDate }, rateLimitKey },
    { signal },
  );
  assertRestaurantSource(result, restaurantGuid);
  provenance.add(result);
  return result;
}

async function readConfigurationPages(
  runtime: ApplicationRuntime,
  path: `/${string}`,
  restaurantGuid: string,
  rateLimitKey: string,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<readonly ToastDetailedJsonResult[]> {
  const pages = await runtime.toastHttpClient.getConfigurationPagesDetailedCancellable(
    { path, restaurantGuid, rateLimitKey },
    { signal },
  );
  if (pages.length === 0) throw cashSourceInvalid();
  for (const page of pages) {
    assertRestaurantSource(page, restaurantGuid);
    provenance.add(page);
  }
  return pages;
}

function parseEntries(body: unknown): readonly CashEntrySource[] {
  const parsed = cashEntryArraySchema.safeParse(body);
  if (!parsed.success) throw cashSourceInvalid();
  return Object.freeze([...parsed.data]);
}

function parseDeposits(body: unknown): readonly CashDepositSource[] {
  const parsed = cashDepositArraySchema.safeParse(body);
  if (!parsed.success) throw cashSourceInvalid();
  return Object.freeze([...parsed.data]);
}

function parseCashDrawers(body: unknown): readonly CashDrawerSource[] {
  const parsed = cashDrawerArraySchema.safeParse(body);
  if (!parsed.success) throw cashSourceInvalid();
  return Object.freeze([...parsed.data]);
}

function parseNoSaleReasons(body: unknown): readonly NoSaleReasonSource[] {
  const parsed = noSaleReasonArraySchema.safeParse(body);
  if (!parsed.success) throw cashSourceInvalid();
  return Object.freeze([...parsed.data]);
}

function parsePayoutReasons(body: unknown): readonly PayoutReasonSource[] {
  const parsed = payoutReasonArraySchema.safeParse(body);
  if (!parsed.success) throw cashSourceInvalid();
  return Object.freeze([...parsed.data]);
}

function parseConfigurationPages<T>(
  pages: readonly ToastDetailedJsonResult[],
  parse: (body: unknown) => readonly T[],
): readonly T[] {
  return Object.freeze(pages.flatMap((page) => parse(page.body)));
}

function assertRestaurantSource(
  result: ToastDetailedJsonResult,
  restaurantGuid: string,
): void {
  if (
    result.apiFamily !== "standard"
    || result.scope.kind !== "restaurant"
    || result.scope.restaurantGuid.toLowerCase() !== restaurantGuid.toLowerCase()
  ) throw cashSourceInvalid();
}

function capabilityDenied(
  businessDate: number,
  generatedAtEpochMs: number,
  restaurantGuid: string,
  restaurantName: string,
  denial: CapabilityDenial,
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
): CashSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "cash_summary" as const,
    source: "standard_api" as const,
    restaurantGuid,
    restaurantName,
    businessDate,
    requestedBusinessDate: businessDate,
    effectiveBusinessDate: businessDate,
    generatedAtEpochMs,
    contextFreshness,
    contextProvenance,
    denial: Object.freeze({
      code: `capability_${denial.reason}`,
      retryable: false,
      upstreamStatus: undefined,
      upstreamRequestId: undefined,
    }),
    missingScopes: denial.missingScopes,
    missingProvisionedScopes: denial.missingProvisionedScopes,
    missingConnectionScopes: denial.missingConnectionScopes,
    excludedScopes: denial.excludedScopes,
    formulaNotes: CASH_FORMULA_NOTES,
    warnings: CASH_WARNINGS,
  });
}
