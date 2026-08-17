import { z } from "zod";

import type { ToastLocation } from "./locations.js";
import type { ToastDetailedJsonResult } from "./transport.js";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;
const BUSINESS_DATE_PATTERN = /^\d{8}$/u;

const guidSchema = z.string().uuid();
const openEnumSchema = z.string().min(1);
const sourceDateTimeSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be a parseable date-time",
  });
const businessDateSchema = z
  .number()
  .int()
  .refine(isValidBusinessDate, { message: "must be a valid yyyyMMdd date" });
const sourceMoneySchema = z.number().finite();
const sourceQuantitySchema = z.number().finite();

const sourceReferenceSchema = z
  .object({
    guid: z.union([z.string().min(1), z.null()]).optional(),
    multiLocationId: z.union([z.string().min(1), z.null()]).optional(),
  })
  .passthrough();

const sourceRefundSchema = z
  .object({
    refundAmount: sourceMoneySchema,
    tipRefundAmount: sourceMoneySchema,
    refundDate: sourceDateTimeSchema.optional(),
    refundBusinessDate: businessDateSchema.optional(),
  })
  .passthrough();

const sourceRefundDetailsSchema = z
  .object({
    refundAmount: sourceMoneySchema,
    taxRefundAmount: sourceMoneySchema,
  })
  .passthrough();

const sourceAppliedDiscountSchema = z
  .object({
    guid: guidSchema,
    discountAmount: sourceMoneySchema,
    nonTaxDiscountAmount: sourceMoneySchema,
    discount: sourceReferenceSchema.optional().nullable(),
    discountType: openEnumSchema.optional().nullable(),
    processingState: openEnumSchema.optional().nullable(),
  })
  .passthrough();

const sourceAppliedServiceChargeSchema = z
  .object({
    guid: guidSchema,
    chargeAmount: sourceMoneySchema,
    serviceCharge: sourceReferenceSchema,
    chargeType: openEnumSchema.optional().nullable(),
    gratuity: z.boolean(),
    serviceChargeCategory: openEnumSchema.optional().nullable(),
    refundDetails: sourceRefundDetailsSchema.optional().nullable(),
  })
  .passthrough();

const sourcePaymentSchema = z
  .object({
    guid: guidSchema,
    type: openEnumSchema,
    amount: sourceMoneySchema,
    tipAmount: sourceMoneySchema,
    paidDate: sourceDateTimeSchema.optional(),
    paidBusinessDate: businessDateSchema.optional(),
    paymentStatus: openEnumSchema.optional().nullable(),
    refundStatus: openEnumSchema.optional().nullable(),
    refund: sourceRefundSchema.optional().nullable(),
    voidInfo: z
      .object({
        voidDate: sourceDateTimeSchema.optional(),
        voidBusinessDate: businessDateSchema.optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
    otherPayment: sourceReferenceSchema.optional().nullable(),
  })
  .passthrough();

const sourceSelectionSchema = z
  .object({
    guid: guidSchema,
    item: sourceReferenceSchema.optional().nullable(),
    itemGroup: sourceReferenceSchema.optional().nullable(),
    optionGroup: sourceReferenceSchema.optional().nullable(),
    salesCategory: sourceReferenceSchema.optional().nullable(),
    quantity: sourceQuantitySchema,
    unitOfMeasure: openEnumSchema.optional().nullable(),
    selectionType: openEnumSchema.optional().nullable(),
    price: sourceMoneySchema,
    preDiscountPrice: sourceMoneySchema,
    tax: sourceMoneySchema.optional(),
    deferred: z.boolean(),
    voided: z.boolean(),
    voidDate: sourceDateTimeSchema.optional(),
    voidBusinessDate: businessDateSchema.optional(),
    appliedDiscounts: z.array(sourceAppliedDiscountSchema).default([]),
    refundDetails: sourceRefundDetailsSchema.optional().nullable(),
    modifiers: z.array(z.unknown()).default([]),
  })
  .passthrough();

const sourceCheckSchema = z
  .object({
    guid: guidSchema,
    amount: sourceMoneySchema,
    taxAmount: sourceMoneySchema,
    totalAmount: sourceMoneySchema,
    deleted: z.boolean(),
    voided: z.boolean(),
    voidDate: sourceDateTimeSchema.optional(),
    voidBusinessDate: businessDateSchema.optional(),
    paymentStatus: openEnumSchema,
    selections: z.array(z.unknown()),
    payments: z.array(sourcePaymentSchema).default([]),
    appliedServiceCharges: z.array(sourceAppliedServiceChargeSchema).default([]),
    appliedDiscounts: z.array(sourceAppliedDiscountSchema).default([]),
  })
  .passthrough();

const sourceOrderSchema = z
  .object({
    guid: guidSchema,
    businessDate: businessDateSchema.optional().nullable(),
    openedDate: sourceDateTimeSchema.optional(),
    modifiedDate: sourceDateTimeSchema.optional(),
    promisedDate: sourceDateTimeSchema.optional().nullable(),
    approvalStatus: openEnumSchema.optional().nullable(),
    source: openEnumSchema.optional().nullable(),
    diningOption: sourceReferenceSchema.optional().nullable(),
    revenueCenter: sourceReferenceSchema.optional().nullable(),
    restaurantService: sourceReferenceSchema.optional().nullable(),
    excessFood: z.boolean(),
    deleted: z.boolean(),
    voided: z.boolean(),
    voidDate: sourceDateTimeSchema.optional(),
    voidBusinessDate: businessDateSchema.optional(),
    checks: z.array(sourceCheckSchema).min(1),
  })
  .passthrough();

type SourceOrder = z.infer<typeof sourceOrderSchema>;
type SourceCheck = z.infer<typeof sourceCheckSchema>;
type SourceSelection = z.infer<typeof sourceSelectionSchema>;
type SourcePayment = z.infer<typeof sourcePaymentSchema>;
type SourceAppliedServiceCharge = z.infer<
  typeof sourceAppliedServiceChargeSchema
>;
type SourceAppliedDiscount = z.infer<typeof sourceAppliedDiscountSchema>;

export type OrdersNormalizationErrorCode =
  | "orders_business_date_invalid"
  | "orders_duplicate_entity"
  | "orders_money_precision_invalid"
  | "orders_query_invalid"
  | "orders_source_invalid";

export class OrdersNormalizationError extends Error {
  readonly code: OrdersNormalizationErrorCode;

  constructor(code: OrdersNormalizationErrorCode, message: string) {
    super(message);
    this.name = "OrdersNormalizationError";
    this.code = code;
  }
}

export interface NormalizedReference {
  readonly guid: string | undefined;
  readonly multiLocationId: string | undefined;
}

export interface NormalizedAppliedDiscount {
  readonly guid: string;
  readonly discountAmountMinor: number;
  readonly nonTaxDiscountAmountMinor: number;
  readonly discount: NormalizedReference | undefined;
  readonly discountType: string | undefined;
  readonly processingState: string | undefined;
}

export interface NormalizedRefundDetails {
  readonly refundAmountMinor: number;
  readonly taxRefundAmountMinor: number;
}

export interface NormalizedServiceCharge {
  readonly guid: string;
  readonly serviceCharge: NormalizedReference;
  readonly chargeAmountMinor: number;
  readonly chargeType: string | undefined;
  readonly gratuity: boolean;
  /** Missing/null is normalized to Toast's documented regular category. */
  readonly serviceChargeCategory: string;
  readonly refundDetails: NormalizedRefundDetails | undefined;
}

export interface NormalizedPaymentRefund {
  readonly refundAmountMinor: number;
  readonly tipRefundAmountMinor: number;
  readonly refundDate: string | undefined;
  readonly refundBusinessDate: number | undefined;
}

export interface NormalizedPayment {
  readonly guid: string;
  readonly type: string;
  readonly amountMinor: number;
  readonly tipAmountMinor: number;
  readonly paidDate: string | undefined;
  readonly paidBusinessDate: number | undefined;
  readonly paymentStatus: string | undefined;
  readonly refundStatus: string | undefined;
  readonly refund: NormalizedPaymentRefund | undefined;
  readonly voided: boolean;
  readonly voidDate: string | undefined;
  readonly voidBusinessDate: number | undefined;
  readonly otherPayment: NormalizedReference | undefined;
}

export interface NormalizedSelection {
  readonly guid: string;
  readonly item: NormalizedReference | undefined;
  readonly itemGroup: NormalizedReference | undefined;
  readonly optionGroup: NormalizedReference | undefined;
  readonly salesCategory: NormalizedReference | undefined;
  readonly quantity: number;
  readonly unitOfMeasure: string | undefined;
  readonly selectionType: string | undefined;
  readonly priceMinor: number;
  readonly preDiscountPriceMinor: number;
  readonly taxMinor: number | undefined;
  readonly deferred: boolean;
  readonly voided: boolean;
  readonly voidDate: string | undefined;
  readonly voidBusinessDate: number | undefined;
  readonly appliedDiscounts: readonly NormalizedAppliedDiscount[];
  readonly refundDetails: NormalizedRefundDetails | undefined;
  readonly modifiers: readonly NormalizedSelection[];
}

export interface NormalizedCheck {
  readonly guid: string;
  readonly amountMinor: number;
  readonly taxAmountMinor: number;
  readonly totalAmountMinor: number;
  readonly deleted: boolean;
  readonly voided: boolean;
  readonly voidDate: string | undefined;
  readonly voidBusinessDate: number | undefined;
  readonly paymentStatus: string;
  readonly selections: readonly NormalizedSelection[];
  readonly payments: readonly NormalizedPayment[];
  readonly appliedServiceCharges: readonly NormalizedServiceCharge[];
  readonly appliedDiscounts: readonly NormalizedAppliedDiscount[];
}

export interface NormalizedOrder {
  readonly guid: string;
  readonly businessDate: number | undefined;
  readonly openedDate: string | undefined;
  readonly modifiedDate: string | undefined;
  readonly promisedDate: string | undefined;
  readonly scheduled: boolean;
  readonly approvalStatus: string | undefined;
  readonly source: string | undefined;
  readonly diningOption: NormalizedReference | undefined;
  readonly revenueCenter: NormalizedReference | undefined;
  readonly restaurantService: NormalizedReference | undefined;
  readonly excessFood: boolean;
  readonly deleted: boolean;
  readonly voided: boolean;
  readonly voidDate: string | undefined;
  readonly voidBusinessDate: number | undefined;
  readonly checks: readonly NormalizedCheck[];
}

export type NormalizedOrdersQuery =
  | {
      readonly mode: "business_date";
      readonly businessDate: number;
    }
  | {
      readonly mode: "modified_window";
      readonly startDate: string;
      readonly endDate: string;
    };

export interface NormalizedOrdersPageProvenance {
  readonly pageNumber: number;
  readonly recordCount: number;
  readonly retrievedAtEpochMs: number;
  readonly upstreamRequestId: string | undefined;
}

export interface NormalizedOrdersBatch {
  readonly source: "standard_api";
  readonly restaurantGuid: string;
  readonly currencyCode: string;
  readonly timezone: string;
  readonly closeoutHour: number;
  readonly query: NormalizedOrdersQuery;
  readonly pages: readonly NormalizedOrdersPageProvenance[];
  readonly pageCount: number;
  readonly recordCount: number;
  readonly orders: readonly NormalizedOrder[];
}

export function normalizeOrdersPages(options: {
  readonly location: ToastLocation;
  readonly query: NormalizedOrdersQuery;
  readonly pages: readonly ToastDetailedJsonResult[];
}): NormalizedOrdersBatch {
  const restaurantGuid = normalizeRestaurantGuid(options.location.restaurantGuid);
  if (!CURRENCY_CODE_PATTERN.test(options.location.currencyCode)) {
    throw sourceInvalid();
  }
  const query = normalizeQuery(options.query);
  if (options.pages.length === 0) {
    throw sourceInvalid();
  }

  const seenOrderGuids = new Set<string>();
  const orders: NormalizedOrder[] = [];
  const pageProvenance: NormalizedOrdersPageProvenance[] = [];

  for (let pageIndex = 0; pageIndex < options.pages.length; pageIndex += 1) {
    const page = options.pages[pageIndex];
    if (page === undefined) {
      throw sourceInvalid();
    }
    assertRetrievalMetadata(page);

    const rawOrders = z.array(z.unknown()).safeParse(page.body);
    if (!rawOrders.success) {
      throw sourceInvalid();
    }

    for (const rawOrder of rawOrders.data) {
      const parsed = sourceOrderSchema.safeParse(rawOrder);
      if (!parsed.success) {
        throw sourceInvalid();
      }
      const orderGuid = parsed.data.guid.toLowerCase();
      assertUnique(seenOrderGuids, orderGuid, "order");
      orders.push(normalizeOrder(parsed.data));
    }

    pageProvenance.push(Object.freeze({
      pageNumber: pageIndex + 1,
      recordCount: rawOrders.data.length,
      retrievedAtEpochMs: page.retrievedAtEpochMs,
      upstreamRequestId: page.upstreamRequestId,
    }));
  }

  return Object.freeze({
    source: "standard_api" as const,
    restaurantGuid,
    currencyCode: options.location.currencyCode,
    timezone: options.location.timezone,
    closeoutHour: options.location.closeoutHour,
    query,
    pages: Object.freeze(pageProvenance),
    pageCount: pageProvenance.length,
    recordCount: orders.length,
    orders: Object.freeze(orders),
  });
}

function normalizeOrder(source: SourceOrder): NormalizedOrder {
  const seenCheckGuids = new Set<string>();
  const seenSelectionGuids = new Set<string>();
  const seenPaymentGuids = new Set<string>();
  const seenServiceChargeGuids = new Set<string>();
  const seenDiscountGuids = new Set<string>();

  const checks = source.checks.map((check) => {
    const guid = check.guid.toLowerCase();
    assertUnique(seenCheckGuids, guid, "check");
    return normalizeCheck(check, {
      seenSelectionGuids,
      seenPaymentGuids,
      seenServiceChargeGuids,
      seenDiscountGuids,
    });
  });

  return Object.freeze({
    guid: source.guid.toLowerCase(),
    businessDate: source.businessDate ?? undefined,
    openedDate: source.openedDate,
    modifiedDate: source.modifiedDate,
    promisedDate: source.promisedDate ?? undefined,
    scheduled: source.promisedDate != null,
    approvalStatus: source.approvalStatus ?? undefined,
    source: source.source ?? undefined,
    diningOption: normalizeReference(source.diningOption),
    revenueCenter: normalizeReference(source.revenueCenter),
    restaurantService: normalizeReference(source.restaurantService),
    excessFood: source.excessFood,
    deleted: source.deleted,
    voided: source.voided,
    voidDate: source.voidDate,
    voidBusinessDate: source.voidBusinessDate,
    checks: Object.freeze(checks),
  });
}

function normalizeCheck(
  source: SourceCheck,
  seen: {
    readonly seenSelectionGuids: Set<string>;
    readonly seenPaymentGuids: Set<string>;
    readonly seenServiceChargeGuids: Set<string>;
    readonly seenDiscountGuids: Set<string>;
  },
): NormalizedCheck {
  const selections = source.selections.map((selection) =>
    normalizeSelectionIterative(selection, seen.seenSelectionGuids),
  );
  const payments = source.payments.map((payment) => {
    const guid = payment.guid.toLowerCase();
    assertUnique(seen.seenPaymentGuids, guid, "payment");
    return normalizePayment(payment);
  });
  const serviceCharges = source.appliedServiceCharges.map((charge) => {
    const guid = charge.guid.toLowerCase();
    assertUnique(seen.seenServiceChargeGuids, guid, "service charge");
    return normalizeServiceCharge(charge);
  });
  const discounts = source.appliedDiscounts.map((discount) => {
    const guid = discount.guid.toLowerCase();
    assertUnique(seen.seenDiscountGuids, guid, "discount");
    return normalizeAppliedDiscount(discount);
  });

  return Object.freeze({
    guid: source.guid.toLowerCase(),
    amountMinor: moneyToMinorUnits(source.amount),
    taxAmountMinor: moneyToMinorUnits(source.taxAmount),
    totalAmountMinor: moneyToMinorUnits(source.totalAmount),
    deleted: source.deleted,
    voided: source.voided,
    voidDate: source.voidDate,
    voidBusinessDate: source.voidBusinessDate,
    paymentStatus: source.paymentStatus,
    selections: Object.freeze(selections),
    payments: Object.freeze(payments),
    appliedServiceCharges: Object.freeze(serviceCharges),
    appliedDiscounts: Object.freeze(discounts),
  });
}

interface SelectionFrame {
  readonly source: SourceSelection;
  readonly children: NormalizedSelection[];
  nextModifier: number;
}

function normalizeSelectionIterative(
  rawSelection: unknown,
  seenSelectionGuids: Set<string>,
): NormalizedSelection {
  const root = parseSelection(rawSelection, seenSelectionGuids);
  const stack: SelectionFrame[] = [
    { source: root, children: [], nextModifier: 0 },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    if (current === undefined) {
      throw sourceInvalid();
    }

    if (current.nextModifier < current.source.modifiers.length) {
      const rawModifier = current.source.modifiers[current.nextModifier];
      current.nextModifier += 1;
      const modifier = parseSelection(rawModifier, seenSelectionGuids);
      stack.push({ source: modifier, children: [], nextModifier: 0 });
      continue;
    }

    const normalized = freezeSelection(current.source, current.children);
    stack.pop();
    const parent = stack[stack.length - 1];
    if (parent === undefined) {
      return normalized;
    }
    parent.children.push(normalized);
  }

  throw sourceInvalid();
}

function parseSelection(
  rawSelection: unknown,
  seenSelectionGuids: Set<string>,
): SourceSelection {
  const parsed = sourceSelectionSchema.safeParse(rawSelection);
  if (!parsed.success) {
    throw sourceInvalid();
  }
  const guid = parsed.data.guid.toLowerCase();
  assertUnique(seenSelectionGuids, guid, "selection");
  return parsed.data;
}

function freezeSelection(
  source: SourceSelection,
  modifiers: readonly NormalizedSelection[],
): NormalizedSelection {
  const seenDiscountGuids = new Set<string>();
  const discounts = source.appliedDiscounts.map((discount) => {
    const guid = discount.guid.toLowerCase();
    assertUnique(seenDiscountGuids, guid, "selection discount");
    return normalizeAppliedDiscount(discount);
  });

  return Object.freeze({
    guid: source.guid.toLowerCase(),
    item: normalizeReference(source.item),
    itemGroup: normalizeReference(source.itemGroup),
    optionGroup: normalizeReference(source.optionGroup),
    salesCategory: normalizeReference(source.salesCategory),
    quantity: source.quantity,
    unitOfMeasure: source.unitOfMeasure ?? undefined,
    selectionType: source.selectionType ?? undefined,
    priceMinor: moneyToMinorUnits(source.price),
    preDiscountPriceMinor: moneyToMinorUnits(source.preDiscountPrice),
    taxMinor:
      source.tax === undefined ? undefined : moneyToMinorUnits(source.tax),
    deferred: source.deferred,
    voided: source.voided,
    voidDate: source.voidDate,
    voidBusinessDate: source.voidBusinessDate,
    appliedDiscounts: Object.freeze(discounts),
    refundDetails: normalizeRefundDetails(source.refundDetails),
    modifiers: Object.freeze([...modifiers]),
  });
}

function normalizePayment(source: SourcePayment): NormalizedPayment {
  return Object.freeze({
    guid: source.guid.toLowerCase(),
    type: source.type,
    amountMinor: moneyToMinorUnits(source.amount),
    tipAmountMinor: moneyToMinorUnits(source.tipAmount),
    paidDate: source.paidDate,
    paidBusinessDate: source.paidBusinessDate,
    paymentStatus: source.paymentStatus ?? undefined,
    refundStatus: source.refundStatus ?? undefined,
    refund:
      source.refund == null
        ? undefined
        : Object.freeze({
            refundAmountMinor: moneyToMinorUnits(source.refund.refundAmount),
            tipRefundAmountMinor: moneyToMinorUnits(
              source.refund.tipRefundAmount,
            ),
            refundDate: source.refund.refundDate,
            refundBusinessDate: source.refund.refundBusinessDate,
          }),
    voided: source.voidInfo != null || source.paymentStatus === "VOIDED",
    voidDate: source.voidInfo?.voidDate,
    voidBusinessDate: source.voidInfo?.voidBusinessDate,
    otherPayment: normalizeReference(source.otherPayment),
  });
}

function normalizeServiceCharge(
  source: SourceAppliedServiceCharge,
): NormalizedServiceCharge {
  const serviceCharge = normalizeReference(source.serviceCharge);
  if (serviceCharge === undefined) {
    throw sourceInvalid();
  }

  return Object.freeze({
    guid: source.guid.toLowerCase(),
    serviceCharge,
    chargeAmountMinor: moneyToMinorUnits(source.chargeAmount),
    chargeType: source.chargeType ?? undefined,
    gratuity: source.gratuity,
    serviceChargeCategory: source.serviceChargeCategory ?? "SERVICE_CHARGE",
    refundDetails: normalizeRefundDetails(source.refundDetails),
  });
}

function normalizeAppliedDiscount(
  source: SourceAppliedDiscount,
): NormalizedAppliedDiscount {
  return Object.freeze({
    guid: source.guid.toLowerCase(),
    discountAmountMinor: moneyToMinorUnits(source.discountAmount),
    nonTaxDiscountAmountMinor: moneyToMinorUnits(
      source.nonTaxDiscountAmount,
    ),
    discount: normalizeReference(source.discount),
    discountType: source.discountType ?? undefined,
    processingState: source.processingState ?? undefined,
  });
}

function normalizeRefundDetails(
  source: z.infer<typeof sourceRefundDetailsSchema> | null | undefined,
): NormalizedRefundDetails | undefined {
  return source == null
    ? undefined
    : Object.freeze({
        refundAmountMinor: moneyToMinorUnits(source.refundAmount),
        taxRefundAmountMinor: moneyToMinorUnits(source.taxRefundAmount),
      });
}

function normalizeReference(
  source: z.infer<typeof sourceReferenceSchema> | null | undefined,
): NormalizedReference | undefined {
  if (source == null) {
    return undefined;
  }
  const guid = source.guid ?? undefined;
  const multiLocationId = source.multiLocationId ?? undefined;
  if (guid === undefined && multiLocationId === undefined) {
    return undefined;
  }
  return Object.freeze({ guid, multiLocationId });
}

function normalizeQuery(query: NormalizedOrdersQuery): NormalizedOrdersQuery {
  if (query.mode === "business_date") {
    if (!isValidBusinessDate(query.businessDate)) {
      throw new OrdersNormalizationError(
        "orders_business_date_invalid",
        "Orders business-date query must contain a valid yyyyMMdd date.",
      );
    }
    return Object.freeze({ ...query });
  }

  if (query.mode === "modified_window") {
    const start = Date.parse(query.startDate);
    const end = Date.parse(query.endDate);
    if (
      Number.isNaN(start)
      || Number.isNaN(end)
      || end <= start
      || query.startDate.length === 0
      || query.endDate.length === 0
    ) {
      throw new OrdersNormalizationError(
        "orders_query_invalid",
        "Orders modified-window query must contain a valid increasing date-time interval.",
      );
    }
    return Object.freeze({ ...query });
  }

  throw new OrdersNormalizationError(
    "orders_query_invalid",
    "Orders normalization received an unsupported query mode.",
  );
}

function moneyToMinorUnits(value: number): number {
  if (!Number.isFinite(value)) {
    throw moneyPrecisionInvalid();
  }

  // Toast documents Orders currency values at two decimal places. Comparing
  // the value with its two-decimal round-trip accepts normal JSON numbers
  // such as 10.1 despite IEEE-754 representation, while rejecting source
  // values that carry unsupported precision instead of silently rounding it.
  const twoDecimalRoundTrip = Number(value.toFixed(2));
  if (twoDecimalRoundTrip !== value) {
    throw moneyPrecisionInvalid();
  }

  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) {
    throw moneyPrecisionInvalid();
  }
  return minor;
}

function assertRetrievalMetadata(page: ToastDetailedJsonResult): void {
  if (
    !Number.isSafeInteger(page.retrievedAtEpochMs)
    || page.retrievedAtEpochMs < 0
    || (
      page.upstreamRequestId !== undefined
      && page.upstreamRequestId.length === 0
    )
  ) {
    throw sourceInvalid();
  }
}

function normalizeRestaurantGuid(value: string): string {
  const parsed = guidSchema.safeParse(value);
  if (!parsed.success) {
    throw sourceInvalid();
  }
  return parsed.data.toLowerCase();
}

function assertUnique(
  seen: Set<string>,
  guid: string,
  entity: string,
): void {
  if (seen.has(guid)) {
    throw new OrdersNormalizationError(
      "orders_duplicate_entity",
      `Orders normalization received a repeated ${entity} GUID.`,
    );
  }
  seen.add(guid);
}

function isValidBusinessDate(value: number): boolean {
  const text = String(value);
  if (!BUSINESS_DATE_PATTERN.test(text)) {
    return false;
  }

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

function sourceInvalid(): OrdersNormalizationError {
  return new OrdersNormalizationError(
    "orders_source_invalid",
    "Orders source data was not usable for deterministic normalization.",
  );
}

function moneyPrecisionInvalid(): OrdersNormalizationError {
  return new OrdersNormalizationError(
    "orders_money_precision_invalid",
    "Orders source contained a currency value that cannot be represented exactly in two decimal minor units.",
  );
}
