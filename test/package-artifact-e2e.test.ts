import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const BUSINESS_DATE = 20260816;
const RUNTIME_MARKER = "installed-artifact-fetch-preload-ready";
const ROUTE_REJECT_MARKER = "installed-artifact-fetch-route-rejected";
const PRELOAD_SOURCE = path.resolve(
  process.cwd(),
  "dist-test/test/fixtures/installed-artifact-fetch-preload.js",
);
const MODULES = [
  "analytics-access", "analytics-report-jobs", "analytics-report-tools", "auth",
  "capabilities", "cash-report-fold", "cash-report-limits", "cash-report-source",
  "cash-report", "config", "dimension-context-helpers", "dimension-context",
  "dimension-menu-normalization", "exact-decimal", "index", "item-sales-aggregation",
  "item-sales-report", "labor-report-source", "labor-report", "locations",
  "accepted-request-transport", "mcp-request-cancellation",
  "orders-normalization-helpers", "orders-normalization-source",
  "orders-normalization-traversal", "orders-normalization-types", "orders-normalization",
  "payment-report", "rate-limit", "rate-limited-client", "report-contract", "report-core",
  "report-tools", "runtime", "sales-cross-page-identity", "sales-report", "server",
  "stdio", "transport",
] as const;
const EXPECTED_TAR_PATHS = [
  "package/LICENSE",
  "package/README.md",
  "package/package.json",
  ...MODULES.flatMap((moduleName) => [
    `package/dist/${moduleName}.d.ts`,
    `package/dist/${moduleName}.d.ts.map`,
    `package/dist/${moduleName}.js`,
    `package/dist/${moduleName}.js.map`,
  ]),
].sort();
const EXPECTED_NPM_PATHS = EXPECTED_TAR_PATHS.map((entry) => entry.slice("package/".length));
const EXPECTED_TOOLS = [
  "toast_analytics_metrics_day",
  "toast_cash_summary",
  "toast_item_sales_summary",
  "toast_labor_summary",
  "toast_payment_summary",
  "toast_sales_summary",
];

test("the npm artifact installs in an empty consumer and runs only through its installed bin", { timeout: 90_000 }, async () => {
  const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "toast-pos-mcp-artifact-"));
  const consumerDirectory = await mkdtemp(path.join(os.tmpdir(), "toast-pos-mcp-consumer-"));
  let client: Client | undefined;
  try {
    // npm prepack cleans dist-test. Preserve the GREEN preload outside the
    // repository before either pack command can run.
    const copiedPreload = path.join(artifactDirectory, "installed-artifact-fetch-preload.js");
    if (existsSync(PRELOAD_SOURCE)) await copyFile(PRELOAD_SOURCE, copiedPreload);
    const dryRun = JSON.parse(await runNpm(["pack", "--dry-run", "--json"], process.cwd()));
    assert.equal(Array.isArray(dryRun), true, "npm pack dry-run must return one JSON entry");
    assert.deepEqual(sortedPaths(dryRun[0]?.files), EXPECTED_NPM_PATHS);

    const packed = JSON.parse(await runNpm([
      "pack", "--json", "--pack-destination", artifactDirectory,
    ], process.cwd()));
    const tarballPath = path.join(artifactDirectory, String(packed[0]?.filename));
    assert.equal(existsSync(tarballPath), true, "npm pack must create the declared tarball");
    assert.deepEqual(sortedLines(await run("tar", ["-tzf", tarballPath], artifactDirectory)), EXPECTED_TAR_PATHS);
    assert.equal(createHash("sha256").update(await readFile(tarballPath)).digest("hex").length, 64);

    await runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], consumerDirectory);
    const installedBin = path.join(consumerDirectory, "node_modules", ".bin", "toast-pos-mcp");
    assert.equal(existsSync(installedBin), true, "consumer must use its installed package bin");

    // The GREEN fixture is copied before npm prepack removes dist-test. During RED,
    // this source is absent and the installed process fails to load it.
    const preloadPath = existsSync(copiedPreload) ? copiedPreload : PRELOAD_SOURCE;

    const transport = new StdioClientTransport({
      command: installedBin,
      args: [],
      cwd: consumerDirectory,
      stderr: "pipe",
      env: childEnvironment(preloadPath),
    });
    const stderr = observeStderr(transport);
    client = new Client(
      { name: "toast-package-artifact-e2e", version: "0.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" }, probe: { timeoutMs: 10_000 } } },
    );
    let connectionError: unknown;
    const connection = client.connect(transport).catch((error: unknown) => {
      connectionError = error;
    });
    await stderr.waitFor(RUNTIME_MARKER);
    assert.equal(connectionError, undefined, "installed bin must remain available after preload startup");
    assert.ok(stderr.output().includes(`execPath=${process.execPath}`));
    assert.ok(stderr.output().includes(`version=${process.version}`));
    await connection;

    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), EXPECTED_TOOLS);
    const sales = await client.callTool({
      name: "toast_sales_summary",
      arguments: { businessDate: BUSINESS_DATE },
    });
    assert.notEqual(sales.isError, true, JSON.stringify(sales.structuredContent));
    const salesOutput = structured(sales.structuredContent);
    assert.equal(salesOutput.schemaVersion, 1);
    assert.equal(salesOutput.status, "complete");
    assert.equal(salesOutput.source, "standard_api");
    assert.equal(salesOutput.report, "sales_summary");

    const analytics = await client.callTool({
      name: "toast_analytics_metrics_day",
      arguments: {
        restaurantGuid: "00000000-0000-4000-8000-000000000002",
        businessDate: BUSINESS_DATE,
      },
    });
    const analyticsOutput = structured(analytics.structuredContent);
    assert.ok(analyticsOutput.status === "denied" || analyticsOutput.status === "incomplete");
    assert.equal("resultRows" in analyticsOutput, false);
    assert.equal("rawBody" in analyticsOutput, false);
    assert.equal(stderr.output().includes(ROUTE_REJECT_MARKER), false);
    stderr.stop();
  } finally {
    try { await client?.close(); } catch { /* process startup is the expected RED failure. */ }
    await rm(artifactDirectory, { recursive: true, force: true });
    await rm(consumerDirectory, { recursive: true, force: true });
  }
});

function childEnvironment(preloadPath: string): Record<string, string> {
  return {
    TOAST_API_HOSTNAME: "ws-api.installed-artifact-fixture.invalid",
    TOAST_CLIENT_ID: "installed-artifact-client",
    TOAST_CLIENT_SECRET: "installed-artifact-secret-not-a-real-secret",
    TOAST_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
    TOAST_DEFAULT_RESTAURANT_GUID: "00000000-0000-4000-8000-000000000002",
    TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: "true",
    NODE_OPTIONS: `--import ${preloadPath}`,
    PATH: path.dirname(process.execPath),
  };
}

async function runNpm(args: readonly string[], cwd: string): Promise<string> {
  return run("npm", args, cwd);
}

async function run(command: string, args: readonly string[], cwd: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (status) => status === 0 ? resolve(stdout) : reject(new Error(`${command} failed with ${status}: ${stderr}`)));
  });
}

function sortedPaths(files: unknown): string[] {
  assert.ok(Array.isArray(files));
  return files.map((entry) => String(structured(entry).path)).sort();
}

function sortedLines(value: string): string[] {
  return value.split("\n").filter(Boolean).sort();
}

function structured(value: unknown): Record<string, any> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, any>;
}

function observeStderr(transport: StdioClientTransport): { output(): string; waitFor(marker: string): Promise<void>; stop(): void } {
  const stream = transport.stderr;
  assert.ok(stream !== null, "installed bin must expose stderr");
  let output = "";
  let wake: (() => void) | undefined;
  const onData = (chunk: Buffer | string): void => { output += chunk.toString(); wake?.(); wake = undefined; };
  stream.on("data", onData);
  return {
    output: () => output,
    waitFor: async (marker) => {
      while (!output.includes(marker)) {
        await Promise.race([
          new Promise<void>((resolve) => { wake = resolve; }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`missing stderr marker ${marker}: ${output}`)), 10_000)),
        ]);
      }
    },
    stop: () => stream.off("data", onData),
  };
}
