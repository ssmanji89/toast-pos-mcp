import assert from "node:assert/strict";
import test from "node:test";

import { StandardDimensionContextProvider } from "../src/dimension-context.js";
import type { ToastLocation } from "../src/locations.js";
import { ToastHttpError, type ToastDetailedJsonResult } from "../src/transport.js";

const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000001";
const LOCATION: ToastLocation = {
  restaurantGuid: RESTAURANT_GUID,
  name: "Synthetic Cafe",
  timezone: "America/Chicago",
  closeoutHour: 4,
  currencyCode: "USD",
  managementGroupGuid: undefined,
  connectionScopes: Object.freeze([]),
};

test("a cancelled menu-refresh starter cancels only its wait", async () => {
  const metadata = deferred<ToastDetailedJsonResult>();
  const provider = new StandardDimensionContextProvider(
    menuClient(metadata),
    () => 0,
  );
  const starterController = new AbortController();
  const starter = provider.getMenuContext(LOCATION, { signal: starterController.signal });
  const follower = provider.getMenuContext(LOCATION);

  starterController.abort();
  await assertCancelled(starter);
  metadata.resolve(result({ restaurantGuid: RESTAURANT_GUID, lastUpdated: "2026-08-16T00:00:00Z" }));

  const context = await follower;
  assert.equal(context.state, "current");
});

test("a cancelled configuration-refresh starter cancels only its wait", async () => {
  const salesCategories = deferred<readonly ToastDetailedJsonResult[]>();
  const provider = new StandardDimensionContextProvider(
    configurationClient(salesCategories),
    () => 0,
  );
  const starterController = new AbortController();
  const starter = provider.getConfigurationContext(LOCATION, { signal: starterController.signal });
  const follower = provider.getConfigurationContext(LOCATION);

  starterController.abort();
  await assertCancelled(starter);
  salesCategories.resolve([result([])]);

  const context = await follower;
  assert.equal(context.state, "current");
});

function menuClient(metadata: Deferred<ToastDetailedJsonResult>): never {
  return {
    getJsonDetailedCancellable(request: { readonly path: string }, options: { readonly signal?: AbortSignal }) {
      if (request.path === "/menus/v2/metadata") {
        return rejectWhenAborted(metadata.promise, options.signal);
      }
      return Promise.resolve(result({
        restaurantGuid: RESTAURANT_GUID,
        lastUpdated: "2026-08-16T00:00:00Z",
        menus: [{
          menuGroups: [{
            guid: "00000000-0000-4000-8000-000000000002",
            menuItems: [],
          }],
        }],
      }));
    },
  } as never;
}

function configurationClient(
  salesCategories: Deferred<readonly ToastDetailedJsonResult[]>,
): never {
  return {
    getConfigurationPagesDetailedCancellable(
      request: { readonly path: string },
      options: { readonly signal?: AbortSignal },
    ) {
      if (request.path === "/config/v2/salesCategories") {
        return rejectWhenAborted(salesCategories.promise, options.signal);
      }
      return Promise.resolve([result([])]);
    },
  } as never;
}

function rejectWhenAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return promise;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(cancellationError()), { once: true });
    }),
  ]);
}

function result(body: unknown): ToastDetailedJsonResult {
  return {
    apiFamily: "standard",
    body,
    scope: { kind: "restaurant", restaurantGuid: RESTAURANT_GUID },
    retrievedAtEpochMs: 0,
    upstreamRequestId: undefined,
  };
}

function cancellationError(): ToastHttpError {
  return new ToastHttpError("request_cancelled", "Synthetic cancellation.", {
    apiFamily: "standard",
    retryable: false,
  });
}

async function assertCancelled(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof ToastHttpError && error.code === "request_cancelled");
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
