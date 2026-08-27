import { SYNTHETIC_VALID_RUNTIME_ENV } from "../support/synthetic-runtime-env.js";

export const RESTAURANT_GUID = SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;
export const ALTERNATE_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000003";
export const PAYMENT_GUID = "00000000-0000-4000-8000-000000000801";
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
export const ITEM_GROUP_GUID = "00000000-0000-4000-8000-000000000821";
export const SALES_CATEGORY_GUID = "00000000-0000-4000-8000-000000000814";
export const DINING_OPTION_GUID = "00000000-0000-4000-8000-000000000815";
export const REVENUE_CENTER_GUID = "00000000-0000-4000-8000-000000000816";
export const RESTAURANT_SERVICE_GUID = "00000000-0000-4000-8000-000000000817";
const TAG_LUNCH_GUID = "00000000-0000-4000-8000-000000000818";
const TAG_UNKNOWN_GUID = "00000000-0000-4000-8000-000000000819";
const TAG_DINNER_GUID = "00000000-0000-4000-8000-000000000823";
const MENU_GUID = "00000000-0000-4000-8000-000000000820";
const MENU_GROUP_A_GUID = "00000000-0000-4000-8000-000000000821";
const MENU_GROUP_B_GUID = "00000000-0000-4000-8000-000000000822";
const CASH_ENTRY_GUID = "00000000-0000-4000-8000-000000000901";
const CASH_DEPOSIT_GUID = "00000000-0000-4000-8000-000000000902";
export const CASH_DRAWER_GUID = "00000000-0000-4000-8000-000000000903";
export const NO_SALE_REASON_GUID = "00000000-0000-4000-8000-000000000904";
export const PAYOUT_REASON_GUID = "00000000-0000-4000-8000-000000000905";
const LABOR_EMPLOYEE_GUID = "00000000-0000-4000-8000-000000000911";
export const LABOR_JOB_GUID = "00000000-0000-4000-8000-000000000912";
export const LABOR_BREAK_TYPE_GUID = "00000000-0000-4000-8000-000000000913";
const LABOR_TIME_ENTRY_GUID = "00000000-0000-4000-8000-000000000914";
const LABOR_ARCHIVED_ENTRY_GUID = "00000000-0000-4000-8000-000000000915";
const LABOR_BREAK_GUID = "00000000-0000-4000-8000-000000000916";
export const TIP_WITHHOLDING_GUID = "00000000-0000-4000-8000-000000000917";
export const BUSINESS_DATE = 20260816;
export const NOW = Date.parse("2026-08-16T20:00:00Z");
export const MENU_UPDATED_AT = "2026-08-16T19:00:00.000Z";

export const FIXTURE_SCENARIOS = [
  "success", "missing-scope", "malformed-source", "broken-pagination",
  "cancel-active-report", "rate-limit-wait", "missing-cash-scope",
  "missing-labor-order-scope", "malformed-cash-source", "malformed-labor-source",
  "malformed-cash-deposits", "malformed-cash-drawers", "malformed-cash-no-sale-reasons",
  "malformed-cash-payout-reasons", "malformed-labor-jobs", "malformed-labor-break-types",
  "malformed-labor-tip-withholding", "malformed-labor-orders", "cancel-cash-report",
  "cancel-labor-report", "rate-limit-cash", "labor-revised-archived", "labor-active-entry",
  "missing-menu-item", "menu-refresh-fails-after-cache", "menu-unavailable-no-cache",
  "missing-config-category", "malformed-menu-structure", "missing-menus-scope",
  "missing-config-scope", "multi-group-tags", "missing-item-group", "conflicting-item-group",
  "conflicting-group-tags", "missing-item-group-singleton", "alternate-restaurant",
  "cancel-cash-entries", "cancel-cash-deposits", "cancel-cash-drawers",
  "cancel-cash-no-sale-reasons", "cancel-cash-payout-reasons", "cancel-labor-time-entries",
  "cancel-labor-jobs", "cancel-labor-break-types", "cancel-labor-tip-withholding",
  "cancel-labor-orders",
] as const;

export type FixtureScenario = typeof FIXTURE_SCENARIOS[number];
const fixtureScenarioSet = new Set<string>(FIXTURE_SCENARIOS);

export function syntheticOrder(primaryItemGroup: object | null = { guid: ITEM_GROUP_GUID }): object {
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
    checks: [syntheticCheck(primaryItemGroup)],
  };
}

function syntheticCheck(primaryItemGroup: object | null): object {
  return {
    guid: CHECK_GUID,
    amount: 10,
    taxAmount: 0.8,
    totalAmount: 10.8,
    taxExempt: false,
    deleted: false,
    voided: false,
    paymentStatus: "CLOSED",
    selections: syntheticSelections(primaryItemGroup),
    payments: [syntheticPayment()],
    appliedServiceCharges: [syntheticServiceCharge()],
    appliedDiscounts: [],
  };
}

function syntheticSelections(primaryItemGroup: object | null): readonly object[] {
  return [
    syntheticPrimarySelection(primaryItemGroup),
    syntheticSecondSelection(),
    syntheticDeferredSelection(),
  ];
}

function syntheticPrimarySelection(primaryItemGroup: object | null): object {
  return {
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
    modifiers: [syntheticModifier()],
  };
}

function syntheticModifier(): object {
  return {
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
    modifiers: [syntheticNestedModifier()],
  };
}

function syntheticNestedModifier(): object {
  return {
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
  };
}

function syntheticSecondSelection(): object {
  return {
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
  };
}

function syntheticDeferredSelection(): object {
  return {
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
  };
}

function syntheticPayment(): object {
  return {
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
  };
}

function syntheticServiceCharge(): object {
  return {
    guid: SERVICE_CHARGE_GUID,
    chargeAmount: 1,
    serviceCharge: { guid: SERVICE_CHARGE_CONFIG_GUID },
    gratuity: false,
    serviceChargeCategory: "FUNDRAISING_CAMPAIGN",
  };
}

export function syntheticCashEntries(): readonly object[] {
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
    guestMarker: "synthetic-guest-must-not-survive",
    contactMarker: "synthetic-contact-must-not-survive",
  }];
}

export function syntheticCashDeposits(): readonly object[] {
  return [{
    guid: CASH_DEPOSIT_GUID,
    date: "2026-08-16T17:00:00-05:00",
    amount: 10,
    rawSourceMarker: "synthetic-cash-raw-source-must-not-survive",
  }];
}

export function syntheticLaborTimeEntries(scenarioValue: FixtureScenario): readonly object[] {
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
    guestMarker: "synthetic-labor-guest-must-not-survive",
    contactMarker: "synthetic-labor-contact-must-not-survive",
    ...overrides,
  };
}

export function syntheticMenus(
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

export function parseScenario(value: string | undefined): FixtureScenario {
  const scenario = value ?? "success";
  if (fixtureScenarioSet.has(scenario)) return scenario as FixtureScenario;
  throw new Error("unknown synthetic report fixture scenario");
}

export function syntheticJwt(scopes: readonly string[]): string {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({ scope: [...scopes] }),
    "synthetic-signature",
  ].join(".");
}

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function jsonResponse(
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
