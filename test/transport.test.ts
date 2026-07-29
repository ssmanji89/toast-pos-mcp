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
const SYNTHETIC_RESTAURANT_GUID_B =
  "00000000-0000-4000-8000-000000000100";

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
  assert.deepEqual(
    harness.client.getRateLimitSnapshot(
      "standard",
      SYNTHETIC_RESTAURANT_GUID,
      "ordersBulk",
    ),
    {
      apiFamily: "standard",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      key: "ordersBulk",
      limit: 20,
      remaining: 19,
      resetAtEpochMs: 1_785_326_405_000,
      retryAfterEpochMs: undefined,
      updatedAtEpochMs: Date.UTC(2026, 6, 29, 12, 0, 0),
    },
  );
});

test("treats a Toast-RateLimit-Reset value above the epoch-ms threshold as already epoch milliseconds (T1-004-R1-F4)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "ok" },
        {
          headers: {
            "Toast-RateLimit-Reset": "12000000000",
          },
        },
      ),
    ],
    now: 100_000,
  });

  await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  assert.equal(
    harness.client.getRateLimitSnapshot(
      "standard",
      SYNTHETIC_RESTAURANT_GUID,
      "ordersBulk",
    )?.resetAtEpochMs,
    12_000_000_000,
  );
});

test("treats a small Toast-RateLimit-Reset value as epoch seconds, per the documented assumption (T1-004-R1-F4)", async () => {
  // This locks in the documented implementation assumption recorded in
  // docs/research/toast-api-reporting-landscape.md: the header is always
  // read as an absolute timestamp, never a relative delta. A value of "42"
  // is read as epoch-seconds 42 (a moment in 1970) rather than "42 seconds
  // from now" — if Toast ever sends a genuinely relative delta here, the
  // derived wait silently resolves to the past instead of firing. This
  // test documents the current, explicit interpretation; it does not
  // assert that interpretation is the only one Toast could mean.
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "ok" },
        {
          headers: {
            "Toast-RateLimit-Reset": "42",
          },
        },
      ),
    ],
    now: 100_000,
  });

  await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  assert.equal(
    harness.client.getRateLimitSnapshot(
      "standard",
      SYNTHETIC_RESTAURANT_GUID,
      "ordersBulk",
    )?.resetAtEpochMs,
    42_000,
  );
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

test("honors an RFC 7231 HTTP-date Retry-After within the wait ceiling (T1-004-R1-F3)", async () => {
  const now = Date.UTC(2026, 6, 29, 12, 0, 0);
  const retryAfterDate = new Date(now + 5 * 60 * 1000).toUTCString();

  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfterDate,
            "Toast-Request-Id": "synthetic-request-id-429-http-date",
          },
        },
      ),
      jsonResponse({ synthetic: "after-http-date-retry" }),
    ],
    random: () => 0,
    now,
  });

  const payload = await harness.client.getJson({
    path: "/orders/v2/ordersBulk",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "ordersBulk",
  });

  assert.deepEqual(payload, { synthetic: "after-http-date-retry" });
  assert.equal(harness.dataFetch.calls.length, 2);
  // Before the fix, an HTTP-date form failed `Number.parseInt` and yielded
  // NaN, so the wait silently fell through to 0. It must instead resolve
  // to the actual delay implied by the date (five minutes).
  assert.deepEqual(harness.sleeps, [5 * 60 * 1000]);
});

test("fails closed on an RFC 7231 HTTP-date Retry-After beyond the wait ceiling (T1-004-R1-F3, T1-004-R1-F2)", async () => {
  const now = Date.UTC(2026, 6, 29, 12, 0, 0);
  const retryAfterDate = new Date(now + 60 * 60 * 1000).toUTCString();

  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfterDate,
            "Toast-Request-Id": "synthetic-request-id-429-http-date-huge",
          },
        },
      ),
      jsonResponse({ synthetic: "unreachable" }),
    ],
    random: () => 0,
    now,
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

test("stops retrying a permanently-failing retryable status at the attempt ceiling and throws rather than hanging (T1-004-R1-F6)", async () => {
  // T1-004-R1-F6: removing the `attempt === this.#maxAttempts` check left
  // every existing test passing, because the loop bound alone still
  // terminates the loop. Removing the loop bound entirely made the suite
  // hang rather than fail. A permanently-failing retryable status (every
  // response is 503) with a small, explicit maxAttempts is the only shape
  // that distinguishes "stops at the ceiling and throws" from "stops
  // because the responses ran out" or "never stops".
  const harness = new TransportHarness({
    responses: [
      jsonResponse({ marker: SYNTHETIC_UPSTREAM_BODY_MARKER }, { status: 503 }),
      jsonResponse({ marker: SYNTHETIC_UPSTREAM_BODY_MARKER }, { status: 503 }),
    ],
    maxAttempts: 2,
    random: () => 0,
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
      assert.equal(error.upstreamStatus, 503);
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
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

test("does not cross-contaminate rate-limit state between restaurant GUIDs sharing a limiter key (T1-004-R1-S1 / T1-004-R1-F7)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { synthetic: "location-a" },
        {
          headers: {
            "Toast-RateLimit-Remaining": "0",
            "Toast-RateLimit-Reset": "105",
          },
        },
      ),
      jsonResponse({ synthetic: "location-b" }),
    ],
    now: 100_000,
  });

  assert.deepEqual(
    await harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "ordersBulk",
    }),
    { synthetic: "location-a" },
  );

  // Location A is now recorded as exhausted with a reset 5 seconds out
  // (now=100_000ms, Toast-RateLimit-Reset=105 -> 105_000ms). A distinct
  // restaurant GUID sharing the same limiter key ("ordersBulk") must not be
  // delayed by location A's exhausted quota: the second call, for a
  // different restaurantGuid, must fetch immediately with zero sleeps.
  assert.deepEqual(
    await harness.client.getJson({
      path: "/orders/v2/ordersBulk",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID_B,
      rateLimitKey: "ordersBulk",
    }),
    { synthetic: "location-b" },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
  assert.deepEqual(harness.sleeps, []);

  const snapshotA = harness.client.getRateLimitSnapshot(
    "standard",
    SYNTHETIC_RESTAURANT_GUID,
    "ordersBulk",
  );
  const snapshotB = harness.client.getRateLimitSnapshot(
    "standard",
    SYNTHETIC_RESTAURANT_GUID_B,
    "ordersBulk",
  );
  assert.equal(snapshotA?.restaurantGuid, SYNTHETIC_RESTAURANT_GUID);
  assert.equal(snapshotB?.restaurantGuid, SYNTHETIC_RESTAURANT_GUID_B);
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

// T1-004-R1-F5: only 200, 403, 429, and 503 were exercised anywhere in this
// file. Adding 401 to RETRYABLE_STATUSES left every existing test passing —
// mutation-confirmed vacuous coverage for the rest of the non-retryable
// class. One test per remaining documented non-retryable status, matching
// the shape of the existing 403 test above: exactly one fetch call and
// retryable: false.
const NON_RETRYABLE_STATUSES_UNDER_TEST = [400, 401, 404, 409, 422] as const;

for (const status of NON_RETRYABLE_STATUSES_UNDER_TEST) {
  test(`does not retry a ${status} response (T1-004-R1-F5)`, async () => {
    const harness = new TransportHarness({
      responses: [
        jsonResponse(
          {
            developerMessage: `${SYNTHETIC_UPSTREAM_BODY_MARKER} for status ${status}`,
          },
          {
            status,
            headers: { "Toast-Request-Id": `synthetic-request-id-${status}` },
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
        assert.equal(error.code, "request_failed");
        assert.equal(error.upstreamStatus, status);
        assert.equal(error.retryable, false);
        return true;
      },
    );

    assert.equal(harness.dataFetch.calls.length, 1);
    assert.deepEqual(harness.sleeps, []);
  });
}

test("iterates configuration pages with Toast-Next-Page-Token and preserves location scope", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { syntheticPage: 1 },
        { headers: { "Toast-Next-Page-Token": "synthetic-token-2" } },
      ),
      jsonResponse({ syntheticPage: 2 }),
    ],
  });

  const pages = await harness.client.getConfigurationPagesJson({
    path: "/config/v2/revenueCenters",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { modifiedSince: "2026-07-29T12:00:00.000Z" },
    rateLimitKey: "config:revenueCenters",
  });

  assert.deepEqual(pages, [{ syntheticPage: 1 }, { syntheticPage: 2 }]);
  assert.equal(harness.dataFetch.calls.length, 2);
  assert.equal(
    harness.dataFetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/config/v2/revenueCenters?modifiedSince=2026-07-29T12%3A00%3A00.000Z",
  );
  assert.equal(
    harness.dataFetch.calls[1]?.url,
    "https://ws-api.synthetic-toast-fixture.test/config/v2/revenueCenters?modifiedSince=2026-07-29T12%3A00%3A00.000Z&pageToken=synthetic-token-2",
  );
  assert.equal(
    harness.dataFetch.calls[0]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_RESTAURANT_GUID,
  );
  assert.equal(
    harness.dataFetch.calls[1]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_RESTAURANT_GUID,
  );
});

test("fails closed when configuration page-token traversal repeats a token", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { syntheticPage: 1 },
        { headers: { "Toast-Next-Page-Token": "synthetic-loop-token" } },
      ),
      jsonResponse(
        { syntheticPage: 2 },
        { headers: { "Toast-Next-Page-Token": "synthetic-loop-token" } },
      ),
    ],
  });

  await assert.rejects(
    harness.client.getConfigurationPagesJson({
      path: "/config/v2/diningOptions",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "config:diningOptions",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "configuration_page_token_repeated");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
});

test("treats a next page token differing only by case as progress rather than a repeat, by design (T1-005-R1-F1)", async () => {
  // Locks in the deliberate design choice recorded beside the guard in
  // src/transport.ts: page tokens are compared and stored by exact,
  // case-sensitive string equality. Two next-tokens differing only in case
  // ("SYNTHETIC-CASE-TOKEN" then "synthetic-case-token") must be accepted
  // as genuine progress, not rejected as a repeated/non-progressing token.
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { syntheticPage: 1 },
        { headers: { "Toast-Next-Page-Token": "SYNTHETIC-CASE-TOKEN" } },
      ),
      jsonResponse(
        { syntheticPage: 2 },
        { headers: { "Toast-Next-Page-Token": "synthetic-case-token" } },
      ),
      jsonResponse({ syntheticPage: 3 }),
    ],
  });

  const pages = await harness.client.getConfigurationPagesJson({
    path: "/config/v2/diningOptions",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "config:diningOptions",
  });

  assert.deepEqual(pages, [
    { syntheticPage: 1 },
    { syntheticPage: 2 },
    { syntheticPage: 3 },
  ]);
  assert.equal(harness.dataFetch.calls.length, 3);
});

test("fails closed when configuration page-token traversal exceeds the page bound", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { syntheticPage: 1 },
        { headers: { "Toast-Next-Page-Token": "synthetic-token-2" } },
      ),
      jsonResponse(
        { syntheticPage: 2 },
        { headers: { "Toast-Next-Page-Token": "synthetic-token-3" } },
      ),
      jsonResponse({ synthetic: "unreachable" }),
    ],
  });

  await assert.rejects(
    harness.client.getConfigurationPagesJson({
      path: "/config/v2/serviceCharges",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "config:serviceCharges",
      maxPages: 2,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "configuration_page_bound_exceeded");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 2);
});

test("restarts configuration page-token traversal once on a scoped 409 and discards partial pages", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { syntheticPage: "stale-first-page" },
        { headers: { "Toast-Next-Page-Token": "stale-token" } },
      ),
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 409,
          headers: { "Toast-Request-Id": "synthetic-config-409" },
        },
      ),
      jsonResponse(
        { syntheticPage: "fresh-first-page" },
        { headers: { "Toast-Next-Page-Token": "fresh-token" } },
      ),
      jsonResponse({ syntheticPage: "fresh-second-page" }),
    ],
  });

  const pages = await harness.client.getConfigurationPagesJson({
    path: "/config/v2/salesCategories",
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    rateLimitKey: "config:salesCategories",
  });

  assert.deepEqual(pages, [
    { syntheticPage: "fresh-first-page" },
    { syntheticPage: "fresh-second-page" },
  ]);
  assert.equal(harness.dataFetch.calls.length, 4);
  assert.equal(
    harness.dataFetch.calls[1]?.url,
    "https://ws-api.synthetic-toast-fixture.test/config/v2/salesCategories?pageToken=stale-token",
  );
  assert.equal(
    harness.dataFetch.calls[2]?.url,
    "https://ws-api.synthetic-toast-fixture.test/config/v2/salesCategories",
  );
});

test("fails closed when configuration 409 restarts exceed the configured budget without leaking upstream body", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse(
        { marker: SYNTHETIC_UPSTREAM_BODY_MARKER },
        {
          status: 409,
          headers: { "Toast-Request-Id": "synthetic-config-409" },
        },
      ),
    ],
  });

  await assert.rejects(
    harness.client.getConfigurationPagesJson({
      path: "/config/v2/voidReasons",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "config:voidReasons",
      maxRestarts: 0,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "configuration_page_restart_exceeded");
      assert.equal(error.upstreamStatus, 409);
      assert.equal(error.upstreamRequestId, "synthetic-config-409");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("keeps 409 restart behavior scoped out of ordinary getJson calls", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse({ synthetic: "ordinary-conflict" }, { status: 409 }),
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
      assert.equal(error.code, "request_failed");
      assert.equal(error.upstreamStatus, 409);
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("rejects a maxConfigurationRestarts value above the configured ceiling at construction (T1-005-R1-F4)", () => {
  assert.throws(
    () => new TransportHarness({ maxConfigurationRestarts: 11, responses: [] }),
    (error: unknown) => {
      assert.ok(error instanceof RangeError);
      assert.match(
        (error as RangeError).message,
        /maxConfigurationRestarts must not exceed 10/,
      );
      return true;
    },
  );
});

test("rejects a per-call maxRestarts override above the configured ceiling before any fetch (T1-005-R1-F4)", async () => {
  const harness = new TransportHarness({ responses: [] });

  await assert.rejects(
    harness.client.getConfigurationPagesJson({
      path: "/config/v2/diningOptions",
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      rateLimitKey: "config:diningOptions",
      maxRestarts: 11,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RangeError);
      assert.match((error as RangeError).message, /maxRestarts must not exceed 10/);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 0);
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

test("traverses ordersBulk pages from Link next relations until next is absent", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.deepEqual(
    harness.dataFetch.calls.map((call) => call.url),
    [
      "https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=1&pageSize=100",
      "https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100",
    ],
  );
});

test("rejects ordersBulk page sizes above Toast's documented maximum", async () => {
  const harness = new TransportHarness({
    responses: [jsonResponse({ synthetic: "unreachable" })],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 101,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 0);
});

test("fails closed when ordersBulk Link next repeats a page number", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=1&pageSize=100>; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed when ordersBulk Link next skips a page number", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=3&pageSize=100>; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed when ordersBulk Link next changes the bounded query", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260730&page=2&pageSize=100>; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed when ordersBulk traversal exceeds the configured page bound", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 1,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

// T1-006-R1-F1 / T1-006-R1-S1: the prior `linkRelations` regex matched only
// a segment that was exactly `<url>; rel="value"` — quoted, `rel`-only,
// `rel`-first, case-sensitive. Every shape below except the two "fails
// closed" cases at the end is ordinary RFC 8288-legal syntax that the prior
// implementation silently dropped, indistinguishable from a genuinely
// absent header.

test("continues ordersBulk traversal when the Link header's next relation is unquoted, per RFC 8288 (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: "<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel=next",
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when the Link header's rel parameter and value use mixed case (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; Rel="Next"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when the Link header's rel parameter and value are fully upper-cased (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; REL="NEXT"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when the Link header's next relation carries a trailing parameter (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"; title="Next page"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when the Link header's next relation parameter is not first (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; title="Next page"; rel="next"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal and selects next rather than prev when the Link header lists both relations (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=0&pageSize=100>; rel="prev", <https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when two separate Link response headers are joined by the Fetch API (T1-006-R1-F1)", async () => {
  const joinedLinkHeaders = new Headers({ "content-type": "application/json" });
  joinedLinkHeaders.append(
    "Link",
    '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=0&pageSize=100>; rel="prev"',
  );
  joinedLinkHeaders.append(
    "Link",
    '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"',
  );

  const harness = new TransportHarness({
    responses: [
      new Response(JSON.stringify([{ guid: "synthetic-order-page-1" }]), {
        status: 200,
        headers: joinedLinkHeaders,
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("continues ordersBulk traversal when the Link header's next target is a relative URL (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '</orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100>; rel="next"',
        },
      }),
      jsonResponse([{ guid: "synthetic-order-page-2" }]),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [
    [{ guid: "synthetic-order-page-1" }],
    [{ guid: "synthetic-order-page-2" }],
  ]);
  assert.equal(
    harness.dataFetch.calls[1]?.url,
    "https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100",
  );
});

test("stops ordersBulk traversal without error when the Link header is present but empty (T1-006-R1-F1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: { Link: "" },
      }),
    ],
  });

  const pages = await harness.client.getOrdersBulkPages({
    restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
    query: { businessDate: 20260729 },
    pageSize: 100,
    maxPages: 3,
  });

  assert.deepEqual(pages, [[{ guid: "synthetic-order-page-1" }]]);
  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed rather than silently stopping when the Link header's next target is missing its closing angle bracket (T1-006-R1-F1, T1-006-R1-S1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '<https://ws-api.synthetic-toast-fixture.test/orders/v2/ordersBulk?businessDate=20260729&page=2&pageSize=100; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed rather than silently stopping when the Link header segment has no angle-bracketed target URI at all (T1-006-R1-F1, T1-006-R1-S1)", async () => {
  const harness = new TransportHarness({
    responses: [
      jsonResponse([{ guid: "synthetic-order-page-1" }], {
        headers: {
          Link: '; rel="next"',
        },
      }),
    ],
  });

  await assert.rejects(
    harness.client.getOrdersBulkPages({
      restaurantGuid: SYNTHETIC_RESTAURANT_GUID,
      query: { businessDate: 20260729 },
      pageSize: 100,
      maxPages: 3,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "pagination_integrity_failed");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

type FetchResult = Response | Error;

interface HarnessOptions {
  readonly maxConfigurationPages?: number;
  readonly maxConfigurationRestarts?: number;
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
      ...(options.maxConfigurationPages !== undefined
        ? { maxConfigurationPages: options.maxConfigurationPages }
        : {}),
      ...(options.maxConfigurationRestarts !== undefined
        ? { maxConfigurationRestarts: options.maxConfigurationRestarts }
        : {}),
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
