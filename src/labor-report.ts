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
import type { ToastLocation, ToastLocationDiscoveryProvenance } from "./locations.js";
import { normalizeOrdersPages } from "./orders-normalization.js";
import { SalesCrossPageIdentityGuard } from "./sales-cross-page-identity.js";
import { STANDARD_REPORT_SCHEMA_VERSION, type ReportContextFreshness } from "./report-contract.js";
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
const JOB_BATCH_SIZE = 100;
const CREDIT_CARD_PAYMENT_TYPES = new Set(["CREDIT", "CREDIT_CARD"]);
const FORMULA_NOTES = Object.freeze([
  "Labor time-entry, job, break-type, and tip-withholding sources are Standard API facts scoped to the selected restaurant.",
  "Employee sales and tips use matching non-voided Orders payments less explicit refunds; check totals are not employee-payment attribution.",
  "Tip withholding applies only to eligible credit-card tips. Total tips, withholding basis, withheld tips, and net tips are reported separately.",
  "Regular wages round each hourly-wage by regular-hours product to the nearest minor unit, with an exact half minor unit rounded up. Overtime hours have no overtime wage because Toast provides no multiplier source.",
]);

export interface LaborSummaryAggregate {
  readonly timeEntryCount: number;
  readonly activeTimeEntryCount: number;
  readonly deletedTimeEntryCount: number;
  readonly excludedJobTimeEntryCount: number;
  readonly salariedTimeEntryCount: number;
  readonly regularHours: number;
  readonly overtimeHours: number;
  readonly regularWagesMinor: number;
  readonly breakCount: number;
  readonly missedBreakCount: number;
  readonly ordersSalesMinor: number;
  readonly ordersTipsMinor: number;
  readonly tipWithholdingEnabled: boolean;
  readonly tipWithholdingBasisMinor: number;
  readonly tipWithholdingMinor: number;
  readonly netOrdersTipsMinor: number;
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

export type LaborSummaryResult = LaborSummaryComplete | LaborSummaryIncomplete | LaborSummaryDenied;

interface EligibleContext {
  readonly location: ToastLocation;
  readonly freshness: ReportContextFreshness;
  readonly provenance: ToastLocationDiscoveryProvenance;
}

interface LaborSources {
  readonly entries: readonly LaborTimeEntryFact[];
  readonly jobs: readonly LaborJob[];
  readonly breakTypeSourceCount: number;
  readonly tipWithholding: TipWithholding;
}

interface LaborJob { readonly guid: string; readonly excludeFromReporting: boolean; }
interface TipWithholding { readonly enabled: boolean; readonly percentage: number; }
interface OrdersAttribution {
  readonly ordersSalesMinor: number;
  readonly ordersTipsMinor: number;
  readonly creditCardTipsMinor: number;
  readonly ordersWithServerAttributionCount: number;
}

interface MutableOrdersFold {
  readonly employeeGuids: ReadonlySet<string>;
  readonly identityGuard: SalesCrossPageIdentityGuard;
  readonly provenance: ReportProvenanceCollector;
  ordersSalesMinor: number;
  ordersTipsMinor: number;
  creditCardTipsMinor: number;
  ordersWithServerAttributionCount: number;
}

export async function buildLaborSummaryReport(
  runtime: ApplicationRuntime,
  input: { readonly businessDate: number; readonly restaurantGuid?: string },
  options: { readonly signal?: AbortSignal } = {},
): Promise<LaborSummaryResult> {
  const generatedAtEpochMs = runtime.now();
  let context: EligibleContext | undefined;
  try {
    assertBusinessDate(input.businessDate);
    const resolved = await resolveEligibleContext(runtime, input.restaurantGuid, options.signal);
    if ("denial" in resolved) return capabilityDenied(input.businessDate, generatedAtEpochMs, resolved);
    context = resolved;
    return await buildEligibleLaborSummary(runtime, input.businessDate, context, generatedAtEpochMs, options.signal);
  } catch (error) {
    return deniedFromError(input.businessDate, generatedAtEpochMs, context, input.restaurantGuid, error);
  }
}

async function resolveEligibleContext(
  runtime: ApplicationRuntime,
  requestedRestaurantGuid: string | undefined,
  signal: AbortSignal | undefined,
): Promise<EligibleContext | { readonly denial: CapabilityDenial; readonly location: ToastLocation; readonly freshness: ReportContextFreshness; readonly provenance: ToastLocationDiscoveryProvenance }> {
  const locationContext = await runtime.getLocationContext(requestedRestaurantGuid, { signal });
  const capability = decideCapability(
    await createCapabilityContext(runtime.tokenManager, locationContext.location),
    { restaurantGuid: locationContext.location.restaurantGuid, requiredScopes: REQUIRED_SCOPES },
  );
  if (capability.status === "denied") return { denial: capability, ...locationContext };
  return locationContext;
}

async function buildEligibleLaborSummary(
  runtime: ApplicationRuntime,
  businessDate: number,
  context: EligibleContext,
  generatedAtEpochMs: number,
  signal: AbortSignal | undefined,
): Promise<LaborSummaryComplete | LaborSummaryIncomplete> {
  const provenance = new ReportProvenanceCollector();
  const sources = await loadLaborSources(runtime, context.location, businessDate, provenance, signal);
  const excludedJobs = excludedJobGuids(sources.jobs);
  const aggregate = foldLaborFacts(sources.entries, excludedJobs);
  const orders = await foldOrdersAttribution(runtime, context.location, businessDate, sources.entries, excludedJobs, provenance, signal);
  return completeResult(context, businessDate, generatedAtEpochMs, sources, provenance, aggregate, orders);
}

async function loadLaborSources(
  runtime: ApplicationRuntime,
  location: ToastLocation,
  businessDate: number,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<LaborSources> {
  const entries = await loadTimeEntries(runtime, location, businessDate, provenance, signal);
  const jobs = await loadJobsForEntries(runtime, location.restaurantGuid, entries, provenance, signal);
  const breakTypeSourceCount = await loadBreakTypeCount(runtime, location.restaurantGuid, provenance, signal);
  const tipWithholding = await loadTipWithholding(runtime, location.restaurantGuid, provenance, signal);
  return Object.freeze({ entries, jobs, breakTypeSourceCount, tipWithholding });
}

async function loadTimeEntries(
  runtime: ApplicationRuntime,
  location: ToastLocation,
  businessDate: number,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<readonly LaborTimeEntryFact[]> {
  const bounds = businessDateBounds(businessDate, location.timezone, location.closeoutHour);
  const result = await runtime.toastHttpClient.getJsonDetailedCancellable({
    path: "/labor/v1/timeEntries", restaurantGuid: location.restaurantGuid,
    query: { startDate: bounds.startDate, endDate: bounds.endDate, includeArchived: true, includeMissedBreaks: true },
    rateLimitKey: "labor-time-entries",
  }, { signal });
  observeResult(result, location.restaurantGuid, provenance);
  return parseRequiredTimeEntries(result.body, businessDate);
}

async function loadJobsForEntries(
  runtime: ApplicationRuntime,
  restaurantGuid: string,
  entries: readonly LaborTimeEntryFact[],
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<readonly LaborJob[]> {
  const requestedGuids = distinctJobGuids(entries);
  const jobs: LaborJob[] = [];
  for (const batch of chunks(requestedGuids, JOB_BATCH_SIZE)) {
    const result = await runtime.toastHttpClient.getJsonDetailedCancellable({
      path: "/labor/v1/jobs", restaurantGuid, query: { jobIds: batch.join(",") }, rateLimitKey: "labor-jobs",
    }, { signal });
    observeResult(result, restaurantGuid, provenance);
    const parsed = parseRequired(laborJobsSchema, result.body, "labor_jobs_source_invalid") as readonly { readonly guid: string; readonly excludeFromReporting: boolean }[];
    jobs.push(...parsed.map((job) => Object.freeze({ guid: job.guid.toLowerCase(), excludeFromReporting: job.excludeFromReporting })));
  }
  assertResolvedJobGuids(requestedGuids, jobs);
  return Object.freeze(jobs);
}

async function loadBreakTypeCount(
  runtime: ApplicationRuntime,
  restaurantGuid: string,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<number> {
  const pages = await runtime.toastHttpClient.getConfigurationPagesDetailedCancellable({
    path: "/config/v2/breakTypes", restaurantGuid, rateLimitKey: "config-break-types",
  }, { signal });
  let count = 0;
  for (const page of pages) {
    observeResult(page, restaurantGuid, provenance);
    count += (parseRequired(laborBreakTypesSchema, page.body, "labor_break_types_source_invalid") as readonly unknown[]).length;
  }
  return count;
}

async function loadTipWithholding(
  runtime: ApplicationRuntime,
  restaurantGuid: string,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<TipWithholding> {
  const result = await runtime.toastHttpClient.getJsonDetailedCancellable({
    path: "/config/v2/tipWithholding", restaurantGuid, rateLimitKey: "config-tip-withholding",
  }, { signal });
  observeResult(result, restaurantGuid, provenance);
  const parsed = parseRequired(laborTipWithholdingSchema, result.body, "labor_tip_withholding_source_invalid") as TipWithholding;
  return Object.freeze({ enabled: parsed.enabled, percentage: parsed.percentage });
}

function foldLaborFacts(entries: readonly LaborTimeEntryFact[], excludedJobs: ReadonlySet<string>): Omit<LaborSummaryAggregate, "ordersSalesMinor" | "ordersTipsMinor" | "tipWithholdingEnabled" | "tipWithholdingBasisMinor" | "tipWithholdingMinor" | "netOrdersTipsMinor" | "ordersWithServerAttributionCount"> {
  const state = { active: 0, deleted: 0, excluded: 0, salaried: 0, regularHours: 0, overtimeHours: 0, regularWagesMinor: 0, breaks: 0, missedBreaks: 0, included: 0 };
  for (const entry of entries) {
    if (entry.deleted) { state.deleted += 1; continue; }
    if (excludedJobs.has(entry.jobGuid)) { state.excluded += 1; continue; }
    state.included += 1;
    if (entry.active) state.active += 1;
    if (entry.hourlyWage === null) state.salaried += 1;
    state.regularHours += entry.regularHours;
    state.overtimeHours += entry.overtimeHours;
    if (entry.hourlyWage !== null) state.regularWagesMinor = addMinorUnits(state.regularWagesMinor, multiplyRegularWage(entry.hourlyWage, entry.regularHours));
    state.breaks += entry.breaks.length;
    state.missedBreaks += entry.breaks.filter((laborBreak) => laborBreak.missed && !laborBreak.waived).length;
  }
  return Object.freeze({ timeEntryCount: state.included, activeTimeEntryCount: state.active, deletedTimeEntryCount: state.deleted, excludedJobTimeEntryCount: state.excluded, salariedTimeEntryCount: state.salaried, regularHours: state.regularHours, overtimeHours: state.overtimeHours, regularWagesMinor: state.regularWagesMinor, breakCount: state.breaks, missedBreakCount: state.missedBreaks });
}

async function foldOrdersAttribution(
  runtime: ApplicationRuntime,
  location: ToastLocation,
  businessDate: number,
  entries: readonly LaborTimeEntryFact[],
  excludedJobs: ReadonlySet<string>,
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<OrdersAttribution> {
  const employeeGuids = new Set(entries.filter((entry) => !entry.deleted && !excludedJobs.has(entry.jobGuid)).map((entry) => entry.employeeGuid));
  const state: MutableOrdersFold = { employeeGuids, identityGuard: new SalesCrossPageIdentityGuard(), provenance, ordersSalesMinor: 0, ordersTipsMinor: 0, creditCardTipsMinor: 0, ordersWithServerAttributionCount: 0 };
  await runtime.toastHttpClient.foldOrdersBulkPagesCancellable({ restaurantGuid: location.restaurantGuid, query: { businessDate }, pageSize: 100 }, state, (fold, page) => foldOrdersPage(fold, page, location, businessDate), { signal });
  return Object.freeze({ ordersSalesMinor: state.ordersSalesMinor, ordersTipsMinor: state.ordersTipsMinor, creditCardTipsMinor: state.creditCardTipsMinor, ordersWithServerAttributionCount: state.ordersWithServerAttributionCount });
}

function foldOrdersPage(state: MutableOrdersFold, page: ToastDetailedJsonResult, location: ToastLocation, businessDate: number): MutableOrdersFold {
  observeResult(page, location.restaurantGuid, state.provenance);
  const normalized = normalizeOrdersPages({ location, query: { mode: "business_date", businessDate }, pages: [page] });
  for (const order of normalized.orders) {
    state.identityGuard.observeOrder(order);
    if (order.deleted || order.voided || order.serverGuid === undefined || !state.employeeGuids.has(order.serverGuid)) continue;
    state.ordersWithServerAttributionCount += 1;
    for (const check of order.checks) {
      if (check.deleted || check.voided) continue;
      for (const payment of check.payments) addPaymentAttribution(state, payment);
    }
  }
  return state;
}

function addPaymentAttribution(state: MutableOrdersFold, payment: { readonly voided: boolean; readonly type: string; readonly amountHundredths: number; readonly tipAmountHundredths: number; readonly refund: { readonly refundAmountHundredths: number; readonly tipRefundAmountHundredths: number } | undefined }): void {
  if (payment.voided) return;
  const salesMinor = addMinorUnits(payment.amountHundredths, -(payment.refund?.refundAmountHundredths ?? 0));
  const tipsMinor = addMinorUnits(payment.tipAmountHundredths, -(payment.refund?.tipRefundAmountHundredths ?? 0));
  state.ordersSalesMinor = addMinorUnits(state.ordersSalesMinor, salesMinor);
  state.ordersTipsMinor = addMinorUnits(state.ordersTipsMinor, tipsMinor);
  if (CREDIT_CARD_PAYMENT_TYPES.has(payment.type)) state.creditCardTipsMinor = addMinorUnits(state.creditCardTipsMinor, tipsMinor);
}

function completeResult(context: EligibleContext, businessDate: number, generatedAtEpochMs: number, sources: LaborSources, provenance: ReportProvenanceCollector, aggregate: Omit<LaborSummaryAggregate, "ordersSalesMinor" | "ordersTipsMinor" | "tipWithholdingEnabled" | "tipWithholdingBasisMinor" | "tipWithholdingMinor" | "netOrdersTipsMinor" | "ordersWithServerAttributionCount">, orders: OrdersAttribution): LaborSummaryComplete | LaborSummaryIncomplete {
  const tipWithholdingMinor = sources.tipWithholding.enabled ? multiplyAndRoundMinor(orders.creditCardTipsMinor, sources.tipWithholding.percentage) : 0;
  const status = aggregate.activeTimeEntryCount === 0 ? "complete" as const : "incomplete" as const;
  return Object.freeze({ schemaVersion: STANDARD_REPORT_SCHEMA_VERSION, status, report: "labor_summary", source: "standard_api", restaurantGuid: context.location.restaurantGuid, restaurantName: context.location.name, businessDate, requestedBusinessDate: businessDate, effectiveBusinessDate: businessDate, currencyCode: context.location.currencyCode, timezone: context.location.timezone, closeoutHour: context.location.closeoutHour, generatedAtEpochMs, contextFreshness: context.freshness, contextProvenance: context.provenance, jobsSourceCount: sources.jobs.length, breakTypeSourceCount: sources.breakTypeSourceCount, provenance: provenance.snapshot(), ...aggregate, ordersSalesMinor: orders.ordersSalesMinor, ordersTipsMinor: orders.ordersTipsMinor, ordersWithServerAttributionCount: orders.ordersWithServerAttributionCount, tipWithholdingEnabled: sources.tipWithholding.enabled, tipWithholdingBasisMinor: orders.creditCardTipsMinor, tipWithholdingMinor, netOrdersTipsMinor: addMinorUnits(orders.ordersTipsMinor, -tipWithholdingMinor), formulaNotes: FORMULA_NOTES, warnings: Object.freeze(status === "complete" ? [] : ["Active validated time entries make this labor result incomplete; source failures remain denied."]) });
}

function capabilityDenied(businessDate: number, generatedAtEpochMs: number, context: { readonly denial: CapabilityDenial; readonly location: ToastLocation; readonly freshness: ReportContextFreshness; readonly provenance: ToastLocationDiscoveryProvenance }): LaborSummaryDenied {
  return Object.freeze({ schemaVersion: STANDARD_REPORT_SCHEMA_VERSION, status: "denied", report: "labor_summary", source: "standard_api", restaurantGuid: context.location.restaurantGuid, restaurantName: context.location.name, businessDate, requestedBusinessDate: businessDate, effectiveBusinessDate: businessDate, generatedAtEpochMs, contextFreshness: context.freshness, contextProvenance: context.provenance, denial: Object.freeze({ code: `capability_${context.denial.reason}`, retryable: false, upstreamStatus: undefined, upstreamRequestId: undefined }), missingScopes: context.denial.missingScopes, missingProvisionedScopes: context.denial.missingProvisionedScopes, missingConnectionScopes: context.denial.missingConnectionScopes, excludedScopes: context.denial.excludedScopes, formulaNotes: FORMULA_NOTES, warnings: Object.freeze([]) });
}

function deniedFromError(businessDate: number, generatedAtEpochMs: number, context: EligibleContext | undefined, requestedRestaurantGuid: string | undefined, error: unknown): LaborSummaryDenied {
  return Object.freeze({ schemaVersion: STANDARD_REPORT_SCHEMA_VERSION, status: "denied", report: "labor_summary", source: "standard_api", restaurantGuid: context?.location.restaurantGuid ?? requestedRestaurantGuid?.toLowerCase(), restaurantName: context?.location.name, businessDate, requestedBusinessDate: businessDate, effectiveBusinessDate: undefined, generatedAtEpochMs, ...(context === undefined ? {} : { contextFreshness: context.freshness, contextProvenance: context.provenance }), denial: denialFromError(error), missingScopes: Object.freeze([]), missingProvisionedScopes: Object.freeze([]), missingConnectionScopes: Object.freeze([]), excludedScopes: Object.freeze([]), formulaNotes: FORMULA_NOTES, warnings: Object.freeze([]) });
}

function observeResult(result: ToastDetailedJsonResult, restaurantGuid: string, provenance: ReportProvenanceCollector): void {
  if (result.scope.kind !== "restaurant" || result.scope.restaurantGuid.toLowerCase() !== restaurantGuid.toLowerCase()) throw new ReportComputationError("labor_source_restaurant_mismatch", "A labor source result was not scoped to the selected restaurant.");
  provenance.add(result);
}

function parseRequired<T extends { safeParse: (value: unknown) => { readonly success: boolean; readonly data?: unknown } }>(schema: T, value: unknown, code: string): unknown {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ReportComputationError(code, "A required labor source payload was invalid.");
  return parsed.data;
}

function parseRequiredTimeEntries(value: unknown, businessDate: number): readonly LaborTimeEntryFact[] {
  try { return parseLaborTimeEntriesForBusinessDate(value, businessDate); }
  catch { throw new ReportComputationError("labor_time_entries_source_invalid", "A required labor time-entry source payload was invalid."); }
}

function distinctJobGuids(entries: readonly LaborTimeEntryFact[]): readonly string[] {
  return Object.freeze([...new Set(entries.map((entry) => entry.jobGuid))]);
}

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return Object.freeze(result.map((batch) => Object.freeze(batch)));
}

function assertResolvedJobGuids(requestedGuids: readonly string[], jobs: readonly LaborJob[]): void {
  const returned = new Set(jobs.map((job) => job.guid));
  if (requestedGuids.some((guid) => !returned.has(guid))) throw new ReportComputationError("labor_jobs_unresolved", "A referenced TimeEntry job was not returned by the bounded job lookup.");
}

function excludedJobGuids(jobs: readonly LaborJob[]): ReadonlySet<string> {
  return new Set(jobs.filter((job) => job.excludeFromReporting).map((job) => job.guid));
}

function assertBusinessDate(value: number): void {
  const text = String(value);
  const date = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
  if (!/^\d{8}$/u.test(text) || date.getUTCFullYear() !== Number(text.slice(0, 4)) || date.getUTCMonth() !== Number(text.slice(4, 6)) - 1 || date.getUTCDate() !== Number(text.slice(6, 8))) throw new ReportComputationError("report_business_date_invalid", "Report business date must be a real calendar date in yyyyMMdd form.");
}

function businessDateBounds(businessDate: number, timeZone: string, closeoutHour: number): { readonly startDate: string; readonly endDate: string } {
  if (!Number.isInteger(closeoutHour) || closeoutHour < 0 || closeoutHour > 23) throw new ReportComputationError("labor_closeout_hour_invalid", "Restaurant closeout hour was invalid.");
  const text = String(businessDate);
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  return Object.freeze({ startDate: zonedInstant(year, month, day, closeoutHour, timeZone), endDate: zonedInstant(year, month, day + 1, closeoutHour, timeZone) });
}

function zonedInstant(year: number, month: number, day: number, hour: number, timeZone: string): string {
  const target = Date.UTC(year, month - 1, day, hour);
  let epochMs = target;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit" });
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const observed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    epochMs += target - observed;
  }
  return new Date(epochMs).toISOString();
}

function multiplyRegularWage(hourlyWage: number, regularHours: number): number {
  return multiplyAndRoundMinor(moneyToMinorUnits(hourlyWage, "labor hourly wage"), regularHours);
}

function multiplyAndRoundMinor(minorUnits: number, factor: number): number {
  if (!Number.isSafeInteger(minorUnits) || !Number.isFinite(factor) || factor < 0) throw new ReportComputationError("labor_regular_wage_precision_invalid", "Labor value could not be represented safely.");
  const scale = 1_000_000_000;
  const scaledFactor = Math.round(factor * scale);
  if (!Number.isSafeInteger(scaledFactor)) throw new ReportComputationError("labor_regular_wage_precision_invalid", "Labor hours exceeded supported precision.");
  const rounded = (BigInt(minorUnits) * BigInt(scaledFactor) + BigInt(scale / 2)) / BigInt(scale);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new ReportComputationError("labor_regular_wage_precision_invalid", "Labor total exceeded safe integer precision.");
  return Number(rounded);
}
