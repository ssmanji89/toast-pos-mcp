import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import {
  createToastHttpClient,
  type ToastDetailedJsonResult,
  type ToastHttpClient,
} from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000002";
const TOKEN = "synthetic-success-metadata-token";

test("getJsonDetailed returns only body plus successful request provenance", async () => {
  const harness = new MetadataHarness([
    jsonResponse({ value: 7 }, { "toast-request-id": "success-request-1" }),
  ]);

  const result = await harness.client.getJsonDetailed({
    path: "/synthetic/v1/value",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "synthetic",
  });

  assert.deepEqual(result.body, { value: 7 });
  assert.equal(result.retrievedAtEpochMs, 1_001);
  assert.equal(result.upstreamRequestId, "success-request-1");
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(Object.keys(result).sort(), [
    "body",
    "retrievedAtEpochMs",
    "upstreamRequestId",
  ]);
  assert.equal((result as { headers?: unknown }).headers, undefined);
  assert.equal((result as { url?: unknown }).url, undefined);
});

test("successful request ID is optional and never fabricated", async () => {
  const harness = new MetadataHarness([jsonResponse({ value: 8 })]);

  const result = await harness.client.getJsonDetailed({
    path: "/synthetic/v1/no-request-id",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "synthetic",
  });

  assert.equal(result.upstreamRequestId, undefined);
  assert.equal(result.retrievedAtEpochMs, 1_001);
});

test("legacy getJson remains a body-only compatibility projection", async () => {
  const harness = new MetadataHarness([
    jsonResponse({ legacy: true }, { "toast-request-id": "legacy-success" }),
  ]);

  const result = await harness.client.getJson({
    path: "/synthetic/v1/legacy",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "synthetic",
  });

  assert.deepEqual(result, { legacy: true });
  assert.equal((result as { retrievedAtEpochMs?: unknown }).retrievedAtEpochMs, undefined);
  assert.equal((result as { upstreamRequestId?: unknown }).upstreamRequestId, undefined);
});

test("retryable failed-attempt request IDs never contaminate final success metadata", async () => {
  const harness = new MetadataHarness([
    new Response(JSON.stringify({ ignored: true }), {
      status: 503,
      headers: {
        "content-type": "application/json",
        "toast-request-id": "failed-attempt-request-id",
      },
    }),
    jsonResponse(
      { complete: true },
      { "toast-request-id": "final-success-request-id" },
    ),
  ]);

  const result = await harness.client.getJsonDetailed({
    path: "/synthetic/v1/retry",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "synthetic",
  });

  assert.equal(result.upstreamRequestId, "final-success-request-id");
  assert.notEqual(result.upstreamRequestId, "failed-attempt-request-id");
  assert.equal(harness.fetch.calls.length, 2);
});

test("configuration detailed traversal retains one metadata entry per proven page", async () => {
  const harness = new MetadataHarness([
    jsonResponse(
      [{ page: 1 }],
      {
        "toast-next-page-token": "opaque-next-token",
        "toast-request-id": "config-page-1",
      },
    ),
    jsonResponse(
      [{ page: 2 }],
      { "toast-request-id": "config-page-2" },
    ),
  ]);

  const pages = await harness.client.getConfigurationPagesDetailed({
    path: "/config/v2/synthetic",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "config",
  });

  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((page) => page.body), [[{ page: 1 }], [{ page: 2 }]]);
  assert.deepEqual(pages.map((page) => page.upstreamRequestId), [
    "config-page-1",
    "config-page-2",
  ]);
  assert.deepEqual(pages.map((page) => page.retrievedAtEpochMs), [1_001, 1_003]);
  assert.ok(Object.isFrozen(pages));
  assert.ok(pages.every(Object.isFrozen));
});

test("configuration 409 restart discards stale page bodies and stale success metadata together", async () => {
  const harness = new MetadataHarness([
    jsonResponse(
      [{ generation: "stale" }],
      {
        "toast-next-page-token": "stale-token",
        "toast-request-id": "stale-page-success-id",
      },
    ),
    new Response(JSON.stringify({ staleConflict: true }), {
      status: 409,
      headers: {
        "content-type": "application/json",
        "toast-request-id": "restart-conflict-id",
      },
    }),
    jsonResponse(
      [{ generation: "fresh" }],
      { "toast-request-id": "fresh-page-success-id" },
    ),
  ]);

  const pages = await harness.client.getConfigurationPagesDetailed({
    path: "/config/v2/synthetic",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "config",
    maxRestarts: 1,
  });

  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0]?.body, [{ generation: "fresh" }]);
  assert.equal(pages[0]?.upstreamRequestId, "fresh-page-success-id");
  const rendered = JSON.stringify(pages);
  assert.ok(!rendered.includes("stale-page-success-id"));
  assert.ok(!rendered.includes("restart-conflict-id"));
  assert.ok(!rendered.includes("stale"));
});

test("legacy configuration wrapper returns the same retained bodies without metadata", async () => {
  const harness = new MetadataHarness([
    jsonResponse(
      [{ page: 1 }],
      {
        "toast-next-page-token": "next",
        "toast-request-id": "page-one-id",
      },
    ),
    jsonResponse([{ page: 2 }], { "toast-request-id": "page-two-id" }),
  ]);

  const pages = await harness.client.getConfigurationPagesJson({
    path: "/config/v2/synthetic",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "config",
  });

  assert.deepEqual(pages, [[{ page: 1 }], [{ page: 2 }]]);
  assert.ok(Object.isFrozen(pages));
  assert.equal((pages[0] as { upstreamRequestId?: unknown }).upstreamRequestId, undefined);
});

test("ordersBulk detailed traversal preserves page-aligned timestamps and request IDs", async () => {
  const firstNext =
    "https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?page=2&pageSize=25&businessDate=20260816";
  const harness = new MetadataHarness([
    jsonResponse(
      [{ guid: "order-1" }],
      {
        link: `<${firstNext}>; rel="next"`,
        "toast-request-id": "orders-page-1",
      },
    ),
    jsonResponse(
      [{ guid: "order-2" }],
      { "toast-request-id": "orders-page-2" },
    ),
  ]);

  const pages = await harness.client.getOrdersBulkPagesDetailed({
    restaurantGuid: RESTAURANT_GUID,
    query: { businessDate: 20260816 },
    pageSize: 25,
  });

  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((page) => page.body), [
    [{ guid: "order-1" }],
    [{ guid: "order-2" }],
  ]);
  assert.deepEqual(pages.map((page) => page.upstreamRequestId), [
    "orders-page-1",
    "orders-page-2",
  ]);
  assert.deepEqual(pages.map((page) => page.retrievedAtEpochMs), [1_001, 1_003]);
  assert.ok(Object.isFrozen(pages));
});

test("legacy ordersBulk wrapper preserves historical body-array shape", async () => {
  const harness = new MetadataHarness([
    jsonResponse([{ guid: "order-legacy" }], {
      "toast-request-id": "orders-legacy-id",
    }),
  ]);

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: RESTAURANT_GUID,
    pageSize: 25,
  });

  assert.deepEqual(pages, [[{ guid: "order-legacy" }]]);
  assert.equal(Object.isFrozen(pages), false);
  assert.equal((pages[0] as { upstreamRequestId?: unknown }).upstreamRequestId, undefined);
});

test("credential-scoped Partners detailed result uses the same provenance contract", async () => {
  const harness = new MetadataHarness([
    jsonResponse(
      [{ restaurantGuid: RESTAURANT_GUID }],
      { "toast-request-id": "partners-success-id" },
    ),
  ]);

  const result = await harness.client.getAccessibleRestaurantsJsonDetailed();

  assert.deepEqual(result.body, [{ restaurantGuid: RESTAURANT_GUID }]);
  assert.equal(result.upstreamRequestId, "partners-success-id");
  assert.equal(result.retrievedAtEpochMs, 1_001);
});

class MetadataHarness {
  readonly client: ToastHttpClient;
  readonly fetch: RecordingFetch;

  constructor(responses: readonly Response[]) {
    const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
    const tokenManager = createOAuthTokenManager(config, {
      fetch: async () => jsonResponse({
        status: "SUCCESS",
        token: {
          tokenType: "Bearer",
          expiresIn: 600,
          accessToken: TOKEN,
        },
      }),
      now: () => 0,
    });
    this.fetch = new RecordingFetch(responses);
    let now = 999;
    this.client = createToastHttpClient(config, tokenManager, {
      fetch: this.fetch.fetch,
      maxAttempts: 3,
      now: () => {
        now += 1;
        return now;
      },
      random: () => 0,
      sleep: async () => {},
    });
  }
}

interface RecordedCall {
  readonly url: string;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #responses: Response[];

  constructor(responses: readonly Response[]) {
    this.#responses = [...responses];
  }

  fetch = async (input: string | URL | Request): Promise<Response> => {
    this.calls.push({ url: String(input) });
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error("RecordingFetch received more calls than responses");
    }
    return response;
  };
}

function jsonResponse(
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function assertDetailedResultShape(result: ToastDetailedJsonResult): void {
  assert.deepEqual(Object.keys(result).sort(), [
    "body",
    "retrievedAtEpochMs",
    "upstreamRequestId",
  ]);
}

void assertDetailedResultShape;
