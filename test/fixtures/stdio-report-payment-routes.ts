import {
  BUSINESS_DATE,
  PAYMENT_GUID,
  jsonResponse,
} from "./stdio-report-data.js";

export interface PaymentRouteAssertions {
  assertRestaurantHeader(headers: Headers): void;
  assertBusinessDataAllowed(): void;
}

export async function handlePaymentRoute(
  url: URL,
  headers: Headers,
  assertions: PaymentRouteAssertions,
): Promise<Response | undefined> {
  if (url.pathname === "/orders/v2/payments") {
    assertions.assertRestaurantHeader(headers);
    assertions.assertBusinessDataAllowed();
    if (
      url.searchParams.get("paidBusinessDate") === String(BUSINESS_DATE)
      || url.searchParams.get("refundBusinessDate") === String(BUSINESS_DATE)
      || url.searchParams.get("voidBusinessDate") === String(BUSINESS_DATE)
    ) {
      return jsonResponse([PAYMENT_GUID], `fixture-payment-list-${url.search}`);
    }
    return jsonResponse([]);
  }

  if (url.pathname !== `/orders/v2/payments/${PAYMENT_GUID}`) return undefined;

  assertions.assertRestaurantHeader(headers);
  assertions.assertBusinessDataAllowed();
  return jsonResponse({
    guid: PAYMENT_GUID,
    paidDate: "2026-08-16T12:00:00-0500",
    paidBusinessDate: BUSINESS_DATE,
    type: "CASH",
    amount: 10,
    tipAmount: 1,
    paymentStatus: "CAPTURED",
    refundStatus: "FULL",
    refund: {
      refundAmount: 2,
      tipRefundAmount: 0.5,
      refundDate: "2026-08-16T16:00:00-0500",
      refundBusinessDate: BUSINESS_DATE,
    },
    voidInfo: {
      voidDate: "2026-08-16T17:00:00-0500",
      voidBusinessDate: BUSINESS_DATE,
    },
    customer: { email: "must-not-leak@example.invalid" },
    first6Digits: "123456",
    last4Digits: "7890",
    tenderTransactionGuid: "must-not-leak",
  }, "fixture-payment-detail");
}
