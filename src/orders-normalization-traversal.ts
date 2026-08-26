import { z } from "zod";

import { exactDecimalFromNumber } from "./exact-decimal.js";
import { assertRetrievalMetadata, assertStandardRestaurantScope, assertUnique, moneyToCurrencyHundredths, normalizeQuery, normalizeRestaurantGuid, sourceInvalid } from "./orders-normalization-helpers.js";
import { sourceCheckSchema, sourceOrderSchema, sourceRefundDetailsSchema, sourceSelectionSchema, type SourceAppliedDiscount, type SourceAppliedServiceCharge, type SourceAppliedTax, type SourceCheck, type SourceOrder, type SourcePayment, type SourceReference, type SourceSelection } from "./orders-normalization-source.js";
import { OrdersNormalizationError, type BatchEntityGuards, type NormalizedAppliedDiscount, type NormalizedAppliedTax, type NormalizedCheck, type NormalizedOrder, type NormalizedOrdersBatch, type NormalizedOrdersPageProvenance, type NormalizedOrdersQuery, type NormalizedPayment, type NormalizedRefundDetails, type NormalizedReference, type NormalizedSelection, type NormalizedServiceCharge } from "./orders-normalization-types.js";
import type { ToastLocation } from "./locations.js";
import type { ToastDetailedJsonResult } from "./transport.js";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/u;

export function normalizeOrdersPages(options: { readonly location: ToastLocation; readonly query: NormalizedOrdersQuery; readonly pages: readonly ToastDetailedJsonResult[] }): NormalizedOrdersBatch {
  const restaurantGuid = normalizeRestaurantGuid(options.location.restaurantGuid);
  if (!CURRENCY_CODE_PATTERN.test(options.location.currencyCode) || options.pages.length === 0) throw sourceInvalid();
  const query = normalizeQuery(options.query);
  const seenOrderGuids = new Set<string>();
  const guards: BatchEntityGuards = { checkGuids: new Set(), selectionGuids: new Set(), paymentGuids: new Set(), serviceChargeGuids: new Set(), appliedTaxGuids: new Set() };
  const orders: NormalizedOrder[] = [];
  const pages: NormalizedOrdersPageProvenance[] = [];
  for (let pageIndex = 0; pageIndex < options.pages.length; pageIndex += 1) {
    const page = options.pages[pageIndex];
    if (page === undefined) throw sourceInvalid();
    assertStandardRestaurantScope(page, restaurantGuid);
    assertRetrievalMetadata(page);
    const rawOrders = z.array(z.unknown()).safeParse(page.body);
    if (!rawOrders.success) throw sourceInvalid();
    for (const rawOrder of rawOrders.data) {
      const parsed = sourceOrderSchema.safeParse(rawOrder);
      if (!parsed.success) throw sourceInvalid();
      if (query.mode === "business_date" && parsed.data.businessDate !== query.businessDate) throw new OrdersNormalizationError("orders_business_date_mismatch", "Orders business-date source contained an order outside the requested business date.");
      const guid = parsed.data.guid.toLowerCase();
      assertUnique(seenOrderGuids, guid, "order");
      orders.push(normalizeOrder(parsed.data, guards));
    }
    pages.push(Object.freeze({ pageNumber: pageIndex + 1, recordCount: rawOrders.data.length, retrievedAtEpochMs: page.retrievedAtEpochMs, upstreamRequestId: page.upstreamRequestId }));
  }
  return Object.freeze({ source: "standard_api", restaurantGuid, currencyCode: options.location.currencyCode, timezone: options.location.timezone, closeoutHour: options.location.closeoutHour, query, pages: Object.freeze(pages), pageCount: pages.length, recordCount: orders.length, orders: Object.freeze(orders) });
}

function normalizeOrder(source: SourceOrder, guards: BatchEntityGuards): NormalizedOrder {
  const discounts = new Set<string>();
  const checks = source.checks.map((check) => { const guid = check.guid.toLowerCase(); assertUnique(guards.checkGuids, guid, "check"); return normalizeCheck(check, guards, discounts); });
  return Object.freeze({ guid: source.guid.toLowerCase(), businessDate: source.businessDate ?? undefined, openedDate: source.openedDate, modifiedDate: source.modifiedDate, promisedDate: source.promisedDate ?? undefined, scheduled: source.promisedDate != null, approvalStatus: source.approvalStatus ?? undefined, source: source.source ?? undefined, numberOfGuests: source.numberOfGuests, diningOption: normalizeReference(source.diningOption), revenueCenter: normalizeReference(source.revenueCenter), restaurantService: normalizeReference(source.restaurantService), excessFood: source.excessFood, deleted: source.deleted, voided: source.voided, voidDate: source.voidDate, voidBusinessDate: source.voidBusinessDate, checks: Object.freeze(checks) });
}

function normalizeCheck(source: SourceCheck, guards: BatchEntityGuards, discounts: Set<string>): NormalizedCheck {
  const selections = source.selections.map((selection) => normalizeSelectionIterative(selection, guards.selectionGuids, guards.appliedTaxGuids));
  const payments = source.payments.map((payment) => { const guid = payment.guid.toLowerCase(); assertUnique(guards.paymentGuids, guid, "payment"); return normalizePayment(payment); });
  const charges = source.appliedServiceCharges.map((charge) => { const guid = charge.guid.toLowerCase(); assertUnique(guards.serviceChargeGuids, guid, "service charge"); return normalizeServiceCharge(charge, guards.appliedTaxGuids); });
  const appliedDiscounts = source.appliedDiscounts.map((discount) => { const guid = discount.guid.toLowerCase(); assertUnique(discounts, guid, "discount"); return normalizeAppliedDiscount(discount); });
  return Object.freeze({ guid: source.guid.toLowerCase(), amountHundredths: moneyToCurrencyHundredths(source.amount), taxAmountHundredths: moneyToCurrencyHundredths(source.taxAmount), totalAmountHundredths: moneyToCurrencyHundredths(source.totalAmount), taxExempt: source.taxExempt, deleted: source.deleted, voided: source.voided, voidDate: source.voidDate, voidBusinessDate: source.voidBusinessDate, paymentStatus: source.paymentStatus, selections: Object.freeze(selections), payments: Object.freeze(payments), appliedServiceCharges: Object.freeze(charges), appliedDiscounts: Object.freeze(appliedDiscounts) });
}

interface SelectionFrame { readonly source: SourceSelection; readonly children: NormalizedSelection[]; nextModifier: number; }
function normalizeSelectionIterative(raw: unknown, seen: Set<string>, taxes: Set<string>): NormalizedSelection {
  const root = parseSelection(raw, seen); const stack: SelectionFrame[] = [{ source: root, children: [], nextModifier: 0 }];
  while (stack.length > 0) { const current = stack[stack.length - 1]; if (current === undefined) throw sourceInvalid(); if (current.nextModifier < current.source.modifiers.length) { const child = parseSelection(current.source.modifiers[current.nextModifier], seen); current.nextModifier += 1; stack.push({ source: child, children: [], nextModifier: 0 }); continue; } const result = freezeSelection(current.source, current.children, taxes); stack.pop(); const parent = stack[stack.length - 1]; if (parent === undefined) return result; parent.children.push(result); }
  throw sourceInvalid();
}
function parseSelection(raw: unknown, seen: Set<string>): SourceSelection { const parsed = sourceSelectionSchema.safeParse(raw); if (!parsed.success) throw sourceInvalid(); const source = parsed.data as SourceSelection; assertUnique(seen, source.guid.toLowerCase(), "selection"); return source; }
function freezeSelection(source: SourceSelection, modifiers: readonly NormalizedSelection[], taxes: Set<string>): NormalizedSelection {
  const discounts = new Set<string>(); const appliedDiscounts = source.appliedDiscounts.map((discount) => { assertUnique(discounts, discount.guid.toLowerCase(), "selection discount"); return normalizeAppliedDiscount(discount); });
  return Object.freeze({ guid: source.guid.toLowerCase(), item: normalizeReference(source.item), itemGroup: normalizeReference(source.itemGroup), optionGroup: normalizeReference(source.optionGroup), salesCategory: normalizeReference(source.salesCategory), diningOption: normalizeReference(source.diningOption), quantity: source.quantity, unitOfMeasure: source.unitOfMeasure ?? undefined, selectionType: source.selectionType ?? undefined, priceHundredths: moneyToCurrencyHundredths(source.price), preDiscountPriceHundredths: moneyToCurrencyHundredths(source.preDiscountPrice), taxHundredths: source.tax === undefined ? undefined : moneyToCurrencyHundredths(source.tax), appliedTaxes: normalizeAppliedTaxes(source.appliedTaxes, taxes), deferred: source.deferred, voided: source.voided, voidDate: source.voidDate, voidBusinessDate: source.voidBusinessDate, appliedDiscounts: Object.freeze(appliedDiscounts), refundDetails: normalizeRefundDetails(source.refundDetails), modifiers: Object.freeze([...modifiers]) });
}
function normalizePayment(source: SourcePayment): NormalizedPayment { return Object.freeze({ guid: source.guid.toLowerCase(), type: source.type, amountHundredths: moneyToCurrencyHundredths(source.amount), tipAmountHundredths: moneyToCurrencyHundredths(source.tipAmount), paidDate: source.paidDate, paidBusinessDate: source.paidBusinessDate, paymentStatus: source.paymentStatus ?? undefined, refundStatus: source.refundStatus ?? undefined, refund: source.refund == null ? undefined : Object.freeze({ refundAmountHundredths: moneyToCurrencyHundredths(source.refund.refundAmount), tipRefundAmountHundredths: moneyToCurrencyHundredths(source.refund.tipRefundAmount), refundDate: source.refund.refundDate, refundBusinessDate: source.refund.refundBusinessDate }), voided: source.voidInfo != null || source.paymentStatus === "VOIDED", voidDate: source.voidInfo?.voidDate, voidBusinessDate: source.voidInfo?.voidBusinessDate, otherPayment: normalizeReference(source.otherPayment) }); }
function normalizeServiceCharge(source: SourceAppliedServiceCharge, taxes: Set<string>): NormalizedServiceCharge { const serviceCharge = normalizeReference(source.serviceCharge); if (serviceCharge === undefined) throw sourceInvalid(); return Object.freeze({ guid: source.guid.toLowerCase(), serviceCharge, chargeAmountHundredths: moneyToCurrencyHundredths(source.chargeAmount), chargeType: source.chargeType ?? undefined, gratuity: source.gratuity, serviceChargeCategory: source.serviceChargeCategory ?? "SERVICE_CHARGE", appliedTaxes: normalizeAppliedTaxes(source.appliedTaxes, taxes), refundDetails: normalizeRefundDetails(source.refundDetails) }); }
function normalizeAppliedTaxes(sources: readonly SourceAppliedTax[], seen: Set<string>): readonly NormalizedAppliedTax[] { return Object.freeze(sources.map((source) => { const guid = source.guid.toLowerCase(); const taxRate = normalizeReference(source.taxRate); if (taxRate === undefined) throw sourceInvalid(); assertUnique(seen, guid, "applied tax"); return Object.freeze({ guid, taxRate, rate: source.rate == null ? undefined : exactDecimalFromNumber(source.rate), taxAmount: exactDecimalFromNumber(source.taxAmount), type: source.type ?? undefined, facilitatorCollectAndRemitTax: source.facilitatorCollectAndRemitTax ?? undefined }); })); }
function normalizeAppliedDiscount(source: SourceAppliedDiscount): NormalizedAppliedDiscount { return Object.freeze({ guid: source.guid.toLowerCase(), discountAmountHundredths: moneyToCurrencyHundredths(source.discountAmount), nonTaxDiscountAmountHundredths: moneyToCurrencyHundredths(source.nonTaxDiscountAmount), discount: normalizeReference(source.discount), discountType: source.discountType ?? undefined, processingState: source.processingState ?? undefined }); }
function normalizeRefundDetails(source: z.infer<typeof sourceRefundDetailsSchema> | null | undefined): NormalizedRefundDetails | undefined { return source == null ? undefined : Object.freeze({ refundAmountHundredths: moneyToCurrencyHundredths(source.refundAmount), taxRefundAmountHundredths: moneyToCurrencyHundredths(source.taxRefundAmount) }); }
function normalizeReference(source: SourceReference | null | undefined): NormalizedReference | undefined { if (source == null) return undefined; const guid = source.guid ?? undefined; const multiLocationId = source.multiLocationId ?? undefined; return guid === undefined && multiLocationId === undefined ? undefined : Object.freeze({ guid, multiLocationId }); }
