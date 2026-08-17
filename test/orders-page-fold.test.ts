import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import {
  createToastHttpClient,
  ToastHttpError,
  type ToastHttpClient,
} from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID =
  SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID;

interface FoldHarness {
  readonly client: ToastHttpClient;
  readonly getFetchCount: () => number;
}

test("fold consumes 150 raw pages sequentially before requesting the next page", async () => {
  const totalPages = 150;
  let completedConsumers = 0;
  let activeConsumers = 0;
  let maxActiveConsumers = 0;

  const harness = createHarness(totalPages, (page) => {
    assert.equal(
      completedConsumers,
      page - 1,
      "the next network page must not start until the prior consumer finished",
    );
  });

  const result = await harness.client.foldOrdersBulkPages(
    {
      restaurantGuid: RESTAURANT_GUID,
      query: { businessDate: 20260816 },
      pageSize: 2,
      maxPages: totalPages,
    },
    Object.freeze({ pages: 0, records: 0, checksum: 0 }),
    async (state, page, pageNumber) => {
      activeConsumers += 1;
      maxActiveConsumers = Math.max(maxActiveConsumers, activeConsumers);
      assert.equal(pageNumber, state.pages + 1);
      assert.ok(Array.isArray(page.body));
      assert.equal((page.body as unknown[]).length, 2);
      assert.ok(Number.isSafeInteger(page.retrievedAtEpochMs));
      await Promise.resolve();
      activeConsumers -= 1;
      completedConsumers += 1;
      return Object.freeze({
        pages: state.pages + 1,
        records: state.records + (page.body as unknown[]).length,
        checksum: state.checksum + pageNumber,
      });
    },
  );

  assert.deepEqual(result, {
    pages: totalPages,
    records: totalPages * 2,
    checksum: (totalPages * (totalPages + 1)) / 2,
  });
  assert.equal(harness.getFetchCount(), totalPages);
  assert.equal(completedConsumers, totalPages);
  assert.equal(maxActiveConsumers, 1);
  assert.ok(!Object.hasOwn(result, "body"));
});

test("consumer failure stops traversal before any later page fetch", async () => {
  const sentinel = new Error("synthetic-consumer-failure");
  const harness = createHarness(10);
  const consumed: number[] = [];

  await assert.rejects(
    harness.client.foldOrdersBulkPages(
      {
        restaurantGuid: RESTAURANT_GUID,
        query: { businessDate: 20260816 },
        pageSize: 1,
        maxPages: 10,
      },
      0,
      (state, _page, pageNumber) => {
        consumed.push(pageNumber);
        if (pageNumber === 3) {
          throw sentinel;
        }
        return state + 1;
      },
    ),
    (error: unknown) => error === sentinel,
  );

  assert.deepEqual(consumed, [1, 2, 3]);
  assert.equal(harness.getFetchCount(), 3);
});

test("cancellation after a consumed page prevents the next fetch and fails closed", async () => {
  const controller = new AbortController();
  const harness = createHarness(10);

  await assert.rejects(
    harness.client.foldOrdersBulkPages(
      {
        restaurantGuid: RESTAURANT_GUID,
        query: { businessDate: 20260816 },
        pageSize: 1,
        maxPages: 10,
      },
      0,
      (state, _page, pageNumber) => {
        if (pageNumber === 2) {
          controller.abort();
        }
        return state + 1;
      },
      { signal: controller.signal },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ToastHttpError);
      assert.equal(error.code, "request_cancelled");
      assert.equal(error.retryable, false);
      assert.equal(error.upstreamStatus, undefined);
      return true;
    },
  );

  assert.equal(harness.getFetchCount(), 2);
});

test("pre-aborted cancellation performs no data fetch", async () => {
  const controller = new AbortController();
  controller.abort();
  const harness = createHarness(3);

  await assert.rejects(
    harness.client.foldOrdersBulkPages(
      {
        restaurantGuid: RESTAURANT_GUID,
        query: { businessDate: 20260816 },
        pageSize: 1,
        maxPages: 3,
      },
      0,
      (state) => state + 1,
      { signal: controller.signal },
    ),
    (error: unknown) =>
      error instanceof ToastHttpError && error.code === "request_cancelled",
  );

  assert.equal(harness.getFetchCount(), 0);
});

test("legacy detailed array API remains a compatibility projection over the same traversal", async () => {
  const harness = createHarness(3);
  const pages = await harness.client.getOrdersBulkPagesDetailed({
    restaurantGuid: RESTAURANT_GUID,
    query: { businessDate: 20260816 },
    pageSize: 2,
    maxPages: 3,
  });

  assert.equal(pages.length, 3);
  assert.deepEqual(
    pages.map((page) =>
      (page.body as Array<{ page: number }>)[0]?.page),
    [1, 2, 3],
  );
  assert.ok(Object.isFrozen(pages));
  assert.ok(pages.every(Object.isFrozen));
  assert.equal(harness.getFetchCount(), 3);
});

function createHarness(
  totalPages: number,
  onDataFetch?: (page: number) => void,
): FoldHarness {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    fetch: async () =>
      jsonResponse({
        token: {
          tokenType: "Bearer",
          expiresIn: 3600,
          accessToken: "synthetic-fold-access-token",
        },
      }),
  });
  let dataFetchCount = 0;
  let now = 1_800_000_000_000;

  const client = createToastHttpClient(config, tokenManager, {
    maxOrdersBulkPages: Math.max(totalPages, 1),
    now: () => {
      now += 1;
      return now;
    },
    fetch: async (input, init) => {
      dataFetchCount += 1;
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      const pageSize = Number(url.searchParams.get("pageSize"));
      assert.equal(url.pathname, "/orders/v2/ordersBulk");
      assert.equal(url.searchParams.get("businessDate"), "20260816");
      assert.equal(init?.method, "GET");
      onDataFetch?.(page);

      const next = page < totalPages
        ? `</orders/v2/ordersBulk?businessDate=20260816&page=${page + 1}&pageSize=${pageSize}>; rel="next"`
        : undefined;
      return jsonResponse(
        [
          { page, record: 1, payload: `synthetic-${page}-a` },
          ...(pageSize > 1
            ? [{ page, record: 2, payload: `synthetic-${page}-b` }]
            : []),
        ],
        {
          ...(next === undefined ? {} : { link: next }),
          "toast-request-id": `synthetic-fold-request-${page}`,
        },
      );
    },
  });

  return {
    client,
    getFetchCount: () => dataFetchCount,
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
