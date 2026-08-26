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

const SYNTHETIC_ACCESS_TOKEN_MARKER = "synthetic-location-access-token-marker";
const SYNTHETIC_PARTNER_EMAIL_MARKER = "partner-contact-must-not-be-retained@example.invalid";
const SYNTHETIC_UPSTREAM_BODY_MARKER = "synthetic-location-body-marker-must-not-leak";
const SYNTHETIC_DEFAULT_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000002";
const SYNTHETIC_SECOND_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000210";
const SYNTHETIC_MANAGEMENT_GROUP_GUID = "00000000-0000-4000-8000-000000000900";

const DEFAULT_SCOPES = Object.freeze([
  "restaurants:read",
  "orders:read",
]);

test("discovers credential-accessible restaurants without a restaurant header, then hydrates each detail with its own GUID", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
        partnerAccess(SYNTHETIC_SECOND_RESTAURANT_GUID, {
          scopes: ["restaurants:read", "orders:read", "orders:read"],
        }),
      ]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
        name: "Synthetic Harbor Cafe",
        timezone: "America/Chicago",
        closeoutHour: 4,
        currencyCode: "USD",
      })),
      jsonResponse(restaurantDetail(SYNTHETIC_SECOND_RESTAURANT_GUID, {
        name: "Synthetic Ridge Counter",
        timezone: "America/Denver",
        closeoutHour: 5,
        currencyCode: "USD",
      })),
    ],
  });
  const registry = createLocationRegistry();

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  assert.equal(discovery.bootstrapRestaurantGuid, SYNTHETIC_DEFAULT_RESTAURANT_GUID);
  assert.equal(discovery.locations.length, 2);
  assert.deepEqual(discovery.locations[0], {
    restaurantGuid: SYNTHETIC_DEFAULT_RESTAURANT_GUID,
    name: "Synthetic Harbor Cafe",
    timezone: "America/Chicago",
    closeoutHour: 4,
    currencyCode: "USD",
    managementGroupGuid: SYNTHETIC_MANAGEMENT_GROUP_GUID,
    connectionScopes: DEFAULT_SCOPES,
  });
  assert.deepEqual(discovery.locations[1]?.connectionScopes, [
    "restaurants:read",
    "orders:read",
  ]);

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
    `https://ws-api.synthetic-toast-fixture.test/restaurants/v1/restaurants/${SYNTHETIC_DEFAULT_RESTAURANT_GUID}?includeArchived=false`,
  );
  assert.equal(
    harness.dataFetch.calls[1]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_DEFAULT_RESTAURANT_GUID,
  );
  assert.equal(
    harness.dataFetch.calls[2]?.headers["toast-restaurant-external-id"],
    SYNTHETIC_SECOND_RESTAURANT_GUID,
  );
});

test("never retains partner contact metadata or unrelated Partners response fields", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([
        {
          ...partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
          createdByEmailAddress: SYNTHETIC_PARTNER_EMAIL_MARKER,
          externalRestaurantRef: "external-ref-must-not-be-retained",
          restaurantName: "Partners-side name is not report context",
        },
      ]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID)),
    ],
  });
  const registry = createLocationRegistry();

  await discoverStandardLocations({
    config: harness.config,
    registry,
    toastHttpClient: harness.client,
  });

  const rendered = `${JSON.stringify(registry.list(harness.config))} ${inspect(registry.list(harness.config), { depth: null })}`;
  assert.ok(!rendered.includes(SYNTHETIC_PARTNER_EMAIL_MARKER));
  assert.ok(!rendered.includes("external-ref-must-not-be-retained"));
  assert.ok(!rendered.includes("Partners-side name is not report context"));
});

test("excludes deleted accessible restaurants from active reporting context", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
        partnerAccess(SYNTHETIC_SECOND_RESTAURANT_GUID, { deleted: true }),
      ]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID)),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry: createLocationRegistry(),
    toastHttpClient: harness.client,
  });

  assert.equal(discovery.locations.length, 1);
  assert.equal(discovery.locations[0]?.restaurantGuid, SYNTHETIC_DEFAULT_RESTAURANT_GUID);
  assert.equal(harness.dataFetch.calls.length, 2);
});

test("fails closed when the configured bootstrap restaurant is deleted or absent from active access", async () => {
  for (const partnerPayload of [
    [partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { deleted: true })],
    [partnerAccess(SYNTHETIC_SECOND_RESTAURANT_GUID)],
  ]) {
    const harness = new LocationHarness({ responses: [jsonResponse(partnerPayload)] });

    await assert.rejects(
      discoverStandardLocations({
        config: harness.config,
        registry: createLocationRegistry(),
        toastHttpClient: harness.client,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ToastLocationError);
        assert.equal(error.code, "location_bootstrap_guid_inaccessible");
        return true;
      },
    );
    assert.equal(harness.dataFetch.calls.length, 1);
  }
});

test("requires the configured bootstrap GUID before any Toast discovery request", async () => {
  const { TOAST_DEFAULT_RESTAURANT_GUID: _omitted, ...env } = SYNTHETIC_VALID_RUNTIME_ENV;
  const harness = new LocationHarness({ env, responses: [] });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_bootstrap_guid_required");
      return true;
    },
  );
  assert.equal(harness.dataFetch.calls.length, 0);
});

test("translates an unauthorized credential-wide Partners source into a static fail-closed location error", async () => {
  const harness = new LocationHarness({
    responses: [
      new Response(JSON.stringify({ marker: SYNTHETIC_UPSTREAM_BODY_MARKER }), {
        status: 403,
        headers: {
          "content-type": "application/json",
          "toast-request-id": "synthetic-partners-403-request-id",
        },
      }),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_discovery_source_unavailable");
      assert.equal(error.retryable, false);
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      assert.ok(!rendered.includes("synthetic-partners-403-request-id"));
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      return true;
    },
  );

  assert.equal(harness.dataFetch.calls.length, 1);
});

test("rejects duplicate Partners restaurant GUIDs before any detail hydration", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
      ]),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_guid_repeated");
      return true;
    },
  );
  assert.equal(harness.dataFetch.calls.length, 1);
});

test("fails closed on invalid connection scopes without leaking the upstream marker", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
          scopes: [`orders:read ${SYNTHETIC_UPSTREAM_BODY_MARKER}`],
        }),
      ]),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      const rendered = `${error.message} ${JSON.stringify(error)} ${inspect(error, { depth: null })}`;
      assert.ok(!rendered.includes(SYNTHETIC_UPSTREAM_BODY_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      assert.ok(!rendered.includes(SYNTHETIC_ACCESS_TOKEN_MARKER));
      return true;
    },
  );
});

test("rejects restaurant detail whose GUID differs from the requested connection", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_SECOND_RESTAURANT_GUID)),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_detail_guid_mismatch");
      return true;
    },
  );
});

test("rejects disagreement between Partners and Restaurants management-group identity", async () => {
  const otherGroup = "00000000-0000-4000-8000-000000000901";
  const harness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
        managementGroupGuid: otherGroup,
      })),
    ],
  });

  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_management_group_mismatch");
      return true;
    },
  );
});

test("validates report-critical detail fields including IANA timezone, 0-12 closeout, and ISO currency shape", async () => {
  const invalidDetails = [
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { timezone: "Not/AZone" }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { timezone: "-05:00" }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { closeoutHour: -1 }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { closeoutHour: 13 }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { closeoutHour: 4.5 }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { currencyCode: "usd" }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { currencyCode: "US" }),
    restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { archived: true }),
  ];

  for (const detail of invalidDetails) {
    const harness = new LocationHarness({
      responses: [
        jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
        jsonResponse(detail),
      ],
    });
    await assert.rejects(
      discoverStandardLocations({
        config: harness.config,
        registry: createLocationRegistry(),
        toastHttpClient: harness.client,
      }),
      (error: unknown) => {
        assert.ok(error instanceof ToastLocationError);
        assert.equal(error.code, "location_response_invalid");
        return true;
      },
    );
  }
});

test("accepts previously verified IANA aliases and Etc/GMT identifiers while rejecting bare fixed offsets", async () => {
  for (const timezone of ["US/Central", "Asia/Calcutta", "Etc/GMT+5"]) {
    const harness = new LocationHarness({
      responses: [
        jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
        jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
          timezone,
        })),
      ],
    });

    const discovery = await discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    });
    assert.equal(discovery.locations[0]?.timezone, timezone);
  }

  const offsetHarness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
        timezone: "-05:00",
      })),
    ],
  });
  await assert.rejects(
    discoverStandardLocations({
      config: offsetHarness.config,
      registry: createLocationRegistry(),
      toastHttpClient: offsetHarness.client,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToastLocationError);
      assert.equal(error.code, "location_response_invalid");
      return true;
    },
  );
});

test("accepts both closeout boundaries and nullable management-group identity", async () => {
  for (const closeoutHour of [0, 12]) {
    const harness = new LocationHarness({
      responses: [
        jsonResponse([
          partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
            managementGroupGuid: null,
          }),
        ]),
        jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
          closeoutHour,
          managementGroupGuid: null,
        })),
      ],
    });

    const discovery = await discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    });
    assert.equal(discovery.locations[0]?.closeoutHour, closeoutHour);
    assert.equal(discovery.locations[0]?.managementGroupGuid, undefined);
  }
});

test("does not replace a previously complete registry when later detail hydration fails", async () => {
  const registry = createLocationRegistry();
  const goodHarness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
        name: "Known Complete Location",
      })),
    ],
  });
  await discoverStandardLocations({
    config: goodHarness.config,
    registry,
    toastHttpClient: goodHarness.client,
  });

  const failingHarness = new LocationHarness({
    config: goodHarness.config,
    responses: [
      jsonResponse([
        partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID),
        partnerAccess(SYNTHETIC_SECOND_RESTAURANT_GUID),
      ]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, {
        name: "Would Replace If Partial",
      })),
      jsonResponse(restaurantDetail(SYNTHETIC_SECOND_RESTAURANT_GUID, {
        currencyCode: "INVALID",
      })),
    ],
  });

  assert.equal(failingHarness.config, goodHarness.config);
  await assert.rejects(
    discoverStandardLocations({
      config: goodHarness.config,
      registry,
      toastHttpClient: failingHarness.client,
    }),
    ToastLocationError,
  );

  assert.equal(registry.list(goodHarness.config).length, 1);
  assert.equal(
    registry.get(goodHarness.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID)?.name,
    "Known Complete Location",
  );
});

test("keeps location state isolated by RuntimeConfig object identity", async () => {
  const registry = createLocationRegistry();
  const harnessA = new LocationHarness({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_CLIENT_ID: "synthetic-client-id-location-a",
      TOAST_CLIENT_SECRET: "synthetic-client-secret-location-a",
    },
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { name: "Operator A" })),
    ],
  });
  const harnessB = new LocationHarness({
    env: {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_CLIENT_ID: "synthetic-client-id-location-b",
      TOAST_CLIENT_SECRET: "synthetic-client-secret-location-b",
    },
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID, { name: "Operator B" })),
    ],
  });

  await discoverStandardLocations({ config: harnessA.config, registry, toastHttpClient: harnessA.client });
  await discoverStandardLocations({ config: harnessB.config, registry, toastHttpClient: harnessB.client });

  assert.equal(registry.get(harnessA.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID)?.name, "Operator A");
  assert.equal(registry.get(harnessB.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID)?.name, "Operator B");
});

test("freezes retained connection scopes so downstream capability code cannot mutate location authority", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)]),
      jsonResponse(restaurantDetail(SYNTHETIC_DEFAULT_RESTAURANT_GUID)),
    ],
  });
  const registry = createLocationRegistry();
  await discoverStandardLocations({ config: harness.config, registry, toastHttpClient: harness.client });

  const location = registry.get(harness.config, SYNTHETIC_DEFAULT_RESTAURANT_GUID);
  assert.ok(location !== undefined);
  assert.ok(Object.isFrozen(location));
  assert.ok(Object.isFrozen(location.connectionScopes));
  assert.throws(() => {
    (location.connectionScopes as string[]).push("guest.pi:read");
  }, TypeError);
});

test("credential-scoped Partners rate-limit state is distinct from every restaurant-scoped bucket", async () => {
  const harness = new LocationHarness({
    responses: [
      jsonResponse([partnerAccess(SYNTHETIC_DEFAULT_RESTAURANT_GUID)], {
        "toast-ratelimit-limit": "10",
        "toast-ratelimit-remaining": "9",
      }),
    ],
  });

  await harness.client.getAccessibleRestaurantsJson();

  assert.deepEqual(
    harness.client.getCredentialRateLimitSnapshot("standard", "partnersAccessibleRestaurants"),
    {
      apiFamily: "standard",
      scope: "credential",
      key: "partnersAccessibleRestaurants",
      limit: 10,
      remaining: 9,
      resetAtEpochMs: undefined,
      retryAfterEpochMs: undefined,
      updatedAtEpochMs: 0,
    },
  );
  assert.equal(
    harness.client.getRateLimitSnapshot(
      "standard",
      SYNTHETIC_DEFAULT_RESTAURANT_GUID,
      "partnersAccessibleRestaurants",
    ),
    undefined,
  );
});

type FetchResult = Response | Error;

interface LocationHarnessOptions {
  readonly config?: RuntimeConfig;
  readonly env?: Readonly<Record<string, string>>;
  readonly responses: FetchResult[];
}

class LocationHarness {
  readonly client: ToastHttpClient;
  readonly config: RuntimeConfig;
  readonly dataFetch: RecordingFetch;

  constructor(options: LocationHarnessOptions) {
    if (options.config !== undefined && options.env !== undefined) {
      throw new Error("LocationHarness accepts config or env, not both.");
    }

    this.config = options.config ?? loadRuntimeConfig(options.env ?? SYNTHETIC_VALID_RUNTIME_ENV);
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

interface PartnerAccessOptions {
  readonly deleted?: boolean;
  readonly managementGroupGuid?: string | null;
  readonly scopes?: readonly string[];
}

function partnerAccess(
  restaurantGuid: string,
  options: PartnerAccessOptions = {},
): Record<string, unknown> {
  return {
    restaurantGuid,
    managementGroupGuid:
      options.managementGroupGuid === undefined
        ? SYNTHETIC_MANAGEMENT_GROUP_GUID
        : options.managementGroupGuid,
    deleted: options.deleted ?? false,
    restaurantName: "Synthetic Partners Name",
    locationName: "SYN-01",
    createdByEmailAddress: SYNTHETIC_PARTNER_EMAIL_MARKER,
    scopes: [...(options.scopes ?? DEFAULT_SCOPES)],
  };
}

interface RestaurantDetailOptions {
  readonly archived?: boolean;
  readonly name?: string;
  readonly timezone?: string;
  readonly closeoutHour?: number;
  readonly currencyCode?: string;
  readonly managementGroupGuid?: string | null;
}

function restaurantDetail(
  restaurantGuid: string,
  options: RestaurantDetailOptions = {},
): Record<string, unknown> {
  return {
    guid: restaurantGuid,
    general: {
      archived: options.archived ?? false,
      name: options.name ?? "Synthetic Harbor Cafe",
      locationName: "Synthetic Location",
      locationCode: "SYN",
      timeZone: options.timezone ?? "America/Chicago",
      closeoutHour: options.closeoutHour ?? 4,
      currencyCode: options.currencyCode ?? "USD",
      managementGroupGuid:
        options.managementGroupGuid === undefined
          ? SYNTHETIC_MANAGEMENT_GROUP_GUID
          : options.managementGroupGuid,
    },
  };
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

  return {
    url: String(input),
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
