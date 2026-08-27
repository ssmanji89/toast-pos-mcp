import assert from "node:assert/strict";
import test from "node:test";

import {
  getAnalyticsRuntimeConfig,
  getAnalyticsRuntimeConfigCredentials,
  loadRuntimeConfig,
  RuntimeConfigError,
} from "../src/config.js";
import { SYNTHETIC_VALID_RUNTIME_ENV } from "./support/synthetic-runtime-env.js";

const ANALYTICS_CLIENT_SECRET_MARKER =
  "invented-analytics-client-secret-marker-19c3";

function analyticsEnv(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Readonly<Record<string, string | undefined>> {
  return {
    ...SYNTHETIC_VALID_RUNTIME_ENV,
    TOAST_ANALYTICS_API_HOSTNAME: "analytics.synthetic-toast-fixture.test",
    TOAST_ANALYTICS_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
    TOAST_ANALYTICS_CLIENT_ID: "invented-analytics-client-id-19c3",
    TOAST_ANALYTICS_CLIENT_SECRET: ANALYTICS_CLIENT_SECRET_MARKER,
    ...overrides,
  };
}

test("Analytics configuration is optional and does not change Standard configuration", () => {
  const standardOnly = loadRuntimeConfig(SYNTHETIC_VALID_RUNTIME_ENV);

  assert.equal(getAnalyticsRuntimeConfig(standardOnly), undefined);
  assert.deepEqual(
    JSON.parse(JSON.stringify(standardOnly)),
    {
      apiHostname: SYNTHETIC_VALID_RUNTIME_ENV.TOAST_API_HOSTNAME,
      machineClientAccessType: "TOAST_MACHINE_CLIENT",
      defaultRestaurantGuid: SYNTHETIC_VALID_RUNTIME_ENV.TOAST_DEFAULT_RESTAURANT_GUID,
      merchantAiConsentAcknowledged: true,
    },
  );
});

test("Analytics configuration requires the complete four-value set", () => {
  for (const key of [
    "TOAST_ANALYTICS_API_HOSTNAME",
    "TOAST_ANALYTICS_ACCESS_TYPE",
    "TOAST_ANALYTICS_CLIENT_ID",
    "TOAST_ANALYTICS_CLIENT_SECRET",
  ] as const) {
    assert.throws(
      () => loadRuntimeConfig(analyticsEnv({ [key]: undefined })),
      (error: unknown) =>
        error instanceof RuntimeConfigError &&
        error.issues.some((issue) => String(issue.field) === key) &&
        !error.message.includes(ANALYTICS_CLIENT_SECRET_MARKER),
      key,
    );
  }
});

test("Analytics configuration validates host and access type independently", () => {
  assert.throws(
    () =>
      loadRuntimeConfig(
        analyticsEnv({
          TOAST_ANALYTICS_API_HOSTNAME: "https://analytics.invalid.test",
          TOAST_ANALYTICS_ACCESS_TYPE: "NOT_A_TOAST_ACCESS_TYPE",
        }),
      ),
    (error: unknown) =>
      error instanceof RuntimeConfigError &&
      error.issues.some(
        (issue) => String(issue.field) === "TOAST_ANALYTICS_API_HOSTNAME",
      ) &&
      error.issues.some(
        (issue) => String(issue.field) === "TOAST_ANALYTICS_ACCESS_TYPE",
      ) &&
      !error.message.includes(ANALYTICS_CLIENT_SECRET_MARKER),
  );
});

test("Analytics credentials are private and Analytics configuration is frozen", () => {
  const config = loadRuntimeConfig(analyticsEnv());
  const analytics = getAnalyticsRuntimeConfig(config);
  assert.ok(analytics);
  assert.ok(Object.isFrozen(analytics));
  assert.ok(Object.isFrozen(getAnalyticsRuntimeConfigCredentials(analytics)));

  const serialized = JSON.stringify({ config, analytics });
  assert.equal(serialized.includes(ANALYTICS_CLIENT_SECRET_MARKER), false);
  assert.equal(serialized.includes("invented-analytics-client-id-19c3"), false);
  assert.throws(() => getAnalyticsRuntimeConfigCredentials({} as never));
});
