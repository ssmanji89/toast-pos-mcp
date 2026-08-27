import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import {
  createUnresolvedConfigContext,
  createUnavailableMenuContext,
  type ConfigurationDimensionContext,
  type DimensionContextState,
  type MenuDimensionContext,
} from "./dimension-context.js";
import {
  exactDecimalToString,
  type ExactDecimal,
} from "./exact-decimal.js";
import { aggregateOrderDimensions } from "./item-sales-aggregation.js";
import type { ToastLocation, ToastLocationDiscoveryProvenance } from "./locations.js";
import { normalizeOrdersPages } from "./orders-normalization.js";
import {
  STANDARD_REPORT_SCHEMA_VERSION,
  type ReportContextFreshness,
} from "./report-contract.js";
import {
  denialFromError,
  ReportComputationError,
  ReportProvenanceCollector,
  type ReportDenial,
  type ReportProvenance,
} from "./report-core.js";
import { SalesCrossPageIdentityGuard } from "./sales-cross-page-identity.js";
import type { ApplicationRuntime } from "./runtime.js";

export type ItemSalesDimension =
  | "item"
  | "sales_category"
  | "revenue_center"
  | "dining_option"
  | "item_tag"
  | "order_source"
  | "service_period";

export type ItemSalesMetricBasis = "selection" | "check_attribution";

export interface ItemSalesGroup {
  readonly key: string;
  readonly guid: string | undefined;
  readonly multiLocationId: string | undefined;
  readonly value: string | undefined;
  readonly displayName: string | undefined;
  readonly enrichmentState: "current" | "stale" | "unresolved" | "historical";
  readonly selectionCount: number;
  readonly checkCount: number;
  /** Canonical base-10 decimal string. Weighted quantities are never rounded to integers. */
  readonly quantity: string;
  readonly grossSelectionAmountMinor: number;
  readonly netSelectionAmountMinor: number;
  readonly observedSelectionRefundAmountMinor: number;
  readonly selectionTaxAmountMinor: number;
  readonly attributedCheckAmountMinor: number;
  readonly currencyCode: string;
}

export interface ItemSalesDimensionContextSummary {
  readonly menuState: DimensionContextState | "not_used";
  readonly menuPublishedAt: string | undefined;
  readonly menuCheckedAtEpochMs: number | undefined;
  readonly menuRetrievedThroughEpochMs: number | undefined;
  readonly menuSourceProvenance: ReportProvenance | undefined;
  readonly menuFreshnessProvenance: ReportProvenance | undefined;
  readonly configurationState: DimensionContextState | "not_used";
  readonly configurationRetrievedThroughEpochMs: number | undefined;
  readonly configurationLastModifiedCursor: string | undefined;
  readonly configurationProvenance: ReportProvenance | undefined;
}

export interface ItemSalesSummaryComplete {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "complete";
  readonly report: "item_sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string;
  readonly restaurantName: string;
  readonly businessDate: number;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly generatedAtEpochMs: number;
  readonly contextFreshness: ReportContextFreshness;
  readonly contextProvenance: ToastLocationDiscoveryProvenance;
  readonly dimension: ItemSalesDimension;
  readonly metricBasis: ItemSalesMetricBasis;
  readonly nonAdditiveAcrossGroups: boolean;
  readonly pagesProcessed: number;
  readonly sourceOrdersProcessed: number;
  readonly modifierSelectionsTraversed: number;
  /** Number of report contributions whose descriptive reference could not be resolved. */
  readonly unresolvedContributionCount: number;
  readonly dimensionContext: ItemSalesDimensionContextSummary;
  /** Orders-source provenance only; descriptive context has separate provenance fields. */
  readonly provenance: ReportProvenance;
  readonly groups: readonly ItemSalesGroup[];
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export interface ItemSalesSummaryDenied {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "denied";
  readonly report: "item_sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string | undefined;
  readonly restaurantName: string | undefined;
  readonly businessDate: number;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number | undefined;
  readonly generatedAtEpochMs: number;
  readonly contextFreshness?: ReportContextFreshness;
  readonly contextProvenance?: ToastLocationDiscoveryProvenance;
  readonly dimension: ItemSalesDimension;
  readonly denial: ReportDenial;
  readonly missingScopes: readonly string[];
  readonly missingProvisionedScopes: readonly string[];
  readonly missingConnectionScopes: readonly string[];
  readonly excludedScopes: readonly string[];
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export type ItemSalesSummaryResult =
  | ItemSalesSummaryComplete
  | ItemSalesSummaryDenied;

export interface MutableGroup {
  descriptor: DimensionDescriptor;
  selectionCount: number;
  checkCount: number;
  quantity: ExactDecimal;
  grossSelectionAmountMinor: number;
  netSelectionAmountMinor: number;
  observedSelectionRefundAmountMinor: number;
  selectionTaxAmountMinor: number;
  attributedCheckAmountMinor: number;
}

export interface DimensionDescriptor {
  readonly key: string;
  readonly guid: string | undefined;
  readonly multiLocationId: string | undefined;
  readonly value: string | undefined;
  readonly displayName: string | undefined;
  readonly enrichmentState: "current" | "stale" | "unresolved" | "historical";
}

export interface ItemSalesFoldState {
  readonly identityGuard: SalesCrossPageIdentityGuard;
  readonly groups: Map<string, MutableGroup>;
  readonly provenance: ReportProvenanceCollector;
  pagesProcessed: number;
  sourceOrdersProcessed: number;
  modifierSelectionsTraversed: number;
  unresolvedContributionCount: number;
}

const FORMULA_NOTES = Object.freeze([
  "Orders are the historical fact source. Current Menus/Configuration data is descriptive enrichment only and never reassigns a historical GUID by display name.",
  "Item dimension uses only top-level non-void/non-deferred order selections for monetary facts because Toast Selection.price already includes quantity, discounts and modifier price adjustments. Nested modifiers are traversed for integrity/context but are not added again.",
  "Selection refundDetails is surfaced as observedSelectionRefundAmountMinor and is not subtracted or re-dated here because Toast reporting applies refunds on the refund date, which Standard Orders selection refundDetails does not itself provide.",
  "Sales-category, dining-option and item-tag dimensions attribute check.amount to each distinct dimension represented on a check; those group totals can be non-additive across groups by design.",
  "Revenue-center, order-source and service-period dimensions attribute each eligible check once using the order-level historical reference/value.",
]);

export async function buildItemSalesSummaryReport(
  runtime: ApplicationRuntime,
  input: ItemSalesReportInput,
  options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<ItemSalesSummaryResult> {
  return buildItemSalesSummaryReportInternal(runtime, input, options);
}

interface ItemSalesReportInput {
  readonly businessDate: number;
  readonly dimension: ItemSalesDimension;
  readonly restaurantGuid?: string;
}

async function buildItemSalesSummaryReportInternal(
  runtime: ApplicationRuntime,
  input: ItemSalesReportInput,
  options: { readonly signal?: AbortSignal | undefined } = {},
): Promise<ItemSalesSummaryResult> {
  const generatedAtEpochMs = runtime.now();
  let restaurantGuid = input.restaurantGuid?.toLowerCase();
  let restaurantName: string | undefined;
  let effectiveBusinessDate: number | undefined;
  let contextFreshness: ReportContextFreshness | undefined;
  let contextProvenance: ToastLocationDiscoveryProvenance | undefined;
  const warnings: string[] = [];

  try {
    assertValidBusinessDate(input.businessDate);
    effectiveBusinessDate = input.businessDate;
    const locationContext = await runtime.getLocationContext(
      input.restaurantGuid,
      { signal: options.signal },
    );
    const { location } = locationContext;
    restaurantGuid = location.restaurantGuid;
    restaurantName = location.name;
    contextFreshness = locationContext.freshness;
    contextProvenance = locationContext.provenance;

    const contexts = await loadDimensionContexts(runtime, input, location, generatedAtEpochMs, warnings, contextFreshness, contextProvenance, options.signal);
    if ("denied" in contexts) return contexts.denied;
    const { menuContext, configContext } = contexts;

    if (
      input.dimension === "item_tag"
      && (menuContext === undefined || menuContext.state === "unresolved")
    ) {
      throw new ReportComputationError(
        "item_tag_context_unavailable",
        "Item-tag reporting requires validated current or explicitly stale menu context.",
      );
    }

    return foldAndCompleteItemSalesReport(
      runtime, input, location, menuContext, configContext, generatedAtEpochMs,
      contextFreshness, contextProvenance, warnings, options.signal,
    );
  } catch (error) {
    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "denied" as const,
      report: "item_sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid,
      restaurantName,
      businessDate: input.businessDate,
      requestedBusinessDate: input.businessDate,
      effectiveBusinessDate,
      generatedAtEpochMs,
      ...(contextFreshness === undefined ? {} : { contextFreshness }),
      ...(contextProvenance === undefined ? {} : { contextProvenance }),
      dimension: input.dimension,
      denial: denialFromError(error),
      missingScopes: Object.freeze([]),
      missingProvisionedScopes: Object.freeze([]),
      missingConnectionScopes: Object.freeze([]),
      excludedScopes: Object.freeze([]),
      formulaNotes: FORMULA_NOTES,
      warnings: Object.freeze(warnings),
    });
  }
}

type LoadedDimensionContexts =
  | { readonly denied: ItemSalesSummaryDenied }
  | { readonly menuContext: MenuDimensionContext | undefined; readonly configContext: ConfigurationDimensionContext | undefined };

async function foldAndCompleteItemSalesReport(
  runtime: ApplicationRuntime, input: ItemSalesReportInput, location: ToastLocation,
  menuContext: MenuDimensionContext | undefined, configContext: ConfigurationDimensionContext | undefined,
  generatedAtEpochMs: number, contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance, warnings: string[], signal: AbortSignal | undefined,
): Promise<ItemSalesSummaryComplete> {
  const state: ItemSalesFoldState = { identityGuard: new SalesCrossPageIdentityGuard(), groups: new Map(), provenance: new ReportProvenanceCollector(), pagesProcessed: 0, sourceOrdersProcessed: 0, modifierSelectionsTraversed: 0, unresolvedContributionCount: 0 };
  await runtime.toastHttpClient.foldOrdersBulkPagesCancellable({ restaurantGuid: location.restaurantGuid, query: { businessDate: input.businessDate }, pageSize: 100 }, state, (foldState, page, pageNumber) => {
    const normalized = normalizeOrdersPages({ location, query: { mode: "business_date", businessDate: input.businessDate }, pages: [page] });
    foldState.provenance.add(page); foldState.pagesProcessed = pageNumber; foldState.sourceOrdersProcessed += normalized.recordCount;
    for (const order of normalized.orders) { foldState.identityGuard.observeOrder(order); aggregateOrderDimensions(foldState, order, input.dimension, menuContext, configContext); }
    return foldState;
  }, { signal });
  const groups = Object.freeze([...state.groups.values()].map((group) => freezeGroup(group, location.currencyCode)).sort((left, right) => left.key.localeCompare(right.key)));
  return Object.freeze({ schemaVersion: STANDARD_REPORT_SCHEMA_VERSION, status: "complete", report: "item_sales_summary", source: "standard_api", restaurantGuid: location.restaurantGuid, restaurantName: location.name, businessDate: input.businessDate, requestedBusinessDate: input.businessDate, effectiveBusinessDate: input.businessDate, currencyCode: location.currencyCode, timezone: location.timezone, generatedAtEpochMs, contextFreshness, contextProvenance, dimension: input.dimension, metricBasis: metricBasis(input.dimension), nonAdditiveAcrossGroups: nonAdditive(input.dimension), pagesProcessed: state.pagesProcessed, sourceOrdersProcessed: state.sourceOrdersProcessed, modifierSelectionsTraversed: state.modifierSelectionsTraversed, unresolvedContributionCount: state.unresolvedContributionCount, dimensionContext: contextSummary(menuContext, configContext), provenance: state.provenance.snapshot(), groups, formulaNotes: FORMULA_NOTES, warnings: Object.freeze(warnings) });
}

async function loadDimensionContexts(
  runtime: ApplicationRuntime,
  input: ItemSalesReportInput,
  location: ToastLocation,
  generatedAtEpochMs: number,
  warnings: string[],
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
  signal: AbortSignal | undefined,
): Promise<LoadedDimensionContexts> {
  const capabilityContext = await createCapabilityContext(runtime.tokenManager, location);
  const ordersCapability = decideCapability(capabilityContext, { restaurantGuid: location.restaurantGuid, requiredScopes: ["orders:read"] });
  if (ordersCapability.status === "denied") return { denied: capabilityDenied(input, generatedAtEpochMs, location.restaurantGuid, location.name, ordersCapability, warnings, contextFreshness, contextProvenance) };
  const menuCapability = decideCapability(capabilityContext, { restaurantGuid: location.restaurantGuid, requiredScopes: ["menus:read"] });
  const configCapability = decideCapability(capabilityContext, { restaurantGuid: location.restaurantGuid, requiredScopes: ["config:read"] });
  let menuContext: MenuDimensionContext | undefined;
  let configContext: ConfigurationDimensionContext | undefined;
  if (dimensionUsesMenu(input.dimension)) {
    if (menuCapability.status === "eligible") {
      menuContext = await runtime.dimensionContextProvider.getMenuContext(location, { signal });
      warnings.push(...menuContext.warnings);
    } else if (input.dimension === "item_tag") {
      return { denied: capabilityDenied(input, generatedAtEpochMs, location.restaurantGuid, location.name, menuCapability, warnings, contextFreshness, contextProvenance) };
    } else {
      const warning = "menus:read is unavailable; item display enrichment is unresolved but historical item references remain reportable.";
      menuContext = createUnavailableMenuContext(generatedAtEpochMs, warning);
      warnings.push(warning);
    }
  }
  if (dimensionUsesConfiguration(input.dimension)) {
    if (configCapability.status === "eligible") {
      configContext = await runtime.dimensionContextProvider.getConfigurationContext(location, { signal });
      warnings.push(...configContext.warnings);
    } else {
      const warning = "config:read is unavailable; current descriptive configuration names are unresolved but historical references remain reportable.";
      configContext = createUnresolvedConfigContext(warning);
      warnings.push(warning);
    }
  }
  return { menuContext, configContext };
}


function freezeGroup(
  group: MutableGroup,
  currencyCode: string,
): ItemSalesGroup {
  return Object.freeze({
    ...group.descriptor,
    selectionCount: group.selectionCount,
    checkCount: group.checkCount,
    quantity: exactDecimalToString(group.quantity),
    grossSelectionAmountMinor: group.grossSelectionAmountMinor,
    netSelectionAmountMinor: group.netSelectionAmountMinor,
    observedSelectionRefundAmountMinor: group.observedSelectionRefundAmountMinor,
    selectionTaxAmountMinor: group.selectionTaxAmountMinor,
    attributedCheckAmountMinor: group.attributedCheckAmountMinor,
    currencyCode,
  });
}

function dimensionUsesMenu(dimension: ItemSalesDimension): boolean {
  return dimension === "item" || dimension === "item_tag";
}

function dimensionUsesConfiguration(dimension: ItemSalesDimension): boolean {
  return dimension === "sales_category"
    || dimension === "revenue_center"
    || dimension === "dining_option"
    || dimension === "service_period";
}

function metricBasis(dimension: ItemSalesDimension): ItemSalesMetricBasis {
  return dimension === "item" ? "selection" : "check_attribution";
}

function nonAdditive(dimension: ItemSalesDimension): boolean {
  return dimension === "sales_category"
    || dimension === "dining_option"
    || dimension === "item_tag";
}

function contextSummary(
  menu: MenuDimensionContext | undefined,
  config: ConfigurationDimensionContext | undefined,
): ItemSalesDimensionContextSummary {
  return Object.freeze({
    menuState: menu?.state ?? "not_used",
    menuPublishedAt: menu?.publishedAt,
    menuCheckedAtEpochMs: menu?.checkedAtEpochMs,
    menuRetrievedThroughEpochMs: menu?.retrievedThroughEpochMs,
    menuSourceProvenance: menu?.sourceProvenance,
    menuFreshnessProvenance: menu?.freshnessProvenance,
    configurationState: config?.state ?? "not_used",
    configurationRetrievedThroughEpochMs: config?.retrievedThroughEpochMs,
    configurationLastModifiedCursor: config?.lastModifiedCursor,
    configurationProvenance: config?.provenance,
  });
}

function capabilityDenied(
  input: {
    readonly businessDate: number;
    readonly dimension: ItemSalesDimension;
  },
  generatedAtEpochMs: number,
  restaurantGuid: string,
  restaurantName: string,
  denial: CapabilityDenial,
  warnings: readonly string[],
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
): ItemSalesSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "item_sales_summary" as const,
    source: "standard_api" as const,
    restaurantGuid,
    restaurantName,
    businessDate: input.businessDate,
    requestedBusinessDate: input.businessDate,
    effectiveBusinessDate: input.businessDate,
    generatedAtEpochMs,
    contextFreshness,
    contextProvenance,
    dimension: input.dimension,
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
    formulaNotes: FORMULA_NOTES,
    warnings: Object.freeze([...warnings]),
  });
}

function assertValidBusinessDate(value: number): void {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) throw invalidDate();
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw invalidDate();
  }
}

function invalidDate(): ReportComputationError {
  return new ReportComputationError(
    "report_business_date_invalid",
    "Report business date must be a real calendar date in yyyyMMdd form.",
  );
}
