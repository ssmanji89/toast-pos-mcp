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
const TAG_DINNER_GUID = "00000000-0000-4000-8000-000000000823";
const MENU_GUID = "00000000-0000-4000-8000-000000000820";
const MENU_GROUP_A_GUID = "00000000-0000-4000-8000-000000000821";
const MENU_GROUP_B_GUID = "00000000-0000-4000-8000-000000000822";
const CASH_ENTRY_GUID = "00000000-0000-4000-8000-000000000901";
const CASH_DEPOSIT_GUID = "00000000-0000-4000-8000-000000000902";
const CASH_DRAWER_GUID = "00000000-0000-4000-8000-000000000903";
const NO_SALE_REASON_GUID = "00000000-0000-4000-8000-000000000904";
const PAYOUT_REASON_GUID = "00000000-0000-4000-8000-000000000905";
const LABOR_EMPLOYEE_GUID = "00000000-0000-4000-8000-000000000911";
const LABOR_JOB_GUID = "00000000-0000-4000-8000-000000000912";
const LABOR_BREAK_TYPE_GUID = "00000000-0000-4000-8000-000000000913";
const LABOR_TIME_ENTRY_GUID = "00000000-0000-4000-8000-000000000914";
const LABOR_ARCHIVED_ENTRY_GUID = "00000000-0000-4000-8000-000000000915";
const LABOR_BREAK_GUID = "00000000-0000-4000-8000-000000000916";
const TIP_WITHHOLDING_GUID = "00000000-0000-4000-8000-000000000917";
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
  | "missing-cash-scope"
  | "missing-labor-order-scope"
  | "malformed-cash-source"
  | "malformed-labor-source"
  | "cancel-cash-report"
  | "cancel-labor-report"
  | "rate-limit-cash"
  | "labor-revised-archived"
  | "labor-active-entry"
  | "missing-menu-item"
  | "menu-refresh-fails-after-cache"
  | "menu-unavailable-no-cache"
  | "missing-config-category"
  | "malformed-menu-structure"
  | "missing-menus-scope"
  | "missing-config-scope"
  | "multi-group-tags"
  | "missing-item-group"
  | "conflicting-item-group"
  | "conflicting-group-tags"
  | "missing-item-group-singleton";

const scenario = parseScenario(process.argv[2]);
let ordersFetchCount = 0;
const tokenScopes = scenario === "missing-scope"
  ? ["restaurants:read"]
  : scenario === "missing-cash-scope"
    ? ["orders:read", "labor:read", "restaurants:read", "menus:read", "config:read"]
    : scenario === "missing-labor-order-scope"
      ? ["cashmgmt:read", "labor:read", "restaurants:read", "menus:read", "config:read"]
  : scenario === "missing-menus-scope"
    ? ["orders:read", "restaurants:read", "config:read"]
    : scenario === "missing-config-scope"
      ? ["orders:read", "restaurants:read", "menus:read"]
  : ["orders:read", "cashmgmt:read", "labor:read", "restaurants:read", "menus:read", "config:read"];

let menuMetadataCalls = 0;
let fullMenuCalls = 0;
let salesCategoryCalls = 0;
const configSuccessCalls = new Map<string, number>();
let cashEntriesFetchCount = 0;

const runtime = createApplicationRuntime({
  env: SYNTHETIC_VALID_RUNTIME_ENV,
  now: scenario === "rate-limit-wait" || scenario === "rate-limit-cash" ? Date.now : () => NOW,
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
          "cashmgmt:read",
          "labor:read",
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

  if (url.pathname === "/cashmgmt/v1/entries") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    assertBusinessDateQuery(url);
    if (scenario === "malformed-cash-source") {
      return jsonResponse({ entries: "invalid" }, "fixture-malformed-cash-entries");
    }
    if (scenario === "cancel-cash-report") {
      return waitForAbort("cash-entries-fetch", init?.signal);
    }
    if (scenario === "rate-limit-cash") {
      cashEntriesFetchCount += 1;
      return jsonResponse(
        syntheticCashEntries(),
        `fixture-rate-limited-cash-${cashEntriesFetchCount}`,
        cashEntriesFetchCount === 1
          ? {
              "x-toast-ratelimit-by": "GLOBAL",
              "x-toast-ratelimit-remaining": "0",
              "x-toast-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 2),
            }
          : {},
      );
    }
    return jsonResponse(syntheticCashEntries(), "fixture-cash-entries");
  }

  if (url.pathname === "/cashmgmt/v1/deposits") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    assertBusinessDateQuery(url);
    return jsonResponse(syntheticCashDeposits(), "fixture-cash-deposits");
  }

  if (url.pathname === "/config/v2/cashDrawers") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    return jsonResponse([{ guid: CASH_DRAWER_GUID }], "fixture-cash-drawers");
  }

  if (url.pathname === "/config/v2/noSaleReasons") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    return jsonResponse([{ guid: NO_SALE_REASON_GUID }], "fixture-no-sale-reasons");
  }

  if (url.pathname === "/config/v2/payoutReasons") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    return jsonResponse([{ guid: PAYOUT_REASON_GUID }], "fixture-payout-reasons");
  }

  if (url.pathname === "/labor/v1/timeEntries") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    assertLaborTimeEntryQuery(url);
    if (scenario === "malformed-labor-source") {
      return jsonResponse({ timeEntries: "invalid" }, "fixture-malformed-labor-time-entries");
    }
    if (scenario === "cancel-labor-report") {
      return waitForAbort("labor-time-entries-fetch", init?.signal);
    }
    return jsonResponse(syntheticLaborTimeEntries(scenario), "fixture-labor-time-entries");
  }

  if (url.pathname === "/labor/v1/jobs") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    const jobIds = url.searchParams.get("jobIds");
    if (jobIds !== LABOR_JOB_GUID) {
      throw new Error("synthetic labor fixture expected the selected Job GUID");
    }
    return jsonResponse([
      { guid: LABOR_JOB_GUID, entityType: "RestaurantJob", deleted: false, excludeFromReporting: false },
    ], "fixture-labor-jobs");
  }

  if (url.pathname === "/config/v2/breakTypes") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    return jsonResponse([
      { guid: LABOR_BREAK_TYPE_GUID, entityType: "BreakType", active: true, paid: false },
    ], "fixture-labor-break-types");
  }

  if (url.pathname === "/config/v2/tipWithholding") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    return jsonResponse({
      guid: TIP_WITHHOLDING_GUID,
      entityType: "TipWithholding",
      enabled: true,
      percentage: 0.1,
    }, "fixture-labor-tip-withholding");
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
        : syntheticMenus(
          scenario === "missing-menu-item",
          scenario === "conflicting-group-tags",
          scenario === "missing-item-group-singleton",
        ),
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
    assertBusinessDataAllowed();
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
    return jsonResponse(
      [syntheticOrder(
        scenario === "missing-item-group" || scenario === "missing-item-group-singleton"
          ? null
          : scenario === "conflicting-item-group"
            ? { guid: ITEM_GROUP_GUID, multiLocationId: "synthetic-group-b" }
            : { guid: ITEM_GROUP_GUID },
      )],
      "fixture-orders-page-1",
    );
  }

  if (url.pathname === "/orders/v2/payments") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
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
    assertBusinessDataAllowed();
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

function syntheticOrder(primaryItemGroup: object | null = { guid: ITEM_GROUP_GUID }): object {
  return {
    guid: ORDER_GUID,
    businessDate: BUSINESS_DATE,
    openedDate: "2026-08-16T12:00:00-0500",
    modifiedDate: "2026-08-16T12:30:00-0500",
    promisedDate: null,
    approvalStatus: "APPROVED",
    source: "In Store",
    server: { guid: LABOR_EMPLOYEE_GUID, name: "synthetic-employee-name-must-not-survive" },
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
            ...(primaryItemGroup === null ? {} : { itemGroup: primaryItemGroup }),
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

function syntheticCashEntries(): readonly object[] {
  return [{
    guid: CASH_ENTRY_GUID,
    date: "2026-08-16T12:00:00-05:00",
    amount: 12.34,
    type: "CASH_IN",
    cashDrawer: { guid: CASH_DRAWER_GUID },
    noSaleReason: { guid: NO_SALE_REASON_GUID },
    payoutReason: { guid: PAYOUT_REASON_GUID },
    employeeName: "synthetic-cash-employee-must-not-survive",
    cardMarker: "synthetic-cash-card-must-not-survive",
  }];
}

function syntheticCashDeposits(): readonly object[] {
  return [{
    guid: CASH_DEPOSIT_GUID,
    date: "2026-08-16T17:00:00-05:00",
    amount: 10,
    rawSourceMarker: "synthetic-cash-raw-source-must-not-survive",
  }];
}

function syntheticLaborTimeEntries(scenarioValue: FixtureScenario): readonly object[] {
  const current = syntheticLaborTimeEntry();
  if (scenarioValue === "labor-active-entry") {
    return [syntheticLaborTimeEntry({ outDate: null, regularHours: 1 })];
  }
  if (scenarioValue === "labor-revised-archived") {
    return [
      current,
      syntheticLaborTimeEntry({
        guid: LABOR_ARCHIVED_ENTRY_GUID,
        deleted: true,
        deletedDate: "2026-08-16T18:00:00-05:00",
        regularHours: 99,
        overtimeHours: 99,
        hourlyWage: 99,
        breaks: [{
          guid: "00000000-0000-4000-8000-000000000918",
          breakType: { guid: LABOR_BREAK_TYPE_GUID, entityType: "BreakType" },
          paid: false,
          inDate: null,
          outDate: null,
          missed: false,
          waived: false,
          auditResponse: null,
        }],
      }),
    ];
  }
  return [current];
}

function syntheticLaborTimeEntry(overrides: Readonly<Record<string, unknown>> = {}): object {
  return {
    guid: LABOR_TIME_ENTRY_GUID,
    entityType: "TimeEntry",
    deleted: false,
    employeeReference: {
      guid: LABOR_EMPLOYEE_GUID,
      entityType: "RestaurantUser",
      externalId: "synthetic-employee-external-id-must-not-survive",
    },
    jobReference: { guid: LABOR_JOB_GUID, entityType: "RestaurantJob" },
    inDate: "2026-08-16T08:00:00-05:00",
    outDate: "2026-08-16T16:00:00-05:00",
    businessDate: String(BUSINESS_DATE),
    regularHours: 7.5,
    overtimeHours: 0.5,
    hourlyWage: null,
    modifiedDate: "2026-08-16T16:05:00-05:00",
    breaks: [{
      guid: LABOR_BREAK_GUID,
      breakType: { guid: LABOR_BREAK_TYPE_GUID, entityType: "BreakType" },
      paid: false,
      inDate: null,
      outDate: null,
      missed: true,
      waived: false,
      auditResponse: null,
    }],
    employeeName: "synthetic-employee-name-must-not-survive",
    ...overrides,
  };
}

function syntheticMenus(
  omitPrimaryItem: boolean,
  conflictingGroupTags: boolean,
  omitSecondPrimaryGroup: boolean,
): object {
  const primaryA = menuItem(ITEM_GUID, [
    { guid: TAG_LUNCH_GUID, name: "Lunch" },
    { guid: TAG_UNKNOWN_GUID, name: "NEW_ENUM_TAG" },
  ]);
  const primaryB = menuItem(ITEM_GUID, [
    { guid: TAG_DINNER_GUID, name: "Dinner" },
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
            multiLocationId: "synthetic-group-a",
            name: "Path A",
            menuItems: omitPrimaryItem
              ? [sameNameDifferentGuid]
              : [primaryA, sameNameDifferentGuid],
          },
          ...(omitSecondPrimaryGroup ? [] : [{
            guid: conflictingGroupTags ? MENU_GROUP_A_GUID : MENU_GROUP_B_GUID,
            multiLocationId: conflictingGroupTags
              ? "synthetic-group-a"
              : "synthetic-group-b",
            name: "Path B",
            menuItems: omitPrimaryItem ? [] : [primaryB],
          }]),
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

function assertBusinessDataAllowed(): void {
  if (
    scenario === "missing-scope"
    || scenario === "missing-cash-scope"
    || scenario === "missing-labor-order-scope"
  ) {
    throw new Error("scope-denied fixture must not reach a business data source");
  }
}

function assertBusinessDateQuery(url: URL): void {
  if (url.searchParams.get("businessDate") !== String(BUSINESS_DATE)) {
    throw new Error("synthetic cash fixture expected the requested business date");
  }
}

function assertLaborTimeEntryQuery(url: URL): void {
  if (
    url.searchParams.get("startDate") !== "2026-08-16T09:00:00.000Z"
    || url.searchParams.get("endDate") !== "2026-08-17T09:00:00.000Z"
    || url.searchParams.get("includeArchived") !== "true"
    || url.searchParams.get("includeMissedBreaks") !== "true"
  ) {
    throw new Error("synthetic labor fixture expected selected-location closeout bounds");
  }
}

function waitForAbort(marker: string, signal: AbortSignal | null | undefined): Promise<Response> {
  console.error(`${marker}-started`);
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => {
      console.error(`${marker}-aborted`);
      reject(new Error("synthetic report fetch cancellation"));
    }, { once: true });
  });
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
    || value === "missing-cash-scope"
    || value === "missing-labor-order-scope"
    || value === "malformed-cash-source"
    || value === "malformed-labor-source"
    || value === "cancel-cash-report"
    || value === "cancel-labor-report"
    || value === "rate-limit-cash"
    || value === "labor-revised-archived"
    || value === "labor-active-entry"
    || value === "missing-menu-item"
    || value === "menu-refresh-fails-after-cache"
    || value === "menu-unavailable-no-cache"
    || value === "missing-config-category"
    || value === "malformed-menu-structure"
    || value === "missing-menus-scope"
    || value === "missing-config-scope"
    || value === "multi-group-tags"
    || value === "missing-item-group"
    || value === "conflicting-item-group"
    || value === "conflicting-group-tags"
    || value === "missing-item-group-singleton"
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
