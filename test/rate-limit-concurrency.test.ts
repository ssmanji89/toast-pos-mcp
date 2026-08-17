import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;
const OTHER_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000778";

test("concurrent Standard calls serialize so the second observes the first response's exhausted GLOBAL limit", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  let nowMs = 1_800_000_000_000;
  const sleeps: number[] = [];
  const upstreamCalls: string[] = [];
  let releaseFirst!: (response: Response) => void;
  const firstResponse = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });
  let dataCall = 0;

  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowMs,
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-concurrency-token",
      },
    }),
  });
  const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
    now: () => nowMs,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    fetch: async (input) => {
      dataCall += 1;
      upstreamCalls.push(String(input));
      if (dataCall === 1) {
        return firstResponse;
      }
      return jsonResponse({ second: true });
    },
  });

  const first = client.getJson({
    path: "/orders/v2/payments",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "payments-index",
  });
  const second = client.getJson({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "restaurant-detail",
  });

  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(dataCall, 1, "second Standard fetch must wait for first response observation");

  releaseFirst(new Response("{}", {
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-toast-ratelimit-by": "GLOBAL",
      "x-toast-ratelimit-remaining": "0",
      "x-toast-ratelimit-reset": "1800000001",
    },
  }));

  await Promise.all([first, second]);
  assert.equal(dataCall, 2);
  assert.deepEqual(sleeps, [1000]);
  assert.equal(upstreamCalls.length, 2);
});

test("a scoped wait releases the serialized turn so another restaurant can fetch while it sleeps", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  let nowMs = 1_800_000_000_000;
  let dataCall = 0;
  const upstreamCalls: string[] = [];
  let holdRateLimitSleep = false;
  let sleepStarted!: () => void;
  const sleepStartedPromise = new Promise<void>((resolve) => {
    sleepStarted = resolve;
  });
  let releaseSleep!: () => void;
  const heldSleep = new Promise<void>((resolve) => {
    releaseSleep = resolve;
  });

  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowMs,
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-location-isolation-token",
      },
    }),
  });
  const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
    now: () => nowMs,
    sleep: async (milliseconds) => {
      if (holdRateLimitSleep) {
        sleepStarted();
        await heldSleep;
      }
      nowMs += milliseconds;
    },
    fetch: async (input) => {
      dataCall += 1;
      upstreamCalls.push(String(input));
      if (dataCall === 1) {
        return new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-toast-ratelimit-by": "GLOBAL",
            "x-toast-ratelimit-remaining": "0",
            "x-toast-ratelimit-reset": "1800000001",
          },
        });
      }
      return jsonResponse({ call: dataCall });
    },
  });

  // Seed a restaurant-scoped exhausted GLOBAL observation.
  await client.getJson({
    path: "/orders/v2/payments",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "seed-a",
  });

  holdRateLimitSleep = true;
  const waitingA = client.getJson({
    path: "/orders/v2/orders/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "waiting-a",
  });
  await sleepStartedPromise;

  const unrelatedB = client.getJson({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: OTHER_RESTAURANT_GUID,
    rateLimitKey: "restaurant-b",
  });
  await unrelatedB;

  assert.equal(
    dataCall,
    2,
    "Restaurant B should reach upstream while Restaurant A is sleeping",
  );
  assert.ok(upstreamCalls[1]?.includes("/restaurants/v1/restaurants/example"));

  holdRateLimitSleep = false;
  releaseSleep();
  await waitingA;
  assert.equal(dataCall, 3);
});

test("current By never borrows missing remaining/reset values from legacy aliases", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  let nowMs = 1_800_000_000_000;
  const sleeps: number[] = [];
  let dataCall = 0;
  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowMs,
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-generation-token",
      },
    }),
  });
  const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
    now: () => nowMs,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    fetch: async () => {
      dataCall += 1;
      if (dataCall === 1) {
        return new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-toast-ratelimit-by": "GLOBAL",
            // Intentionally omit current Remaining/Reset. Legacy values must
            // not complete a current-generation hierarchy observation.
            "toast-ratelimit-remaining": "0",
            "toast-ratelimit-reset": "1800000001",
          },
        });
      }
      return jsonResponse({ second: true });
    },
  });

  await client.getJson({
    path: "/orders/v2/payments",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "payments-index",
  });
  await client.getJson({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "restaurant-detail",
  });

  assert.equal(dataCall, 2);
  assert.deepEqual(sleeps, []);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
