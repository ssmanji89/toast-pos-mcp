import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../src/analytics-report-jobs.ts", import.meta.url);
const focusedTest = "dist-test/test/analytics-report-jobs.test.js";
const guardIds = [
  "closed-catalog", "selection-ownership", "opaque-create-id", "no-result-body",
  "pending-bounds", "invalid-or-expired", "replacement-budget", "post-get-limiter",
  "limiter-key", "limiter-separation", "signal-propagation", "deferred-token-cancellation",
  "inflight-post-cancellation", "inflight-get-cancellation", "error-sanitization",
  "provenance-completeness", "local-policy-label", "runtime-internal-only",
];

const mutations = [
  ["closed-catalog", "const MAX_REPORT_REQUEST_ID_LENGTH = 512;", "const MAX_REPORT_REQUEST_ID_LENGTH = 1;"],
  ["selection-ownership", "throwIfCancelled(options.signal);\n    this.#access.assertSelectionForCurrentIdentity(selection);\n    const validated = validateCreateInput(input);", "throwIfCancelled(options.signal);\n    void selection;\n    const validated = validateCreateInput(input);"],
  ["opaque-create-id", "payload.length > MAX_REPORT_REQUEST_ID_LENGTH", "payload.length > 1"],
  ["no-result-body", "return Object.freeze({ status: \"complete\", resultContract: \"unavailable\" });", "return Object.freeze({ status: \"failed_or_incomplete\" });"],
  ["pending-bounds", "export const ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS = 30;", "export const ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS = 1;"],
  ["invalid-or-expired", "case 404:\n      return Object.freeze({ status: \"invalid_or_expired\" });", "case 404:\n      return Object.freeze({ status: \"failed_or_incomplete\" });"],
  ["replacement-budget", "export const ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS = 1;", "export const ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS = 0;"],
  ["post-get-limiter", "if (method === \"GET\") return { maxRequests: 5, windowMs: 1_000 };", "if (method === \"GET\") return { maxRequests: undefined, windowMs: 1_000 };"],
  ["limiter-key", "const key = `${operation}|${method}|${timeRange}|${restaurantGuids.join(\",\")}`;", "const key: never = `${operation}|${timeRange}`;"],
  ["limiter-separation", "const limiterByAnalyticsIdentity = new WeakMap<object, Map<string, number[]>>();", "const limiterByAnalyticsIdentity: never = new WeakMap<object, Map<string, number[]>>();"],
  ["signal-propagation", "body: JSON.stringify(body),\n        ...(signal !== undefined ? { signal } : {}),", "body: JSON.stringify(body),\n        ...({}),"],
  ["deferred-token-cancellation", "return new Promise<T>((resolve, reject) => {", "return new Promise<T>((resolve) => {"],
  ["inflight-post-cancellation", "throwIfCancelled(signal);\n    if (!response.ok) throw requestFailure();", "const cancelledPostGuard: never = signal;\n    if (!response.ok) throw requestFailure();"],
  ["inflight-get-cancellation", "throwIfCancelled(signal);\n    if (response.status === 429)", "const cancelledGetGuard: never = signal;\n    if (response.status === 429)"],
  ["error-sanitization", "\"Analytics report-job request was cancelled before completion.\"", "TOKEN_MARKER"],
  ["provenance-completeness", "apiFamily: \"analytics\",", "apiFamily: \"standard\", "],
  ["local-policy-label", "/** Local safety policy. These values are not Toast rate-limit facts. */", "const localPolicyLabel: never = \"Toast rate-limit facts.\";"],
  ["runtime-internal-only", "export const ANALYTICS_REPORT_JOB_POLL_INTERVAL_MS = 1_000;", "export const ANALYTICS_REPORT_JOB_POLL_INTERVAL_MS = 0;"],
];

if (new Set(guardIds).size !== guardIds.length || mutations.length !== guardIds.length) {
  throw new Error("The complete unique T5-002 guard identifier list is required.");
}

const original = await readFile(sourcePath, "utf8");
try {
  for (const [id, before, after] of mutations) {
    if (!guardIds.includes(id)) throw new Error(`Unknown guard identifier: ${id}`);
    if (original.split(before).length !== 2) throw new Error(`Guard ${id} needs one stable source marker.`);
    await writeFile(sourcePath, original.replace(before, after));
    const build = spawnSync("npm", ["run", "build:test"], { encoding: "utf8" });
    let caught = build.status !== 0;
    if (!caught) {
      const focused = spawnSync("node", ["--test", focusedTest], { encoding: "utf8" });
      caught = focused.status !== 0;
    }
    if (!caught) throw new Error(`Guard mutation survived: ${id}`);
  }
} finally {
  await writeFile(sourcePath, original);
  const restored = await readFile(sourcePath, "utf8");
  if (restored !== original) throw new Error("T5-002 mutation harness did not restore the candidate source.");
}

console.log(`T5-002 mutation harness restored ${guardIds.length} focused mutations.`);
