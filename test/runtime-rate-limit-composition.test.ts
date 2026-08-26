import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRuntime } from "../src/runtime.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

test("the process runtime shares GLOBAL rate-limit coordination across endpoint calls", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  let nowMs = 1_800_000_000_000;
  const sleeps: number[] = [];
  const tokenManager = createOAuthTokenManager(config, {
    now: () => nowMs,
    fetch: async () => jsonResponse({
      token: { tokenType: "Bearer", expiresIn: 3600, accessToken: "synthetic-runtime-token" },
    }),
  });
  const runtime = createRuntime(config, tokenManager, {
    now: () => nowMs,
    sleep: async (milliseconds: number) => {
      sleeps.push(milliseconds);
      nowMs += milliseconds;
    },
    fetch: async (_input: Request | URL | string, _init?: RequestInit) => {
      const path = new URL(String(_input)).pathname;
      if (path === "/orders/v2/payments") {
        return new Response("{}", {
          headers: {
            "content-type": "application/json",
            "x-toast-ratelimit-by": "GLOBAL",
            "x-toast-ratelimit-remaining": "0",
            "x-toast-ratelimit-reset": "1800000001",
          },
        });
      }
      return jsonResponse({ ok: true });
    },
  });

  await runtime.toastHttpClient.getJson({
    path: "/orders/v2/payments",
    restaurantGuid: requiredDefaultRestaurantGuid(config),
    rateLimitKey: "payments-index",
  });
  await runtime.toastHttpClient.getJson({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: requiredDefaultRestaurantGuid(config),
    rateLimitKey: "restaurant-detail",
  });

  assert.deepEqual(sleeps, [1000]);
  await runtime.server.close();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

function requiredDefaultRestaurantGuid(config: { readonly defaultRestaurantGuid?: string }): string {
  assert.ok(config.defaultRestaurantGuid !== undefined);
  return config.defaultRestaurantGuid;
}
