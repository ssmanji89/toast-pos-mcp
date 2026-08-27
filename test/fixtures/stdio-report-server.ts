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
const SECOND_SELECTION_GUID = "00000000-0000-4000-8000-000000000808";
const MODIFIER_GUID = "00000000-0000-4000-8000-000000000809";
const NESTED_MODIFIER_GUID = "00000000-0000-4000-8000-000000000810";
const ITEM_GUID = "00000000-0000-4000-8000-000000000811";
const SECOND_ITEM_GUID = "00000000-0000-4000-8000-000000000812";
const ITEM_GROUP_GUID = "00000000-0000-4000-8000-000000000821";
const SALES_CATEGORY_GUID = "00000000-0000-4000-8000-000000000814";
const DINING_OPTION_GUID = "00000000-0000-4000-8000-000000000815";
const REVENUE_CENTER_GUID = "00000000-0000-4000-8000-000000000816";
const RESTAURANT_SERVICE_GUID = "00000000-0000-4000-8000-000000000817";
const TAG_LUNCH_GUID = "00000000-0000-4000-8000-000000000818";
const TAG_UNKNOWN_GUID = "00000000-0000-4000-8000-000000000819";
const MENU_GUID = "00000000-0000-4000-8000-000000000820";
const MENU_GROUP_A_GUID = "00000000-0000-4000-8000-000000000821";
const MENU_GROUP_B_GUID = "00000000-0000-4000-8000-000000000822";
const BUSINESS_DATE = 20260816;
const NOW = Date.parse("2026-08-16T20:00:00Z");
const MENU_UPDATED_AT = "2026-08-16T19:00:00.000Z";

type FixtureScenario =
  | "success"
  | "missing-scope"
  | "malformed-source"
  | "broken-pagination"
  | "cancel-active-report"
  | "rate-limit-wait"
  | "missing-menu-item"
  | "menu-refresh-fails-after-cache"
  | "menu-unavailable-no-cache"
  | "missing-config-category"
  | "malformed-menu-structure"
  | "missing-menus-scope"
  | "missing-config-scope";

const scenario = parseScenario(process.argv[2]);
let ordersFetchCount = 0;
const tokenScopes = scenario === "missing-scope"
  ? ["restaurants:read"]
  : scenario === "missing-menus-scope"
    ? ["orders:read", "restaurants:read", "config:read"]
    : scenario === "missing-config-scope"
      ? ["orders:read", "restaurants:read", "menus:read"]
  : ["orders:read", "restaurants:read", "menus:read", "config:read"];

let menuMetadataCalls = 0;
let fullMenuCalls = 0;
let salesCategoryCalls = 0;
const configSuccessCalls = new Map<string, number>();

const runtime = createApplicationRuntime({
  env: SYNTHETIC_VALID_RUNTIME_ENV,
  now: scenario === "rate-limit-wait" ? Date.now : () => NOW,
  random: () => 0,
  sleep: scenario === "rate-limit-wait"
    ? (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    : async () => undefined,
  maxAttempts: 1,
  authFetch: async () => jsonResponse({
    token: {
      tokenType: "Bearer",
      expiresIn: 3600,
      accessToken: syntheticJwt(tokenScopes),
    },
  }),
  dataFetch: syntheticToastFetch,
});

startStdioServer(({ era }) => createServer(
  era === "modern" ? { runtime } : { advertiseToolListChanged: true },
));

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
        scopes: [
          "orders:read",
          "restaurants:read",
          "menus:read",
          "config:read",
        ],
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

  if (url.pathname === "/menus/v2/metadata") {
    assertRestaurantHeader(headers);
    menuMetadataCalls += 1;
    if (
      scenario === "menu-unavailable-no-cache"
      || (
        scenario === "menu-refresh-fails-after-cache"
        && menuMetadataCalls > 1
      )
    ) {
      return new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return jsonResponse({
      restaurantGuid: RESTAURANT_GUID,
      lastUpdated: MENU_UPDATED_AT,
    }, `fixture-menu-metadata-${menuMetadataCalls}`);
  }

  if (url.pathname === "/menus/v2/menus") {
    assertRestaurantHeader(headers);
    fullMenuCalls += 1;
    if (fullMenuCalls > 1) {
      throw new Error(
        "fixture full menu may not be downloaded twice while metadata is unchanged",
      );
    }
    return jsonResponse(
      scenario === "malformed-menu-structure"
        ? { restaurantGuid: RESTAURANT_GUID, lastUpdated: MENU_UPDATED_AT, menus: {} }
        : syntheticMenus(scenario === "missing-menu-item"),
      "fixture-menu-full-1",
    );
  }

  if (url.pathname === "/config/v2/salesCategories") {
    assertRestaurantHeader(headers);
    salesCategoryCalls += 1;
    if (salesCategoryCalls === 1) {
      return new Response("{}", {
        status: 409,
        headers: {
          "content-type": "application/json",
          "toast-request-id": "fixture-config-sales-category-409",
        },
      });
    }
    if (salesCategoryCalls > 2) {
      throw new Error(
        "fixture configuration snapshot must be cached for the same local day",
      );
    }
    return jsonResponse(
      scenario === "missing-config-category"
        ? []
        : [{ guid: SALES_CATEGORY_GUID, name: "Current Entrees" }],
      "fixture-config-sales-category-success",
    );
  }

  if (url.pathname === "/config/v2/revenueCenters") {
    assertRestaurantHeader(headers);
    assertSingleConfigSuccess(url.pathname);
    return jsonResponse([
      { guid: REVENUE_CENTER_GUID, name: "Current Main Dining" },
    ], "fixture-config-revenue-center");
  }

  if (url.pathname === "/config/v2/diningOptions") {
    assertRestaurantHeader(headers);
    assertSingleConfigSuccess(url.pathname);
    return jsonResponse([
      {
        guid: DINING_OPTION_GUID,
        name: "Current Dine In",
        behavior: "DINE_IN",
      },
    ], "fixture-config-dining-option");
  }

  if (url.pathname === "/config/v2/restaurantServices") {
    assertRestaurantHeader(headers);
    assertSingleConfigSuccess(url.pathname);
    return jsonResponse([
      { guid: RESTAURANT_SERVICE_GUID, name: "Current Dinner" },
    ], "fixture-config-restaurant-service");
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
    if (scenario === "cancel-active-report") {
      console.error("orders-fetch-started");
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          console.error("orders-fetch-aborted");
          reject(new Error("synthetic orders fetch cancellation"));
        }, { once: true });
      });
    }
    if (scenario === "rate-limit-wait") {
      ordersFetchCount += 1;
      return jsonResponse(
        [syntheticOrder()],
        `fixture-rate-limited-orders-${ordersFetchCount}`,
        ordersFetchCount === 1
          ? {
              "x-toast-ratelimit-by": "GLOBAL",
              "x-toast-ratelimit-remaining": "0",
              "x-toast-ratelimit-reset": String(
                Math.floor(Date.now() / 1000) + 2,
              ),
            }
          : {},
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
    revenueCenter: { guid: REVENUE_CENTER_GUID },
    restaurantService: { guid: RESTAURANT_SERVICE_GUID },
    diningOption: { guid: DINING_OPTION_GUID },
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
            item: { guid: ITEM_GUID },
            itemGroup: { guid: ITEM_GROUP_GUID },
            salesCategory: { guid: SALES_CATEGORY_GUID },
            diningOption: { guid: DINING_OPTION_GUID },
            quantity: 0.5,
            unitOfMeasure: "LB",
            selectionType: "NONE",
            price: 8,
            preDiscountPrice: 9,
            tax: 0.8,
            deferred: false,
            voided: false,
            appliedDiscounts: [],
            modifiers: [
              {
                guid: MODIFIER_GUID,
                item: { guid: ITEM_GUID },
                quantity: 1,
                unitOfMeasure: "NONE",
                selectionType: "NONE",
                price: 1,
                preDiscountPrice: 1,
                tax: 0,
                deferred: false,
                voided: false,
                appliedDiscounts: [],
                modifiers: [
                  {
                    guid: NESTED_MODIFIER_GUID,
                    item: { guid: ITEM_GUID },
                    quantity: 1,
                    unitOfMeasure: "NONE",
                    selectionType: "NONE",
                    price: 0.5,
                    preDiscountPrice: 0.5,
                    tax: 0,
                    deferred: false,
                    voided: false,
                    appliedDiscounts: [],
                    modifiers: [],
                  },
                ],
              },
            ],
          },
          {
            guid: SECOND_SELECTION_GUID,
            item: { guid: SECOND_ITEM_GUID },
            itemGroup: { guid: ITEM_GROUP_GUID },
            salesCategory: { guid: SALES_CATEGORY_GUID },
            diningOption: { guid: DINING_OPTION_GUID },
            quantity: 1,
            unitOfMeasure: "NONE",
            selectionType: "NONE",
            price: 2,
            preDiscountPrice: 2,
            tax: 0,
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

function syntheticMenus(omitPrimaryItem: boolean): object {
  const primaryA = menuItem(ITEM_GUID, [
    { guid: TAG_LUNCH_GUID, name: "Lunch" },
    { guid: TAG_UNKNOWN_GUID, name: "NEW_ENUM_TAG" },
  ]);
  const primaryB = menuItem(ITEM_GUID, [
    { guid: TAG_UNKNOWN_GUID, name: "NEW_ENUM_TAG" },
    { guid: TAG_LUNCH_GUID, name: "Lunch" },
  ]);
  const sameNameDifferentGuid = menuItem(SECOND_ITEM_GUID, [
    { guid: TAG_LUNCH_GUID, name: "Lunch" },
  ]);

  return {
    restaurantGuid: RESTAURANT_GUID,
    lastUpdated: MENU_UPDATED_AT,
    restaurantTimeZone: "America/Chicago",
    menus: [
      {
        guid: MENU_GUID,
        name: "Current Dinner Menu",
        menuGroups: [
          {
            guid: MENU_GROUP_A_GUID,
            name: "Path A",
            menuItems: omitPrimaryItem
              ? [sameNameDifferentGuid]
              : [primaryA, sameNameDifferentGuid],
          },
          {
            guid: MENU_GROUP_B_GUID,
            name: "Path B",
            menuItems: omitPrimaryItem ? [] : [primaryB],
          },
        ],
      },
    ],
    modifierOptionReferences: {},
  };
}

function menuItem(
  guid: string,
  itemTags: readonly { readonly guid: string; readonly name: string }[],
): object {
  return {
    guid,
    multiLocationId: guid,
    name: "Current Burger",
    itemTags,
    salesCategory: {
      guid: SALES_CATEGORY_GUID,
      name: "Current Entrees",
    },
  };
}

function assertSingleConfigSuccess(pathname: string): void {
  const next = (configSuccessCalls.get(pathname) ?? 0) + 1;
  configSuccessCalls.set(pathname, next);
  if (next > 1) {
    throw new Error(
      "fixture configuration snapshot must be cached for the same local day",
    );
  }
}

function assertDataAllowedByScenario(): void {
  if (scenario === "missing-scope") {
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
    || value === "cancel-active-report"
    || value === "rate-limit-wait"
    || value === "missing-menu-item"
    || value === "menu-refresh-fails-after-cache"
    || value === "menu-unavailable-no-cache"
    || value === "missing-config-category"
    || value === "malformed-menu-structure"
    || value === "missing-menus-scope"
    || value === "missing-config-scope"
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
