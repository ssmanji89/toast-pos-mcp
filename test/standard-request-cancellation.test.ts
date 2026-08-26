import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig } from "../src/config.js";
import { createRateLimitAwareToastHttpClient } from "../src/rate-limited-client.js";
import { ToastRateLimitCoordinator } from "../src/rate-limit.js";
import { ToastHttpError } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const RESTAURANT_GUID = SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID!;
const ABORT_MARKER = "abort-marker-must-not-leak";
const START_EPOCH_MS = 1_800_000_000_000;

test("pre-aborted request fails before auth or data fetch", async () => {
  const controller = new AbortController();
  controller.abort(ABORT_MARKER);
  let authCalls = 0;
  let dataCalls = 0;
  const client = makeClient({
    authFetch: async () => {
      authCalls += 1;
      return tokenResponse();
    },
    dataFetch: async () => {
      dataCalls += 1;
      return jsonResponse({ unexpected: true });
    },
  });

  await assertCancelled(client.getJsonDetailedCancellable(
    scopedRequest("pre-abort"),
    { signal: controller.signal },
  ));
  assert.equal(authCalls, 0);
  assert.equal(dataCalls, 0);
});

test("abort while queued releases its turn and later requests progress", async () => {
  let dataCalls = 0;
  let releaseFirst!: (response: Response) => void;
  const firstResponse = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });
  const client = makeClient({
    dataFetch: async () => {
      dataCalls += 1;
      if (dataCalls === 1) return firstResponse;
      return jsonResponse({ call: dataCalls });
    },
  });

  const first = client.getJsonDetailedCancellable(scopedRequest("first"));
  const controller = new AbortController();
  const queued = client.getJsonDetailedCancellable(
    scopedRequest("queued"),
    { signal: controller.signal },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(dataCalls, 1);
  controller.abort(ABORT_MARKER);
  releaseFirst(jsonResponse({ first: true }));

  await first;
  await assertCancelled(queued);
  assert.equal(dataCalls, 1);

  const later = await client.getJsonDetailedCancellable(scopedRequest("later"));
  assert.deepEqual(later.body, { call: 2 });
});

test("abort during hierarchy sleep sends no upstream request", async () => {
  let nowMs = START_EPOCH_MS;
  let dataCalls = 0;
  let sleepStarted!: () => void;
  const sleepStartedPromise = new Promise<void>((resolve) => { sleepStarted = resolve; });
  let releaseSleep!: () => void;
  const heldSleep = new Promise<void>((resolve) => { releaseSleep = resolve; });
  const coordinator = new ToastRateLimitCoordinator();
  coordinator.record(
    {
      restaurantGuid: RESTAURANT_GUID,
      apiKey: "orders",
      endpointKey: "orders/v2/payments",
    },
    {
      byTokens: [],
      primary: "GLOBAL",
      account: false,
      remaining: 0,
      resetAtEpochMs: START_EPOCH_MS + 1_000,
      retryAfterEpochMs: undefined,
    },
  );
  const client = makeClient({
    now: () => nowMs,
    coordinator,
    sleep: async () => {
      sleepStarted();
      await heldSleep;
    },
    dataFetch: async () => {
      dataCalls += 1;
      return jsonResponse({ ok: true });
    },
  });

  const controller = new AbortController();
  const waiting = client.getJsonDetailedCancellable(
    scopedRequest("payments", "/orders/v2/payments"),
    { signal: controller.signal },
  );
  await sleepStartedPromise;
  controller.abort(ABORT_MARKER);
  await assertCancelled(waiting);
  assert.equal(dataCalls, 0);

  nowMs = START_EPOCH_MS + 1_001;
  releaseSleep();
  const later = await client.getJsonDetailedCancellable(
    scopedRequest("payments-later", "/orders/v2/payments"),
  );
  assert.deepEqual(later.body, { ok: true });
});

test("abort during in-flight fetch aborts upstream and later traffic recovers", async () => {
  let dataCalls = 0;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const client = makeClient({
    dataFetch: async (_input, init) => {
      dataCalls += 1;
      if (dataCalls > 1) return jsonResponse({ recovered: true });
      started();
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal instanceof AbortSignal);
        signal.addEventListener("abort", () => reject(new Error(ABORT_MARKER)), { once: true });
      });
    },
  });

  const controller = new AbortController();
  const inFlight = client.getJsonDetailedCancellable(
    scopedRequest("in-flight"),
    { signal: controller.signal },
  );
  await startedPromise;
  controller.abort(ABORT_MARKER);
  await assertCancelled(inFlight);
  assert.equal(dataCalls, 1);

  const later = await client.getJsonDetailedCancellable(scopedRequest("recovered"));
  assert.deepEqual(later.body, { recovered: true });
});

test("abort during retry backoff prevents retry fetch", async () => {
  let dataCalls = 0;
  let sleepStarted!: () => void;
  const sleepStartedPromise = new Promise<void>((resolve) => { sleepStarted = resolve; });
  let releaseSleep!: () => void;
  const heldSleep = new Promise<void>((resolve) => { releaseSleep = resolve; });
  const client = makeClient({
    sleep: async () => {
      sleepStarted();
      await heldSleep;
    },
    dataFetch: async () => {
      dataCalls += 1;
      if (dataCalls === 1) {
        return new Response("{}", {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return jsonResponse({ recovered: true });
    },
  });

  const controller = new AbortController();
  const retrying = client.getJsonDetailedCancellable(
    scopedRequest("retry"),
    { signal: controller.signal },
  );
  await sleepStartedPromise;
  controller.abort(ABORT_MARKER);
  await assertCancelled(retrying);
  assert.equal(dataCalls, 1);

  releaseSleep();
  const later = await client.getJsonDetailedCancellable(scopedRequest("later"));
  assert.deepEqual(later.body, { recovered: true });
  assert.equal(dataCalls, 2);
});

test("abort during a default retry wait clears its timer", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const activeTimers = new Set<NodeJS.Timeout>();
  globalThis.setTimeout = ((
    callback: (...callbackArgs: unknown[]) => void,
    _milliseconds?: number,
    ...args: unknown[]
  ) => {
    const handle = originalSetTimeout(() => callback(...args), 60_000);
    activeTimers.add(handle);
    return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle: NodeJS.Timeout | undefined) => {
    if (handle !== undefined) {
      activeTimers.delete(handle);
    }
    return originalClearTimeout(handle);
  }) as typeof clearTimeout;

  try {
    const client = makeClient({
      dataFetch: async () => new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    });
    const controller = new AbortController();
    const retrying = client.getJsonDetailedCancellable(
      scopedRequest("default-timer"),
      { signal: controller.signal },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(activeTimers.size, 1);

    controller.abort(ABORT_MARKER);
    await assertCancelled(retrying);
    assert.equal(activeTimers.size, 0);
  } finally {
    for (const timer of activeTimers) {
      originalClearTimeout(timer);
    }
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("configuration cancellation stops before later pages or restarts", async () => {
  let dataCalls = 0;
  let secondPageStarted!: () => void;
  const secondPageStartedPromise = new Promise<void>((resolve) => {
    secondPageStarted = resolve;
  });
  const client = makeClient({
    dataFetch: async (_input, init) => {
      dataCalls += 1;
      if (dataCalls === 1) {
        return jsonResponse({ first: true }, {
          "toast-next-page-token": "second-page",
        });
      }
      if (dataCalls === 2) {
        secondPageStarted();
        return abortableResponse(init?.signal);
      }
      if (dataCalls === 3) {
        return jsonResponse({ fresh: true }, {
          "toast-next-page-token": "fresh-second-page",
        });
      }
      return jsonResponse({ fresh: "second-page" });
    },
  });
  const controller = new AbortController();
  const cancelled = client.getConfigurationPagesDetailedCancellable(
    configurationRequest(),
    { signal: controller.signal },
  );
  await secondPageStartedPromise;
  controller.abort(ABORT_MARKER);

  await assertCancelled(cancelled);
  assert.equal(dataCalls, 2);

  const recovered = await client.getConfigurationPagesDetailedCancellable(
    configurationRequest(),
  );
  assert.deepEqual(recovered.map((page) => page.body), [
    { fresh: true },
    { fresh: "second-page" },
  ]);
  assert.equal(dataCalls, 4);
});

test("concurrent calls retain distinct request cancellation signals", async () => {
  const observedSignals: AbortSignal[] = [];
  let firstStarted!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
  const client = makeClient({
    dataFetch: async (_input, init) => {
      const signal = init?.signal;
      assert.ok(signal instanceof AbortSignal);
      observedSignals.push(signal);
      if (observedSignals.length === 1) {
        firstStarted();
        return abortableResponse(signal);
      }
      return jsonResponse({ request: "B" });
    },
  });
  const controllerA = new AbortController();
  const controllerB = new AbortController();
  const requestA = client.getJsonDetailedCancellable(
    scopedRequest("concurrent-A"),
    { signal: controllerA.signal },
  );
  await firstStartedPromise;
  const requestB = client.getJsonDetailedCancellable(
    scopedRequest("concurrent-B"),
    { signal: controllerB.signal },
  );
  controllerA.abort(ABORT_MARKER);

  await assertCancelled(requestA);
  const resultB = await requestB;
  assert.deepEqual(resultB.body, { request: "B" });
  assert.deepEqual(observedSignals, [controllerA.signal, controllerB.signal]);
});

test("abort during ordersBulk page fetch prevents page consumption", async () => {
  let dataCalls = 0;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const client = makeClient({
    dataFetch: async (_input, init) => {
      dataCalls += 1;
      started();
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal instanceof AbortSignal);
        signal.addEventListener("abort", () => reject(new Error(ABORT_MARKER)), { once: true });
      });
    },
  });
  const controller = new AbortController();
  let consumedPages = 0;

  const fold = client.foldOrdersBulkPagesCancellable(
    {
      restaurantGuid: RESTAURANT_GUID,
      pageSize: 100,
      query: { businessDate: 20260816 },
    },
    0,
    (state) => {
      consumedPages += 1;
      return state + 1;
    },
    { signal: controller.signal },
  );
  await startedPromise;
  controller.abort(ABORT_MARKER);
  await assertCancelled(fold);
  assert.equal(dataCalls, 1);
  assert.equal(consumedPages, 0);
});

test("Partners cancellation preserves credential-scoped header boundary", async () => {
  let observedRestaurantHeader: string | null | undefined;
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => { started = resolve; });
  const client = makeClient({
    dataFetch: async (_input, init) => {
      observedRestaurantHeader = new Headers(init?.headers)
        .get("toast-restaurant-external-id");
      started();
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        assert.ok(signal instanceof AbortSignal);
        signal.addEventListener("abort", () => reject(new Error(ABORT_MARKER)), { once: true });
      });
    },
  });
  const controller = new AbortController();
  const partners = client.getAccessibleRestaurantsJsonDetailedCancellable({
    signal: controller.signal,
  });
  await startedPromise;
  controller.abort(ABORT_MARKER);

  await assertCancelled(partners);
  assert.equal(observedRestaurantHeader, null);
});

function makeClient(options: {
  readonly authFetch?: (input: string, init: RequestInit) => Promise<Response>;
  readonly coordinator?: ToastRateLimitCoordinator;
  readonly dataFetch: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}) {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const tokenManager = createOAuthTokenManager(config, {
    now: options.now ?? (() => START_EPOCH_MS),
    fetch: options.authFetch ?? (async () => tokenResponse()),
  });
  return createRateLimitAwareToastHttpClient(config, tokenManager, {
    fetch: options.dataFetch,
    now: options.now ?? (() => START_EPOCH_MS),
    random: () => 0,
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.coordinator === undefined ? {} : { rateLimitCoordinator: options.coordinator }),
  });
}

function scopedRequest(
  rateLimitKey: string,
  path: `/${string}` = "/restaurants/v1/restaurants/example",
) {
  return { path, restaurantGuid: RESTAURANT_GUID, rateLimitKey } as const;
}

function configurationRequest() {
  return {
    path: "/config/v2/restaurants/example/menus" as const,
    restaurantGuid: RESTAURANT_GUID,
    rateLimitKey: "configuration-cancellation",
    maxPages: 3,
    maxRestarts: 1,
  };
}

function abortableResponse(signal: AbortSignal | null | undefined): Promise<Response> {
  assert.ok(signal instanceof AbortSignal);
  return new Promise<Response>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error(ABORT_MARKER)), { once: true });
  });
}

async function assertCancelled(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ToastHttpError);
    assert.equal(error.code, "request_cancelled");
    assert.equal(error.retryable, false);
    assert.equal(error.upstreamStatus, undefined);
    assert.ok(!`${error.message} ${JSON.stringify(error)}`.includes(ABORT_MARKER));
    return true;
  });
}

function tokenResponse(): Response {
  return jsonResponse({
    token: {
      tokenType: "Bearer",
      expiresIn: 3600,
      accessToken: "synthetic-cancellation-token",
    },
  });
}

function jsonResponse(
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
