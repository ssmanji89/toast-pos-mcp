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

const CASH_FORMULA_NOTES = Object.freeze([
  "Cash entries and deposits are separate Cash Management source facts; this report does not calculate guest cash payments or expected deposits.",
  "Amounts use exact two-decimal minor units. Open Toast cash-entry types remain separate aggregate buckets.",
  "A reversal is paired only when its undoes GUID is present in this invocation; cross-business-date reversals remain observed source facts.",
]);

const CASH_WARNINGS = Object.freeze([
  "Cash entry and deposit records are source-attributed Cash Management facts. They are not guest payment totals.",
]);

export interface CashEntryTypeTotal {
  readonly type: string;
  readonly entryCount: number;
  readonly amountMinor: number;
}

export interface CashDrawerReference {
  readonly drawerGuid: string;
  readonly entryCount: number;
  readonly resolved: boolean;
}

export interface CashReasonReference {
  readonly reasonGuid: string;
  readonly entryCount: number;
  readonly resolved: boolean;
}

export interface CashSummaryFold {
  readonly businessDate: number;
  readonly cashEntryCount: number;
  readonly depositCount: number;
  readonly cashEntryAmountMinor: number;
  readonly depositAmountMinor: number;
  readonly noSaleCount: number;
  readonly cashEntriesWithoutDrawerCount: number;
  readonly cashInCount: number;
  readonly cashOutCount: number;
  readonly cashCollectedCount: number;
  readonly tipOutCount: number;
  readonly payoutCount: number;
  readonly reimbursementCount: number;
  readonly closeoutCount: number;
  readonly observedReversalCount: number;
  readonly unresolvedCrossDateReversalCount: number;
  readonly observedDepositReversalCount: number;
  readonly unresolvedCrossDateDepositReversalCount: number;
  readonly cashEntryTotalsByType: readonly CashEntryTypeTotal[];
  readonly cashDrawerReferences: readonly CashDrawerReference[];
  readonly noSaleReasonReferences: readonly CashReasonReference[];
  readonly payoutReasonReferences: readonly CashReasonReference[];
}

export interface CashSummaryFoldInput {
  readonly businessDate: number;
  readonly entries: readonly CashEntrySource[];
  readonly deposits: readonly CashDepositSource[];
  readonly cashDrawers: readonly CashDrawerSource[];
  readonly noSaleReasons: readonly NoSaleReasonSource[];
  readonly payoutReasons: readonly PayoutReasonSource[];
}

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

interface MutableTypeTotal {
  entryCount: number;
  amountMinor: number;
}

interface MutableDrawerReference {
  entryCount: number;
}

interface MutableReasonReference {
  entryCount: number;
}

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

/**
 * This pure fold reports observed cash-management facts. It deliberately does
 * not use Orders, infer guest cash payments, or calculate expected deposits.
 */
export function foldCashSummary(input: CashSummaryFoldInput): CashSummaryFold {
  assertValidBusinessDate(input.businessDate);
  const entryGuids = new Set<string>();
  const typeTotals = new Map<string, MutableTypeTotal>();
  const drawerReferences = new Map<string, MutableDrawerReference>();
  const noSaleReasonReferences = new Map<string, MutableReasonReference>();
  const payoutReasonReferences = new Map<string, MutableReasonReference>();
  const cashDrawerGuids = new Set(input.cashDrawers.map((drawer) => drawer.guid));
  const noSaleReasonGuids = new Set(input.noSaleReasons.map((reason) => reason.guid));
  const payoutReasonGuids = new Set(input.payoutReasons.map((reason) => reason.guid));
  let cashEntryAmountMinor = 0;
  let depositAmountMinor = 0;
  let noSaleCount = 0;
  let cashEntriesWithoutDrawerCount = 0;
  let cashInCount = 0;
  let cashOutCount = 0;
  let cashCollectedCount = 0;
  let tipOutCount = 0;
  let payoutCount = 0;
  let reimbursementCount = 0;
  let closeoutCount = 0;
  let observedReversalCount = 0;
  let unresolvedCrossDateReversalCount = 0;
  let observedDepositReversalCount = 0;
  let unresolvedCrossDateDepositReversalCount = 0;

  for (const entry of input.entries) entryGuids.add(entry.guid);
  for (const entry of input.entries) {
    const amountMinor = moneyToMinorUnits(entry.amount, "cashEntry.amount");
    cashEntryAmountMinor = addMinorUnits(cashEntryAmountMinor, amountMinor);
    const typeTotal = typeTotals.get(entry.type) ?? {
      entryCount: 0,
      amountMinor: 0,
    };
    typeTotal.entryCount += 1;
    typeTotal.amountMinor = addMinorUnits(typeTotal.amountMinor, amountMinor);
    typeTotals.set(entry.type, typeTotal);
    if (entry.cashDrawer === undefined || entry.cashDrawer === null) {
      cashEntriesWithoutDrawerCount += 1;
    } else {
      incrementDrawer(drawerReferences, entry.cashDrawer.guid);
    }
    incrementEntryKind(entry.type, {
      noSale: () => { noSaleCount += 1; },
      cashIn: () => { cashInCount += 1; },
      cashOut: () => { cashOutCount += 1; },
      cashCollected: () => { cashCollectedCount += 1; },
      tipOut: () => { tipOutCount += 1; },
      payout: () => { payoutCount += 1; },
      reimbursement: () => { reimbursementCount += 1; },
      closeout: () => { closeoutCount += 1; },
    });
    if (entry.noSaleReason !== undefined && entry.noSaleReason !== null) {
      incrementReason(noSaleReasonReferences, entry.noSaleReason.guid);
    }
    if (entry.payoutReason !== undefined && entry.payoutReason !== null) {
      incrementReason(payoutReasonReferences, entry.payoutReason.guid);
    }
    if (entry.undoes !== undefined && entry.undoes !== null) {
      observedReversalCount += 1;
      if (!entryGuids.has(entry.undoes)) unresolvedCrossDateReversalCount += 1;
    }
  }

  const depositGuids = new Set(input.deposits.map((deposit) => deposit.guid));
  for (const deposit of input.deposits) {
    const amountMinor = moneyToMinorUnits(deposit.amount, "cashDeposit.amount");
    const undoneDepositGuid = deposit.undoes;
    const isReversal = undoneDepositGuid !== undefined && undoneDepositGuid !== null;
    depositAmountMinor = addMinorUnits(
      depositAmountMinor,
      isReversal ? -amountMinor : amountMinor,
    );
    if (isReversal) {
      observedDepositReversalCount += 1;
      if (!depositGuids.has(undoneDepositGuid)) {
        unresolvedCrossDateDepositReversalCount += 1;
      }
    }
  }

  return Object.freeze({
    businessDate: input.businessDate,
    cashEntryCount: input.entries.length,
    depositCount: input.deposits.length,
    cashEntryAmountMinor,
    depositAmountMinor,
    noSaleCount,
    cashEntriesWithoutDrawerCount,
    cashInCount,
    cashOutCount,
    cashCollectedCount,
    tipOutCount,
    payoutCount,
    reimbursementCount,
    closeoutCount,
    observedReversalCount,
    unresolvedCrossDateReversalCount,
    observedDepositReversalCount,
    unresolvedCrossDateDepositReversalCount,
    cashEntryTotalsByType: Object.freeze([...typeTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, value]) => Object.freeze({ type, ...value }))),
    cashDrawerReferences: freezeDrawerReferences(drawerReferences, cashDrawerGuids),
    noSaleReasonReferences: freezeReasonReferences(
      noSaleReasonReferences,
      noSaleReasonGuids,
    ),
    payoutReasonReferences: freezeReasonReferences(
      payoutReasonReferences,
      payoutReasonGuids,
    ),
  });
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

function incrementDrawer(
  references: Map<string, MutableDrawerReference>,
  drawerGuid: string,
): void {
  const reference = references.get(drawerGuid) ?? { entryCount: 0 };
  reference.entryCount += 1;
  references.set(drawerGuid, reference);
}

function incrementReason(
  references: Map<string, MutableReasonReference>,
  reasonGuid: string,
): void {
  const reference = references.get(reasonGuid) ?? { entryCount: 0 };
  reference.entryCount += 1;
  references.set(reasonGuid, reference);
}

function incrementEntryKind(
  type: string,
  increment: {
    readonly noSale: () => void;
    readonly cashIn: () => void;
    readonly cashOut: () => void;
    readonly cashCollected: () => void;
    readonly tipOut: () => void;
    readonly payout: () => void;
    readonly reimbursement: () => void;
    readonly closeout: () => void;
  },
): void {
  switch (type) {
    case "NO_SALE": increment.noSale(); break;
    case "CASH_IN": increment.cashIn(); break;
    case "CASH_OUT": increment.cashOut(); break;
    case "CASH_COLLECTED": increment.cashCollected(); break;
    case "TIP_OUT": increment.tipOut(); break;
    case "PAY_OUT":
    case "UNDO_PAY_OUT": increment.payout(); break;
    case "DRIVER_REIMBURSEMENT": increment.reimbursement(); break;
    case "CLOSE_OUT_EXACT":
    case "CLOSE_OUT_OVERAGE":
    case "CLOSE_OUT_SHORTAGE": increment.closeout(); break;
    default: break;
  }
}

function freezeDrawerReferences(
  references: Map<string, MutableDrawerReference>,
  knownGuids: ReadonlySet<string>,
): readonly CashDrawerReference[] {
  return Object.freeze([...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([drawerGuid, value]) => Object.freeze({
      drawerGuid,
      ...value,
      resolved: knownGuids.has(drawerGuid),
    })));
}

function freezeReasonReferences(
  references: Map<string, MutableReasonReference>,
  knownGuids: ReadonlySet<string>,
): readonly CashReasonReference[] {
  return Object.freeze([...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reasonGuid, value]) => Object.freeze({
      reasonGuid,
      ...value,
      resolved: knownGuids.has(reasonGuid),
    })));
}

function assertValidBusinessDate(value: number): void {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) throw cashSourceInvalid();
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) throw cashSourceInvalid();
}

export function cashSourceInvalid(): ReportComputationError {
  return new ReportComputationError(
    "cash_source_invalid",
    "Toast cash source data was not usable for deterministic reporting.",
  );
}
