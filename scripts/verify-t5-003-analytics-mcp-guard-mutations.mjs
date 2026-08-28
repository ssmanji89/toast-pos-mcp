import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const mutationRoot = await mkdtemp(join(tmpdir(), "toast-pos-mcp-t5-003-"));
const toolPath = join(mutationRoot, "src/analytics-report-tools.ts");
const serverPath = join(mutationRoot, "src/server.ts");
const fixturePath = join(mutationRoot, "test/fixtures/stdio-analytics-report-server.ts");
const focusedTest = "dist-test/test/analytics-report-tools-stdio.test.js";

const guards = [
  ["tool-registration", "Analytics tool registration exposes one fixed metrics-day tool", serverPath, "registerAnalyticsReportTools(server, options.runtime);", "void options.runtime;"],
  ["one-guid-and-date", "Analytics tool requires one UUID restaurant and one real numeric business date", toolPath, "z.string().uuid().describe", "z.string().describe"],
  ["runtime-only-authority", "Analytics tool denies absent capability or inaccessible selection before Metrics job access", toolPath, '"analytics_runtime_unavailable"));', '"analytics_failed_or_incomplete"));'],
  ["preflight-before-business-data", "Analytics tool denies absent capability or inaccessible selection before Metrics job access", toolPath, "const registry = await access.refreshManagementGroupRestaurants({ signal });", "const registry = access.currentRegistry()!;"],
  ["selection-membership", "Analytics tool uses only the closed Metrics/day lifecycle input", toolPath, "[input.restaurantGuid]);", "[input.restaurantGuid, input.restaurantGuid]);"],
  ["closed-metrics-day-input", "Analytics tool uses only the closed Metrics/day lifecycle input", toolPath, 'operation: "metrics",\n          timeRange: "day",', 'operation: "menu",\n          timeRange: "day",'],
  ["equal-business-dates", "Analytics tool uses only the closed Metrics/day lifecycle input", toolPath, "endBusinessDate: String(input.businessDate),", "endBusinessDate: String(input.businessDate + 1),"],
  ["route-method-catalog", "Analytics tool uses only the closed Metrics/day lifecycle input", fixturePath, 'url.pathname === "/era/v1/metrics/day" && method === "POST"', 'url.pathname === "/era/v1/menu/day" && method === "POST"'],
  ["no-standard-header", "Analytics tool uses only the closed Metrics/day lifecycle input", fixturePath, "const headerNames = [...headers.keys()].sort();", 'const headerNames = [...headers.keys(), "toast-restaurant-external-id"].sort();'],
  ["no-grouping-inactive-name-settings", "Analytics tool preserves public lifecycle provenance and informational non-GAAP scope", toolPath, '"grouping",', '"grouped",'],
  ["analytics-source-label", "Analytics tool uses only the closed Metrics/day lifecycle input", toolPath, 'source: "analytics_api" as const,', 'source: "standard_api" as never,'],
  ["informational-non-gaap", "Analytics tool preserves public lifecycle provenance and informational non-GAAP scope", toolPath, "Analytics output is informational and non-GAAP.", "Analytics output is informational."],
  ["body-free-provenance", "Analytics terminal states publish only body-free denied or incomplete envelopes", toolPath, "formulaNote,\n  };", 'formulaNote,\n    rawBody: "synthetic-raw-body",\n  };'],
  ["200-schema-gate", "Analytics terminal states publish only body-free denied or incomplete envelopes", toolPath, '"analytics_result_schema_unverified"', '"analytics_completed_schema"'],
  ["no-complete-branch", "Analytics terminal states publish only body-free denied or incomplete envelopes", toolPath, "status: lifecycle.completeness.state,", 'status: "complete" as never,'],
  ["guest-payment-exclusion", "Analytics tool preserves public lifecycle provenance and informational non-GAAP scope", toolPath, '"guest_linked_data",', '"guest_data",'],
  ["report-guid-exclusion", "Analytics terminal states publish only body-free denied or incomplete envelopes", toolPath, "formulaNote,\n  };", 'formulaNote,\n    reportRequestId: "synthetic-report-guid",\n  };'],
  ["cancellation-propagation", "Analytics tool propagates nonzero MCP cancellation without publishing an envelope", fixturePath, 'console.error("analytics-fetch-aborted");', 'console.error("analytics-fetch-not-aborted");'],
];
const requestedBatch = process.env.T5_GUARD_BATCH;
const selectedGuards = requestedBatch === undefined
  ? guards
  : guards.filter((_, index) => (
    requestedBatch === "first" ? index < 9
      : requestedBatch === "third" ? index >= 9 && index < 14
        : requestedBatch === "fourth" ? index >= 14
          : false
  ));

if (new Set(guards.map(([id]) => id)).size !== guards.length) {
  throw new Error("The complete unique T5-003 guard identifier list is required.");
}
if (requestedBatch !== undefined && !["first", "third", "fourth"].includes(requestedBatch)) {
  throw new Error("T5_GUARD_BATCH must be first, third, or fourth when it is set.");
}

try {
  const worktree = spawnSync("git", ["worktree", "add", "--detach", mutationRoot, "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (worktree.status !== 0) throw new Error("T5-003 mutation harness could not create its temporary worktree.");
  const install = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: mutationRoot,
    encoding: "utf8",
  });
  if (install.status !== 0) throw new Error("T5-003 mutation harness could not restore locked dependencies in its temporary worktree.");
  const originals = new Map(await Promise.all([toolPath, serverPath, fixturePath].map(async (path) => [path, await readFile(path, "utf8")] )));
  for (const [id, testName, path, before, after] of selectedGuards) {
    const original = originals.get(path);
    if (original === undefined || original.split(before).length !== 2) {
      throw new Error(`Guard ${id} needs one unique source marker.`);
    }
    await writeFile(path, original.replace(before, after));
    try {
      const build = spawnSync("npm", ["run", "build:test"], { cwd: mutationRoot, encoding: "utf8" });
      if (build.status !== 0) throw new Error(`Guard mutation broke TypeScript compilation: ${id}`);
      const focused = spawnSync("node", ["--test", "--test-name-pattern", `^${escapeRegularExpression(testName)}$`, focusedTest], { cwd: mutationRoot, encoding: "utf8" });
      const output = `${focused.stdout}\n${focused.stderr}`;
      if (!output.includes(testName)) throw new Error(`Guard ${id} did not run its named behavioral test.`);
      if (focused.status === 0) throw new Error(`Guard mutation survived: ${id}`);
    } finally {
      await writeFile(path, original);
    }
  }
  const finalBuild = spawnSync("npm", ["run", "build:test"], { cwd: mutationRoot, encoding: "utf8" });
  if (finalBuild.status !== 0) throw new Error("Restored temporary candidate did not compile.");
  const finalTest = spawnSync("node", ["--test", focusedTest], { cwd: mutationRoot, encoding: "utf8" });
  if (finalTest.status !== 0) throw new Error("Restored temporary candidate did not pass its focused suite.");
  const sourceDiff = spawnSync("git", ["diff", "--exit-code", "--", "src/analytics-report-tools.ts", "src/server.ts", "test/fixtures/stdio-analytics-report-server.ts"], { cwd: mutationRoot, encoding: "utf8" });
  if (sourceDiff.status !== 0) throw new Error("T5-003 mutation harness left a temporary candidate source diff.");
} finally {
  spawnSync("git", ["worktree", "remove", "--force", mutationRoot], { cwd: repositoryRoot, encoding: "utf8" });
  await rm(mutationRoot, { recursive: true, force: true });
}
console.log(`T5-003 mutation harness caught ${selectedGuards.length} compiling behavioral mutations in an isolated worktree.`);

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
