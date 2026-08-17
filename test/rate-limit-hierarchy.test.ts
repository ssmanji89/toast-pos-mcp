import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { ToastHttpError } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_A = SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;
const RESTAURANT_B = "00000000-0000-4000-8000-000000000777";

interface Harness {
  readonly client: ReturnType<typeof createRateLimitAwareToastHttpClient>;
  readonly sleeps: number[];
  readonly calls: string[];
  setResponses(responses: Response[]): void;
}

test("GLOBAL exhaustion on one endpoint delays another API for the same restaurant", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("GLOBAL", 0, 1),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/orders/example", "orders-one");
  await restaurantGet(harness, RESTAURANT_A, "/restaurants/v1/restaurants/example", "restaurants-two");

  assert.deepEqual(harness.sleeps, [1000]);
  assert.equal(harness.calls.length, 2);
});

test("API exhaustion coordinates sibling orders endpoints but not another API", async () => {
  const sameApi = createHarness();
  sameApi.setResponses([
    limitedResponse("API", 0, 1),
    jsonResponse({ ok: true }),
  ]);
  await restaurantGet(sameApi, RESTAURANT_A, "/orders/v2/payments", "payments-index");
  await restaurantGet(sameApi, RESTAURANT_A, "/orders/v2/orders/example", "orders-one");
  assert.deepEqual(sameApi.sleeps, [1000]);

  const otherApi = createHarness();
  otherApi.setResponses([
    limitedResponse("API", 0, 1),
    jsonResponse({ ok: true }),
  ]);
  await restaurantGet(otherApi, RESTAURANT_A, "/orders/v2/payments", "payments-index");
  await restaurantGet(otherApi, RESTAURANT_A, "/restaurants/v1/restaurants/example", "restaurant-detail");
  assert.deepEqual(otherApi.sleeps, []);
});

test("ENDPOINT exhaustion blocks the same normalized endpoint only", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("ENDPOINT", 0, 1),
    jsonResponse({ ok: true }),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(
    harness,
    RESTAURANT_A,
    "/orders/v2/payments/00000000-0000-4000-8000-000000000701",
    "payment-detail-a",
  );
  await restaurantGet(
    harness,
    RESTAURANT_A,
    "/orders/v2/payments/00000000-0000-4000-8000-000000000702",
    "payment-detail-b",
  );
  await restaurantGet(
    harness,
    RESTAURANT_A,
    "/orders/v2/orders/00000000-0000-4000-8000-000000000703",
    "order-detail",
  );

  assert.deepEqual(harness.sleeps, [1000]);
});

test("restaurant-scoped constraints do not block another restaurant", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("GLOBAL", 0, 1),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-a");
  await restaurantGet(harness, RESTAURANT_B, "/orders/v2/payments", "payments-b");

  assert.deepEqual(harness.sleeps, []);
});

test("ACCOUNT API exhaustion coordinates the same API across restaurants", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("API, ACCOUNT", 0, 1),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-a");
  await restaurantGet(harness, RESTAURANT_B, "/orders/v2/orders/example", "orders-b");

  assert.deepEqual(harness.sleeps, [1000]);
});

test("headerless Partners/IP-context limit remains disjoint from restaurant context", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("GLOBAL", 0, 1),
    jsonResponse({ ok: true }),
  ]);

  await harness.client.getAccessibleRestaurantsJson();
  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-a");

  assert.deepEqual(harness.sleeps, []);
});

test("current X-Toast headers override legacy aliases and populate compatibility snapshots", async () => {
  const harness = createHarness();
  harness.setResponses([
    new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-toast-ratelimit-by": "ENDPOINT",
        "x-toast-ratelimit-remaining": "1",
        "x-toast-ratelimit-reset": "1800000001",
        "toast-ratelimit-remaining": "0",
        "toast-ratelimit-reset": "1800000999",
      },
    }),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-index");
  assert.equal(
    harness.client.getRateLimitSnapshot("standard", RESTAURANT_A, "payments-index")?.remaining,
    1,
  );
  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-index");
  assert.deepEqual(harness.sleeps, []);
});

test("documented reset is treated as absolute epoch, not a relative duration", async () => {
  const harness = createHarness();
  harness.setResponses([
    limitedResponse("GLOBAL", 0, 1),
    jsonResponse({ ok: true }),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-one");
  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/orders/example", "orders-two");
  assert.deepEqual(harness.sleeps, [1000]);
});

test("known hierarchical wait beyond the configured ceiling fails through the existing non-retryable wait gate", async () => {
  const harness = createHarness({ maxRateLimitWaitMs: 1000 });
  harness.setResponses([
    limitedResponse("GLOBAL", 0, 2),
  ]);

  await restaurantGet(harness, RESTAURANT_A, "/orders/v2/payments", "payments-one");
  await assert.rejects(
    restaurantGet(harness, RESTAURANT_A, "/restaurants/v1/restaurants/example", "restaurant-two"),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "rate_limit_wait_exceeded");
      assert.equal(error.retryable, false);
      return true;
    },
  );
  assert.equal(harness.calls.length, 1, "no second upstream request should be sent");
});

function createHarness(
  options: { readonly maxRateLimitWaitMs?: number } = {},
): Harness {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  let nowMs = 1_800_000_000_000;
  const sleeps: number[] = [];
  const calls: string[] = [];
  let responses: Response[] = [];
  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowMs,
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-rate-limit-token",
      },
    }),
  });

  const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
    maxRateLimitWaitMs: options.maxRateLimitWaitMs,
    now: () => nowMs,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    fetch: async (input) => {
      calls.push(String(input));
      const response = responses.shift();
      assert.ok(response, "synthetic rate-limit harness exhausted responses");
      return response;
    },
  });

  return {
    client,
    sleeps,
    calls,
    setResponses(next) {
      responses = [...next];
    },
  };
}

async function restaurantGet(
  harness: Harness,
  restaurantGuid: string,
  path: `/${string}`,
  rateLimitKey: string,
): Promise<unknown> {
  return harness.client.getJson({
    path,
    restaurantGuid,
    rateLimitKey,
  });
}

function limitedResponse(
  by: string,
  remaining: number,
  resetSecondsFromNow: number,
): Response {
  return new Response("{}", {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-toast-ratelimit-by": by,
      "x-toast-ratelimit-remaining": String(remaining),
      "x-toast-ratelimit-reset": String(1_800_000_000 + resetSecondsFromNow),
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
