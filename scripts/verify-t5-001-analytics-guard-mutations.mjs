import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const accessSourcePath = new URL("../src/analytics-access.ts", import.meta.url);
const capabilitiesSourcePath = new URL("../src/capabilities.ts", import.meta.url);
const configSourcePath = new URL("../src/config.ts", import.meta.url);
const runtimeSourcePath = new URL("../src/runtime.ts", import.meta.url);
const testCommand = "npm run build:test && node --test dist-test/test/analytics-config.test.js dist-test/test/analytics-capabilities.test.js dist-test/test/analytics-access-adapter.test.js";

const requiredGuardNames = Object.freeze([
  "analytics-config-optional-standard-compatibility",
  "analytics-config-completeness",
  "analytics-config-secret-serialization",
  "analytics-scope-preflight",
  "analytics-standard-scope-substitution",
  "analytics-cross-identity-state",
  "analytics-method",
  "analytics-path",
  "analytics-standard-header",
  "analytics-guest-route",
  "analytics-schema",
  "analytics-duplicate-guid",
  "analytics-atomic-publication",
  "analytics-selection-uuid",
  "analytics-selection-duplicate",
  "analytics-selection-membership",
  "analytics-selection-canonicalization",
  "analytics-selection-identity",
  "analytics-cancellation",
  "analytics-endpoint-limiter",
  "analytics-limiter-isolation",
  "analytics-runtime-tool-boundary",
]);

const guards = Object.freeze([
  ["analytics-config-optional-standard-compatibility", configSourcePath, "if (supplied.length === 0) return undefined;", "if (supplied.length < 0) return undefined;"],
  ["analytics-config-completeness", configSourcePath, "for (const field of fields) {", "for (const field of fields.slice(0, 3)) {"],
  ["analytics-config-secret-serialization", configSourcePath, "const frozenAnalyticsConfig = Object.freeze(analytics.config);", "const frozenAnalyticsConfig = Object.freeze({ ...analytics.config, ...analytics.credentials });"],
  ["analytics-method", accessSourcePath, "method: \"GET\"", "method: \"POST\""],
  ["analytics-path", accessSourcePath, "/era/v1/restaurants-information", "/era/v1/report-request"],
  ["analytics-standard-header", accessSourcePath, "headers: { authorization: await this.#tokenManager.getAuthorizationHeader() }", "headers: { authorization: await this.#tokenManager.getAuthorizationHeader(), \"Toast-Restaurant-External-ID\": \"forbidden\" }"],
  ["analytics-scope-preflight", capabilitiesSourcePath, "ANALYTICS_REQUIRED_SCOPE = \"enterprise-metrics:read\"", "ANALYTICS_REQUIRED_SCOPE = \"enterprise-metrics:write\""],
  ["analytics-standard-scope-substitution", capabilitiesSourcePath, "return Object.freeze({ scopes: normalizeTrustedScopes(scopes, \"analyticsScopes\") });", "return Object.freeze({ scopes: normalizeTrustedScopes([\"enterprise-metrics:read\", \"standard:connection-scope\"], \"analyticsScopes\") });"],
  ["analytics-cross-identity-state", capabilitiesSourcePath, "return freezeScopes(normalized);", "return Object.freeze([\"enterprise-metrics:read\"]);"],
  ["analytics-guest-route", accessSourcePath, "\"/era/v1/restaurants-information\" as const", "\"/era/v1/guest-payments\" as const"],
  ["analytics-schema", accessSourcePath, "restaurantGuid: restaurantGuidSchema", "restaurantGuid: z.string()"],
  ["analytics-duplicate-guid", accessSourcePath, "seenRestaurantGuids.has", "false"],
  ["analytics-atomic-publication", accessSourcePath, "this.#state.registry = registry;", "this.#state.registry = undefined;"],
  ["analytics-selection-uuid", accessSourcePath, "restaurantGuidSchema.safeParse(restaurantGuid).success", "true"],
  ["analytics-selection-duplicate", accessSourcePath, "seen.has", "false"],
  ["analytics-selection-membership", accessSourcePath, "!registryByGuid.has(guid)", "false"],
  ["analytics-selection-canonicalization", accessSourcePath, "normalized.sort();", "normalized.sort((first, second) => second.localeCompare(first));"],
  ["analytics-selection-identity", accessSourcePath, "selectionOwnerBySelection.get(selection) !== this.#identity", "selectionOwnerBySelection.get(selection) === this.#identity"],
  ["analytics-cancellation", accessSourcePath, "signal: options.signal", "signal: undefined"],
  ["analytics-endpoint-limiter", accessSourcePath, "MAX_REQUESTS_PER_SECOND = 5", "MAX_REQUESTS_PER_SECOND = 6"],
  ["analytics-limiter-isolation", accessSourcePath, "return identity;", "return AnalyticsAccessAdapter;"],
  ["analytics-runtime-tool-boundary", runtimeSourcePath, "return Object.freeze({ toastHttpClient, server: createServer() });", "return Object.freeze({ toastHttpClient, server: createServer(), analyticsAccess: true });"],
]);

assertGuardSet(guards);
if (runFocusedTests() !== 0) {
  throw new Error("Analytics guard harness requires a passing focused baseline before source mutation.");
}

for (const [name, sourcePath, search, replacement] of guards) {
    const original = await readFile(sourcePath, "utf8").catch(() => undefined);
    if (original === undefined) {
      throw new Error("Analytics source is absent. Run this guard harness after the GREEN implementation.");
    }
    try {
      if (!original.includes(search)) {
        throw new Error(`${name}: source guard marker is absent`);
      }
      const candidate = original.replace(search, replacement);
      await writeFile(sourcePath, candidate);
      if (runFocusedTests() === 0) {
        throw new Error(`${name}: mutation survived focused Analytics tests`);
      }
      console.log(`${name}: caught`);
    } finally {
      await writeFile(sourcePath, original);
    }
}

function runFocusedTests() {
  return spawnSync("sh", ["-lc", testCommand], {
    cwd: new URL("..", import.meta.url), stdio: "ignore",
  }).status;
}

function assertGuardSet(entries) {
  const names = entries.map(([name]) => name);
  const uniqueNames = new Set(names);
  if (names.length !== requiredGuardNames.length || uniqueNames.size !== names.length) {
    throw new Error("Analytics guard harness requires exactly 22 unique mutation names.");
  }
  for (const name of requiredGuardNames) {
    if (!uniqueNames.has(name)) {
      throw new Error(`Analytics guard harness is missing required mutation ${name}.`);
    }
  }
}
