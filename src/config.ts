import { inspect } from "node:util";

import { z } from "zod";

/**
 * Non-persistent runtime configuration.
 *
 * This module reads Toast credentials, the documented machine-client access
 * type, an optional default restaurant GUID, and the explicit
 * Merchant-AI-consent acknowledgment from environment variables only. It
 * writes nothing to disk, caches nothing outside process memory, and never
 * echoes a raw environment value back in an error message, log line, or
 * serialized form. See docs/architecture/public-use-boundary.md for the
 * governing product decision.
 *
 * OAuth token lifecycle (T1-003), Toast HTTP transport (T1-004), and
 * pagination (T1-005/T1-006) are out of scope here; this module only loads
 * and validates the configuration those later layers will consume.
 */

/** The only Toast machine-client access type documented today. */
const DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE = "TOAST_MACHINE_CLIENT" as const;

/** The only accepted value for explicit Merchant-AI-consent acknowledgment. */
const REQUIRED_CONSENT_ACKNOWLEDGMENT = "true" as const;

const REDACTED_PLACEHOLDER = "[redacted]" as const;

/** Bare hostname only: no scheme, path, query string, or port. */
const HOSTNAME_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/iu;

const hostnameSchema = z.string().regex(HOSTNAME_PATTERN);
const nonBlankCredentialSchema = z.string().min(1);
const accessTypeSchema = z.literal(DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE);
const restaurantGuidSchema = z.string().uuid();
const consentSchema = z.literal(REQUIRED_CONSENT_ACKNOWLEDGMENT);

/** One environment variable naming the configuration this module owns. */
const RUNTIME_CONFIG_ENV_KEYS = [
  "TOAST_API_HOSTNAME",
  "TOAST_CLIENT_ID",
  "TOAST_CLIENT_SECRET",
  "TOAST_ACCESS_TYPE",
  "TOAST_DEFAULT_RESTAURANT_GUID",
  "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED",
] as const;

type RuntimeConfigEnvKey = (typeof RUNTIME_CONFIG_ENV_KEYS)[number];

/** Environment variable names whose values must never be echoed, logged, or returned. */
const CREDENTIAL_ENV_KEYS = new Set<RuntimeConfigEnvKey>([
  "TOAST_CLIENT_ID",
  "TOAST_CLIENT_SECRET",
]);

export interface RuntimeConfigIssue {
  /** The environment variable this issue concerns. */
  readonly field: RuntimeConfigEnvKey;
  /** An actionable description that never includes the raw configured value. */
  readonly message: string;
}

/**
 * Thrown when runtime configuration fails validation or required
 * Merchant-AI-consent acknowledgment is absent or not exactly `"true"`.
 *
 * `issues` aggregates every problem found in a single pass so an operator can
 * fix all of them at once. Neither `message` nor `issues` ever contains a raw
 * configured value.
 */
export class RuntimeConfigError extends Error {
  readonly issues: readonly RuntimeConfigIssue[];

  constructor(issues: readonly RuntimeConfigIssue[]) {
    super(RuntimeConfigError.summarize(issues));
    this.name = "RuntimeConfigError";
    this.issues = issues;
  }

  private static summarize(issues: readonly RuntimeConfigIssue[]): string {
    const count = issues.length;
    const noun = count === 1 ? "issue" : "issues";
    const details = issues
      .map((issue) => `${issue.field}: ${issue.message}`)
      .join(" | ");

    return `Runtime configuration is invalid (${count} ${noun}): ${details}`;
  }
}

export interface RuntimeConfig {
  readonly apiHostname: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly machineClientAccessType: typeof DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE;
  readonly defaultRestaurantGuid?: string;
  readonly merchantAiConsentAcknowledged: true;
}

/** Read-only view of environment variables. `process.env` satisfies this. */
export type RuntimeConfigSource = Readonly<Record<string, string | undefined>>;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasSurroundingWhitespace(value: string): boolean {
  return value !== value.trim();
}

function validateHostname(
  value: string | undefined,
  issues: RuntimeConfigIssue[],
): string {
  const field = "TOAST_API_HOSTNAME";

  if (value === undefined || isBlank(value)) {
    issues.push({
      field,
      message:
        "is required. Set it to the bare Toast API hostname for your integration " +
        "(for example, ws-api.toasttab.com), with no scheme, path, query, or port.",
    });
    return "";
  }

  if (hasSurroundingWhitespace(value)) {
    issues.push({
      field,
      message: "must not have leading or trailing whitespace.",
    });
    return "";
  }

  if (value.includes("://")) {
    issues.push({
      field,
      message:
        'must not include a URL scheme such as "https://". Provide only the hostname.',
    });
    return "";
  }

  if (!hostnameSchema.safeParse(value).success) {
    issues.push({
      field,
      message:
        "must be a bare hostname such as ws-api.toasttab.com, with no scheme, " +
        "path, query, or port.",
    });
    return "";
  }

  return value;
}

function validateCredential(
  value: string | undefined,
  field: "TOAST_CLIENT_ID" | "TOAST_CLIENT_SECRET",
  issues: RuntimeConfigIssue[],
): string {
  if (value === undefined || isBlank(value)) {
    issues.push({
      field,
      message: `is required. Set ${field} to the credential value Toast issued for this integration. The value itself is never echoed back.`,
    });
    return "";
  }

  if (hasSurroundingWhitespace(value)) {
    issues.push({
      field,
      message:
        "must not have leading or trailing whitespace. Check for a stray newline " +
        "or space copied from a secret manager or .env file. The value itself is never echoed back.",
    });
    return "";
  }

  if (!nonBlankCredentialSchema.safeParse(value).success) {
    issues.push({
      field,
      message: `must be a non-empty credential value. The value itself is never echoed back.`,
    });
    return "";
  }

  return value;
}

function validateAccessType(
  value: string | undefined,
  issues: RuntimeConfigIssue[],
): typeof DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE {
  const field = "TOAST_ACCESS_TYPE";

  if (value !== undefined && accessTypeSchema.safeParse(value).success) {
    return DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE;
  }

  issues.push({
    field,
    message:
      `must be set to the exact documented value "${DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE}". ` +
      "Toast currently documents only the machine-client access type for this integration model.",
  });
  return DOCUMENTED_MACHINE_CLIENT_ACCESS_TYPE;
}

function validateOptionalRestaurantGuid(
  value: string | undefined,
  issues: RuntimeConfigIssue[],
): string | undefined {
  const field = "TOAST_DEFAULT_RESTAURANT_GUID";

  if (value === undefined) {
    return undefined;
  }

  if (isBlank(value)) {
    issues.push({
      field,
      message:
        "must not be an empty string. Unset the variable entirely to omit an " +
        "optional default restaurant GUID.",
    });
    return undefined;
  }

  if (hasSurroundingWhitespace(value)) {
    issues.push({
      field,
      message: "must not have leading or trailing whitespace.",
    });
    return undefined;
  }

  if (!restaurantGuidSchema.safeParse(value).success) {
    issues.push({
      field,
      message: "must be a Toast restaurant GUID in UUID format.",
    });
    return undefined;
  }

  return value;
}

/**
 * Validate the explicit operator acknowledgment that documented Merchant
 * consent exists before Toast Merchant Data is processed by an AI tool or
 * service. Absent or false acknowledgment fails closed: only the exact
 * string `"true"` is accepted, and no partial credit is given for other
 * truthy-looking values (`"1"`, `"yes"`, `"True"`, and so on).
 *
 * This acknowledgment records operator intent only. It cannot and does not
 * establish legal sufficiency of Merchant consent; see
 * docs/architecture/public-use-boundary.md.
 */
function validateMerchantAiConsentAcknowledgment(
  value: string | undefined,
  issues: RuntimeConfigIssue[],
): true {
  const field = "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED";

  if (value !== undefined && consentSchema.safeParse(value).success) {
    return true;
  }

  issues.push({
    field,
    message:
      'is required before this server will start, and only the exact string "true" is accepted. ' +
      "Set it only after you already hold documented Merchant consent for AI processing of Toast " +
      "Merchant Data and have satisfied any applicable Toast prior-written-consent requirement " +
      "(see docs/architecture/public-use-boundary.md). The server fails closed without it.",
  });
  return true;
}

/**
 * Attach non-enumerable, secret-safe `toJSON` and inspection overrides so
 * that `JSON.stringify(config)`, `console.log(config)`, and `util.inspect(config)`
 * can never leak `clientId` or `clientSecret`, and freeze the result.
 *
 * This is defense in depth for accidental logging in later slices. It is not
 * a substitute for never capturing credential-shaped values in the first
 * place.
 */
function finalizeRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  const redactedView: Record<string, unknown> = {
    ...config,
    clientId: REDACTED_PLACEHOLDER,
    clientSecret: REDACTED_PLACEHOLDER,
  };

  Object.defineProperty(config, "toJSON", {
    value: () => redactedView,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(config, inspect.custom, {
    value: () => redactedView,
    enumerable: false,
    configurable: false,
  });

  return Object.freeze(config);
}

/**
 * Load and validate non-persistent runtime configuration from environment
 * variables, including the explicit Merchant-AI-consent acknowledgment.
 *
 * Nothing is read from or written to disk, and nothing is cached to a
 * durable artifact; every call re-reads `source` (which defaults to
 * `process.env`). Throws {@link RuntimeConfigError} with every problem found
 * in a single pass, including absent or false consent acknowledgment
 * (fail-closed). Never includes a raw configured value in a thrown message.
 */
export function loadRuntimeConfig(
  source: RuntimeConfigSource = process.env,
): RuntimeConfig {
  const issues: RuntimeConfigIssue[] = [];

  const apiHostname = validateHostname(source.TOAST_API_HOSTNAME, issues);
  const clientId = validateCredential(
    source.TOAST_CLIENT_ID,
    "TOAST_CLIENT_ID",
    issues,
  );
  const clientSecret = validateCredential(
    source.TOAST_CLIENT_SECRET,
    "TOAST_CLIENT_SECRET",
    issues,
  );
  const machineClientAccessType = validateAccessType(
    source.TOAST_ACCESS_TYPE,
    issues,
  );
  const defaultRestaurantGuid = validateOptionalRestaurantGuid(
    source.TOAST_DEFAULT_RESTAURANT_GUID,
    issues,
  );
  const merchantAiConsentAcknowledged = validateMerchantAiConsentAcknowledgment(
    source.TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED,
    issues,
  );

  if (issues.length > 0) {
    throw new RuntimeConfigError(issues);
  }

  const config: RuntimeConfig = {
    apiHostname,
    clientId,
    clientSecret,
    machineClientAccessType,
    ...(defaultRestaurantGuid !== undefined ? { defaultRestaurantGuid } : {}),
    merchantAiConsentAcknowledged,
  };

  return finalizeRuntimeConfig(config);
}

/** Env keys this module reads. Exported so tests can assert exhaustiveness. */
export const RUNTIME_CONFIG_ENV_KEYS_FOR_TESTS = RUNTIME_CONFIG_ENV_KEYS;
export const CREDENTIAL_ENV_KEYS_FOR_TESTS = CREDENTIAL_ENV_KEYS;
