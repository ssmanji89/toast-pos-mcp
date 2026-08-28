import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repositoryRoot = process.cwd();
const mutationRoot = await mkdtemp(join(tmpdir(), "toast-pos-mcp-t6-public-wiring-"));
const indexPath = join(mutationRoot, "src/index.ts");
const serverPath = join(mutationRoot, "src/server.ts");
const reportToolsPath = join(mutationRoot, "src/report-tools.ts");

const focusedServerTest = "dist-test/test/server.test.js";
const focusedReportToolsTest = "dist-test/test/report-tools-e2e.test.js";
const guards = [
  ["legacy-runtime", "serves retained legacy 2025 requests through the production report runtime", indexPath, "runtime,\n    advertiseToolListChanged:", "advertiseToolListChanged:"],
  ["fresh-runtime", "production factory shares one startup runtime across protocol eras", indexPath, "runtime,\n    advertiseToolListChanged:", "runtime: createApplicationRuntime(),\n    advertiseToolListChanged:"],
  ["legacy-registration", "serves retained legacy 2025 requests through the production report runtime", serverPath, "if (options.runtime !== undefined) {", "if (options.runtime !== undefined && options.advertiseToolListChanged !== true) {"],
  ["request-signal", "a nonzero-ID active report cancellation aborts Standard fetch and returns a structured denial", reportToolsPath, "{ signal: ctx.mcpReq.signal },\n    )),\n  );\n\n  server.registerTool(\n    \"toast_payment_summary\"", "{ signal: new AbortController().signal },\n    )),\n  );\n\n  server.registerTool(\n    \"toast_payment_summary\""],
  ["complete-provenance", "tools/list advertises only the real Standard result branches", reportToolsPath, "provenance: requestProvenanceSchema,", "// provenance omitted"],
  ["sales-denied", "tools/list advertises only the real Standard result branches", reportToolsPath, "deniedStandardEnvelopeSchema.extend({ report: z.literal(\"sales_summary\") })", "completeStandardEnvelopeSchema.extend({ report: z.literal(\"sales_summary\") })"],
  ["payment-denied", "tools/list advertises only the real Standard result branches", reportToolsPath, "deniedStandardEnvelopeSchema.extend({ report: z.literal(\"payment_summary\") })", "completeStandardEnvelopeSchema.extend({ report: z.literal(\"payment_summary\") })"],
  ["item-denied", "tools/list advertises only the real Standard result branches", reportToolsPath, "deniedStandardEnvelopeSchema.extend({\n    report: z.literal(\"item_sales_summary\"),", "completeStandardEnvelopeSchema.extend({\n    report: z.literal(\"item_sales_summary\"),"],
  ["cash-denied", "tools/list advertises only the real Standard result branches", reportToolsPath, "deniedStandardEnvelopeSchema.extend({ report: z.literal(\"cash_summary\") })", "completeStandardEnvelopeSchema.extend({ report: z.literal(\"cash_summary\") })"],
  ["labor-incomplete", "tools/list advertises only the real Standard result branches", reportToolsPath, "status: z.literal(\"incomplete\"),", "status: z.literal(\"complete\"),"],
  ["labor-denied", "tools/list advertises only the real Standard result branches", reportToolsPath, "deniedStandardEnvelopeSchema.extend({ report: z.literal(\"labor_summary\") })", "completeStandardEnvelopeSchema.extend({ report: z.literal(\"labor_summary\") })"],
  ["report-literal", "tools/list advertises only the real Standard result branches", reportToolsPath, "report: z.literal(\"sales_summary\"),", "report: z.string().min(1),"],
  ["denial-required", "tools/list advertises only the real Standard result branches", reportToolsPath, "missingScopes: z.array(z.string()),", "missingScopes: z.array(z.string()).optional(),"],
  ["item-dimension-required", "tools/list advertises only the real Standard result branches", reportToolsPath, "dimension: z.string().min(1),", "dimension: z.string().min(1).optional(),"],
];

if (new Set(guards.map(([id]) => id)).size !== guards.length) {
  throw new Error("The complete unique T6 public-wiring guard list is required.");
}

try {
  run("git", ["worktree", "add", "--detach", mutationRoot, "HEAD"], repositoryRoot);
  run("npm", ["ci", "--no-audit", "--no-fund"], mutationRoot);
  const originals = new Map(await Promise.all(
    [indexPath, serverPath, reportToolsPath].map(async (file) => [file, await readFile(file, "utf8")]),
  ));

  for (const [id, testName, file, before, after] of guards) {
    const original = originals.get(file);
    if (original === undefined || original.split(before).length !== 2) {
      throw new Error(`Guard ${id} needs one unique source marker.`);
    }
    await writeFile(file, original.replace(before, after));
    try {
      run("npm", ["run", "build"], mutationRoot);
      run("npm", ["run", "build:test"], mutationRoot);
      const focusedTest = file === indexPath || file === serverPath
        ? focusedServerTest
        : focusedReportToolsTest;
      const result = spawnSync(
        "node",
        ["--test", "--test-name-pattern", `^${escapeRegularExpression(testName)}$`, focusedTest],
        { cwd: mutationRoot, encoding: "utf8" },
      );
      const output = `${result.stdout}\n${result.stderr}`;
      if (!output.includes(testName)) throw new Error(`Guard ${id} did not run its named behavioral test.`);
      if (result.status === 0) throw new Error(`Guard mutation survived: ${id}`);
    } finally {
      await writeFile(file, original);
    }
  }

  run("npm", ["run", "build"], mutationRoot);
  run("npm", ["run", "build:test"], mutationRoot);
  run("node", ["--test", focusedServerTest, focusedReportToolsTest], mutationRoot);
  run("git", ["diff", "--exit-code", "--", "src/index.ts", "src/server.ts", "src/report-tools.ts"], mutationRoot);
} finally {
  spawnSync("git", ["worktree", "remove", "--force", mutationRoot], { cwd: repositoryRoot, encoding: "utf8" });
  await rm(mutationRoot, { recursive: true, force: true });
}

console.log(`T6 public-wiring mutation harness caught ${guards.length} compiling behavioral mutations in an isolated worktree.`);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
}

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
