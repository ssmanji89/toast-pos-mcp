import {
  CASH_DRAWER_GUID,
  NO_SALE_REASON_GUID,
  PAYOUT_REASON_GUID,
  jsonResponse,
  syntheticCashDeposits,
  syntheticCashEntries,
  type FixtureScenario,
} from "./stdio-report-data.js";

export type CashRouteHandler = (
  url: URL,
  headers: Headers,
  init?: RequestInit,
) => Promise<Response | undefined>;

export interface CashRouteAssertions {
  assertRestaurantHeader(headers: Headers): void;
  assertBusinessDataAllowed(): void;
  assertBusinessDateQuery(url: URL): void;
  sourceCancellationMarker(pathname: string): string | undefined;
  waitForAbort(marker: string, signal: AbortSignal | null | undefined): Promise<Response>;
}

export function createCashRouteHandlers(
  scenario: FixtureScenario,
  assertions: CashRouteAssertions,
): readonly CashRouteHandler[] {
  let entriesFetchCount = 0;
  return [
    (url, headers, init) => handleCashEntriesRoute(
      url, headers, init, scenario, assertions, () => ++entriesFetchCount,
    ),
    (url, headers, init) => handleCashDepositsRoute(
      url, headers, init, scenario, assertions,
    ),
    (url, headers, init) => handleCashConfigurationRoute(
      url, headers, init, scenario, assertions,
    ),
  ];
}

async function handleCashEntriesRoute(
  url: URL,
  headers: Headers,
  init: RequestInit | undefined,
  scenario: FixtureScenario,
  assertions: CashRouteAssertions,
  nextFetchCount: () => number,
): Promise<Response | undefined> {
  if (url.pathname !== "/cashmgmt/v1/entries") return undefined;
  assertions.assertRestaurantHeader(headers);
  assertions.assertBusinessDataAllowed();
  assertions.assertBusinessDateQuery(url);
  if (scenario === "malformed-cash-source") {
    return jsonResponse({ entries: "invalid" }, "fixture-malformed-cash-entries");
  }
  const cancellationMarker = assertions.sourceCancellationMarker(url.pathname);
  if (cancellationMarker !== undefined) return assertions.waitForAbort(cancellationMarker, init?.signal);
  if (scenario !== "rate-limit-cash") {
    return jsonResponse(syntheticCashEntries(), "fixture-cash-entries");
  }

  const fetchCount = nextFetchCount();
  return jsonResponse(
    syntheticCashEntries(),
    `fixture-rate-limited-cash-${fetchCount}`,
    fetchCount === 1
      ? {
          "x-toast-ratelimit-by": "GLOBAL",
          "x-toast-ratelimit-remaining": "0",
          "x-toast-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 2),
        }
      : {},
  );
}

async function handleCashDepositsRoute(
  url: URL,
  headers: Headers,
  init: RequestInit | undefined,
  scenario: FixtureScenario,
  assertions: CashRouteAssertions,
): Promise<Response | undefined> {
  if (url.pathname !== "/cashmgmt/v1/deposits") return undefined;
  assertions.assertRestaurantHeader(headers);
  assertions.assertBusinessDataAllowed();
  assertions.assertBusinessDateQuery(url);
  if (scenario === "malformed-cash-deposits") return jsonResponse({ deposits: "invalid" });
  const cancellationMarker = assertions.sourceCancellationMarker(url.pathname);
  if (cancellationMarker !== undefined) return assertions.waitForAbort(cancellationMarker, init?.signal);
  return jsonResponse(syntheticCashDeposits(), "fixture-cash-deposits");
}

interface CashConfigurationRoute {
  readonly malformedScenario: FixtureScenario;
  readonly invalidBody: object;
  readonly responseBody: readonly object[];
  readonly requestId: string;
}

const cashConfigurationRoutes: Readonly<Record<string, CashConfigurationRoute>> = {
  "/config/v2/cashDrawers": {
    malformedScenario: "malformed-cash-drawers",
    invalidBody: { drawers: "invalid" },
    responseBody: [{ guid: CASH_DRAWER_GUID }],
    requestId: "fixture-cash-drawers",
  },
  "/config/v2/noSaleReasons": {
    malformedScenario: "malformed-cash-no-sale-reasons",
    invalidBody: { reasons: "invalid" },
    responseBody: [{ guid: NO_SALE_REASON_GUID }],
    requestId: "fixture-no-sale-reasons",
  },
  "/config/v2/payoutReasons": {
    malformedScenario: "malformed-cash-payout-reasons",
    invalidBody: { reasons: "invalid" },
    responseBody: [{ guid: PAYOUT_REASON_GUID }],
    requestId: "fixture-payout-reasons",
  },
};

async function handleCashConfigurationRoute(
  url: URL,
  headers: Headers,
  init: RequestInit | undefined,
  scenario: FixtureScenario,
  assertions: CashRouteAssertions,
): Promise<Response | undefined> {
  const route = cashConfigurationRoutes[url.pathname];
  if (route === undefined) return undefined;
  assertions.assertRestaurantHeader(headers);
  assertions.assertBusinessDataAllowed();
  if (scenario === route.malformedScenario) return jsonResponse(route.invalidBody);
  const cancellationMarker = assertions.sourceCancellationMarker(url.pathname);
  if (cancellationMarker !== undefined) return assertions.waitForAbort(cancellationMarker, init?.signal);
  return jsonResponse(route.responseBody, route.requestId);
}
