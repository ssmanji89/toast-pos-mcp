import assert from "node:assert/strict";
import test from "node:test";

import { createOAuthTokenManager } from "../src/auth.js";
import { loadRuntimeConfig, type RuntimeConfig } from "../src/config.js";
import {
  createLocationRegistry,
  discoverStandardLocations,
  ToastLocationError,
} from "../src/locations.js";
import { createToastHttpClient, type ToastHttpClient } from "../src/transport.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const DEFAULT_GUID = "00000000-0000-4000-8000-000000000002";
const GROUP_GUID = "00000000-0000-4000-8000-000000000900";
const UPPER_GUID = "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF";
const UPPER_GROUP_GUID = "FACEFACE-FACE-4ACE-8ACE-FACEFACEFACE";
const DEFAULT_SCOPES = ["restaurants:read", "orders:read"] as const;

/**
 * This file is intentionally organized as an enumerated guard matrix rather
 * than a few representative happy/failure cases. T2-001 already demonstrated
 * that self-selected mutation samples miss apparently boring schema guards.
 * Each entry below corresponds to a load-bearing parser/normalizer decision
 * that must be independently mutable once an authentic dependency-backed
 * executor is available.
 */

test("G01 rejects a non-array Partners payload", async () => {
  await expectInvalidPartnerPayload({ restaurants: [] });
});

test("G02 rejects an invalid Partners restaurant UUID", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ restaurantGuid: "not-a-uuid" }),
  ]);
});

test("G03 rejects an invalid Partners management-group UUID", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ managementGroupGuid: "not-a-uuid" }),
  ]);
});

test("G04 rejects a non-boolean Partners deleted flag", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ deleted: "false" }),
  ]);
});

test("G05 rejects a non-array Partners scopes value", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ scopes: "orders:read" }),
  ]);
});

test("G06 rejects an empty connection scope", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ scopes: [""] }),
  ]);
});

test("G07 rejects connection scope surrounding whitespace", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ scopes: [" orders:read"] }),
  ]);
});

test("G08 rejects unsafe connection-scope syntax", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ scopes: ["orders:read scope"] }),
  ]);
});

test("G09 rejects a connection scope longer than 128 characters", async () => {
  await expectInvalidPartnerPayload([
    partnerAccess({ scopes: [`a${"b".repeat(128)}`] }),
  ]);
});

test("G10 deduplicates connection scopes while preserving first-seen order", async () => {
  const harness = new GuardHarness({
    responses: [
      jsonResponse([
        partnerAccess({ scopes: ["orders:read", "restaurants:read", "orders:read"] }),
      ]),
      jsonResponse(restaurantDetail()),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry: createLocationRegistry(),
    toastHttpClient: harness.client,
  });

  assert.deepEqual(discovery.locations[0]?.connectionScopes, [
    "orders:read",
    "restaurants:read",
  ]);
});

test("G11 rejects an invalid Restaurants detail UUID", async () => {
  await expectInvalidDetail({
    ...restaurantDetail(),
    guid: "not-a-uuid",
  });
});

test("G12 rejects an invalid Restaurants management-group UUID", async () => {
  await expectInvalidDetail(restaurantDetail({ managementGroupGuid: "not-a-uuid" }));
});

test("G13 rejects an empty restaurant name", async () => {
  await expectInvalidDetail(restaurantDetail({ name: "" }));
});

test("G14 rejects a whitespace-only restaurant name", async () => {
  await expectInvalidDetail(restaurantDetail({ name: "   " }));
});

test("G15 rejects a missing restaurant general object", async () => {
  await expectInvalidDetail({ guid: DEFAULT_GUID });
});

test("G16 rejects a non-boolean archived flag", async () => {
  await expectInvalidDetail(restaurantDetail({ archived: "false" }));
});

test("G17 rejects an unknown timezone", async () => {
  await expectInvalidDetail(restaurantDetail({ timeZone: "Not/AZone" }));
});

test("G18 rejects a bare fixed-offset timezone independently of ICU behavior", async () => {
  await expectInvalidDetail(restaurantDetail({ timeZone: "-05:00" }));
});

test("G19 rejects a non-integer closeout hour", async () => {
  await expectInvalidDetail(restaurantDetail({ closeoutHour: 4.5 }));
});

test("G20 rejects closeout hour below zero", async () => {
  await expectInvalidDetail(restaurantDetail({ closeoutHour: -1 }));
});

test("G21 rejects closeout hour above twelve", async () => {
  await expectInvalidDetail(restaurantDetail({ closeoutHour: 13 }));
});

test("G22 accepts both closeout boundaries", async () => {
  for (const closeoutHour of [0, 12]) {
    const harness = new GuardHarness({
      responses: [
        jsonResponse([partnerAccess()]),
        jsonResponse(restaurantDetail({ closeoutHour })),
      ],
    });
    const discovery = await discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    });
    assert.equal(discovery.locations[0]?.closeoutHour, closeoutHour);
  }
});

test("G23 rejects lowercase or malformed currency codes", async () => {
  for (const currencyCode of ["usd", "US", "USDD", "12A"]) {
    await expectInvalidDetail(restaurantDetail({ currencyCode }));
  }
});

test("G24 normalizes alphabetic restaurant and management-group UUIDs to lowercase", async () => {
  const config = loadRuntimeConfig({
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_DEFAULT_RESTAURANT_GUID: UPPER_GUID,
  });
  const harness = new GuardHarness({
    config,
    responses: [
      jsonResponse([
        partnerAccess({
          restaurantGuid: UPPER_GUID,
          managementGroupGuid: UPPER_GROUP_GUID,
        }),
      ]),
      jsonResponse(
        restaurantDetail({
          guid: UPPER_GUID,
          managementGroupGuid: UPPER_GROUP_GUID,
        }),
      ),
    ],
  });
  const registry = createLocationRegistry();

  const discovery = await discoverStandardLocations({
    config,
    registry,
    toastHttpClient: harness.client,
  });

  const expectedGuid = UPPER_GUID.toLowerCase();
  const expectedGroupGuid = UPPER_GROUP_GUID.toLowerCase();
  assert.equal(discovery.bootstrapRestaurantGuid, expectedGuid);
  assert.equal(discovery.locations[0]?.restaurantGuid, expectedGuid);
  assert.equal(discovery.locations[0]?.managementGroupGuid, expectedGroupGuid);
  assert.equal(registry.get(config, UPPER_GUID)?.restaurantGuid, expectedGuid);
  assert.equal(registry.get(config, expectedGuid)?.managementGroupGuid, expectedGroupGuid);
});

test("G25 rejects a valid but mismatched restaurant detail GUID", async () => {
  const otherGuid = "00000000-0000-4000-8000-000000000099";
  const harness = new GuardHarness({
    responses: [
      jsonResponse([partnerAccess()]),
      jsonResponse(restaurantDetail({ guid: otherGuid })),
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

test("G26 rejects a valid but conflicting management-group identity", async () => {
  const otherGroupGuid = "00000000-0000-4000-8000-000000000901";
  const harness = new GuardHarness({
    responses: [
      jsonResponse([partnerAccess()]),
      jsonResponse(restaurantDetail({ managementGroupGuid: otherGroupGuid })),
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

test("G27 excludes an explicitly archived detail despite includeArchived=false", async () => {
  await expectInvalidDetail(restaurantDetail({ archived: true }));
});

test("G28 accepts null management-group identity without inventing one", async () => {
  const harness = new GuardHarness({
    responses: [
      jsonResponse([partnerAccess({ managementGroupGuid: null })]),
      jsonResponse(restaurantDetail({ managementGroupGuid: null })),
    ],
  });

  const discovery = await discoverStandardLocations({
    config: harness.config,
    registry: createLocationRegistry(),
    toastHttpClient: harness.client,
  });
  assert.equal(discovery.locations[0]?.managementGroupGuid, undefined);
});

test("G29 rejects a bootstrap location that is absent from the active connection set", async () => {
  const otherGuid = "00000000-0000-4000-8000-000000000099";
  const harness = new GuardHarness({
    responses: [jsonResponse([partnerAccess({ restaurantGuid: otherGuid })])],
  });

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
});

test("G30 rejects a bootstrap connection marked deleted", async () => {
  const harness = new GuardHarness({
    responses: [jsonResponse([partnerAccess({ deleted: true })])],
  });

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
});

async function expectInvalidPartnerPayload(payload: unknown): Promise<void> {
  const harness = new GuardHarness({ responses: [jsonResponse(payload)] });
  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    isInvalidResponse,
  );
  assert.equal(harness.dataFetch.calls.length, 1);
}

async function expectInvalidDetail(detail: unknown): Promise<void> {
  const harness = new GuardHarness({
    responses: [
      jsonResponse([partnerAccess()]),
      jsonResponse(detail),
    ],
  });
  await assert.rejects(
    discoverStandardLocations({
      config: harness.config,
      registry: createLocationRegistry(),
      toastHttpClient: harness.client,
    }),
    isInvalidResponse,
  );
  assert.equal(harness.dataFetch.calls.length, 2);
}

function isInvalidResponse(error: unknown): boolean {
  assert.ok(error instanceof ToastLocationError);
  assert.equal(error.code, "location_response_invalid");
  assert.equal(error.retryable, false);
  return true;
}

interface GuardHarnessOptions {
  readonly config?: RuntimeConfig;
  readonly responses: readonly Response[];
}

class GuardHarness {
  readonly client: ToastHttpClient;
  readonly config: RuntimeConfig;
  readonly dataFetch: RecordingFetch;

  constructor(options: GuardHarnessOptions) {
    this.config = options.config ?? loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
    const tokenManager = createOAuthTokenManager(this.config, {
      fetch: new RecordingFetch([
        jsonResponse({
          status: "SUCCESS",
          token: {
            tokenType: "Bearer",
            expiresIn: 600,
            accessToken: "synthetic-guard-matrix-token",
          },
        }),
      ]).fetch,
      now: () => 0,
    });
    this.dataFetch = new RecordingFetch(options.responses);
    this.client = createToastHttpClient(this.config, tokenManager, {
      fetch: this.dataFetch.fetch,
      now: () => 0,
      random: () => 0,
      sleep: async () => {
        throw new Error("guard-matrix fixtures must not sleep");
      },
    });
  }
}

interface PartnerAccessOverrides {
  readonly restaurantGuid?: unknown;
  readonly managementGroupGuid?: unknown;
  readonly deleted?: unknown;
  readonly scopes?: unknown;
}

function partnerAccess(
  overrides: PartnerAccessOverrides = {},
): Record<string, unknown> {
  return {
    restaurantGuid: overrides.restaurantGuid ?? DEFAULT_GUID,
    managementGroupGuid:
      overrides.managementGroupGuid === undefined
        ? GROUP_GUID
        : overrides.managementGroupGuid,
    deleted: overrides.deleted ?? false,
    scopes: overrides.scopes ?? [...DEFAULT_SCOPES],
    createdByEmailAddress: "ignored@example.invalid",
  };
}

interface RestaurantDetailOverrides {
  readonly guid?: unknown;
  readonly archived?: unknown;
  readonly name?: unknown;
  readonly timeZone?: unknown;
  readonly closeoutHour?: unknown;
  readonly currencyCode?: unknown;
  readonly managementGroupGuid?: unknown;
}

function restaurantDetail(
  overrides: RestaurantDetailOverrides = {},
): Record<string, unknown> {
  return {
    guid: overrides.guid ?? DEFAULT_GUID,
    general: {
      archived: overrides.archived ?? false,
      name: overrides.name ?? "Synthetic Guard Matrix Cafe",
      timeZone: overrides.timeZone ?? "America/Chicago",
      closeoutHour: overrides.closeoutHour ?? 4,
      currencyCode: overrides.currencyCode ?? "USD",
      managementGroupGuid:
        overrides.managementGroupGuid === undefined
          ? GROUP_GUID
          : overrides.managementGroupGuid,
    },
  };
}

interface RecordedCall {
  readonly url: string;
}

class RecordingFetch {
  readonly calls: RecordedCall[] = [];
  #responses: Response[];

  constructor(responses: readonly Response[]) {
    this.#responses = [...responses];
  }

  fetch = async (input: string | URL | Request): Promise<Response> => {
    this.calls.push({ url: String(input) });
    const response = this.#responses.shift();
    if (response === undefined) {
      throw new Error("RecordingFetch received more calls than responses");
    }
    return response;
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
