import assert from "node:assert/strict";

import { ToastHttpError } from "../../src/transport.js";

export const IDS = Object.freeze({
  entryA: "00000000-0000-4000-8000-000000004001",
  entryB: "00000000-0000-4000-8000-000000004002",
  entryC: "00000000-0000-4000-8000-000000004003",
  depositA: "00000000-0000-4000-8000-000000004004",
  depositB: "00000000-0000-4000-8000-000000004010",
  drawerA: "00000000-0000-4000-8000-000000004005",
  drawerMissing: "00000000-0000-4000-8000-000000004006",
  noSaleReasonA: "00000000-0000-4000-8000-000000004007",
  payoutReasonA: "00000000-0000-4000-8000-000000004008",
});

export const BUSINESS_DATE = 20260827;
export const RESTAURANT_GUID = "00000000-0000-4000-8000-000000004009";

export type CashSourceKey =
  | "cash-entries"
  | "cash-deposits"
  | "config-cash-drawers"
  | "config-no-sale-reasons"
  | "config-payout-reasons";

export interface SourceEntryBarrier { enter(): void; wait(): Promise<void>; }

export function entry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    guid: IDS.entryA, businessDate: BUSINESS_DATE,
    date: "2026-08-27T12:00:00-05:00", amount: 1, type: "CASH_IN",
    cashDrawer: { guid: IDS.drawerA }, ...overrides,
  };
}

export function deposit(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    guid: IDS.depositA, date: "2026-08-27T15:00:00-05:00", amount: 1, ...overrides,
  };
}

export function createSourceEntryBarrier(): SourceEntryBarrier {
  let entered = false;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => { release = resolve; });
  return Object.freeze({
    enter: () => { if (!entered) { entered = true; release(); } },
    wait: async () => reached,
  });
}

export function syntheticCashRuntime(options: {
  readonly calls: string[];
  readonly provisionedScopes: readonly string[];
  readonly signal?: AbortSignal;
  readonly malformedAt?: CashSourceKey;
  readonly oversizedAt?: CashSourceKey;
  readonly mismatchAt?: CashSourceKey;
  readonly incomplete?: boolean;
  readonly emptyAt?: Exclude<CashSourceKey, "cash-entries" | "cash-deposits">;
  readonly abort?: boolean;
  readonly sourceBarrier?: SourceEntryBarrier;
  readonly twoPageAt?: Exclude<CashSourceKey, "cash-entries" | "cash-deposits">;
  readonly configurationPageSizes?: readonly [number, number];
  readonly malformedSecondPage?: boolean;
  readonly mismatchedSecondPage?: boolean;
}): any {
  const detail = (body: unknown, requestId: string, mismatched = false) => ({
    apiFamily: "standard" as const, body,
    scope: { kind: "restaurant" as const, restaurantGuid: mismatched ? IDS.drawerMissing : RESTAURANT_GUID },
    retrievedAtEpochMs: 1_800_000_000_000, upstreamRequestId: requestId,
  });
  const bodyFor = (key: CashSourceKey): unknown => {
    if (options.oversizedAt === key) return Array.from(
      { length: 1_001 },
      (_value, index) => entry({ guid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }),
    );
    if (options.malformedAt === key) return [{}];
    if (options.emptyAt === key) return [];
    if (key === "cash-entries") return [entry({})];
    if (key === "cash-deposits") return [deposit({ amount: 2 })];
    if (key === "config-cash-drawers") return [{ guid: IDS.drawerA }];
    if (key === "config-no-sale-reasons") return [{ guid: IDS.noSaleReasonA }];
    return [{ guid: IDS.payoutReasonA }];
  };
  return {
    now: () => 1_800_000_000_000,
    tokenManager: { getProvisionedScopes: async () => { options.calls.push("scopes"); return options.provisionedScopes; } },
    getLocationContext: async (_guid: string | undefined, input: { readonly signal?: AbortSignal }) => {
      options.calls.push("location");
      assert.equal(input.signal, options.signal);
      return locationContext();
    },
    toastHttpClient: {
      getJsonDetailedCancellable: async (request: any, input: { readonly signal?: AbortSignal }) => {
        const key = request.rateLimitKey as CashSourceKey;
        assertCashRequest(request, input.signal, options.signal, key);
        options.calls.push(key);
        if (options.abort) return await abortSource(input.signal, options.sourceBarrier);
        return detail(bodyFor(key), `synthetic-${key.replace("cash-", "")}`, options.mismatchAt === key);
      },
      getConfigurationPagesDetailedCancellable: async (request: any, input: { readonly signal?: AbortSignal }) => {
        const key = request.rateLimitKey as CashSourceKey;
        assertCashRequest(request, input.signal, options.signal, key);
        options.calls.push(key);
        if (options.incomplete) return [];
        return configurationPages(key);
      },
      foldConfigurationPagesCancellable: async <T>(
        request: any,
        createInitialState: () => T,
        consumePage: (state: T, page: any, pageNumber: number) => T | Promise<T>,
        input: { readonly signal?: AbortSignal },
      ): Promise<T> => {
        const key = request.rateLimitKey as CashSourceKey;
        assertCashRequest(request, input.signal, options.signal, key);
        options.calls.push(key);
        let state = createInitialState();
        if (options.incomplete) return state;
        const pages = configurationPages(key);
        for (const [index, page] of pages.entries()) {
          state = await consumePage(state, page, index + 1);
        }
        return state;
      },
    },
  };

  function configurationPage(
    key: CashSourceKey,
    pageIndex: number,
  ): unknown {
    const size = options.configurationPageSizes?.[pageIndex];
    if (size === undefined) return bodyFor(key);
    return Array.from(
      { length: size },
      (_value, index) => ({ guid: configurationGuid(key, pageIndex, index) }),
    );
  }

  function configurationPages(key: CashSourceKey): readonly ReturnType<typeof detail>[] {
    const first = detail(
      configurationPage(key, 0),
      `synthetic-${key.replace("config-", "")}`,
      options.mismatchAt === key,
    );
    if (options.twoPageAt !== key) return [first];
    return [first, detail(
      options.malformedSecondPage ? [{}] : configurationPage(key, 1),
      `synthetic-${key.replace("config-", "")}-page-2`,
      options.mismatchedSecondPage,
    )];
  }
}

function locationContext() {
  return {
    location: {
      restaurantGuid: RESTAURANT_GUID, name: "Synthetic Cash Cafe", timezone: "America/Chicago",
      closeoutHour: 4, currencyCode: "USD", connectionScopes: ["cashmgmt:read", "config:read"],
    },
    freshness: { retrievedThroughEpochMs: 1_800_000_000_000, ageMs: 0, maxAgeMs: 10_000 },
    provenance: { retrievedThroughEpochMs: 1_800_000_000_000, upstreamRequestIds: [], upstreamRequestIdCount: 0, upstreamRequestIdsTruncated: false },
  };
}

function assertCashRequest(request: any, signal: AbortSignal | undefined, expected: AbortSignal | undefined, key: CashSourceKey): void {
  assert.equal(request.restaurantGuid, RESTAURANT_GUID);
  assert.equal(signal, expected);
  if (key.startsWith("cash-")) {
    assert.deepEqual(request.query, { businessDate: BUSINESS_DATE });
    assert.equal(request.path, key === "cash-entries" ? "/cashmgmt/v1/entries" : "/cashmgmt/v1/deposits");
  } else assert.equal(request.query, undefined);
}

async function abortSource(signal: AbortSignal | undefined, barrier: SourceEntryBarrier | undefined): Promise<never> {
  barrier?.enter();
  return await new Promise<never>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new ToastHttpError(
      "request_cancelled", "Synthetic source request cancelled.", { apiFamily: "standard", retryable: false },
    )), { once: true });
  });
}

function configurationGuid(key: CashSourceKey, pageIndex: number, index: number): string {
  const sourceIndex = ["config-cash-drawers", "config-no-sale-reasons", "config-payout-reasons"].indexOf(key);
  const value = (sourceIndex + 1) * 100_000 + pageIndex * 1_000 + index;
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
