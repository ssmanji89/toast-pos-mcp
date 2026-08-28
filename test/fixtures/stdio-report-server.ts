import { createApplicationRuntime } from "../../src/runtime.js";
import { createServer } from "../../src/server.js";
import { startStdioServer } from "../../src/stdio.js";
import {
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "../support/synthetic-runtime-env.js";

import {
  ALTERNATE_RESTAURANT_GUID,
  BUSINESS_DATE,
  ITEM_GROUP_GUID,
  LABOR_BREAK_TYPE_GUID,
  LABOR_JOB_GUID,
  MENU_UPDATED_AT,
  NOW,
  RESTAURANT_GUID,
  SALES_CATEGORY_GUID,
  REVENUE_CENTER_GUID,
  DINING_OPTION_GUID,
  RESTAURANT_SERVICE_GUID,
  TIP_WITHHOLDING_GUID,
  jsonResponse,
  parseScenario,
  syntheticJwt,
  syntheticLaborTimeEntries,
  syntheticMenus,
  syntheticOrder,
  type FixtureScenario,
} from "./stdio-report-data.js";
import { createCashRouteHandlers } from "./stdio-report-cash-routes.js";
import { handlePaymentRoute } from "./stdio-report-payment-routes.js";

const scenario = parseScenario(process.argv[2]);
const selectedRestaurantGuid = scenario === "alternate-restaurant"
  ? ALTERNATE_RESTAURANT_GUID
  : RESTAURANT_GUID;
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
const useRealRateLimitClock = scenario === "rate-limit-wait" || scenario === "rate-limit-cash";
const cashRouteHandlers = createCashRouteHandlers(scenario, {
  assertRestaurantHeader,
  assertBusinessDataAllowed,
  assertBusinessDateQuery,
  sourceCancellationMarker,
  waitForAbort,
});

const runtime = createApplicationRuntime({
  env: SYNTHETIC_VALID_RUNTIME_ENV,
  now: useRealRateLimitClock ? Date.now : () => NOW,
  random: () => 0,
  sleep: useRealRateLimitClock
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

startStdioServer(({ era, acceptedRequests }) => createServer(
  era === "modern"
    ? { runtime, acceptedRequests }
    : { advertiseToolListChanged: true, acceptedRequests },
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
  console.error(
    `fixture-request:${url.pathname}:${headers.get("toast-restaurant-external-id") ?? "none"}`,
  );

  for (const handler of fixtureRouteHandlers) {
    const response = await handler(url, headers, init);
    if (response !== undefined) return response;
  }

  return new Response("{}", {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}

type FixtureRouteHandler = (
  url: URL,
  headers: Headers,
  init?: RequestInit,
) => Promise<Response | undefined>;

const fixtureRouteHandlers: readonly FixtureRouteHandler[] = [
  handleLocationRoute,
  ...cashRouteHandlers,
  handleLaborRoute,
  handleMenuRoute,
  handleConfigurationRoute,
  handleOrdersRoute,
  handlePaymentFixtureRoute,
];

async function handleLocationRoute(
  url: URL,
  headers: Headers,
): Promise<Response | undefined> {
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
      {
        restaurantGuid: ALTERNATE_RESTAURANT_GUID,
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

  if (
    url.pathname === `/restaurants/v1/restaurants/${RESTAURANT_GUID}`
    || url.pathname === `/restaurants/v1/restaurants/${ALTERNATE_RESTAURANT_GUID}`
  ) {
    const restaurantGuid = url.pathname.endsWith(ALTERNATE_RESTAURANT_GUID)
      ? ALTERNATE_RESTAURANT_GUID
      : RESTAURANT_GUID;
    assertRestaurantHeader(headers, restaurantGuid);
    return jsonResponse({
      guid: restaurantGuid,
      general: {
        archived: false,
        name: restaurantGuid === ALTERNATE_RESTAURANT_GUID
          ? "Synthetic Alternate Cafe"
          : "Synthetic Tool Cafe",
        timeZone: "America/Chicago",
        closeoutHour: 4,
        currencyCode: "USD",
        managementGroupGuid: null,
      },
    }, "fixture-restaurant-request");
  }

  return undefined;
}

async function handleLaborRoute(
  url: URL,
  headers: Headers,
  init?: RequestInit,
): Promise<Response | undefined> {
  if (url.pathname === "/labor/v1/timeEntries") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    assertLaborTimeEntryQuery(url);
    if (scenario === "malformed-labor-source") {
      return jsonResponse({ timeEntries: "invalid" }, "fixture-malformed-labor-time-entries");
    }
    const cancellationMarker = sourceCancellationMarker(url.pathname);
    if (cancellationMarker !== undefined) return waitForAbort(cancellationMarker, init?.signal);
    return jsonResponse(syntheticLaborTimeEntries(scenario), "fixture-labor-time-entries");
  }

  if (url.pathname === "/labor/v1/jobs") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    if (scenario === "malformed-labor-jobs") return jsonResponse({ jobs: "invalid" });
    const cancellationMarker = sourceCancellationMarker(url.pathname);
    if (cancellationMarker !== undefined) return waitForAbort(cancellationMarker, init?.signal);
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
    if (scenario === "malformed-labor-break-types") return jsonResponse({ breakTypes: "invalid" });
    const cancellationMarker = sourceCancellationMarker(url.pathname);
    if (cancellationMarker !== undefined) return waitForAbort(cancellationMarker, init?.signal);
    return jsonResponse([
      { guid: LABOR_BREAK_TYPE_GUID, entityType: "BreakType", active: true, paid: false },
    ], "fixture-labor-break-types");
  }

  if (url.pathname === "/config/v2/tipWithholding") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    if (scenario === "malformed-labor-tip-withholding") return jsonResponse({ tipWithholding: "invalid" });
    const cancellationMarker = sourceCancellationMarker(url.pathname);
    if (cancellationMarker !== undefined) return waitForAbort(cancellationMarker, init?.signal);
    return jsonResponse({
      guid: TIP_WITHHOLDING_GUID,
      entityType: "TipWithholding",
      enabled: true,
      percentage: 0.1,
    }, "fixture-labor-tip-withholding");
  }

  return undefined;
}

async function handleMenuRoute(
  url: URL,
  headers: Headers,
): Promise<Response | undefined> {
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
        : syntheticMenus(
          scenario === "missing-menu-item",
          scenario === "conflicting-group-tags",
          scenario === "missing-item-group-singleton",
        ),
      "fixture-menu-full-1",
    );
  }

  return undefined;
}

async function handleConfigurationRoute(
  url: URL,
  headers: Headers,
): Promise<Response | undefined> {
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

  return undefined;
}

async function handleOrdersRoute(
  url: URL,
  headers: Headers,
  init?: RequestInit,
): Promise<Response | undefined> {
  if (url.pathname === "/orders/v2/ordersBulk") {
    assertRestaurantHeader(headers);
    assertBusinessDataAllowed();
    const cancellationMarker = sourceCancellationMarker(url.pathname);
    if (cancellationMarker !== undefined) return waitForAbort(cancellationMarker, init?.signal);
    if (url.searchParams.get("businessDate") !== String(BUSINESS_DATE)) {
      return jsonResponse([]);
    }
    if (scenario === "malformed-source") {
      return jsonResponse(
        { not: "an-orders-array" },
        "fixture-malformed-orders",
      );
    }
    if (scenario === "malformed-labor-orders") {
      return jsonResponse({ not: "an-orders-array" }, "fixture-malformed-labor-orders");
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

  return undefined;
}

async function handlePaymentFixtureRoute(
  url: URL,
  headers: Headers,
): Promise<Response | undefined> {
  return handlePaymentRoute(url, headers, {
    assertRestaurantHeader,
    assertBusinessDataAllowed,
  });
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

function assertRestaurantHeader(headers: Headers, expectedGuid = selectedRestaurantGuid): void {
  if (headers.get("toast-restaurant-external-id") !== expectedGuid) {
    throw new Error("synthetic fixture expected restaurant isolation header");
  }
}

function sourceCancellationMarker(pathname: string): string | undefined {
  const scenarioByPath: Readonly<Record<string, string>> = {
    "/cashmgmt/v1/entries": "cancel-cash-entries",
    "/cashmgmt/v1/deposits": "cancel-cash-deposits",
    "/config/v2/cashDrawers": "cancel-cash-drawers",
    "/config/v2/noSaleReasons": "cancel-cash-no-sale-reasons",
    "/config/v2/payoutReasons": "cancel-cash-payout-reasons",
    "/labor/v1/timeEntries": "cancel-labor-time-entries",
    "/labor/v1/jobs": "cancel-labor-jobs",
    "/config/v2/breakTypes": "cancel-labor-break-types",
    "/config/v2/tipWithholding": "cancel-labor-tip-withholding",
    "/orders/v2/ordersBulk": "cancel-labor-orders",
  };
  const expectedScenario = scenarioByPath[pathname];
  if (scenario === expectedScenario) return `${pathname.slice(1).replaceAll("/", "-")}-fetch`;
  if (scenario === "cancel-cash-report" && pathname === "/cashmgmt/v1/entries") {
    return "cash-entries-fetch";
  }
  if (scenario === "cancel-labor-report" && pathname === "/labor/v1/timeEntries") {
    return "labor-time-entries-fetch";
  }
  return undefined;
}

function assertNoRestaurantHeader(headers: Headers): void {
  if (headers.get("toast-restaurant-external-id") !== null) {
    throw new Error("synthetic fixture expected credential-scoped request");
  }
}
