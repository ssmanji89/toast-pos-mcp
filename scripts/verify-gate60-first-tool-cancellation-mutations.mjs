import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const candidateHead = runOutput("git", ["rev-parse", "HEAD"], repositoryRoot);
const firstToolTest = "dist-test/test/first-tool-cancellation-e2e.test.js";
const paths = {
  bridge: "src/mcp-request-cancellation.ts",
  accepted: "src/accepted-request-transport.ts",
  standard: "src/report-tools.ts",
  analytics: "src/analytics-report-tools.ts",
};

const guards = [
  guard("modern-id-zero", "modern official stdio client preserves actual request IDs and cancels first and later report requests through the production executable", paths.bridge, "if (requestId === undefined) return;", "if (!requestId) return;"),
  guard("legacy-nonzero-dispatch", "legacy official stdio client preserves actual request IDs and cancels first and later report requests through the production executable", paths.bridge, "if (acceptedRequests.markCancelled(requestId)) {", "if (acceptedRequests.markCancelled(requestId)) {\n      if (activeControllers.get(requestId) !== undefined) return;"),
  guard("exact-request-id", "coalesced legacy initialized, tools/call ID one, and cancellation abort before tool source access", paths.accepted, "return this.#accepted.get(requestId) === true;", "return this.#accepted.get(\"invented-wrong-request-id\") === true;"),
  guard("duplicate-active-id", "duplicate active report IDs are dropped before a second handler and cancellation cleans the first request", paths.accepted, "if (this.#accepted.has(message.id)) return false;", "if (false) return false;"),
  guard("combined-signal", "modern official stdio client preserves actual request IDs and cancels first and later report requests through the production executable", paths.bridge, "signal: combinedController.signal,", "signal: context.mcpReq.signal,"),
  guard("active-controller-cleanup", "modern official stdio client preserves actual request IDs and cancels first and later report requests through the production executable", paths.bridge, "activeControllers.delete(requestId);", "void requestId;"),
  guard("relay-listener-cleanup", "modern official stdio client preserves actual request IDs and cancels first and later report requests through the production executable", paths.bridge, "relayListeners -= 2;", "relayListeners -= 1;"),
  ...registrationGuards(paths.standard, [
    "toast_sales_summary",
    "toast_payment_summary",
    "toast_item_sales_summary",
    "toast_cash_summary",
    "toast_labor_summary",
  ]),
  ...registrationGuards(paths.analytics, ["toast_analytics_metrics_day"]),
];
const requestedGuard = process.env.GATE60_MUTATION_GUARD;
const selectedGuards = requestedGuard === undefined
  ? guards
  : guards.filter(({ id }) => id === requestedGuard);

if (new Set(guards.map(({ id }) => id)).size !== guards.length) {
  throw new Error("Each Gate 60 mutation guard needs a unique ID.");
}
if (requestedGuard !== undefined && selectedGuards.length !== 1) {
  throw new Error("GATE60_MUTATION_GUARD must name one known guard.");
}

for (const mutation of selectedGuards) {
  await verifyMutation(mutation);
}

run("git", ["diff", "--check"], repositoryRoot);
run("git", ["diff", "--quiet"], repositoryRoot);
run("git", ["diff", "--cached", "--quiet"], repositoryRoot);
console.log(`Gate 60 mutation harness caught ${selectedGuards.length} compiling behavioral mutations in isolated worktrees.`);

function guard(id, testName, file, before, after) {
  return Object.freeze({ id, testName, file, before, after });
}

function registrationGuards(file, names) {
  return names.map((name) => guard(
    `registration-${name}`,
    `legacy compiled registration wrapper: ${name}`,
    file,
    `cancellationBridge.wrap(\"${name}\",`,
    `(function<T>(_toolName: unknown, callback: T): T { return callback; })(\"${name}\",`,
  ));
}

async function verifyMutation({ id, testName, file, before, after }) {
  const mutationRoot = await mkdtemp(join(tmpdir(), `toast-pos-mcp-gate60-${id}-`));
  const mutationPath = join(mutationRoot, file);
  try {
    run("git", ["worktree", "add", "--detach", mutationRoot, candidateHead], repositoryRoot);
    run("npm", ["ci", "--no-audit", "--no-fund"], mutationRoot);
    const original = await readFile(mutationPath, "utf8");
    if (original.split(before).length !== 2) {
      throw new Error(`Guard ${id} needs one unique source marker.`);
    }
    await writeFile(mutationPath, original.replace(before, after));
    try {
      run("npm", ["run", "build"], mutationRoot);
      run("npm", ["run", "build:test"], mutationRoot);
      const result = spawnSync(
        "node",
        ["--test", "--test-name-pattern", `^${escapeRegularExpression(testName)}$`, firstToolTest],
        {
          cwd: mutationRoot,
          encoding: "utf8",
          env: { ...process.env, GATE60_PROTOCOL_TIMEOUT_MS: "500" },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      if (!output.includes(testName)) {
        throw new Error(`Guard ${id} did not run its named executable test.`);
      }
      if (result.status === 0) {
        throw new Error(`Gate 60 mutation survived: ${id}`);
      }
    } finally {
      await writeFile(mutationPath, original);
    }
    run("npm", ["run", "build"], mutationRoot);
    run("npm", ["run", "build:test"], mutationRoot);
    run("node", ["--test", firstToolTest], mutationRoot);
    run("git", ["diff", "--check"], mutationRoot);
    run("git", ["diff", "--quiet"], mutationRoot);
    run("git", ["diff", "--cached", "--quiet"], mutationRoot);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", mutationRoot], { cwd: repositoryRoot, encoding: "utf8" });
    await rm(mutationRoot, { recursive: true, force: true });
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed for ${cwd}:\n${result.stdout}\n${result.stderr}`);
  }
}

function runOutput(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed for ${cwd}:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
