import type { ExactDecimal } from "./exact-decimal.js";

export type OrdersNormalizationErrorCode =
  | "orders_business_date_invalid"
  | "orders_business_date_mismatch"
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

export interface NormalizedReference { readonly guid: string | undefined; readonly multiLocationId: string | undefined; }
export interface NormalizedAppliedTax { readonly guid: string; readonly taxRate: NormalizedReference; readonly rate: ExactDecimal | undefined; readonly taxAmount: ExactDecimal; readonly type: string | undefined; readonly facilitatorCollectAndRemitTax: boolean | undefined; }
export interface NormalizedAppliedDiscount { readonly guid: string; readonly discountAmountHundredths: number; readonly nonTaxDiscountAmountHundredths: number; readonly discount: NormalizedReference | undefined; readonly discountType: string | undefined; readonly processingState: string | undefined; }
export interface NormalizedRefundDetails { readonly refundAmountHundredths: number; readonly taxRefundAmountHundredths: number; }
export interface NormalizedServiceCharge { readonly guid: string; readonly serviceCharge: NormalizedReference; readonly chargeAmountHundredths: number; readonly chargeType: string | undefined; readonly gratuity: boolean; readonly serviceChargeCategory: string; readonly appliedTaxes: readonly NormalizedAppliedTax[]; readonly refundDetails: NormalizedRefundDetails | undefined; }
export interface NormalizedPaymentRefund { readonly refundAmountHundredths: number; readonly tipRefundAmountHundredths: number; readonly refundDate: string | undefined; readonly refundBusinessDate: number | undefined; }
export interface NormalizedPayment { readonly guid: string; readonly type: string; readonly amountHundredths: number; readonly tipAmountHundredths: number; readonly paidDate: string | undefined; readonly paidBusinessDate: number | undefined; readonly paymentStatus: string | undefined; readonly refundStatus: string | undefined; readonly refund: NormalizedPaymentRefund | undefined; readonly voided: boolean; readonly voidDate: string | undefined; readonly voidBusinessDate: number | undefined; readonly otherPayment: NormalizedReference | undefined; }
export interface NormalizedSelection { readonly guid: string; readonly item: NormalizedReference | undefined; readonly itemGroup: NormalizedReference | undefined; readonly optionGroup: NormalizedReference | undefined; readonly salesCategory: NormalizedReference | undefined; readonly diningOption: NormalizedReference | undefined; readonly quantity: number; readonly unitOfMeasure: string | undefined; readonly selectionType: string | undefined; readonly priceHundredths: number; readonly preDiscountPriceHundredths: number; readonly taxHundredths: number | undefined; readonly appliedTaxes: readonly NormalizedAppliedTax[]; readonly deferred: boolean; readonly voided: boolean; readonly voidDate: string | undefined; readonly voidBusinessDate: number | undefined; readonly appliedDiscounts: readonly NormalizedAppliedDiscount[]; readonly refundDetails: NormalizedRefundDetails | undefined; readonly modifiers: readonly NormalizedSelection[]; }
export interface NormalizedCheck { readonly guid: string; readonly amountHundredths: number; readonly taxAmountHundredths: number; readonly totalAmountHundredths: number; readonly taxExempt: boolean; readonly deleted: boolean; readonly voided: boolean; readonly voidDate: string | undefined; readonly voidBusinessDate: number | undefined; readonly paymentStatus: string; readonly selections: readonly NormalizedSelection[]; readonly payments: readonly NormalizedPayment[]; readonly appliedServiceCharges: readonly NormalizedServiceCharge[]; readonly appliedDiscounts: readonly NormalizedAppliedDiscount[]; }
export interface NormalizedOrder { readonly guid: string; readonly businessDate: number | undefined; readonly openedDate: string | undefined; readonly modifiedDate: string | undefined; readonly promisedDate: string | undefined; readonly scheduled: boolean; readonly approvalStatus: string | undefined; readonly source: string | undefined; /** Identifier-only employee attribution. This remains internal to labor joins. */ readonly serverGuid: string | undefined; readonly numberOfGuests: number | undefined; readonly diningOption: NormalizedReference | undefined; readonly revenueCenter: NormalizedReference | undefined; readonly restaurantService: NormalizedReference | undefined; readonly excessFood: boolean; readonly deleted: boolean; readonly voided: boolean; readonly voidDate: string | undefined; readonly voidBusinessDate: number | undefined; readonly checks: readonly NormalizedCheck[]; }
export type NormalizedOrdersQuery = { readonly mode: "business_date"; readonly businessDate: number; } | { readonly mode: "modified_window"; readonly startDate: string; readonly endDate: string; };
export interface NormalizedOrdersPageProvenance { readonly pageNumber: number; readonly recordCount: number; readonly retrievedAtEpochMs: number; readonly upstreamRequestId: string | undefined; }
export interface NormalizedOrdersBatch { readonly source: "standard_api"; readonly restaurantGuid: string; readonly currencyCode: string; readonly timezone: string; readonly closeoutHour: number; readonly query: NormalizedOrdersQuery; readonly pages: readonly NormalizedOrdersPageProvenance[]; readonly pageCount: number; readonly recordCount: number; readonly orders: readonly NormalizedOrder[]; }
export interface BatchEntityGuards { readonly checkGuids: Set<string>; readonly selectionGuids: Set<string>; readonly paymentGuids: Set<string>; readonly serviceChargeGuids: Set<string>; readonly appliedTaxGuids: Set<string>; }
