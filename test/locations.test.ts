import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../src/config.js";
import {
  createLocationRegistry,
  discoverStandardLocations,
  ToastLocationError,
  type ToastLocation,
} from "../src/locations.js";
import { createToastHttpClient, type ToastHttpClient } from "../src/transport.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

const RESTAURANT_A = "00000000-0000-4000-8000-000000000002";
const RESTAURANT_B = "00000000-0000-4000-8000-000000000210";
const MGMT_A = "10000000-0000-4000-8000-000000000001";
const MGMT_B = "10000000-0000-4000-8000-000000000002";
const ACCESS_TOKEN_MARKER = "synthetic-location-access-token-marker";
const CONTACT_MARKER = "private-partner-contact-marker@example.invalid";
const MALFORMED_MARKER = "synthetic-malformed-location-marker";

test("discovers active Partners connections then hydrates each restaurant detail with exact request scope", async () => {
  const harness = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read", "orders:read"], {
        createdByEmailAddress: CONTACT_MARKER,
        externalRestaurantRef: "must-not-survive",
      }),
      partnerRecord(RESTAURANT_B, MGMT_B, ["restaurants:read", "menus:read"]),
    ]),
    jsonResponse(restaurantInfo(RESTAURANT_A, MGMT_A, {
      name: "Synthetic Harbor Cafe",
      timeZone: "America/Chicago",
      closeoutHour: 4,
      currencyCode: "USD",
    })),
    jsonResponse(restaurantInfo(RESTAURANT_B, MGMT_B, {
      name: "Synthetic Maple Counter",
      timeZone: "America/Toronto",
      closeoutHour: 5,
      currencyCode: "CAD",
    })),
  ]);
  const registry = createLocationRegistry();

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.deepEqual(discovery.locations.map((location) => ({
    restaurantGuid: location.restaurantGuid,
    currencyCode: location.currencyCode,
    connectionScopes: location.connectionScopes,
  })), [
    {
      restaurantGuid: RESTAURANT_A,
      currencyCode: "USD",
      connectionScopes: ["restaurants:read", "orders:read"],
    },
    {
      restaurantGuid: RESTAURANT_B,
      currencyCode: "CAD",
      connectionScopes: ["restaurants:read", "menus:read"],
    },
  ]);
  assert.equal(discovery.bootstrapRestaurantGuid, RESTAURANT_A);
  assert.equal(discovery.accessibleRestaurantsRetrievedAtEpochMs, 1_000);

  assert.equal(harness.dataFetch.calls.length, 3);
  assert.equal(
    harness.dataFetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/partners/v1/restaurants",
  );
  assert.equal(
    harness.dataFetch.calls[0]?.headers["toast-restaurant-external-id"],
    undefined,
  );
  assert.equal(
    harness.dataFetch.calls[1]?.url,
    `https://ws-api.synthetic-toast-fixture.test/restaurants/v1/restaurants/${RESTAURANT_A}`,
  );
  assert.equal(
    harness.dataFetch.calls[1]?.headers["toast-restaurant-external-id"],
    RESTAURANT_A,
  );
  assert.equal(
    harness.dataFetch.calls[2]?.headers["toast-restaurant-external-id"],
    RESTAURANT_B,
  );

  const rendered = inspect(discovery, { depth: null });
  assert.ok(!rendered.includes(CONTACT_MARKER));
  assert.ok(!rendered.includes("must-not-survive"));
  assert.equal(Object.isFrozen(discovery.locations[0]), true);
  assert.equal(Object.isFrozen(discovery.locations[0]?.connectionScopes), true);
});

test("does not hydrate deleted restaurants and fails closed when the bootstrap connection is deleted", async () => {
  const deletedNonBootstrap = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read"]),
      partnerRecord(RESTAURANT_B, MGMT_B, ["restaurants:read"], { deleted: true }),
    ]),
    jsonResponse(restaurantInfo(RESTAURANT_A, MGMT_A)),
  ]);
  const registry = createLocationRegistry();
  const discovery = await discoverStandardLocations({
    config: deletedNonBootstrap.config,
    registry,
    toastHttpClient: deletedNonBootstrap.client,
  });

  assert.deepEqual(discovery.locations.map((location) => location.restaurantGuid), [
    RESTAURANT_A,
  ]);
  assert.equal(deletedNonBootstrap.dataFetch.calls.length, 2);

  const deletedBootstrap = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read"], { deleted: true }),
      partnerRecord(RESTAURANT_B, MGMT_B, ["restaurants:read"]),
    ]),
  ]);

  await assert.rejects(
    discoverStandardLocations({
      config: deletedBootstrap.config,
      registry: createLocationRegistry(),
      toastHttpClient: deletedBootstrap.client,
    }),
    locationError("location_bootstrap_guid_inaccessible"),
  );
  assert.equal(deletedBootstrap.dataFetch.calls.length, 1);
});

test("requires the configured bootstrap GUID before any Toast request", async () => {
  const { TOAST_DEFAULT_RESTAURANT_GUID: _omitted, ...withoutBootstrap } =
    SYNTHETIC_VALID_RUNTIME_ENV;
  const harness = new LocationHarness([], withoutBootstrap);

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    locationError("location_bootstrap_guid_required"),
  );
  assert.equal(harness.dataFetch.calls.length, 0);
});

test("fails closed on duplicate accessible restaurant GUIDs before detail hydration", async () => {
  const harness = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read"]),
      partnerRecord(RESTAURANT_A, MGMT_A, ["orders:read"]),
    ]),
  ]);

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    locationError("location_guid_repeated"),
  );
  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed when the active accessible set omits the bootstrap restaurant", async () => {
  const harness = new LocationHarness([
    jsonResponse([partnerRecord(RESTAURANT_B, MGMT_B, ["restaurants:read"])]),
  ]);

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    locationError("location_bootstrap_guid_inaccessible"),
  );
  assert.equal(harness.dataFetch.calls.length, 1);
});

test("publishes registry state atomically only after every restaurant detail succeeds", async () => {
  const registry = createLocationRegistry();
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  registry.replace(config, [previousLocation()]);
  const harness = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read"]),
      partnerRecord(RESTAURANT_B, MGMT_B, ["restaurants:read"]),
    ]),
    jsonResponse(restaurantInfo(RESTAURANT_A, MGMT_A)),
    new Response(JSON.stringify({ marker: MALFORMED_MARKER }), { status: 500 }),
  ], undefined, config);

  await assert.rejects(
    discoverStandardLocations({
      config,
      registry,
      toastHttpClient: harness.client,
    }),
  );

  assert.deepEqual(registry.list(config), [previousLocation()]);
});

test("fails closed when RestaurantInfo guid or management group disagrees with Partners connection", async () => {
  for (const body of [
    restaurantInfo(RESTAURANT_B, MGMT_A),
    restaurantInfo(RESTAURANT_A, MGMT_B),
  ]) {
    const harness = new LocationHarness([
      jsonResponse([partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read"])]),
      jsonResponse(body),
    ]);

    await assert.rejects(
      discoverStandardLocations({
        config: harness.config,
        registry: createLocationRegistry(),
        toastHttpClient: harness.client,
      }),
      locationError("location_response_invalid"),
    );
  }
});

test("validates IANA time zone independently from fixed-offset support", async () => {
  for (const timeZone of ["Not/AZone", "-05:00", "+0530", "UTC-08:00"]) {
    await rejectsRestaurantGeneral({ timeZone });
  }

  for (const timeZone of ["America/Chicago", "US/Central", "Etc/GMT+5"]) {
    const harness = singleLocationHarness({ timeZone });
    const result = await discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    });
    assert.equal(result.locations[0]?.timezone, timeZone);
  }
});

test("enforces Toast closeoutHour 0 through 12 inclusive", async () => {
  for (const closeoutHour of [-1, 13, 4.5]) {
    await rejectsRestaurantGeneral({ closeoutHour });
  }

  for (const closeoutHour of [0, 12]) {
    const harness = singleLocationHarness({ closeoutHour });
    const result = await discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    });
    assert.equal(result.locations[0]?.closeoutHour, closeoutHour);
  }
});

test("requires normalized ISO-4217 alpha currency code and never defaults to USD", async () => {
  for (const currencyCode of ["usd", "US", "USDD", "12A", ""]) {
    await rejectsRestaurantGeneral({ currencyCode });
  }
  await rejectsRestaurantGeneral({ omitCurrencyCode: true });

  const cad = singleLocationHarness({ currencyCode: "CAD" });
  const result = await discoverStandardLocations({
    config: cad.config,
    registry: createLocationRegistry(),
    toastHttpClient: cad.client,
  });
  assert.equal(result.locations[0]?.currencyCode, "CAD");
});

test("rejects invalid connection scopes and de-duplicates valid restaurant-specific scopes", async () => {
  const invalid = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read", "bad/scope"]),
    ]),
  ]);
  await assert.rejects(
    discoverStandardLocations({
      config: invalid.config,
      registry: createLocationRegistry(),
      toastHttpClient: invalid.client,
    }),
    locationError("location_response_invalid"),
  );

  const valid = new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, [
        "restaurants:read",
        "orders:read",
        "orders:read",
      ]),
    ]),
    jsonResponse(restaurantInfo(RESTAURANT_A, MGMT_A)),
  ]);
  const result = await discoverStandardLocations({
    config: valid.config,
    registry: createLocationRegistry(),
    toastHttpClient: valid.client,
  });
  assert.deepEqual(result.locations[0]?.connectionScopes, [
    "restaurants:read",
    "orders:read",
  ]);
});

test("malformed source markers and credential material never appear in location errors", async () => {
  const harness = new LocationHarness([
    jsonResponse([{ restaurantGuid: RESTAURANT_A, scopes: [MALFORMED_MARKER] }]),
  ]);

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(MALFORMED_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(ACCESS_TOKEN_MARKER));
      return true;
    },
  );
});

test("registry remains isolated by runtime-config identity and restaurant GUID", async () => {
  const registry = createLocationRegistry();
  const harnessA = singleLocationHarness({ name: "Synthetic Operator A" }, {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_CLIENT_ID: "synthetic-client-id-location-a",
    TOAST_CLIENT_SECRET: "synthetic-client-secret-location-a",
  });
  const harnessB = singleLocationHarness({ name: "Synthetic Operator B" }, {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_CLIENT_ID: "synthetic-client-id-location-b",
    TOAST_CLIENT_SECRET: "synthetic-client-secret-location-b",
  });

  await discoverStandardLocations({
    config: harnessA.config,
    registry,
    toastHttpClient: harnessA.client,
  });
  await discoverStandardLocations({
    config: harnessB.config,
    registry,
    toastHttpClient: harnessB.client,
  });

  assert.equal(registry.get(harnessA.config, RESTAURANT_A)?.name, "Synthetic Operator A");
  assert.equal(registry.get(harnessB.config, RESTAURANT_A)?.name, "Synthetic Operator B");
  assert.equal(registry.get(harnessA.config, RESTAURANT_B), undefined);
});

async function rejectsRestaurantGeneral(
  overrides: RestaurantGeneralOverrides,
): Promise<void> {
  const harness = singleLocationHarness(overrides);
  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    locationError("location_response_invalid"),
  );
}

function singleLocationHarness(
  overrides: RestaurantGeneralOverrides = {},
  env: Readonly<Record<string, string>> = SYNTHETIC_VALID_RUNTIME_ENV,
): LocationHarness {
  return new LocationHarness([
    jsonResponse([
      partnerRecord(RESTAURANT_A, MGMT_A, ["restaurants:read", "orders:read"]),
    ]),
    jsonResponse(restaurantInfo(RESTAURANT_A, MGMT_A, overrides)),
  ], env);
}

function locationError(code: ToastLocationError["code"]): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ToastLocationError);
    assert.equal(error.code, code);
    assert.equal(error.retryable, false);
    return true;
  };
}

interface RestaurantGeneralOverrides {
  readonly name?: string;
  readonly timeZone?: string;
  readonly closeoutHour?: number;
  readonly currencyCode?: string;
  readonly omitCurrencyCode?: boolean;
}

function partnerRecord(
  restaurantGuid: string,
  managementGroupGuid: string,
  scopes: readonly string[],
  extras: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    restaurantGuid,
    managementGroupGuid,
    restaurantName: "Synthetic Partner Listing Name",
    scopes: [...scopes],
    ...extras,
  };
}

function restaurantInfo(
  restaurantGuid: string,
  managementGroupGuid: string,
  overrides: RestaurantGeneralOverrides = {},
): Record<string, unknown> {
  const general: Record<string, unknown> = {
    name: overrides.name ?? "Synthetic Harbor Cafe",
    locationName: "Synthetic Location",
    timeZone: overrides.timeZone ?? "America/Chicago",
    closeoutHour: overrides.closeoutHour ?? 4,
    managementGroupGuid,
  };
  if (!overrides.omitCurrencyCode) {
    general.currencyCode = overrides.currencyCode ?? "USD";
  }

  return {
    guid: restaurantGuid,
    general,
    urls: { website: "https://example.invalid" },
  };
}

function previousLocation(): ToastLocation {
  return Object.freeze({
    restaurantGuid: RESTAURANT_A,
    name: "Synthetic Previous Complete Location",
    timezone: "America/Chicago",
    closeoutHour: 4,
    currencyCode: "USD",
    managementGroupGuid: MGMT_A,
    connectionScopes: Object.freeze(["restaurants:read"]),
    contextRetrievedAtEpochMs: 42,
  });
}

type FetchResult = Response | Error;

class LocationHarness {
  readonly client: ToastHttpClient;
  readonly config: RuntimeConfig;
  readonly dataFetch: RecordingFetch;

  constructor(
    responses: FetchResult[],
    env: Readonly<Record<string, string>> = SYNTHETIC_VALID_RUNTIME_ENV,
    config?: RuntimeConfig,
  ) {
    this.config = config ?? loadRuntimeConfig(env);
    const tokenFetch = new RecordingFetch([
      jsonResponse({
        status: "SUCCESS",
        token: {
          tokenType: "Bearer",
          expiresIn: 600,
          accessToken: ACCESS_TOKEN_MARKER,
        },
      }),
    ]);
    const tokenManager = createOAuthTokenManager(this.config, {
      fetch: tokenFetch.fetch,
      now: () => 0,
    });

    this.dataFetch = new RecordingFetch(responses);
    let now = 0;
    this.client = createToastHttpClient(this.config, tokenManager, {
      fetch: this.dataFetch.fetch,
      now: () => {
        now += 1_000;
        return now;
      },
      random: () => 0,
      maxAttempts: 1,
      sleep: async () => {
        throw new Error("location discovery fixtures must not sleep");
      },
    });
  }
}

interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #results: FetchResult[];

  constructor(results: FetchResult[]) {
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
  return { url: String(input), headers: headerRecord };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
