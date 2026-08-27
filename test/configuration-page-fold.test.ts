import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { cashSourceInvalid } from "../src/cash-report-fold.js";
import { MAX_CASH_SOURCE_RECORDS } from "../src/cash-report-limits.js";
import { cashDrawerArraySchema } from "../src/cash-report-source.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { ReportComputationError } from "../src/report-core.js";
import type { ToastDetailedJsonResult } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = requiredString(
  SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID,
  "The synthetic runtime environment must define a restaurant GUID.",
);

interface FoldState {
  readonly records: readonly { readonly guid: string }[];
  readonly requestIds: readonly string[];
  readonly pages: number;
}

test("rate-limited configuration fold validates the cap before page three starts", async () => {
  let consumedPages = 0;
  const harness = createHarness([
    jsonResponse(records(500, 0), {
      "toast-next-page-token": "synthetic-page-2",
      "toast-request-id": "synthetic-page-1",
    }),
    jsonResponse(records(501, 1), {
      "toast-next-page-token": "synthetic-page-3",
      "toast-request-id": "synthetic-page-2",
    }),
  ], () => {
    if (harness.urls.length === 2) assert.equal(consumedPages, 1);
  });

  await assert.rejects(
    harness.client.foldConfigurationPagesCancellable(
      request(),
      emptyState,
      (state, page, pageNumber) => {
        consumedPages += 1;
        return consumeCashDrawerPage(state, page, pageNumber);
      },
    ),
    (error: unknown) => error instanceof ReportComputationError && error.code === cashSourceInvalid().code,
  );

  assert.equal(consumedPages, 2);
  assert.equal(harness.urls.length, 2);
  assert.equal(harness.urls[1]?.searchParams.get("pageToken"), "synthetic-page-2");
});

test("rate-limited configuration fold resets parsed state after a scoped 409", async () => {
  const harness = createHarness([
    jsonResponse(records(1, 0), {
      "toast-next-page-token": "stale-page-2",
      "toast-request-id": "stale-page-1",
    }),
    new Response(JSON.stringify({ syntheticConflict: true }), {
      status: 409,
      headers: {
        "content-type": "application/json",
        "toast-request-id": "synthetic-restart-conflict",
      },
    }),
    jsonResponse(records(500, 2), {
      "toast-next-page-token": "fresh-page-2",
      "toast-request-id": "fresh-page-1",
    }),
    jsonResponse(records(500, 3), { "toast-request-id": "fresh-page-2" }),
  ]);
  let createdStates = 0;

  const result = await harness.client.foldConfigurationPagesCancellable(
    request(),
    () => {
      createdStates += 1;
      return emptyState();
    },
    consumeCashDrawerPage,
  );

  assert.equal(createdStates, 2);
  assert.equal(result.pages, 2);
  assert.equal(result.records.length, MAX_CASH_SOURCE_RECORDS);
  assert.deepEqual(result.requestIds, ["fresh-page-1", "fresh-page-2"]);
  assert.equal("syntheticUnknown" in result.records[0]!, false);
  assert.deepEqual(harness.urls.map((url) => url.searchParams.get("pageToken")), [
    null,
    "stale-page-2",
    null,
    "fresh-page-2",
  ]);
});

function emptyState(): FoldState {
  return Object.freeze({ records: Object.freeze([]), requestIds: Object.freeze([]), pages: 0 });
}

function consumeCashDrawerPage(
  state: FoldState,
  page: ToastDetailedJsonResult,
  pageNumber: number,
): FoldState {
  assert.equal(pageNumber, state.pages + 1);
  const parsed = cashDrawerArraySchema.safeParse(page.body);
  if (!parsed.success || state.records.length + parsed.data.length > MAX_CASH_SOURCE_RECORDS) {
    throw cashSourceInvalid();
  }
  return Object.freeze({
    records: Object.freeze([...state.records, ...parsed.data]),
    requestIds: Object.freeze([
      ...state.requestIds,
      ...(page.upstreamRequestId === undefined ? [] : [page.upstreamRequestId]),
    ]),
    pages: state.pages + 1,
  });
}

function request() {
  return {
    path: "/config/v2/synthetic" as const,
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "config-synthetic",
    maxPages: 3,
    maxRestarts: 1,
  };
}

function records(length: number, page: number): readonly object[] {
  return Array.from(
    { length },
    (_value, index) => ({
      guid: `00000000-0000-4000-8000-${String(page * 1_000 + index + 1).padStart(12, "0")}`,
      syntheticUnknown: `synthetic-unknown-${page}-${index}`,
    }),
  );
}

function createHarness(
  responses: readonly Response[],
  onFetch?: () => void,
) {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: { tokenType: "Bearer", expiresIn: 3600, accessToken: "synthetic-fold-token" },
    }),
  });
  const pending = [...responses];
  const urls: URL[] = [];
  const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
    fetch: async (input) => {
      urls.push(new URL(String(input)));
      onFetch?.();
      const response = pending.shift();
      if (response === undefined) throw new Error("Unexpected configuration page fetch.");
      return response;
    },
    now: () => 1_800_000_000_000,
    random: () => 0,
  });
  return Object.freeze({ client, urls });
}

function jsonResponse(body: unknown, headers: Readonly<Record<string, string>> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function requiredString(value: string | undefined, message: string): string {
  assert.ok(value, message);
  return value;
}
