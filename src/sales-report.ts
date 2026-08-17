import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import {
  normalizeOrdersPages,
  type NormalizedAppliedDiscount,
  type NormalizedOrder,
  type NormalizedSelection,
} from "./orders-normalization.js";
import {
  addMinorUnits,
  denialFromError,
  ReportComputationError,
  ReportProvenanceCollector,
  type ReportDenial,
  type ReportProvenance,
} from "./report-core.js";
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
  readonly status: "complete";
  readonly report: "sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string;
  readonly businessDate: number;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly currencyCode: string;
  readonly generatedAtEpochMs: number;
  readonly pagesProcessed: number;
  readonly sourceOrdersProcessed: number;
  readonly provenance: ReportProvenance;
  readonly currentAndPast: SalesSummaryBucket;
  readonly future: SalesSummaryBucket;
  readonly combined: SalesSummaryBucket;
  readonly exclusions: SalesSummaryExclusions;
  readonly warnings: readonly string[];
}

export interface SalesSummaryDenied {
  readonly status: "denied";
  readonly report: "sales_summary";
  readonly source: "standard_api";
  readonly restaurantGuid: string | undefined;
  readonly businessDate: number;
  readonly generatedAtEpochMs: number;
  readonly denial: ReportDenial;
  readonly missingScopes: readonly string[];
  readonly missingProvisionedScopes: readonly string[];
  readonly missingConnectionScopes: readonly string[];
  readonly excludedScopes: readonly string[];
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
  deferredSelectionAmountMinor: number;
  houseAccountBalancePaymentAmountMinor: number;
  fundraisingContributionAmountMinor: number;
  ordersEmbeddedRefundAmountMinor: number;
  taxExemptCheckCount: number;
}

interface SalesFoldState {
  readonly seenOrderGuids: Set<string>;
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

const SALES_WARNINGS = Object.freeze([
  "Future orders are reported separately using promisedDate compared with report generation time.",
  "Net sales reconcile refundAmount embedded on Orders payments; use toast_payment_summary for the complete paid/refunded/voided business-date payment lifecycle.",
]);

export async function buildSalesSummaryReport(
  runtime: ApplicationRuntime,
  input: {
    readonly businessDate: number;
    readonly restaurantGuid?: string;
  },
): Promise<SalesSummaryResult> {
  const generatedAtEpochMs = runtime.now();
  let resolvedRestaurantGuid = input.restaurantGuid?.toLowerCase();

  try {
    const location = await runtime.getLocation(input.restaurantGuid);
    resolvedRestaurantGuid = location.restaurantGuid;
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
        capability,
      );
    }

    const state: SalesFoldState = {
      seenOrderGuids: new Set<string>(),
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

    await runtime.toastHttpClient.foldOrdersBulkPages(
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
          if (foldState.seenOrderGuids.has(order.guid)) {
            throw new ReportComputationError(
              "sales_duplicate_order_across_pages",
              "The Orders traversal returned a repeated order across pages.",
            );
          }
          foldState.seenOrderGuids.add(order.guid);
          aggregateOrder(
            foldState,
            order,
            generatedAtEpochMs,
          );
        }

        return foldState;
      },
    );

    const currentAndPast = freezeBucket(state.currentAndPast);
    const future = freezeBucket(state.future);
    const combined = addBuckets(currentAndPast, future);

    return Object.freeze({
      status: "complete" as const,
      report: "sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: location.restaurantGuid,
      businessDate: input.businessDate,
      timezone: location.timezone,
      closeoutHour: location.closeoutHour,
      currencyCode: location.currencyCode,
      generatedAtEpochMs,
      pagesProcessed: state.pagesProcessed,
      sourceOrdersProcessed: state.sourceOrdersProcessed,
      provenance: state.provenance.snapshot(),
      currentAndPast,
      future,
      combined,
      exclusions: Object.freeze({ ...state.exclusions }),
      warnings: SALES_WARNINGS,
    });
  } catch (error) {
    return Object.freeze({
      status: "denied" as const,
      report: "sales_summary" as const,
      source: "standard_api" as const,
      restaurantGuid: resolvedRestaurantGuid,
      businessDate: input.businessDate,
      generatedAtEpochMs,
      denial: denialFromError(error),
      missingScopes: Object.freeze([]),
      missingProvisionedScopes: Object.freeze([]),
      missingConnectionScopes: Object.freeze([]),
      excludedScopes: Object.freeze([]),
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
      check.amountMinor,
    );
    bucket.taxAmountMinor = addMinorUnits(
      bucket.taxAmountMinor,
      check.taxAmountMinor,
    );
    if (check.taxExempt) {
      bucket.taxExemptCheckCount += 1;
    }

    const fundraisingContributionAmountMinor = check.appliedServiceCharges
      .filter((charge) => charge.serviceChargeCategory === "FUNDRAISING_CAMPAIGN")
      .reduce(
        (sum, charge) => addMinorUnits(sum, charge.chargeAmountMinor),
        0,
      );
    const serviceChargeAmountMinor = check.appliedServiceCharges
      .filter((charge) => charge.serviceChargeCategory !== "FUNDRAISING_CAMPAIGN")
      .reduce(
        (sum, charge) => addMinorUnits(sum, charge.chargeAmountMinor),
        0,
      );

    // Toast's net-sales guide says to inspect `check.selections`. Do not walk
    // nested modifiers for these deductions: Selection.price is already the
    // final net item price after modifier prices, so recursively subtracting
    // modifier prices would double-count the exclusion.
    let deferredSelectionAmountMinor = 0;
    let houseAccountBalancePaymentAmountMinor = 0;
    for (const selection of check.selections) {
      if (selection.voided) {
        continue;
      }
      if (selection.deferred) {
        deferredSelectionAmountMinor = addMinorUnits(
          deferredSelectionAmountMinor,
          selection.priceMinor,
        );
      }
      if (selection.selectionType === "HOUSE_ACCOUNT_PAY_BALANCE") {
        houseAccountBalancePaymentAmountMinor = addMinorUnits(
          houseAccountBalancePaymentAmountMinor,
          selection.priceMinor,
        );
      }
    }

    const embeddedRefundAmountMinor = check.payments.reduce(
      (sum, payment) => addMinorUnits(
        sum,
        payment.refund?.refundAmountMinor ?? 0,
      ),
      0,
    );

    bucket.netOrderAmountMinor = addMinorUnits(
      bucket.netOrderAmountMinor,
      check.amountMinor,
      -fundraisingContributionAmountMinor,
    );
    bucket.netSalesMinor = addMinorUnits(
      bucket.netSalesMinor,
      check.amountMinor,
      -fundraisingContributionAmountMinor,
      -deferredSelectionAmountMinor,
      -houseAccountBalancePaymentAmountMinor,
      -embeddedRefundAmountMinor,
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
    (sum, discount) => addMinorUnits(sum, discount.discountAmountMinor),
    0,
  );
  const stack = [...selections];
  while (stack.length > 0) {
    const selection = stack.pop();
    if (selection === undefined || selection.voided || selection.deferred) {
      continue;
    }
    total = addMinorUnits(
      total,
      ...selection.appliedDiscounts.map((discount) => discount.discountAmountMinor),
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
  denial: CapabilityDenial,
): SalesSummaryDenied {
  return Object.freeze({
    status: "denied" as const,
    report: "sales_summary" as const,
    source: "standard_api" as const,
    restaurantGuid,
    businessDate,
    generatedAtEpochMs,
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
    warnings: SALES_WARNINGS,
  });
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
