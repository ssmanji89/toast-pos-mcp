import { z } from "zod";

import {
  createCapabilityContext,
  decideCapability,
  type CapabilityDenial,
} from "./capabilities.js";
import type { ToastLocationDiscoveryProvenance } from "./locations.js";
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

const MAX_PAYMENT_DETAILS_PER_REPORT = 5_000;
const businessDateSchema = z
  .number()
  .int()
  .refine(isValidBusinessDate, { message: "must be a real yyyyMMdd date" });
const guidSchema = z.string().uuid();
const sourceMoneySchema = z.number().finite();

/**
 * Payment detail parsing deliberately uses Zod's default strip behavior.
 * Toast payment objects may contain guest/card/tender metadata that the report
 * does not need; those unknown fields never survive this normalization step.
 */
const sourcePaymentSchema = z.object({
  guid: guidSchema,
  paidDate: z.string().optional().nullable(),
  paidBusinessDate: businessDateSchema.optional().nullable(),
  type: z.string().min(1),
  amount: sourceMoneySchema,
  tipAmount: sourceMoneySchema,
  paymentStatus: z.string().min(1).optional().nullable(),
  refundStatus: z.string().min(1).optional().nullable(),
  refund: z
    .object({
      refundAmount: sourceMoneySchema,
      tipRefundAmount: sourceMoneySchema,
      refundDate: z.string().optional().nullable(),
      refundBusinessDate: businessDateSchema.optional().nullable(),
    })
    .optional()
    .nullable(),
  voidInfo: z
    .object({
      voidDate: z.string().optional().nullable(),
      voidBusinessDate: businessDateSchema.optional().nullable(),
    })
    .optional()
    .nullable(),
});

type SourcePayment = z.infer<typeof sourcePaymentSchema>;

export interface PaymentTypeTotal {
  readonly type: string;
  readonly paymentCount: number;
  readonly amountMinor: number;
  readonly tipAmountMinor: number;
}

export interface PaymentStatusCount {
  readonly status: string;
  readonly paymentCount: number;
}

export interface PaymentSummaryComplete {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "complete";
  readonly report: "payment_summary";
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
  readonly eventListCount: 3;
  readonly paymentDetailsProcessed: number;
  readonly uniquePaymentCount: number;
  readonly paid: {
    readonly paymentCount: number;
    readonly amountMinor: number;
    readonly tipAmountMinor: number;
  };
  readonly refunded: {
    readonly paymentCount: number;
    readonly refundAmountMinor: number;
    readonly tipRefundAmountMinor: number;
  };
  readonly voided: {
    readonly paymentCount: number;
    readonly amountMinor: number;
  };
  readonly paidByType: readonly PaymentTypeTotal[];
  readonly paymentStatusCounts: readonly PaymentStatusCount[];
  readonly refundStatusCounts: readonly PaymentStatusCount[];
  readonly contextFreshness: ReportContextFreshness;
  readonly contextProvenance: ToastLocationDiscoveryProvenance;
  readonly provenance: ReportProvenance;
  readonly formulaNotes: readonly string[];
  readonly warnings: readonly string[];
}

export interface PaymentSummaryDenied {
  readonly schemaVersion: typeof STANDARD_REPORT_SCHEMA_VERSION;
  readonly status: "denied";
  readonly report: "payment_summary";
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

export type PaymentSummaryResult = PaymentSummaryComplete | PaymentSummaryDenied;

const PAYMENT_FORMULA_NOTES = Object.freeze([
  "Source mode uses three independent Orders API /payments business-date event lists: paidBusinessDate, refundBusinessDate, and voidBusinessDate; Standard and Analytics metrics are never mixed.",
  "Each unique payment GUID is hydrated once; a payment may contribute to more than one lifecycle event group when Toast reports matching dates.",
  "Paid amount/tip, refund amount/tip refund, and voided payment amount remain separate deterministic minor-unit totals.",
  "Payment detail parsing strips guest/card/tender fields that are outside this report contract before aggregation or serialization.",
]);

const PAYMENT_WARNINGS = Object.freeze([
  "Payment events are sourced independently by paidBusinessDate, refundBusinessDate, and voidBusinessDate; one payment can legitimately appear in more than one event group.",
  "For a finalized prior-day payment report, Toast recommends allowing post-closeout processing time for refunds, voids, and tip adjustments.",
]);

export async function buildPaymentSummaryReport(
  runtime: ApplicationRuntime,
  input: {
    readonly businessDate: number;
    readonly restaurantGuid?: string;
  },
  options: { readonly signal?: AbortSignal } = {},
): Promise<PaymentSummaryResult> {
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
    contextFreshness = locationContext.freshness;
    contextProvenance = locationContext.provenance;
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

    const provenance = new ReportProvenanceCollector();
    const paidIds = await retrievePaymentIds(
      runtime,
      location.restaurantGuid,
      input.businessDate,
      "paidBusinessDate",
      provenance,
      options.signal,
    );
    const refundIds = await retrievePaymentIds(
      runtime,
      location.restaurantGuid,
      input.businessDate,
      "refundBusinessDate",
      provenance,
      options.signal,
    );
    const voidIds = await retrievePaymentIds(
      runtime,
      location.restaurantGuid,
      input.businessDate,
      "voidBusinessDate",
      provenance,
      options.signal,
    );

    const paidSet = new Set(paidIds);
    const refundSet = new Set(refundIds);
    const voidSet = new Set(voidIds);
    const uniqueIds = orderedUnion(paidIds, refundIds, voidIds);
    if (uniqueIds.length > MAX_PAYMENT_DETAILS_PER_REPORT) {
      throw new ReportComputationError(
        "payment_identifier_bound_exceeded",
        `Payment summary exceeded the bounded detail count of ${MAX_PAYMENT_DETAILS_PER_REPORT}.`,
      );
    }

    let paidAmountMinor = 0;
    let paidTipAmountMinor = 0;
    let refundAmountMinor = 0;
    let tipRefundAmountMinor = 0;
    let voidAmountMinor = 0;
    const paidByType = new Map<string, {
      paymentCount: number;
      amountMinor: number;
      tipAmountMinor: number;
    }>();
    const paymentStatusCounts = new Map<string, number>();
    const refundStatusCounts = new Map<string, number>();

    for (const paymentGuid of uniqueIds) {
      const detail = await runtime.toastHttpClient.getJsonDetailedCancellable(
        {
          path: `/orders/v2/payments/${paymentGuid}`,
          restaurantGuid: location.restaurantGuid,
          rateLimitKey: "payments-detail",
        },
        { signal: options.signal },
      );
      provenance.add(detail);
      const payment = parsePayment(detail.body, paymentGuid);

      incrementStatus(paymentStatusCounts, payment.paymentStatus);
      incrementStatus(refundStatusCounts, payment.refundStatus);

      if (paidSet.has(paymentGuid)) {
        if (payment.paidBusinessDate !== input.businessDate) {
          throw paymentSourceInvalid();
        }
        const amountMinor = moneyToMinorUnits(payment.amount, "payment.amount");
        const tipAmountMinor = moneyToMinorUnits(
          payment.tipAmount,
          "payment.tipAmount",
        );
        paidAmountMinor = addMinorUnits(paidAmountMinor, amountMinor);
        paidTipAmountMinor = addMinorUnits(
          paidTipAmountMinor,
          tipAmountMinor,
        );
        const byType = paidByType.get(payment.type) ?? {
          paymentCount: 0,
          amountMinor: 0,
          tipAmountMinor: 0,
        };
        byType.paymentCount += 1;
        byType.amountMinor = addMinorUnits(byType.amountMinor, amountMinor);
        byType.tipAmountMinor = addMinorUnits(
          byType.tipAmountMinor,
          tipAmountMinor,
        );
        paidByType.set(payment.type, byType);
      }

      if (refundSet.has(paymentGuid)) {
        if (
          payment.refund === null
          || payment.refund === undefined
          || payment.refund.refundBusinessDate !== input.businessDate
        ) {
          throw paymentSourceInvalid();
        }
        refundAmountMinor = addMinorUnits(
          refundAmountMinor,
          moneyToMinorUnits(
            payment.refund.refundAmount,
            "payment.refund.refundAmount",
          ),
        );
        tipRefundAmountMinor = addMinorUnits(
          tipRefundAmountMinor,
          moneyToMinorUnits(
            payment.refund.tipRefundAmount,
            "payment.refund.tipRefundAmount",
          ),
        );
      }

      if (voidSet.has(paymentGuid)) {
        if (
          payment.voidInfo === null
          || payment.voidInfo === undefined
          || payment.voidInfo.voidBusinessDate !== input.businessDate
        ) {
          throw paymentSourceInvalid();
        }
        voidAmountMinor = addMinorUnits(
          voidAmountMinor,
          moneyToMinorUnits(payment.amount, "payment.amount"),
        );
      }
    }

    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "complete" as const,
      report: "payment_summary" as const,
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
      eventListCount: 3 as const,
      paymentDetailsProcessed: uniqueIds.length,
      uniquePaymentCount: uniqueIds.length,
      paid: Object.freeze({
        paymentCount: paidIds.length,
        amountMinor: paidAmountMinor,
        tipAmountMinor: paidTipAmountMinor,
      }),
      refunded: Object.freeze({
        paymentCount: refundIds.length,
        refundAmountMinor,
        tipRefundAmountMinor,
      }),
      voided: Object.freeze({
        paymentCount: voidIds.length,
        amountMinor: voidAmountMinor,
      }),
      paidByType: Object.freeze(
        [...paidByType.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([type, value]) => Object.freeze({ type, ...value })),
      ),
      paymentStatusCounts: freezeStatusCounts(paymentStatusCounts),
      refundStatusCounts: freezeStatusCounts(refundStatusCounts),
      contextFreshness,
      contextProvenance,
      provenance: provenance.snapshot(),
      formulaNotes: PAYMENT_FORMULA_NOTES,
      warnings: PAYMENT_WARNINGS,
    });
  } catch (error) {
    return Object.freeze({
      schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
      status: "denied" as const,
      report: "payment_summary" as const,
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
      formulaNotes: PAYMENT_FORMULA_NOTES,
      warnings: PAYMENT_WARNINGS,
    });
  }
}

async function retrievePaymentIds(
  runtime: ApplicationRuntime,
  restaurantGuid: string,
  businessDate: number,
  event: "paidBusinessDate" | "refundBusinessDate" | "voidBusinessDate",
  provenance: ReportProvenanceCollector,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const result = await runtime.toastHttpClient.getJsonDetailedCancellable(
    {
      path: "/orders/v2/payments",
      restaurantGuid,
      query: { [event]: businessDate },
      rateLimitKey: `payments-${event}`,
    },
    { signal },
  );
  provenance.add(result);
  const parsed = z.array(guidSchema).safeParse(result.body);
  if (!parsed.success) {
    throw paymentSourceInvalid();
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const rawGuid of parsed.data) {
    const guid = rawGuid.toLowerCase();
    if (seen.has(guid)) {
      throw new ReportComputationError(
        "payment_duplicate_identifier",
        "Toast returned a repeated payment GUID within one business-date event list.",
      );
    }
    seen.add(guid);
    ids.push(guid);
  }
  return Object.freeze(ids);
}

function parsePayment(body: unknown, expectedGuid: string): SourcePayment {
  const parsed = sourcePaymentSchema.safeParse(body);
  if (!parsed.success || parsed.data.guid.toLowerCase() !== expectedGuid) {
    throw paymentSourceInvalid();
  }
  return parsed.data;
}

function orderedUnion(
  ...groups: readonly (readonly string[])[]
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const guid of group) {
      if (!seen.has(guid)) {
        seen.add(guid);
        result.push(guid);
      }
    }
  }
  return Object.freeze(result);
}

function incrementStatus(
  counts: Map<string, number>,
  status: string | null | undefined,
): void {
  if (status === undefined || status === null) {
    return;
  }
  counts.set(status, (counts.get(status) ?? 0) + 1);
}

function freezeStatusCounts(
  counts: ReadonlyMap<string, number>,
): readonly PaymentStatusCount[] {
  return Object.freeze(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([status, paymentCount]) => Object.freeze({
        status,
        paymentCount,
      })),
  );
}

function capabilityDenied(
  businessDate: number,
  generatedAtEpochMs: number,
  restaurantGuid: string,
  restaurantName: string,
  denial: CapabilityDenial,
  contextFreshness: ReportContextFreshness,
  contextProvenance: ToastLocationDiscoveryProvenance,
): PaymentSummaryDenied {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "payment_summary" as const,
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
    formulaNotes: PAYMENT_FORMULA_NOTES,
    warnings: PAYMENT_WARNINGS,
  });
}

function assertValidBusinessDate(value: number): void {
  if (!isValidBusinessDate(value)) {
    throw new ReportComputationError(
      "report_business_date_invalid",
      "Report business date must be a real calendar date in yyyyMMdd form.",
    );
  }
}

function isValidBusinessDate(value: number): boolean {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

function paymentSourceInvalid(): ReportComputationError {
  return new ReportComputationError(
    "payment_source_invalid",
    "Toast payment source data was not usable for deterministic reporting.",
  );
}
