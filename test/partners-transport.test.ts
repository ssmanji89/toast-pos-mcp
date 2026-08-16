import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import {
  createToastHttpClient,
  ToastHttpError,
  type ToastHttpClient,
} from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const SYNTHETIC_ACCESS_TOKEN = "synthetic-partners-access-token";
const SYNTHETIC_ERROR_MARKER = "partners-upstream-marker-must-not-leak";
const SYNTHETIC_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000002";

test("Partners discovery is a hard-coded credential-scoped GET with no restaurant header", async () => {
  const dataFetch = new RecordingFetch([
    jsonResponse([{ restaurantGuid: SYNTHETIC_RESTAURANT_GUID }]),
  ]);
  const client = createClient(dataFetch);

  const payload = await client.getAccessibleRestaurantsJson();

  assert.deepEqual(payload, [{ restaurantGuid: SYNTHETIC_RESTAURANT_GUID }]);
  assert.equal(dataFetch.calls.length, 1);
  assert.equal(
    dataFetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/partners/v1/restaurants",
  );
  assert.equal(dataFetch.calls[0]?.method, "GET");
  assert.equal(dataFetch.calls[0]?.headers.authorization, `Bearer ${SYNTHETIC_ACCESS_TOKEN}`);
  assert.equal(
    dataFetch.calls[0]?.headers["toast-restaurant-external-id"],
    undefined,
  );
});

test("Partners discovery reuses bounded retry behavior for retryable upstream statuses", async () => {
  const sleeps: number[] = [];
  const dataFetch = new RecordingFetch([
    new Response(JSON.stringify({ marker: SYNTHETIC_ERROR_MARKER }), {
      status: 503,
      headers: { "content-type": "application/json" },
    }),
    jsonResponse([]),
  ]);
  const client = createClient(dataFetch, {
    maxAttempts: 2,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  const payload = await client.getAccessibleRestaurantsJson();

  assert.deepEqual(payload, []);
  assert.equal(dataFetch.calls.length, 2);
  assert.deepEqual(sleeps, [0]);
  assert.equal(dataFetch.calls[0]?.url, dataFetch.calls[1]?.url);
});

test("Partners discovery fails before data fetch when token acquisition fails", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenFetch = new RecordingFetch([
    new Response(JSON.stringify({ marker: SYNTHETIC_ERROR_MARKER }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: tokenFetch.fetch,
    now: () => 0,
  });
  const dataFetch = new RecordingFetch([]);
  const client = createToastHttpClient(config, tokenManager, {
    fetch: dataFetch.fetch,
    now: () => 0,
    random: () => 0,
    sleep: async () => {},
  });

  await assert.rejects(
    client.getAccessibleRestaurantsJson(),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "token_acquisition_failed");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_ERROR_MARKER));
      assert.equal((error as { cause?: unknown }).cause, undefined);
      return true;
    },
  );

  assert.equal(dataFetch.calls.length, 0);
});

test("Partners discovery sanitizes invalid JSON without retaining upstream bytes", async () => {
  const dataFetch = new RecordingFetch([
    new Response(`not-json-${SYNTHETIC_ERROR_MARKER}`, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ]);
  const client = createClient(dataFetch);

  await assert.rejects(
    client.getAccessibleRestaurantsJson(),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "response_invalid_json");
      assert.equal(error.upstreamStatus, 200);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_ERROR_MARKER));
      assert.equal((error as { cause?: unknown }).cause, undefined);
      return true;
    },
  );
});

test("credential-scoped rate-limit state cannot block a restaurant-scoped read", async () => {
  const dataFetch = new RecordingFetch([
    jsonResponse([], {
      "toast-ratelimit-limit": "10",
      "toast-ratelimit-remaining": "0",
      "toast-ratelimit-reset": "10",
    }),
    jsonResponse({ guid: SYNTHETIC_RESTAURANT_GUID }),
  ]);
  const sleeps: number[] = [];
  const client = createClient(dataFetch, {
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
    },
  });

  await client.getAccessibleRestaurantsJson();
  await client.getJson({
    path: `/restaurants/v1/restaurants/${SYNTHETIC_RESTAURANT_GUID}`,
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "restaurants",
  });

  assert.deepEqual(sleeps, []);
  assert.equal(dataFetch.calls.length, 2);
  assert.equal(
    dataFetch.calls[1]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_RESTAURANT_GUID,
  );
  assert.equal(
    client.getRateLimitSnapshot(
      "standard",
      SYNTHETIC_RESTAURANT_GUID,
      "partnersAccessibleRestaurants",
    ),
    undefined,
  );
  assert.equal(
    client.getCredentialRateLimitSnapshot(
      "standard",
      "partnersAccessibleRestaurants",
    )?.remaining,
    0,
  );
});

interface ClientOptions {
  readonly maxAttempts?: number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

function createClient(
  dataFetch: RecordingFetch,
  options: ClientOptions = {},
): ToastHttpClient {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: new RecordingFetch([
      jsonResponse({
        status: "SUCCESS",
        token: {
          tokenType: "Bearer",
          expiresIn: 600,
          accessToken: SYNTHETIC_ACCESS_TOKEN,
        },
      }),
    ]).fetch,
    now: () => 0,
  });

  return createToastHttpClient(config, tokenManager, {
    fetch: dataFetch.fetch,
    maxAttempts: options.maxAttempts,
    now: () => 0,
    random: () => 0,
    sleep: options.sleep ?? (async () => {}),
  });
}

interface RecordedCall {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Record<string, string>;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #results: (Response | Error)[];

  constructor(results: (Response | Error)[]) {
    this.#results = [...results];
  }

  fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    this.calls.push(recordCall(input, init));
    const next = this.#results.shift();
    if (next === undefined) {
      throw new Error("RecordingFetch received more calls than responses");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  };
}

function recordCall(input: string | URL | Request, init?: RequestInit): RecordedCall {
  const headers = new Headers(init?.headers);
  const headerRecord: Record<string, string> = {};
  headers.forEach((value, key) => {
    headerRecord[key] = value;
  });

  return {
    url: String(input),
    method: init?.method,
    headers: headerRecord,
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
