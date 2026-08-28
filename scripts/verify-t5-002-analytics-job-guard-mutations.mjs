import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../src/analytics-report-jobs.ts", import.meta.url);
const focusedTest = "dist-test/test/analytics-report-jobs.test.js";

const guards = [
  ["closed-catalog", "Analytics report jobs use exactly the six reviewed create and retrieval routes", "return `/era/v1/payout/sales-date/${encodedId}`;", "return `/era/v1/payout/payments/${encodedId}`;"],
  ["opaque-create-id", "Analytics report jobs reject malformed create identifiers without publishing a descriptor", "payload.length > MAX_REPORT_REQUEST_ID_LENGTH", "payload.length > 1"],
  ["completed-body-g05", "Analytics report jobs retain only an opaque bounded create identifier and body-free statuses", "return Object.freeze({ status: \"complete\", resultContract: \"unavailable\" });", "return Object.freeze({ status: \"failed_or_incomplete\" });"],
  ["pending-budget", "Analytics report lifecycle exhausts its local pending budget and cancels without later turns", "export const ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS = 30;", "export const ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS = 1;"],
  ["invalid-or-expired", "Analytics report lifecycle returns invalid-or-expired and bounds conflict replacements", "case 404:\n      return Object.freeze({ status: \"invalid_or_expired\" });", "case 404:\n      return Object.freeze({ status: \"failed_or_incomplete\" });"],
  ["replacement-budget", "Analytics report lifecycle returns invalid-or-expired and bounds conflict replacements", "export const ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS = 1;", "export const ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS = 0;"],
  ["capability-envelope", "Analytics lifecycle maps capability and source failures to immutable safe envelopes", "? \"capability_denied\"\n        : \"failed_or_incomplete\"", "? \"failed_or_incomplete\"\n        : \"capability_denied\""],
  ["source-failure-envelope", "Analytics lifecycle maps capability and source failures to immutable safe envelopes", "const status = error instanceof AnalyticsReportJobError && error.code === \"analytics_report_job_capability_denied\"\n        ? \"capability_denied\"\n        : \"failed_or_incomplete\";", "const status = \"capability_denied\";"],
  ["post-window", "Analytics lifecycle enforces all documented endpoint windows atomically", "Object.freeze({ maxRequests: 10, windowMs: 60_000 }),", "Object.freeze({ maxRequests: 1, windowMs: 60_000 }),"],
  ["retrieval-second-window", "Analytics lifecycle enforces all documented endpoint windows atomically", "Object.freeze({ maxRequests: 30, windowMs: 60_000 }),", "Object.freeze({ maxRequests: 1, windowMs: 60_000 }),"],
  ["retry-after", "Analytics lifecycle retries a bounded 429 create turn using Retry-After", "if (headerDelay !== undefined) return Math.min(headerDelay, ANALYTICS_REPORT_JOB_MAX_429_WAIT_MS);", "if (headerDelay !== undefined) return 1;"],
  ["retry-budget", "Analytics lifecycle retries a bounded 429 create turn using Retry-After", "export const ANALYTICS_REPORT_JOB_MAX_429_RETRIES = 2;", "export const ANALYTICS_REPORT_JOB_MAX_429_RETRIES = 0;"],
  ["g02-inactive-option", "Analytics report jobs use exactly the six reviewed create and retrieval routes", "excludedRestaurantIds: [] as const,", "excludedRestaurantIds: [\"inactive\"] as const,"],
  ["safe-request-id", "Analytics lifecycle maps poll and replacement failures without retaining source bodies", "const requestId = safeRequestId(response);\n      return Object.freeze({ status: classifyAnalyticsReportJobRetrievalStatus(response.status), ...(requestId === undefined ? {} : { requestId }) });", "const requestId = undefined;\n      return Object.freeze({ status: classifyAnalyticsReportJobRetrievalStatus(response.status), ...(requestId === undefined ? {} : { requestId }) });"],
  ["failed-post-safe-request-id", "Analytics lifecycle retains safe IDs from failed create and replacement turns", "if (requestId !== undefined) responseRequestIds.push(requestId);", "if (requestId !== undefined) void requestId;"],
];

if (new Set(guards.map(([id]) => id)).size !== guards.length) {
  throw new Error("The complete unique T5-002 guard identifier list is required.");
}

const original = await readFile(sourcePath, "utf8");
try {
  for (const [id, testName, before, after] of guards) {
    if (original.split(before).length !== 2) throw new Error(`Guard ${id} needs one unique source marker.`);
    await writeFile(sourcePath, original.replace(before, after));
    const build = spawnSync("npm", ["run", "build:test"], { encoding: "utf8" });
    if (build.status === 0) {
      const exactPattern = `^${escapeRegularExpression(testName)}$`;
      const focused = spawnSync("node", ["--test", "--test-name-pattern", exactPattern, focusedTest], { encoding: "utf8" });
      const output = `${focused.stdout}\n${focused.stderr}`;
      if (!output.includes(testName)) throw new Error(`Guard ${id} did not run its named behavioral test.`);
      if (focused.status === 0) throw new Error(`Guard mutation survived: ${id}`);
    } else {
      throw new Error(`Guard mutation broke TypeScript compilation: ${id}`);
    }
  }
} finally {
  await writeFile(sourcePath, original);
  if (await readFile(sourcePath, "utf8") !== original) throw new Error("T5-002 mutation harness did not restore the candidate source.");
}

const finalBuild = spawnSync("npm", ["run", "build:test"], { encoding: "utf8" });
if (finalBuild.status !== 0) throw new Error("Restored candidate did not compile.");
const finalTest = spawnSync("node", ["--test", focusedTest], { encoding: "utf8" });
if (finalTest.status !== 0) throw new Error("Restored candidate did not pass its focused suite.");
const treeDiff = spawnSync("git", ["diff", "--exit-code", "--", "src/analytics-report-jobs.ts", "test/analytics-report-jobs.test.ts", "scripts/verify-t5-002-analytics-job-guard-mutations.mjs", "docs/verification/t5-002-analytics-job-guard-matrix.md"], { encoding: "utf8" });
if (treeDiff.status !== 0) throw new Error("T5-002 mutation harness left a candidate tree diff.");
console.log(`T5-002 mutation harness caught ${guards.length} compiling behavioral mutations and restored the source.`);

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
