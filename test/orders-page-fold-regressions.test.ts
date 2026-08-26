import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createToastHttpClient } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = requiredString(
  SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID,
  "The synthetic runtime environment must define a restaurant GUID.",
);
const PARTNERS_LIMITER_KEY = "partnersAccessibleRestaurants";

test("credential-scoped Partners detailed read remains headerless, provenance-bearing, and limiter-isolated", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const calls: Array<{ url: string; headers: Headers }> = [];
  let now = 1_800_000_000_000;
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-regression-token",
      },
    }),
  });
  const client = createToastHttpClient(config, tokenManager, {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), headers });
      if (String(input).endsWith("/partners/v1/restaurants")) {
        return jsonResponse([{ restaurantGuid: RESTAURANT_GUID }], {
          "toast-ratelimit-limit": "10",
          "toast-ratelimit-remaining": "9",
          "toast-request-id": "partners-success-request",
        });
      }
      return jsonResponse({ ok: true }, {
        "toast-ratelimit-limit": "20",
        "toast-ratelimit-remaining": "19",
      });
    },
    now: () => ++now,
  });

  const partners = await client.getAccessibleRestaurantsJsonDetailed();
  await client.getJson({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "restaurant-detail",
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.headers.get("toast-restaurant-external-id"), null);
  assert.equal(
    calls[1]?.headers.get("toast-restaurant-external-id"),
    RESTAURANT_GUID,
  );
  assert.deepEqual(partners.body, [{ restaurantGuid: RESTAURANT_GUID }]);
  assert.equal(partners.upstreamRequestId, "partners-success-request");
  assert.ok(Number.isSafeInteger(partners.retrievedAtEpochMs));

  assert.equal(
    client.getCredentialRateLimitSnapshot("standard", PARTNERS_LIMITER_KEY)
      ?.remaining,
    9,
  );
  assert.equal(
    client.getRateLimitSnapshot(
      "standard",
      RESTAURANT_GUID,
      "restaurant-detail",
    )?.remaining,
    19,
  );
});

test("body-only Partners API remains a projection of the detailed source", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-regression-token",
      },
    }),
  });
  const client = createToastHttpClient(config, tokenManager, {
    fetch: async () => jsonResponse([{ restaurantGuid: RESTAURANT_GUID }]),
  });

  assert.deepEqual(await client.getAccessibleRestaurantsJson(), [
    { restaurantGuid: RESTAURANT_GUID },
  ]);
});

test("success provenance timestamp is sampled after JSON body parsing completes", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-regression-token",
      },
    }),
  });
  let now = 100;
  let parsed = false;
  const parsedAtTimeSamples: boolean[] = [];
  const client = createToastHttpClient(config, tokenManager, {
    now: () => {
      parsedAtTimeSamples.push(parsed);
      return ++now;
    },
    fetch: async () => new ParsingResponse(
      "{}",
      () => {
        parsed = true;
      },
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    ),
  });

  const result = await client.getJsonDetailed({
    path: "/restaurants/v1/restaurants/example",
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "provenance-test",
  });
  assert.equal(result.retrievedAtEpochMs, 102);
  assert.deepEqual(parsedAtTimeSamples, [false, true]);
});

test("legacy body-only ordersBulk wrapper remains a mutable array", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () => jsonResponse({
      token: {
        tokenType: "Bearer",
        expiresIn: 3600,
        accessToken: "synthetic-regression-token",
      },
    }),
  });
  const client = createToastHttpClient(config, tokenManager, {
    fetch: async () => jsonResponse([{ page: 1 }]),
  });

  const pages = await client.getOrdersBulkPages({
    restaurantGuid: RESTAURANT_GUID,
    query: { businessDate: 20260816 },
    pageSize: 100,
    maxPages: 1,
  });

  pages.push({ synthetic: "caller-owned-mutation" });
  assert.equal(pages.length, 2);
  assert.equal(Object.isFrozen(pages), false);
});

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

function requiredString(value: string | undefined, message: string): string {
  assert.ok(value, message);
  return value;
}

class ParsingResponse extends Response {
  readonly #afterJson: () => void;

  constructor(body: string, afterJson: () => void, init: ResponseInit) {
    super(body, init);
    this.#afterJson = afterJson;
  }

  override json = async (): Promise<unknown> => {
    const result = await Response.prototype.json.call(this);
    this.#afterJson();
    return result;
  };
}
