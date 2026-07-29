/**
 * An independently invented, fully valid synthetic runtime environment.
 *
 * These values are not derived from any real Toast credential or Merchant
 * Data; they exist only to exercise {@link loadRuntimeConfig} and the process
 * startup path in tests. `clientSecret` is intentionally distinctive so
 * tests can assert it never appears in error output, logs, or serialized
 * config.
 */
export const SYNTHETIC_VALID_RUNTIME_ENV: Readonly<Record<string, string>> = {
  TOAST_API_HOSTNAME: "ws-api.synthetic-toast-fixture.test",
  TOAST_CLIENT_ID: "synthetic-client-id-0001",
  TOAST_CLIENT_SECRET: "synthetic-client-secret-marker-9f3c2b1a",
  TOAST_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
  TOAST_DEFAULT_RESTAURANT_GUID: "00000000-0000-4000-8000-000000000002",
  TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: "true",
};

/** The distinctive marker embedded in the synthetic client secret above. */
export const SYNTHETIC_CLIENT_SECRET_MARKER = "synthetic-client-secret-marker-9f3c2b1a";
