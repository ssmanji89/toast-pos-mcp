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
  type MenuItemDimension,
} from "./dimension-context.js";
import {
  addExactDecimals,
  exactDecimalFromNumber,
  exactDecimalToString,
  type ExactDecimal,
} from "./exact-decimal.js";
import type { ToastLocationDiscoveryProvenance } from "./locations.js";
import type {
  NormalizedOrder,
  NormalizedReference,
  NormalizedSelection,
} from "./orders-normalization.js";
import { normalizeOrdersPages } from "./orders-normalization.js";
import {
  STANDARD_REPORT_SCHEMA_VERSION,
  type ReportContextFreshness,
} from "./report-contract.js";
import {
  addMinorUnits,
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

interface MutableGroup {
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

interface DimensionDescriptor {
  readonly key: string;
  readonly guid: string | undefined;
  readonly multiLocationId: string | undefined;
  readonly value: string | undefined;
  readonly displayName: string | undefined;
  readonly enrichmentState: "current" | "stale" | "unresolved" | "historical";
}

interface ItemSalesFoldState {
  readonly identityGuard: SalesCrossPageIdentityGuard;
  readonly groups: Map<string, MutableGroup>;
  readonly provenance: ReportProvenanceCollector;
  pagesProcessed: number;
  sourceOrdersProcessed: number;
  modifierSelectionsTraversed: number;
  unresolvedContributionCount: number;
}

const ZERO_DECIMAL: ExactDecimal = Object.freeze({
  coefficient: "0",
  scale: 0,
});

const FORMULA_NOTES = Object.freeze([
  "Orders are the historical fact source. Current Menus/Configuration data is descriptive enrichment only and never reassigns a historical GUID by display name.",
  "Item dimension uses only top-level non-void/non-deferred order selections for monetary facts because Toast Selection.price already includes quantity, discounts and modifier price adjustments. Nested modifiers are traversed for integrity/context but are not added again.",
  "Selection refundDetails is surfaced as observedSelectionRefundAmountMinor and is not subtracted or re-dated here because Toast reporting applies refunds on the refund date, which Standard Orders selection refundDetails does not itself provide.",
  "Sales-category, dining-option and item-tag dimensions attribute check.amount to each distinct dimension represented on a check; those group totals can be non-additive across groups by design.",
  "Revenue-center, order-source and service-period dimensions attribute each eligible check once using the order-level historical reference/value.",
]);

export async function buildItemSalesSummaryReport(
  runtime: ApplicationRuntime,
  input: {
    readonly businessDate: number;
    readonly dimension: ItemSalesDimension;
    readonly restaurantGuid?: string;
  },
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

    const capabilityContext = await createCapabilityContext(
      runtime.tokenManager,
      location,
    );
    const ordersCapability = decideCapability(capabilityContext, {
      restaurantGuid: location.restaurantGuid,
      requiredScopes: ["orders:read"],
    });
    if (ordersCapability.status === "denied") {
      return capabilityDenied(
        input,
        generatedAtEpochMs,
        location.restaurantGuid,
        location.name,
        ordersCapability,
        warnings,
        contextFreshness,
        contextProvenance,
      );
    }

    const menuCapability = decideCapability(capabilityContext, {
      restaurantGuid: location.restaurantGuid,
      requiredScopes: ["menus:read"],
    });
    const configCapability = decideCapability(capabilityContext, {
      restaurantGuid: location.restaurantGuid,
      requiredScopes: ["config:read"],
    });

    let menuContext: MenuDimensionContext | undefined;
    let configContext: ConfigurationDimensionContext | undefined;

    if (dimensionUsesMenu(input.dimension)) {
      if (menuCapability.status === "eligible") {
        menuContext = await runtime.dimensionContextProvider.getMenuContext(
          location,
          { signal: options.signal },
        );
        warnings.push(...menuContext.warnings);
      } else if (input.dimension === "item_tag") {
        return capabilityDenied(
          input,
          generatedAtEpochMs,
          location.restaurantGuid,
          location.name,
          menuCapability,
          warnings,
          contextFreshness,
          contextProvenance,
        );
      } else {
        menuContext = createUnavailableMenuContext(
          generatedAtEpochMs,
          "menus:read is unavailable; item display enrichment is unresolved but historical item references remain reportable.",
        );
        warnings.push(
          "menus:read is unavailable; item display enrichment is unresolved but historical item references remain reportable.",
        );
      }
    }

    if (dimensionUsesConfiguration(input.dimension)) {
      if (configCapability.status === "eligible") {
        configContext = await runtime.dimensionContextProvider.getConfigurationContext(
          location,
          { signal: options.signal },
        );
        warnings.push(...configContext.warnings);
      } else {
        configContext = createUnresolvedConfigContext(
          "config:read is unavailable; current descriptive configuration names are unresolved but historical references remain reportable.",
        );
        warnings.push(
          "config:read is unavailable; current descriptive configuration names are unresolved but historical references remain reportable.",
        );
      }
    }

    if (
      input.dimension === "item_tag"
      && (menuContext === undefined || menuContext.state === "unresolved")
    ) {
      throw new ReportComputationError(
        "item_tag_context_unavailable",
        "Item-tag reporting requires validated current or explicitly stale menu context.",
      );
    }

    const state: ItemSalesFoldState = {
      identityGuard: new SalesCrossPageIdentityGuard(),
      groups: new Map(),
      provenance: new ReportProvenanceCollector(),
      pagesProcessed: 0,
      sourceOrdersProcessed: 0,
      modifierSelectionsTraversed: 0,
      unresolvedContributionCount: 0,
    };

    await runtime.toastHttpClient.foldOrdersBulkPagesCancellable(
      {
        restaurantGuid: location.restaurantGuid,
        query: { businessDate: input.businessDate },
        pageSize: 100,
      },
      state,
      (foldState, page, pageNumber) => {
        const normalized = normalizeOrdersPages({
          location,
          query: {
            mode: "business_date",
            businessDate: input.businessDate,
          },
          pages: [page],
        });
        foldState.provenance.add(page);
        foldState.pagesProcessed = pageNumber;
        foldState.sourceOrdersProcessed += normalized.recordCount;

        for (const order of normalized.orders) {
          foldState.identityGuard.observeOrder(order);
          aggregateOrder(
            foldState,
            order,
            input.dimension,
            menuContext,
            configContext,
          );
        }
        return foldState;
      },
      { signal: options.signal },
    );

    const groups = Object.freeze(
      [...state.groups.values()]
        .map((group) => freezeGroup(group, location.currencyCode))
        .sort((left, right) => left.key.localeCompare(right.key)),
    );

    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "complete" as const,
      report: "item_sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: location.restaurantGuid,
      restaurantName: location.name,
      businessDate: input.businessDate,
      requestedBusinessDate: input.businessDate,
      effectiveBusinessDate: input.businessDate,
      currencyCode: location.currencyCode,
      timezone: location.timezone,
      generatedAtEpochMs,
      contextFreshness,
      contextProvenance,
      dimension: input.dimension,
      metricBasis: metricBasis(input.dimension),
      nonAdditiveAcrossGroups: nonAdditive(input.dimension),
      pagesProcessed: state.pagesProcessed,
      sourceOrdersProcessed: state.sourceOrdersProcessed,
      modifierSelectionsTraversed: state.modifierSelectionsTraversed,
      unresolvedContributionCount: state.unresolvedContributionCount,
      dimensionContext: contextSummary(menuContext, configContext),
      provenance: state.provenance.snapshot(),
      groups,
      formulaNotes: FORMULA_NOTES,
      warnings: Object.freeze(warnings),
    });
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

function aggregateOrder(
  state: ItemSalesFoldState,
  order: NormalizedOrder,
  dimension: ItemSalesDimension,
  menuContext: MenuDimensionContext | undefined,
  configContext: ConfigurationDimensionContext | undefined,
): void {
  if (order.deleted || order.voided || order.excessFood) return;

  for (const check of order.checks) {
    if (check.deleted || check.voided) continue;

    for (const selection of check.selections) {
      state.modifierSelectionsTraversed += countModifiers(selection);
    }

    if (dimension === "item") {
      for (const selection of check.selections) {
        if (selection.voided || selection.deferred) continue;
        const descriptor = itemDescriptor(selection, menuContext);
        if (descriptor.enrichmentState === "unresolved") {
          state.unresolvedContributionCount += 1;
        }
        const group = getGroup(state.groups, descriptor);
        group.selectionCount += 1;
        group.quantity = addExactDecimals([
          group.quantity,
          exactDecimalFromNumber(selection.quantity),
        ]);
        group.grossSelectionAmountMinor = addMinorUnits(
          group.grossSelectionAmountMinor,
          selection.preDiscountPriceHundredths,
        );
        group.netSelectionAmountMinor = addMinorUnits(
          group.netSelectionAmountMinor,
          selection.priceHundredths,
        );
        group.observedSelectionRefundAmountMinor = addMinorUnits(
          group.observedSelectionRefundAmountMinor,
          selection.refundDetails?.refundAmountHundredths ?? 0,
        );
        group.selectionTaxAmountMinor = addMinorUnits(
          group.selectionTaxAmountMinor,
          selection.taxHundredths ?? 0,
        );
      }
      continue;
    }

    const descriptors = checkDimensionDescriptors(
      order,
      check.selections,
      dimension,
      menuContext,
      configContext,
    );
    if (descriptors.length === 0) {
      descriptors.push(unresolvedDescriptor(dimension));
    }
    for (const descriptor of descriptors) {
      if (descriptor.enrichmentState === "unresolved") {
        state.unresolvedContributionCount += 1;
      }
      const group = getGroup(state.groups, descriptor);
      group.checkCount += 1;
      group.attributedCheckAmountMinor = addMinorUnits(
        group.attributedCheckAmountMinor,
        check.amountHundredths,
      );
    }
  }
}

function checkDimensionDescriptors(
  order: NormalizedOrder,
  selections: readonly NormalizedSelection[],
  dimension: Exclude<ItemSalesDimension, "item">,
  menuContext: MenuDimensionContext | undefined,
  configContext: ConfigurationDimensionContext | undefined,
): DimensionDescriptor[] {
  const unique = new Map<string, DimensionDescriptor>();

  if (dimension === "revenue_center") {
    addDescriptor(unique, referenceDescriptor(
      dimension,
      order.revenueCenter,
      configContext?.revenueCenters,
      configContext?.state,
    ));
  } else if (dimension === "order_source") {
    addDescriptor(unique, valueDescriptor(dimension, order.source));
  } else if (dimension === "service_period") {
    addDescriptor(unique, referenceDescriptor(
      dimension,
      order.restaurantService,
      configContext?.restaurantServices,
      configContext?.state,
    ));
  } else if (dimension === "sales_category") {
    for (const selection of selections) {
      if (selection.voided || selection.deferred) continue;
      addDescriptor(unique, referenceDescriptor(
        dimension,
        selection.salesCategory,
        configContext?.salesCategories,
        configContext?.state,
      ));
    }
  } else if (dimension === "dining_option") {
    for (const selection of selections) {
      if (selection.voided || selection.deferred) continue;
      addDescriptor(unique, referenceDescriptor(
        dimension,
        selection.diningOption ?? order.diningOption,
        configContext?.diningOptions,
        configContext?.state,
      ));
    }
    if (unique.size === 0) {
      addDescriptor(unique, referenceDescriptor(
        dimension,
        order.diningOption,
        configContext?.diningOptions,
        configContext?.state,
      ));
    }
  } else if (dimension === "item_tag") {
    for (const selection of selections) {
      if (selection.voided || selection.deferred) continue;
      const item = resolveMenuItem(selection.item, selection.itemGroup, menuContext);
      if (item === undefined) {
        const unresolved = unresolvedDescriptor(dimension);
        unique.set(unresolved.key, unresolved);
        continue;
      }
      for (const tag of item.itemTags) {
        const descriptor: DimensionDescriptor = Object.freeze({
          key: `guid:${tag.guid}`,
          guid: tag.guid,
          multiLocationId: undefined,
          value: undefined,
          displayName: tag.name,
          enrichmentState: menuContext?.state === "stale" ? "stale" : "current",
        });
        unique.set(descriptor.key, descriptor);
      }
      if (item.itemTags.length === 0) {
        const unresolved = unresolvedDescriptor(dimension);
        unique.set(unresolved.key, unresolved);
      }
    }
  }

  return [...unique.values()];
}

function addDescriptor(
  target: Map<string, DimensionDescriptor>,
  descriptor: DimensionDescriptor | undefined,
): void {
  if (descriptor !== undefined) target.set(descriptor.key, descriptor);
}

function itemDescriptor(
  selection: NormalizedSelection,
  menuContext: MenuDimensionContext | undefined,
): DimensionDescriptor {
  const reference = selection.item;
  const key = referenceKey(reference) ?? "unresolved:item";
  const item = resolveMenuItem(reference, selection.itemGroup, menuContext);
  return Object.freeze({
    key,
    guid: reference?.guid,
    multiLocationId: reference?.multiLocationId,
    value: undefined,
    displayName: item?.name,
    enrichmentState:
      item === undefined
        ? "unresolved"
        : menuContext?.state === "stale"
          ? "stale"
          : "current",
  });
}

function resolveMenuItem(
  reference: NormalizedReference | undefined,
  itemGroupReference: NormalizedReference | undefined,
  menuContext: MenuDimensionContext | undefined,
): MenuItemDimension | undefined {
  if (reference === undefined || menuContext === undefined) return undefined;
  const byGuid = reference.guid === undefined
    || menuContext.ambiguousItemGuids.has(reference.guid)
    ? undefined
    : menuContext.itemsByGuid.get(reference.guid);
  const byMulti = reference.multiLocationId === undefined
    || menuContext.ambiguousMultiLocationIds.has(reference.multiLocationId)
    ? undefined
    : menuContext.itemsByMultiLocationId.get(reference.multiLocationId);
  if (
    byGuid !== undefined
    && byMulti !== undefined
    && byGuid.guid !== byMulti.guid
  ) {
    return undefined;
  }
  const item = byGuid ?? byMulti;
  if (item === undefined || itemGroupReference === undefined) return item;
  const matchingGroup = item.itemGroups.find((group) =>
    (itemGroupReference.guid !== undefined && group.guid === itemGroupReference.guid)
    || (itemGroupReference.multiLocationId !== undefined
      && group.multiLocationId === itemGroupReference.multiLocationId));
  return matchingGroup === undefined
    ? undefined
    : Object.freeze({ ...item, itemTags: matchingGroup.itemTags });
}

function referenceDescriptor(
  dimension: string,
  reference: NormalizedReference | undefined,
  current: ReadonlyMap<string, {
    readonly name: string | undefined;
    readonly behavior?: string | undefined;
  }> | undefined,
  contextState: DimensionContextState | undefined,
): DimensionDescriptor | undefined {
  const key = referenceKey(reference);
  if (key === undefined) return undefined;
  const currentValue = reference?.guid === undefined
    ? undefined
    : current?.get(reference.guid);
  const displayName = dimension === "dining_option"
    && currentValue?.behavior !== undefined
    ? `${currentValue.name ?? reference?.guid ?? "Dining option"} (${currentValue.behavior})`
    : currentValue?.name;
  return Object.freeze({
    key,
    guid: reference?.guid,
    multiLocationId: reference?.multiLocationId,
    value: undefined,
    displayName,
    enrichmentState:
      currentValue === undefined
        ? "unresolved"
        : contextState === "stale"
          ? "stale"
          : "current",
  });
}

function valueDescriptor(
  dimension: string,
  value: string | undefined,
): DimensionDescriptor | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return Object.freeze({
    key: `${dimension}:${value}`,
    guid: undefined,
    multiLocationId: undefined,
    value,
    displayName: value,
    enrichmentState: "historical" as const,
  });
}

function unresolvedDescriptor(dimension: string): DimensionDescriptor {
  return Object.freeze({
    key: `unresolved:${dimension}`,
    guid: undefined,
    multiLocationId: undefined,
    value: undefined,
    displayName: undefined,
    enrichmentState: "unresolved" as const,
  });
}

function referenceKey(
  reference: NormalizedReference | undefined,
): string | undefined {
  if (reference?.guid !== undefined) return `guid:${reference.guid}`;
  if (reference?.multiLocationId !== undefined) {
    return `multi:${reference.multiLocationId}`;
  }
  return undefined;
}

function getGroup(
  groups: Map<string, MutableGroup>,
  descriptor: DimensionDescriptor,
): MutableGroup {
  const existing = groups.get(descriptor.key);
  if (existing !== undefined) return existing;
  const created: MutableGroup = {
    descriptor,
    selectionCount: 0,
    checkCount: 0,
    quantity: ZERO_DECIMAL,
    grossSelectionAmountMinor: 0,
    netSelectionAmountMinor: 0,
    observedSelectionRefundAmountMinor: 0,
    selectionTaxAmountMinor: 0,
    attributedCheckAmountMinor: 0,
  };
  groups.set(descriptor.key, created);
  return created;
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
    observedSelectionRefundAmountMinor:
      group.observedSelectionRefundAmountMinor,
    selectionTaxAmountMinor: group.selectionTaxAmountMinor,
    attributedCheckAmountMinor: group.attributedCheckAmountMinor,
    currencyCode,
  });
}

function countModifiers(selection: NormalizedSelection): number {
  let count = 0;
  const stack = [...selection.modifiers];
  while (stack.length > 0) {
    const modifier = stack.pop();
    if (modifier === undefined) continue;
    count += 1;
    stack.push(...modifier.modifiers);
  }
  return count;
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
