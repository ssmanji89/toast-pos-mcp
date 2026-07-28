import assert from "node:assert/strict";
import { inspect } from "node:util";
import test from "node:test";

import {
  CREDENTIAL_ENV_KEYS_FOR_TESTS,
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
  assert.equal(config.clientId, "synthetic-client-id-0001");
  assert.equal(config.clientSecret, SYNTHETIC_CLIENT_SECRET_MARKER);
  assert.equal(config.machineClientAccessType, "TOAST_MACHINE_CLIENT");
  assert.equal(
    config.defaultRestaurantGuid,
    "00000000-0000-4000-8000-000000000002",
  );
  assert.equal(config.merchantAiConsentAcknowledged, true);
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

test("returned config redacts credentials from JSON.stringify", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const serialized = JSON.stringify(config);

  assert.ok(!serialized.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
  assert.ok(!serialized.includes("synthetic-client-id-0001"));
  assert.match(serialized, /\[redacted\]/u);
  assert.match(serialized, /ws-api\.synthetic-toast-fixture\.test/u);
});

test("returned config redacts credentials from util.inspect / console.log rendering", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);
  const rendered = inspect(config);

  assert.ok(!rendered.includes(SYNTHETIC_CLIENT_SECRET_MARKER));
  assert.ok(!rendered.includes("synthetic-client-id-0001"));
  assert.match(rendered, /\[redacted\]/u);
});

test("returned config is frozen and cannot be mutated", () => {
  const config = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  assert.ok(Object.isFrozen(config));
  assert.throws(() => {
    // @ts-expect-error verifying runtime immutability of a readonly field
    config.clientSecret = "mutated";
  }, TypeError);
});
