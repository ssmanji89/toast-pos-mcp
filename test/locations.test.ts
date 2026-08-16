import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../src/config.js";
import {
  createLocationRegistry,
  discoverStandardLocations,
  ToastLocationError,
} from "../src/locations.js";
import { createToastHttpClient, type ToastHttpClient } from "../src/transport.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

const SYNTHETIC_ACCESS_TOKEN_MARKER =
  "synthetic-location-access-token-marker";
const SYNTHETIC_UPSTREAM_BODY_MARKER =
  "synthetic-location-body-marker-must-not-leak";
const SYNTHETIC_MALFORMED_PAYLOAD_MARKER =
  "synthetic-malformed-payload-marker-must-not-leak";
const SYNTHETIC_DEFAULT_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000000002";
const SYNTHETIC_SECOND_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000000210";

test("discovers accessible Standard API locations through the bootstrap restaurant GUID and records them by GUID", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
          {
            guid: SYNTHETIC_SECOND_RESTAURANT_GUID,
            name: "Synthetic Ridge Counter",
            timeZone: "America/Denver",
            closeoutHour: 5,
          },
        ],
      }),
    ],
  });
  const registry = createLocationRegistry();

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.deepEqual(discovery.locations, [
    {
      restaurantGuid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
      name: "Synthetic Harbor Cafe",
      timezone: "America/Chicago",
      closeoutHour: 4,
    },
    {
      restaurantGuid: SYNTHETIC_SECOND_RESTAURANT_GUID,
      name: "Synthetic Ridge Counter",
      timezone: "America/Denver",
      closeoutHour: 5,
    },
  ]);
  assert.equal(discovery.bootstrapRestaurantGuid, SYNTHETIC_DEFAULT_RESTAURANT_GUID);
  assert.equal(harness.dataFetch.calls.length, 1);
  assert.equal(
    harness.dataFetch.calls[0]?.url,
    "https://ws-api.synthetic-toast-fixture.test/restaurants/v1/restaurants",
  );
  assert.equal(
    harness.dataFetch.calls[0]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_DEFAULT_RESTAURANT_GUID,
  );
  assert.deepEqual(
    registry.get(harness.config, SYNTHETIC_SECOND_RESTAURANT_GUID),
    {
      restaurantGuid: SYNTHETIC_SECOND_RESTAURANT_GUID,
      name: "Synthetic Ridge Counter",
      timezone: "America/Denver",
      closeoutHour: 5,
    },
  );
});

test("requires the configured bootstrap restaurant GUID before location discovery can call Toast", async () => {
  const {
    TOAST_DEFAULT_RESTAURANT_GUID: _omitted,
    ...envWithoutDefaultRestaurantGuid
  } = SYNTHETIC_VALID_RUNTIME_ENV;
  const harness = new LocationHarness({
    env: envWithoutDefaultRestaurantGuid,
    responses: [jsonResponse({ restaurants: [] })],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_bootstrap_guid_required");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 0);
});

test("fails closed when Toast returns duplicate or malformed restaurant GUIDs without recording partial state", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Duplicate Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_guid_repeated");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      return true;
    },
  );

  assert.equal(registry.get(harness.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID), undefined);
});

test("fails closed when the discovered locations omit the bootstrap restaurant GUID", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_SECOND_RESTAURANT_GUID,
            name: "Synthetic Ridge Counter",
            timeZone: "America/Denver",
            closeoutHour: 5,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_bootstrap_guid_inaccessible");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed on malformed location payloads without recording partial state", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed on malformed location payloads without leaking the raw upstream payload", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: SYNTHETIC_MALFORMED_PAYLOAD_MARKER,
            timeZone: "America/Chicago",
            closeoutHour: "not-a-number",
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_MALFORMED_PAYLOAD_MARKER));
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's timeZone is not a recognized IANA zone identifier", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "this is not a timezone at all",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's timeZone is a plausible-looking but unrecognized zone name", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "Not/AZone",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's timeZone is a fixed UTC offset rather than an IANA zone identifier", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "-05:00",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("accepts a discovered location whose timeZone is a legitimate IANA zone identifier", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.equal(discovery.locations[0]?.timezone, "America/Chicago");
});

test("fails closed when a discovered location's closeoutHour is negative", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: -1,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's closeoutHour is 13 or greater", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 13,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("accepts closeoutHour 0 as a legitimate midnight closeout, never conflated with an absent value", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 0,
          },
        ],
      }),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.equal(discovery.locations[0]?.closeoutHour, 0);
});

test("accepts closeoutHour 12 as the documented maximum legitimate closeout hour", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 12,
          },
        ],
      }),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.equal(discovery.locations[0]?.closeoutHour, 12);
});

test("fails closed when a discovered location's guid is not a valid UUID", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: "not-a-valid-uuid",
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's name is an empty string", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed when a discovered location's closeoutHour is not an integer", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Harbor Cafe",
            timeZone: "America/Chicago",
            closeoutHour: 4.5,
          },
        ],
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("fails closed as an invalid response, not merely an inaccessible bootstrap GUID, when Toast returns an empty restaurants array", async () => {
  const registry = createLocationRegistry();
  const harness = new LocationHarness({
    responses: [jsonResponse({ restaurants: [] })],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry,
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      assert.equal(error.retryable, false);
      return true;
    },
  );

  assert.deepEqual(registry.list(harness.config), []);
});

test("keeps discovered location state isolated by runtime config identity as well as restaurant GUID", async () => {
  const registry = createLocationRegistry();
  const harnessA = new LocationHarness({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_CLIENT_ID: "synthetic-client-id-location-a",
      TOAST_CLIENT_SECRET: "synthetic-client-secret-location-a",
    },
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Operator A",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
  });
  const harnessB = new LocationHarness({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_CLIENT_ID: "synthetic-client-id-location-b",
      TOAST_CLIENT_SECRET: "synthetic-client-secret-location-b",
    },
    responses: [
      jsonResponse({
        restaurants: [
          {
            guid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
            name: "Synthetic Operator B",
            timeZone: "America/Chicago",
            closeoutHour: 4,
          },
        ],
      }),
    ],
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

  assert.equal(
    registry.get(harnessA.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID)?.name,
    "Synthetic Operator A",
  );
  assert.equal(
    registry.get(harnessB.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID)?.name,
    "Synthetic Operator B",
  );
});

type FetchResult = Response | Error;

interface LocationHarnessOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly responses: FetchResult[];
}

class LocationHarness {
  readonly client: ToastHttpClient;
  readonly config: RuntimeConfig;
  readonly dataFetch: RecordingFetch;

  constructor(options: LocationHarnessOptions) {
    this.config = loadRuntimeConfig(options.env ?? SYNTHETIC_VALID_RUNTIME_ENV);
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
    const tokenManager = createOAuthTokenManager(this.config, {
      fetch: tokenFetch.fetch,
      now: () => 0,
    });

    this.dataFetch = new RecordingFetch(options.responses);
    this.client = createToastHttpClient(this.config, tokenManager, {
      fetch: this.dataFetch.fetch,
      now: () => 0,
      random: () => 0,
      sleep: async () => {
        throw new Error("location discovery must not sleep in these fixtures");
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
    headers: headerRecord,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
