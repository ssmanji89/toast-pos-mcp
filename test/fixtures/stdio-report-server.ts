import { createApplicationRuntime } from "../../src/runtime.js";
import { createServer } from "../../src/server.js";
import { startStdioServer } from "../../src/stdio.js";
import {
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "../support/synthetic-runtime-env.js";

const RESTAURANT_GUID = SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;
const PAYMENT_GUID = "00000000-0000-4000-8000-000000000801";
const ORDER_GUID = "00000000-0000-4000-8000-000000000802";
const CHECK_GUID = "00000000-0000-4000-8000-000000000803";
const SELECTION_GUID = "00000000-0000-4000-8000-000000000804";
const DEFERRED_GUID = "00000000-0000-4000-8000-000000000805";
const SERVICE_CHARGE_GUID = "00000000-0000-4000-8000-000000000806";
const SERVICE_CHARGE_CONFIG_GUID = "00000000-0000-4000-8000-000000000807";
const BUSINESS_DATE = 20260816;
const NOW = Date.parse("2026-08-16T20:00:00Z");

type FixtureScenario =
  | "success"
  | "missing-scope"
  | "malformed-source"
  | "broken-pagination";

const scenario = parseScenario(process.argv[2]);
const tokenScopes = scenario === "missing-scope"
  ? ["restaurants:read"]
  : ["orders:read", "restaurants:read"];

const runtime = createApplicationRuntime({
  env: SYNTHETIC_VALID_RUNTIME_ENV,
  now: () => NOW,
  random: () => 0,
  sleep: async () => undefined,
  authFetch: async () => jsonResponse({
    token: {
      tokenType: "Bearer",
      expiresIn: 3600,
      accessToken: syntheticJwt(tokenScopes),
    },
  }),
  dataFetch: syntheticToastFetch,
});

startStdioServer(() => createServer({ runtime }));

async function syntheticToastFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url,
  );
  const headers = new Headers(init?.headers);

  if (url.pathname === "/partners/v1/restaurants") {
    assertNoRestaurantHeader(headers);
    return jsonResponse([
      {
        restaurantGuid: RESTAURANT_GUID,
        managementGroupGuid: null,
        deleted: false,
        scopes: ["orders:read", "restaurants:read"],
      },
    ], "fixture-partners-request");
  }

  if (url.pathname === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`) {
    assertRestaurantHeader(headers);
    return jsonResponse({
      guid: RESTAURANT_GUID,
      general: {
        archived: false,
        name: "Synthetic Tool Cafe",
        timeZone: "America/Chicago",
        closeoutHour: 4,
        currencyCode: "USD",
        managementGroupGuid: null,
      },
    }, "fixture-restaurant-request");
  }

  if (url.pathname === "/orders/v2/ordersBulk") {
    assertRestaurantHeader(headers);
    assertDataAllowedByScenario();
    if (url.searchParams.get("businessDate") !== String(BUSINESS_DATE)) {
      return jsonResponse([]);
    }
    if (scenario === "malformed-source") {
      return jsonResponse(
        { not: "an-orders-array" },
        "fixture-malformed-orders",
      );
    }
    if (scenario === "broken-pagination") {
      return jsonResponse(
        [syntheticOrder()],
        "fixture-broken-link-page-1",
        {
          link:
            `</orders/v2/ordersBulk?businessDate=${BUSINESS_DATE}&page=3&pageSize=100>; rel="next"`,
        },
      );
    }
    return jsonResponse([syntheticOrder()], "fixture-orders-page-1");
  }

  if (url.pathname === "/orders/v2/payments") {
    assertRestaurantHeader(headers);
    assertDataAllowedByScenario();
    if (
      url.searchParams.get("paidBusinessDate") === String(BUSINESS_DATE)
      || url.searchParams.get("refundBusinessDate") === String(BUSINESS_DATE)
      || url.searchParams.get("voidBusinessDate") === String(BUSINESS_DATE)
    ) {
      return jsonResponse([PAYMENT_GUID], `fixture-payment-list-${url.search}`);
    }
    return jsonResponse([]);
  }

  if (url.pathname === `/orders/v2/payments/${PAYMENT_GUID}`) {
    assertRestaurantHeader(headers);
    assertDataAllowedByScenario();
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

  return new Response("{}", {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

function syntheticOrder(): object {
  return {
    guid: ORDER_GUID,
    businessDate: BUSINESS_DATE,
    openedDate: "2026-08-16T12:00:00-0500",
    modifiedDate: "2026-08-16T12:30:00-0500",
    promisedDate: null,
    approvalStatus: "APPROVED",
    source: "In Store",
    numberOfGuests: 2,
    excessFood: false,
    deleted: false,
    voided: false,
    checks: [
      {
        guid: CHECK_GUID,
        amount: 10,
        taxAmount: 0.8,
        totalAmount: 10.8,
        taxExempt: false,
        deleted: false,
        voided: false,
        paymentStatus: "CLOSED",
        selections: [
          {
            guid: SELECTION_GUID,
            quantity: 1,
            unitOfMeasure: "NONE",
            selectionType: "NONE",
            price: 8,
            preDiscountPrice: 9,
            tax: 0.8,
            deferred: false,
            voided: false,
            appliedDiscounts: [],
            modifiers: [],
          },
          {
            guid: DEFERRED_GUID,
            quantity: 1,
            unitOfMeasure: "NONE",
            selectionType: "HOUSE_ACCOUNT_PAY_BALANCE",
            price: 1,
            preDiscountPrice: 1,
            tax: 0,
            deferred: true,
            voided: false,
            appliedDiscounts: [],
            modifiers: [],
          },
        ],
        payments: [
          {
            guid: PAYMENT_GUID,
            type: "CASH",
            amount: 10,
            tipAmount: 1,
            paidBusinessDate: BUSINESS_DATE,
            paymentStatus: "CAPTURED",
            refundStatus: "FULL",
            refund: {
              refundAmount: 2,
              tipRefundAmount: 0.5,
              refundBusinessDate: BUSINESS_DATE,
            },
          },
        ],
        appliedServiceCharges: [
          {
            guid: SERVICE_CHARGE_GUID,
            chargeAmount: 1,
            serviceCharge: { guid: SERVICE_CHARGE_CONFIG_GUID },
            gratuity: false,
            serviceChargeCategory: "FUNDRAISING_CAMPAIGN",
          },
        ],
        appliedDiscounts: [],
      },
    ],
  };
}

function assertDataAllowedByScenario(): void {
  if (scenario === "missing-scope") {
    // If capability preflight regresses and a data call occurs, make the
    // resulting denial visibly different from the expected missing-scope code.
    throw new Error("missing-scope fixture must not reach Orders data source");
  }
}

function assertRestaurantHeader(headers: Headers): void {
  if (headers.get("toast-restaurant-external-id") !== RESTAURANT_GUID) {
    throw new Error("synthetic fixture expected restaurant isolation header");
  }
}

function assertNoRestaurantHeader(headers: Headers): void {
  if (headers.get("toast-restaurant-external-id") !== null) {
    throw new Error("synthetic fixture expected credential-scoped request");
  }
}

function parseScenario(value: string | undefined): FixtureScenario {
  if (
    value === undefined
    || value === "success"
    || value === "missing-scope"
    || value === "malformed-source"
    || value === "broken-pagination"
  ) {
    return value ?? "success";
  }
  throw new Error("unknown synthetic report fixture scenario");
}

function syntheticJwt(scopes: readonly string[]): string {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({ scope: [...scopes] }),
    "synthetic-signature",
  ].join(".");
}

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function jsonResponse(
  body: unknown,
  requestId?: string,
  additionalHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "toast-request-id": requestId }),
      ...additionalHeaders,
    },
  });
}
