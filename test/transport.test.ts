import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import type { OAuthTokenManager } from "../src/auth.js";
import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import {
  createToastHttpClient,
  ToastHttpClient,
  ToastHttpError,
} from "../src/transport.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

const SYNTHETIC_ACCESS_TOKEN_MARKER =
  "synthetic-transport-access-token-marker";
const SYNTHETIC_UPSTREAM_BODY_MARKER =
  "synthetic-upstream-body-marker-must-not-leak";
const SYNTHETIC_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000000099";

test("sends a location-scoped Toast GET request with a bearer token and records rate-limit state", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "ok" },
        {
          headers: {
            "Toast-RateLimit-Limit": "20",
            "Toast-RateLimit-Remaining": "19",
            "Toast-RateLimit-Reset": "1785326405",
            "Toast-Request-Id": "synthetic-request-id-200",
          },
        },
      ),
    ],
    now: Date.UTC(2026, 6, 29, 12, 0, 0),
  });

  const payload = await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { page: 1, pageSize: 100, omitted: undefined },
    rateLimitKey: "ordersBulk",
  });

  assert.deepEqual(payload, { synthetic: "ok" });
  assert.equal(harness.dataFetch.calls.length, 1);
  assert.equal(
    harness.dataFetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?page=1&pageSize=100",
  );
  assert.equal(harness.dataFetch.calls[0]?.init.method, "GET");
  assert.equal(
    harness.dataFetch.calls[0]?.headers.authorization,
    `Bearer ${SYNTHETIC_ACCESS_TOKEN_MARKER}`,
  );
  assert.equal(
    harness.dataFetch.calls[0]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_RESTAURANT_GUID,
  );
  assert.equal(harness.dataFetch.calls[0]?.init.body, undefined);
  assert.deepEqual(harness.client.getRateLimitSnapshot("standard", "ordersBulk"), {
    apiFamily: "standard",
    key: "ordersBulk",
    limit: 20,
    remaining: 19,
    resetAtEpochMs: 1_785_326_405_000,
    retryAfterEpochMs: undefined,
    updatedAtEpochMs: Date.UTC(2026, 6, 29, 12, 0, 0),
  });
});

test("retries retryable 429 responses within the configured attempt budget and honors Retry-After", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 429,
          headers: {
            "Retry-After": "2",
            "Toast-Request-Id": "synthetic-request-id-429",
          },
        },
      ),
      jsonResponse({ synthetic: "after-retry" }),
    ],
    random: () => 0,
    now: 100_000,
  });

  const payload = await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  assert.deepEqual(payload, { synthetic: "after-retry" });
  assert.equal(harness.dataFetch.calls.length, 2);
  assert.deepEqual(harness.sleeps, [2_000]);
});

test("retries retryable 5xx responses with bounded exponential jitter", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        { status: 503 },
      ),
      jsonResponse({ synthetic: "after-503" }),
    ],
    random: () => 0.5,
  });

  const payload = await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  assert.deepEqual(payload, { synthetic: "after-503" });
  assert.equal(harness.dataFetch.calls.length, 2);
  assert.deepEqual(harness.sleeps, [125]);
});

test("waits before a later request when stored rate-limit state shows exhausted quota", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "first" },
        {
          headers: {
            "Toast-RateLimit-Remaining": "0",
            "Toast-RateLimit-Reset": "101",
          },
        },
      ),
      jsonResponse({ synthetic: "second" }),
    ],
    now: 100_000,
  });

  assert.deepEqual(
    await harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    { synthetic: "first" },
  );
  assert.deepEqual(
    await harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    { synthetic: "second" },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
  assert.deepEqual(harness.sleeps, [1_000]);
});

test("fails closed rather than sleeping past the rate-limit wait ceiling for a large Retry-After (T1-004-R1-F2)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 429,
          headers: {
            "Retry-After": "86400",
            "Toast-Request-Id": "synthetic-request-id-429-huge",
          },
        },
      ),
      jsonResponse({ synthetic: "unreachable" }),
    ],
  });

  await assert.rejects(
    harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "rate_limit_wait_exceeded");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
  assert.deepEqual(harness.sleeps, []);
});

test("fails closed rather than waiting out a far-future stored rate-limit reset (T1-004-R1-F2)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "first" },
        {
          headers: {
            "Toast-RateLimit-Remaining": "0",
            "Toast-RateLimit-Reset": "100000",
          },
        },
      ),
      jsonResponse({ synthetic: "unreachable" }),
    ],
    now: 100_000,
  });

  assert.deepEqual(
    await harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    { synthetic: "first" },
  );

  await assert.rejects(
    harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "rate_limit_wait_exceeded");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
  assert.deepEqual(harness.sleeps, []);
});

test("does not retry authorization or validation failures and does not expose upstream bodies", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        {
          developerMessage:
            `${SYNTHETIC_UPSTREAM_BODY_MARKER} ${SYNTHETIC_CLIENT_SECRET_MARKER} ${SYNTHETIC_ACCESS_TOKEN_MARKER}`,
        },
        {
          status: 403,
          headers: { "Toast-Request-Id": "synthetic-request-id-403" },
        },
      ),
    ],
  });

  await assert.rejects(
    harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "request_failed");
      assert.equal(error.upstreamStatus, 403);
      assert.equal(error.upstreamRequestId, "synthetic-request-id-403");
      assert.equal(error.retryable, false);
      const rendered = [
        error.message,
        error.code,
        JSON.stringify(error),
        inspect(error, { depth: null, showHidden: true, customInspect: false }),
        inspect(error, { depth: null }),
      ].join(" ");
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
  assert.deepEqual(harness.sleeps, []);
});

test("wraps rejected fetches in sanitized network errors and retries only within bounds", async () => {
  const harness = new TransportHarness({
    responses: [
      new Error(
        `socket error with ${SYNTHETIC_CLIENT_SECRET_MARKER} ${SYNTHETIC_ACCESS_TOKEN_MARKER}`,
      ),
      new Error(`second socket error with ${SYNTHETIC_UPSTREAM_BODY_MARKER}`),
    ],
    maxAttempts: 2,
    random: () => 1,
  });

  await assert.rejects(
    harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "request_network_error");
      assert.equal(error.retryable, true);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
  assert.deepEqual(harness.sleeps, [250]);
});

test("fails closed on invalid JSON without retrying or exposing the response body", async () => {
  const harness = new TransportHarness({
    responses: [
      new Response(
        `{ "marker": "${SYNTHETIC_UPSTREAM_BODY_MARKER}"`,
        { status: 200 },
      ),
    ],
  });

  await assert.rejects(
    harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "response_invalid_json");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
  assert.deepEqual(harness.sleeps, []);
});

test("does not expose bearer tokens or credentials through client enumeration or inspection", async () => {
  const harness = new TransportHarness({
    responses: [jsonResponse({ synthetic: "ok" })],
  });

  await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  const observed = [
    Object.keys(harness.client),
    Object.getOwnPropertyNames(harness.client),
    Object.entries(harness.client),
    Object.values(harness.client),
    { ...harness.client },
    Object.assign({}, harness.client),
    structuredClone(harness.client),
    inspect(harness.client, {
      depth: null,
      showHidden: true,
      customInspect: false,
    }),
    JSON.stringify(harness.client),
  ]
    .map((value) => inspect(value, { depth: null }))
    .join(" ");

  const forInCollected: Record<string, unknown> = {};
  for (const key in harness.client) {
    forInCollected[key] =
      (harness.client as unknown as Record<string, unknown>)[key];
  }

  assert.ok(!observed.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
  assert.ok(!observed.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
  assert.ok(!inspect(forInCollected).includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
  assert.ok(!inspect(forInCollected).includes(SYNTHETIC_CLIENT_SECRET_MARKER));
});

test("does not retry token acquisition failures and never calls fetch (T1-004-R1-F1)", async () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const dataFetch = new RecordingFetch([jsonResponse({ synthetic: "unused" })]);
  let acquisitionAttempts = 0;
  const throwingTokenManager: Pick<OAuthTokenManager, "getAuthorizationHeader"> = {
    getAuthorizationHeader: async () => {
      acquisitionAttempts += 1;
      throw new Error(
        `token acquisition failure ${SYNTHETIC_CLIENT_SECRET_MARKER}`,
      );
    },
  };

  const client = createToastHttpClient(
    config,
    throwingTokenManager as OAuthTokenManager,
    {
      fetch: dataFetch.fetch,
      maxAttempts: 3,
      now: () => 0,
      random: () => 0,
      sleep: async () => {
        throw new Error("must not sleep for a token acquisition failure");
      },
    },
  );

  await assert.rejects(
    client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "token_acquisition_failed");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      return true;
    },
  );

  assert.equal(acquisitionAttempts, 1);
  assert.equal(dataFetch.calls.length, 0);
});

type FetchResult = Response | Error;

interface HarnessOptions {
  readonly maxAttempts?: number;
  readonly now?: number;
  readonly random?: () => number;
  readonly responses: FetchResult[];
}

class TransportHarness {
  readonly client: ToastHttpClient;
  readonly dataFetch: RecordingFetch;
  readonly sleeps: number[] = [];
  #now: number;

  constructor(options: HarnessOptions) {
    this.#now = options.now ?? 0;
    const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
    const tokenFetch = new RecordingFetch([
      jsonResponse({
        status: "SUCCESS",
        token: {
          tokenType: "Bearer",
          expiresIn: 600,
          accessToken: SYNTHETIC_ACCESS_TOKEN_MARKER,
        },
      }),
    ]);
    const tokenManager = createOAuthTokenManager(config, {
      fetch: tokenFetch.fetch,
      now: () => this.#now,
    });

    this.dataFetch = new RecordingFetch(options.responses);
    this.client = createToastHttpClient(config, tokenManager, {
      fetch: this.dataFetch.fetch,
      ...(options.maxAttempts !== undefined
        ? { maxAttempts: options.maxAttempts }
        : {}),
      now: () => this.#now,
      random: options.random ?? (() => 0),
      sleep: async (milliseconds) => {
        this.sleeps.push(milliseconds);
        this.#now += milliseconds;
      },
    });
  }
}

interface RecordedCall {
  readonly url: string;
  readonly init: {
    readonly body: unknown;
    readonly method: string | undefined;
  };
  readonly headers: Record<string, string>;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #results: FetchResult[];

  constructor(results: FetchResult[]) {
    this.#results = results;
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
    init: {
      body: init?.body,
      method: init?.method,
    },
    headers: headerRecord,
  };
}

function jsonResponse(
  body: unknown,
  options: { readonly status?: number; readonly headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  });
}
