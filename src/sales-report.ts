import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import type { ToastLocationDiscoveryProvenance } from "./locations.js";
import {
  normalizeOrdersPages,
  type NormalizedAppliedDiscount,
  type NormalizedOrder,
  type NormalizedSelection,
} from "./orders-normalization.js";
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

export interface SalesSummaryBucket {
  readonly orderCount: number;
  readonly checkCount: number;
  readonly knownGuestCount: number;
  readonly ordersWithKnownGuestCount: number;
  readonly grossCheckAmountMinor: number;
  readonly netOrderAmountMinor: number;
  readonly netSalesMinor: number;
  readonly taxAmountMinor: number;
  readonly discountAmountMinor: number;
  readonly serviceChargeAmountMinor: number;
  readonly selectionExclusionAmountMinor: number;
  readonly deferredSelectionAmountMinor: number;
  readonly houseAccountBalancePaymentAmountMinor: number;
  readonly fundraisingContributionAmountMinor: number;
  readonly ordersEmbeddedRefundAmountMinor: number;
  readonly taxExemptCheckCount: number;
}

export interface SalesSummaryExclusions {
  readonly deletedOrders: number;
  readonly voidedOrders: number;
  readonly excessFoodOrders: number;
  readonly deletedChecks: number;
  readonly voidedChecks: number;
}

export interface SalesSummaryComplete {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "complete";
  readonly report: "sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string;
  readonly restaurantName: string;
  /** Compatibility alias for effectiveBusinessDate. */
  readonly businessDate: number;
  readonly requestedBusinessDate: number;
  readonly effectiveBusinessDate: number;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly currencyCode: string;
  readonly generatedAtEpochMs: number;
  readonly pagesProcessed: number;
  readonly sourceOrdersProcessed: number;
  readonly contextFreshness: ReportContextFreshness;
  readonly contextProvenance: ToastLocationDiscoveryProvenance;
  readonly provenance: ReportProvenance;
  readonly currentAndPast: SalesSummaryBucket;
  readonly future: SalesSummaryBucket;
  readonly combined: SalesSummaryBucket;
  readonly exclusions: SalesSummaryExclusions;
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export interface SalesSummaryDenied {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "denied";
  readonly report: "sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string | undefined;
  readonly restaurantName: string | undefined;
  /** Compatibility alias for requestedBusinessDate on denied results. */
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

export type SalesSummaryResult = SalesSummaryComplete | SalesSummaryDenied;

interface MutableBucket {
  orderCount: number;
  checkCount: number;
  knownGuestCount: number;
  ordersWithKnownGuestCount: number;
  grossCheckAmountMinor: number;
  netOrderAmountMinor: number;
  netSalesMinor: number;
  taxAmountMinor: number;
  discountAmountMinor: number;
  serviceChargeAmountMinor: number;
  selectionExclusionAmountMinor: number;
  deferredSelectionAmountMinor: number;
  houseAccountBalancePaymentAmountMinor: number;
  fundraisingContributionAmountMinor: number;
  ordersEmbeddedRefundAmountMinor: number;
  taxExemptCheckCount: number;
}

interface SalesFoldState {
  readonly identityGuard: SalesCrossPageIdentityGuard;
  readonly provenance: ReportProvenanceCollector;
  readonly currentAndPast: MutableBucket;
  readonly future: MutableBucket;
  readonly exclusions: {
    deletedOrders: number;
    voidedOrders: number;
    excessFoodOrders: number;
    deletedChecks: number;
    voidedChecks: number;
  };
  pagesProcessed: number;
  sourceOrdersProcessed: number;
}

const SALES_FORMULA_NOTES = Object.freeze([
  "Source mode is Orders API /ordersBulk with Toast businessDate semantics; Standard and Analytics metrics are never mixed.",
  "Net sales starts from Toast-returned non-void/non-deleted check amount and excludes excess-food orders, fundraising service charges, the union of deferred/house-account-balance selections, and embedded refundAmount.",
  "Tip refunds are not folded into net sales; comprehensive payment lifecycle totals belong to toast_payment_summary.",
  "Configuration references are not rewritten with current menu/config names in this summary; item/category/revenue-center enrichment belongs to T3-003.",
]);

const SALES_WARNINGS = Object.freeze([
  "Future orders are reported separately using promisedDate compared with report generation time.",
  "deferredSelectionAmountMinor and houseAccountBalancePaymentAmountMinor are diagnostic categories that can overlap; selectionExclusionAmountMinor is their deduplicated union used in netSalesMinor.",
  "Net sales reconcile refundAmount embedded on Orders payments; use toast_payment_summary for the complete paid/refunded/voided business-date payment lifecycle.",
]);

export async function buildSalesSummaryReport(
  runtime: ApplicationRuntime,
  input: {
    readonly businessDate: number;
    readonly restaurantGuid?: string;
  },
  options: { readonly signal?: AbortSignal } = {},
): Promise<SalesSummaryResult> {
  const generatedAtEpochMs = runtime.now();
  let resolvedRestaurantGuid = input.restaurantGuid?.toLowerCase();
  let restaurantName: string | undefined;
  let contextFreshness: ReportContextFreshness | undefined;
  let contextProvenance: ToastLocationDiscoveryProvenance | undefined;
  let effectiveBusinessDate: number | undefined;

  try {
    assertValidBusinessDate(input.businessDate);
    effectiveBusinessDate = input.businessDate;
    const locationContext = await runtime.getLocationContext(
      input.restaurantGuid,
      { signal: options.signal },
    );
    const { location } = locationContext;
    contextProvenance = locationContext.provenance;
    contextFreshness = locationContext.freshness;
    resolvedRestaurantGuid = location.restaurantGuid;
    restaurantName = location.name;
    const capabilityContext = await createCapabilityContext(
      runtime.tokenManager,
      location,
    );
    const capability = decideCapability(capabilityContext, {
      restaurantGuid: location.restaurantGuid,
      requiredScopes: ["orders:read"],
    });
    if (capability.status === "denied") {
      return capabilityDenied(
        input.businessDate,
        generatedAtEpochMs,
        location.restaurantGuid,
        location.name,
        capability,
        contextFreshness,
        contextProvenance,
      );
    }

    const state: SalesFoldState = {
      identityGuard: new SalesCrossPageIdentityGuard(),
      provenance: new ReportProvenanceCollector(),
      currentAndPast: emptyBucket(),
      future: emptyBucket(),
      exclusions: {
        deletedOrders: 0,
        voidedOrders: 0,
        excessFoodOrders: 0,
        deletedChecks: 0,
        voidedChecks: 0,
      },
      pagesProcessed: 0,
      sourceOrdersProcessed: 0,
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
          aggregateOrder(foldState, order, generatedAtEpochMs);
        }

        return foldState;
      },
      { signal: options.signal },
    );

    const currentAndPast = freezeBucket(state.currentAndPast);
    const future = freezeBucket(state.future);
    const combined = addBuckets(currentAndPast, future);

    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "complete" as const,
      report: "sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: location.restaurantGuid,
      restaurantName: location.name,
      businessDate: input.businessDate,
      requestedBusinessDate: input.businessDate,
      effectiveBusinessDate: input.businessDate,
      timezone: location.timezone,
      closeoutHour: location.closeoutHour,
      currencyCode: location.currencyCode,
      generatedAtEpochMs,
      pagesProcessed: state.pagesProcessed,
      sourceOrdersProcessed: state.sourceOrdersProcessed,
      contextFreshness,
      contextProvenance,
      provenance: state.provenance.snapshot(),
      currentAndPast,
      future,
      combined,
      exclusions: Object.freeze({ ...state.exclusions }),
      formulaNotes: SALES_FORMULA_NOTES,
      warnings: SALES_WARNINGS,
    });
  } catch (error) {
    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "denied" as const,
      report: "sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: resolvedRestaurantGuid,
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
      formulaNotes: SALES_FORMULA_NOTES,
      warnings: SALES_WARNINGS,
    });
  }
}

function aggregateOrder(
  state: SalesFoldState,
  order: NormalizedOrder,
  generatedAtEpochMs: number,
): void {
  if (order.deleted) {
    state.exclusions.deletedOrders += 1;
    return;
  }
  if (order.voided) {
    state.exclusions.voidedOrders += 1;
    return;
  }
  if (order.excessFood) {
    state.exclusions.excessFoodOrders += 1;
    return;
  }

  const bucket = isFutureOrder(order, generatedAtEpochMs)
    ? state.future
    : state.currentAndPast;
  bucket.orderCount += 1;
  if (order.numberOfGuests !== undefined) {
    bucket.knownGuestCount += order.numberOfGuests;
    bucket.ordersWithKnownGuestCount += 1;
  }

  for (const check of order.checks) {
    if (check.deleted) {
      state.exclusions.deletedChecks += 1;
      continue;
    }
    if (check.voided) {
      state.exclusions.voidedChecks += 1;
      continue;
    }

    bucket.checkCount += 1;
    bucket.grossCheckAmountMinor = addMinorUnits(
      bucket.grossCheckAmountMinor,
      check.amountHundredths,
    );
    bucket.taxAmountMinor = addMinorUnits(
      bucket.taxAmountMinor,
      check.taxAmountHundredths,
    );
    if (check.taxExempt) {
      bucket.taxExemptCheckCount += 1;
    }

    const fundraisingContributionAmountMinor = check.appliedServiceCharges
      .filter((charge) => charge.serviceChargeCategory === "FUNDRAISING_CAMPAIGN")
      .reduce(
        (sum, charge) => addMinorUnits(sum, charge.chargeAmountHundredths),
        0,
      );
    const serviceChargeAmountMinor = check.appliedServiceCharges
      .filter((charge) => charge.serviceChargeCategory !== "FUNDRAISING_CAMPAIGN")
      .reduce(
        (sum, charge) => addMinorUnits(sum, charge.chargeAmountHundredths),
        0,
      );

    let selectionExclusionAmountMinor = 0;
    let deferredSelectionAmountMinor = 0;
    let houseAccountBalancePaymentAmountMinor = 0;
    for (const selection of check.selections) {
      if (selection.voided) {
        continue;
      }
      const deferred = selection.deferred;
      const houseAccount =
        selection.selectionType === "HOUSE_ACCOUNT_PAY_BALANCE";
      if (deferred || houseAccount) {
        selectionExclusionAmountMinor = addMinorUnits(
          selectionExclusionAmountMinor,
          selection.priceHundredths,
        );
      }
      if (deferred) {
        deferredSelectionAmountMinor = addMinorUnits(
          deferredSelectionAmountMinor,
          selection.priceHundredths,
        );
      }
      if (houseAccount) {
        houseAccountBalancePaymentAmountMinor = addMinorUnits(
          houseAccountBalancePaymentAmountMinor,
          selection.priceHundredths,
        );
      }
    }

    const embeddedRefundAmountMinor = check.payments.reduce(
      (sum, payment) => addMinorUnits(
        sum,
        payment.refund?.refundAmountHundredths ?? 0,
      ),
      0,
    );

    bucket.netOrderAmountMinor = addMinorUnits(
      bucket.netOrderAmountMinor,
      check.amountHundredths,
      -fundraisingContributionAmountMinor,
    );
    bucket.netSalesMinor = addMinorUnits(
      bucket.netSalesMinor,
      check.amountHundredths,
      -fundraisingContributionAmountMinor,
      -selectionExclusionAmountMinor,
      -embeddedRefundAmountMinor,
    );
    bucket.selectionExclusionAmountMinor = addMinorUnits(
      bucket.selectionExclusionAmountMinor,
      selectionExclusionAmountMinor,
    );
    bucket.deferredSelectionAmountMinor = addMinorUnits(
      bucket.deferredSelectionAmountMinor,
      deferredSelectionAmountMinor,
    );
    bucket.houseAccountBalancePaymentAmountMinor = addMinorUnits(
      bucket.houseAccountBalancePaymentAmountMinor,
      houseAccountBalancePaymentAmountMinor,
    );
    bucket.fundraisingContributionAmountMinor = addMinorUnits(
      bucket.fundraisingContributionAmountMinor,
      fundraisingContributionAmountMinor,
    );
    bucket.ordersEmbeddedRefundAmountMinor = addMinorUnits(
      bucket.ordersEmbeddedRefundAmountMinor,
      embeddedRefundAmountMinor,
    );
    bucket.serviceChargeAmountMinor = addMinorUnits(
      bucket.serviceChargeAmountMinor,
      serviceChargeAmountMinor,
    );
    bucket.discountAmountMinor = addMinorUnits(
      bucket.discountAmountMinor,
      discountsForCheck(check.appliedDiscounts, check.selections),
    );
  }
}

function discountsForCheck(
  checkDiscounts: readonly NormalizedAppliedDiscount[],
  selections: readonly NormalizedSelection[],
): number {
  let total = checkDiscounts.reduce(
    (sum, discount) => addMinorUnits(sum, discount.discountAmountHundredths),
    0,
  );
  const stack = [...selections];
  while (stack.length > 0) {
    const selection = stack.pop();
    if (
      selection === undefined
      || selection.voided
      || selection.deferred
      || selection.selectionType === "HOUSE_ACCOUNT_PAY_BALANCE"
    ) {
      continue;
    }
    total = addMinorUnits(
      total,
      ...selection.appliedDiscounts.map((discount) => discount.discountAmountHundredths),
    );
    stack.push(...selection.modifiers);
  }
  return total;
}

function isFutureOrder(
  order: NormalizedOrder,
  generatedAtEpochMs: number,
): boolean {
  return order.promisedDate !== undefined
    && Date.parse(order.promisedDate) > generatedAtEpochMs;
}

function capabilityDenied(
  businessDate: number,
  generatedAtEpochMs: number,
  restaurantGuid: string,
  restaurantName: string,
  denial: CapabilityDenial,
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
): SalesSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "sales_summary" as const,
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
    formulaNotes: SALES_FORMULA_NOTES,
    warnings: SALES_WARNINGS,
  });
}

function assertValidBusinessDate(value: number): void {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) {
    throw invalidBusinessDate();
  }
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw invalidBusinessDate();
  }
}

function invalidBusinessDate(): ReportComputationError {
  return new ReportComputationError(
    "report_business_date_invalid",
    "Report business date must be a real calendar date in yyyyMMdd form.",
  );
}

function emptyBucket(): MutableBucket {
  return {
    orderCount: 0,
    checkCount: 0,
    knownGuestCount: 0,
    ordersWithKnownGuestCount: 0,
    grossCheckAmountMinor: 0,
    netOrderAmountMinor: 0,
    netSalesMinor: 0,
    taxAmountMinor: 0,
    discountAmountMinor: 0,
    serviceChargeAmountMinor: 0,
    selectionExclusionAmountMinor: 0,
    deferredSelectionAmountMinor: 0,
    houseAccountBalancePaymentAmountMinor: 0,
    fundraisingContributionAmountMinor: 0,
    ordersEmbeddedRefundAmountMinor: 0,
    taxExemptCheckCount: 0,
  };
}

function freezeBucket(bucket: MutableBucket): SalesSummaryBucket {
  return Object.freeze({ ...bucket });
}

function addBuckets(
  left: SalesSummaryBucket,
  right: SalesSummaryBucket,
): SalesSummaryBucket {
  return Object.freeze({
    orderCount: left.orderCount + right.orderCount,
    checkCount: left.checkCount + right.checkCount,
    knownGuestCount: left.knownGuestCount + right.knownGuestCount,
    ordersWithKnownGuestCount:
      left.ordersWithKnownGuestCount + right.ordersWithKnownGuestCount,
    grossCheckAmountMinor: addMinorUnits(
      left.grossCheckAmountMinor,
      right.grossCheckAmountMinor,
    ),
    netOrderAmountMinor: addMinorUnits(
      left.netOrderAmountMinor,
      right.netOrderAmountMinor,
    ),
    netSalesMinor: addMinorUnits(left.netSalesMinor, right.netSalesMinor),
    taxAmountMinor: addMinorUnits(left.taxAmountMinor, right.taxAmountMinor),
    discountAmountMinor: addMinorUnits(
      left.discountAmountMinor,
      right.discountAmountMinor,
    ),
    serviceChargeAmountMinor: addMinorUnits(
      left.serviceChargeAmountMinor,
      right.serviceChargeAmountMinor,
    ),
    selectionExclusionAmountMinor: addMinorUnits(
      left.selectionExclusionAmountMinor,
      right.selectionExclusionAmountMinor,
    ),
    deferredSelectionAmountMinor: addMinorUnits(
      left.deferredSelectionAmountMinor,
      right.deferredSelectionAmountMinor,
    ),
    houseAccountBalancePaymentAmountMinor: addMinorUnits(
      left.houseAccountBalancePaymentAmountMinor,
      right.houseAccountBalancePaymentAmountMinor,
    ),
    fundraisingContributionAmountMinor: addMinorUnits(
      left.fundraisingContributionAmountMinor,
      right.fundraisingContributionAmountMinor,
    ),
    ordersEmbeddedRefundAmountMinor: addMinorUnits(
      left.ordersEmbeddedRefundAmountMinor,
      right.ordersEmbeddedRefundAmountMinor,
    ),
    taxExemptCheckCount:
      left.taxExemptCheckCount + right.taxExemptCheckCount,
  });
}
