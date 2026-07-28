import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import {
  CREDENTIAL_ENV_KEYS_FOR_TESTS,
  getRuntimeConfigCredentials,
  loadRuntimeConfig,
  RUNTIME_CONFIG_ENV_KEYS_FOR_TESTS,
  RuntimeConfigError,
} from "../src/config.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

test("the documented environment variable set matches the synthetic fixture exactly", () => {
  assert.deepEqual(
    Object.keys(SYNTHETIC_VALID_RUNTIME_ENV).sort(),
    [...RUNTIME_CONFIG_ENV_KEYS_FOR_TESTS].sort(),
  );
});

test("both Toast OAuth client credentials are treated as credential-shaped", () => {
  assert.deepEqual(
    [...CREDENTIAL_ENV_KEYS_FOR_TESTS].sort(),
    ["TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET"],
  );
});

test("loads a fully valid synthetic runtime configuration", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  assert.equal(config.apiHostname, "ws-api.synthetic-toast-fixture.test");
  assert.equal(config.machineClientAccessType, "TOAST_MACHINE_CLIENT");
  assert.equal(
    config.defaultRestaurantGuid,
    "00000000-0000-4000-8000-000000000002",
  );
  assert.equal(config.merchantAiConsentAcknowledged, true);
});

test("the OAuth client-credentials pair is reachable only through the named accessor", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  const credentials = getRuntimeConfigCredentials(config);

  assert.equal(credentials.clientId, "synthetic-client-id-0001");
  assert.equal(credentials.clientSecret, SYNTHETIC_CLIENT_SECRET_MARKER);
});

test("the accessor throws for a config object loadRuntimeConfig did not produce", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const lookalike = { ...config };

  assert.throws(() => getRuntimeConfigCredentials(lookalike), TypeError);
});

test("omitting the optional default restaurant GUID is valid", () => {
  const { TOAST_DEFAULT_RESTAURANT_GUID: _omitted, ...rest } =
    SYNTHETIC_VALID_RUNTIME_ENV;

  const config = loadRuntimeConfig(rest);

  assert.equal(config.defaultRestaurantGuid, undefined);
  assert.ok(!("defaultRestaurantGuid" in config) || config.defaultRestaurantGuid === undefined);
});

test("reads only from the provided source, never touching global process.env", () => {
  const originalHostname = process.env.TOAST_API_HOSTNAME;
  assert.equal(originalHostname, undefined);

  loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  assert.equal(process.env.TOAST_API_HOSTNAME, undefined);
});

test("fails closed with one issue per missing required field on an empty environment", () => {
  assert.throws(
    () => loadRuntimeConfig({}),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.name, "RuntimeConfigError");
      const fields = error.issues.map((issue) => issue.field).sort();
      assert.deepEqual(fields, [
        "TOAST_ACCESS_TYPE",
        "TOAST_API_HOSTNAME",
        "TOAST_CLIENT_ID",
        "TOAST_CLIENT_SECRET",
        "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED",
      ]);
      return true;
    },
  );
});

test("fails closed when consent acknowledgment is absent, even if everything else is valid", () => {
  const { TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: _omitted, ...rest } =
    SYNTHETIC_VALID_RUNTIME_ENV;

  assert.throws(
    () => loadRuntimeConfig(rest),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.issues.length, 1);
      assert.equal(
        error.issues[0]?.field,
        "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED",
      );
      return true;
    },
  );
});

test("fails closed when consent acknowledgment is explicitly false", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: "false",
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(
        error.issues[0]?.field,
        "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED",
      );
      return true;
    },
  );
});

test("accepts only the exact string \"true\" for consent acknowledgment", () => {
  for (const notExactlyTrue of ["True", "TRUE", "1", "yes", " true", "true "]) {
    const env = {
      ...SYNTHETIC_VALID_RUNTIME_ENV,
      TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: notExactlyTrue,
    };

    assert.throws(
      () => loadRuntimeConfig(env),
      RuntimeConfigError,
      `expected "${notExactlyTrue}" to be rejected`,
    );
  }
});

test("rejects an access type other than the documented machine-client value", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_ACCESS_TYPE: "SOMETHING_ELSE",
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.issues[0]?.field, "TOAST_ACCESS_TYPE");
      assert.match(error.issues[0]?.message ?? "", /TOAST_MACHINE_CLIENT/u);
      return true;
    },
  );
});

test("rejects a hostname containing a URL scheme", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_API_HOSTNAME: "https://ws-api.synthetic-toast-fixture.test",
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.issues[0]?.field, "TOAST_API_HOSTNAME");
      return true;
    },
  );
});

test("rejects a hostname with no dot (not a fully qualified domain)", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_API_HOSTNAME: "localhost",
  };

  assert.throws(() => loadRuntimeConfig(env), RuntimeConfigError);
});

test("rejects an invalid default restaurant GUID", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_DEFAULT_RESTAURANT_GUID: "not-a-guid",
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(
        error.issues[0]?.field,
        "TOAST_DEFAULT_RESTAURANT_GUID",
      );
      return true;
    },
  );
});

test("rejects an explicitly empty default restaurant GUID instead of silently ignoring it", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_DEFAULT_RESTAURANT_GUID: "",
  };

  assert.throws(() => loadRuntimeConfig(env), RuntimeConfigError);
});

test("rejects credentials with surrounding whitespace instead of silently trimming them", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_CLIENT_SECRET: `${SYNTHETIC_VALID_RUNTIME_ENV.TOAST_CLIENT_SECRET}\n`,
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      assert.equal(error.issues[0]?.field, "TOAST_CLIENT_SECRET");
      return true;
    },
  );
});

test("never includes the raw client secret value in a thrown error", () => {
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_API_HOSTNAME: "not a valid hostname",
    TOAST_CLIENT_SECRET: `${SYNTHETIC_VALID_RUNTIME_ENV.TOAST_CLIENT_SECRET}-invalid-with-space here`,
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      const serialized = `${error.message} ${JSON.stringify(error.issues)}`;
      assert.ok(!serialized.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
      return true;
    },
  );
});

test("never includes the raw client id value in a thrown error", () => {
  const distinctiveClientId = "synthetic-client-id-marker-do-not-leak";
  const env = {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_CLIENT_ID: `  ${distinctiveClientId}`,
  };

  assert.throws(
    () => loadRuntimeConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeConfigError);
      const serialized = `${error.message} ${JSON.stringify(error.issues)}`;
      assert.ok(!serialized.includes(distinctiveClientId));
      return true;
    },
  );
});

test("returned config is frozen and cannot be mutated", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  assert.ok(Object.isFrozen(config));
  assert.throws(() => {
    // @ts-expect-error verifying runtime immutability: clientSecret is not
    // (and must never become) an own property of RuntimeConfig.
    config.clientSecret = "mutated";
  }, TypeError);
});

test("clientId and clientSecret are never own properties of the returned config", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  const ownKeys = Object.getOwnPropertyNames(config);
  assert.ok(!ownKeys.includes("clientId"));
  assert.ok(!ownKeys.includes("clientSecret"));
  assert.ok(!("clientId" in config));
  assert.ok(!("clientSecret" in config));
});

// Full adversarial probe table for T1-002-R1-F1: every access pattern below
// must be safe against the returned config. Each assertion checks the raw
// synthetic client-secret marker is not reachable by that idiom, not merely
// that the accessor works — an accessor working is necessary but not
// sufficient to close this finding.
test("probe table: none of the eleven access patterns reach the raw client secret", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const MARKER = SYNTHETIC_CLIENT_SECRET_MARKER;
  const CLIENT_ID = "synthetic-client-id-0001";

  const assertSafe = (label: string, value: unknown): void => {
    const rendered =
      (typeof value === "string" ? value : JSON.stringify(value)) +
      " " +
      inspect(value, { depth: null });
    assert.ok(
      !rendered.includes(MARKER) && !rendered.includes(CLIENT_ID),
      `${label} must not leak the raw client credentials, got: ${rendered}`,
    );
  };

  // Previously safe (already passed before the fix); must remain safe.
  assertSafe("JSON.stringify(config)", JSON.stringify(config));
  assertSafe("inspect(config) default", inspect(config));
  assertSafe(
    "inspect(config, {depth:null, showHidden:true})",
    inspect(config, { depth: null, showHidden: true }),
  );
  assertSafe("template interpolation `${config}`", `${config}`);

  // Previously leaking; must now be safe because clientId/clientSecret are
  // no longer own data properties of config at all.
  assertSafe(
    "inspect(config, {customInspect:false})",
    inspect(config, { customInspect: false }),
  );
  assertSafe("Object.entries(config)", Object.entries(config));
  assertSafe("Object.values(config)", Object.values(config));
  assertSafe("{...config} spread", { ...config });
  assertSafe("Object.assign({}, config)", Object.assign({}, config));
  assertSafe("structuredClone(config)", structuredClone(config));

  const forInCollected: Record<string, unknown> = {};
  for (const key in config) {
    forInCollected[key] = (config as unknown as Record<string, unknown>)[key];
  }
  assertSafe("for...in enumeration", forInCollected);
});
