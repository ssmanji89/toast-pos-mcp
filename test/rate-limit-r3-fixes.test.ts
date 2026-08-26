import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { ToastRateLimitCoordinator } from "../src/rate-limit.js";
import {
  createToastHttpClient,
  ToastHttpError,
} from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = requiredSyntheticRuntimeValue("TOAST_DEFAULT_RESTAURANT_GUID");
const START_EPOCH_MS = 1_800_000_000_000;

test("known over-ceiling hierarchy wait is non-retryable regardless of maxAttempts", async () => {
  for (const maxAttempts of [1, 3]) {
    const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
    const coordinator = new ToastRateLimitCoordinator();
    coordinator.record(
      {
        restaurantGuid: RESTAURANT_GUID,
        apiKey: "orders",
        endpointKey: "orders/v2/payments",
      },
      {
        byTokens: ["GLOBAL"],
        primary: "GLOBAL",
        account: false,
        remaining: 0,
        resetAtEpochMs: START_EPOCH_MS + 2_000,
        retryAfterEpochMs: undefined,
      },
    );

    let dataFetchCount = 0;
    const tokenManager = createOAuthTokenManager(config, {
      now: () => START_EPOCH_MS,
      fetch: async () => tokenResponse(),
    });
    const client = createRateLimitAwareToastHttpClient(config, tokenManager, {
      maxAttempts,
      maxRateLimitWaitMs: 1_000,
      now: () => START_EPOCH_MS,
      rateLimitCoordinator: coordinator,
      fetch: async () => {
        dataFetchCount += 1;
        return jsonResponse({ unexpected: true });
      },
    });

    await assert.rejects(
      client.getJson({
        path: "/orders/v2/payments",
        restaurantGuid: RESTAURANT_GUID,
        rateLimitKey: "payments-index",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ToastHttpError);
        assert.equal(error.code, "rate_limit_wait_exceeded");
        assert.equal(error.retryable, false);
        assert.equal(error.upstreamStatus, undefined);
        return true;
      },
    );
    assert.equal(
      dataFetchCount,
      0,
      `maxAttempts=${maxAttempts} must not issue the blocked upstream request`,
    );
  }
});

test("Retry-After accepts strict delta-seconds and retries after that delay", async () => {
  const { client, sleeps, fetchCount } = createBaseRetryHarness("10");
  await client.getJson({
    path: "/orders/v2/orders/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "strict-delta",
  });

  assert.deepEqual(sleeps, [10_000]);
  assert.equal(fetchCount(), 2);
});

test("Retry-After retains HTTP-date compatibility", async () => {
  const httpDate = new Date(START_EPOCH_MS + 5_000).toUTCString();
  const { client, sleeps, fetchCount } = createBaseRetryHarness(httpDate);
  await client.getJson({
    path: "/orders/v2/orders/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "http-date",
  });

  assert.deepEqual(sleeps, [5_000]);
  assert.equal(fetchCount(), 2);
});

test("malformed numeric-prefix Retry-After is not interpreted as delta-seconds", async () => {
  const { client, sleeps, fetchCount } = createBaseRetryHarness("10junk");
  await client.getJson({
    path: "/orders/v2/orders/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "malformed-delta",
  });

  // random=0 makes the ordinary client-side jitter backoff exactly zero. If
  // `10junk` were still parsed by Number.parseInt this would be 10,000 ms.
  assert.deepEqual(sleeps, [0]);
  assert.equal(fetchCount(), 2);
});

function createBaseRetryHarness(retryAfter: string): {
  readonly client: ReturnType<typeof createToastHttpClient>;
  readonly sleeps: number[];
  readonly fetchCount: () => number;
} {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const sleeps: number[] = [];
  let nowEpochMs = START_EPOCH_MS;
  let dataFetchCount = 0;
  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowEpochMs,
    fetch: async () => tokenResponse(),
  });
  const client = createToastHttpClient(config, tokenManager, {
    maxAttempts: 2,
    now: () => nowEpochMs,
    random: () => 0,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      nowEpochMs += milliseconds;
    },
    fetch: async () => {
      dataFetchCount += 1;
      if (dataFetchCount === 1) {
        return new Response("{}", {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": retryAfter,
          },
        });
      }
      return jsonResponse({ ok: true });
    },
  });

  return { client, sleeps, fetchCount: () => dataFetchCount };
}

function tokenResponse(): Response {
  return jsonResponse({
    token: {
      tokenType: "Bearer",
      expiresIn: 3600,
      accessToken: "synthetic-r3-rate-limit-token",
    },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requiredSyntheticRuntimeValue(name: string): string {
  const value = SYNTHETIC_VALID_RUNTIME_ENV[name];
  assert.ok(value !== undefined, `missing synthetic runtime value: ${name}`);
  return value;
}
