import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const BUSINESS_DATE = 20260816;
const ALTERNATE_RESTAURANT_GUID = "00000000-0000-4000-8000-000000000003";
const REPORT_SERVER_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "stdio-report-server.js",
);

const CASH_SOURCE_IDS = [
  "fixture-cash-entries",
  "fixture-cash-deposits",
  "fixture-cash-drawers",
  "fixture-no-sale-reasons",
  "fixture-payout-reasons",
];
const LABOR_SOURCE_IDS = [
  "fixture-labor-time-entries",
  "fixture-labor-jobs",
  "fixture-labor-break-types",
  "fixture-labor-tip-withholding",
  "fixture-orders-page-1",
];
const SOURCE_PATHS = [
  "/cashmgmt/v1/entries",
  "/cashmgmt/v1/deposits",
  "/config/v2/cashDrawers",
  "/config/v2/noSaleReasons",
  "/config/v2/payoutReasons",
  "/labor/v1/timeEntries",
  "/labor/v1/jobs",
  "/config/v2/breakTypes",
  "/config/v2/tipWithholding",
  "/orders/v2/ordersBulk",
] as const;

test("cash and labor stdio reports record every source request ID", { timeout: 30_000 }, async () => {
  const connection = createConnection("success");
  const stderr = observeFixtureStderr(connection.transport);
  try {
    await connection.client.connect(connection.transport);
    const cash = await connection.client.callTool({
      name: "toast_cash_summary",
      arguments: { businessDate: BUSINESS_DATE },
    });
    assert.notEqual(cash.isError, true, `${JSON.stringify(cash.structuredContent)}\n${stderr.output()}`);
    const cashOutput = structured(cash.structuredContent);
    assert.equal(cashOutput.status, "complete");
    assert.deepEqual(
      structured(cashOutput.provenance).upstreamRequestIds.filter((value: unknown) =>
        CASH_SOURCE_IDS.includes(value as string)),
      CASH_SOURCE_IDS,
    );

    const labor = await connection.client.callTool({
      name: "toast_labor_summary",
      arguments: { businessDate: BUSINESS_DATE },
    });
    assert.notEqual(labor.isError, true, JSON.stringify(labor.structuredContent));
    const laborOutput = structured(labor.structuredContent);
    assert.equal(laborOutput.status, "complete");
    assert.deepEqual(
      structured(laborOutput.provenance).upstreamRequestIds.filter((value: unknown) =>
        LABOR_SOURCE_IDS.includes(value as string)),
      LABOR_SOURCE_IDS,
    );
  } finally {
    try {
      await connection.client.close();
    } finally {
      stderr.stop();
    }
  }
});

test("explicit accessible restaurantGuid binds both reports to the alternate restaurant", { timeout: 30_000 }, async () => {
  const connection = createConnection("alternate-restaurant");
  const stderr = observeFixtureStderr(connection.transport);
  const results: unknown[] = [];
  try {
    await connection.client.connect(connection.transport);
    for (const name of ["toast_cash_summary", "toast_labor_summary"] as const) {
      const result = await connection.client.callTool({
        name,
        arguments: {
          businessDate: BUSINESS_DATE,
          restaurantGuid: ALTERNATE_RESTAURANT_GUID,
        },
      });
      assert.notEqual(result.isError, true, name);
      const output = structured(result.structuredContent);
      assert.equal(output.status, "complete", name);
      assert.equal(output.restaurantGuid, ALTERNATE_RESTAURANT_GUID, name);
      assert.equal(output.restaurantName, "Synthetic Alternate Cafe", name);
      assert.equal(output.businessDate, BUSINESS_DATE, name);
      assert.equal(output.requestedBusinessDate, BUSINESS_DATE, name);
      assert.equal(output.effectiveBusinessDate, BUSINESS_DATE, name);
      assert.equal(output.timezone, "America/Chicago", name);
      assert.equal(output.currencyCode, "USD", name);
      assert.ok(Array.isArray(structured(output.contextProvenance).upstreamRequestIds), name);
      results.push(result);
    }
    const serialized = JSON.stringify(results);
    for (const marker of ["synthetic-signature", "Bearer", "synthetic-guest", "must-not-leak@example.invalid", "synthetic-employee", "raw-source", "synthetic-cash-card", "123456", "7890"]) {
      assert.equal(serialized.toLowerCase().includes(marker.toLowerCase()), false, marker);
    }
    for (const pathValue of SOURCE_PATHS) {
      assert.ok(
        stderr.output().includes(`fixture-request:${pathValue}:${ALTERNATE_RESTAURANT_GUID}`),
        `expected alternate restaurant header for ${pathValue}`,
      );
    }
  } finally {
    try {
      await connection.client.close();
    } finally {
      stderr.stop();
    }
  }
});

test("malformed later sources deny and stop the report", { timeout: 30_000 }, async () => {
  for (const [scenario, name, code, expectedPaths] of [
    ["malformed-cash-deposits", "toast_cash_summary", "cash_source_invalid", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits"]],
    ["malformed-cash-drawers", "toast_cash_summary", "cash_source_invalid", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers"]],
    ["malformed-cash-no-sale-reasons", "toast_cash_summary", "cash_source_invalid", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers", "/config/v2/noSaleReasons"]],
    ["malformed-cash-payout-reasons", "toast_cash_summary", "cash_source_invalid", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers", "/config/v2/noSaleReasons", "/config/v2/payoutReasons"]],
    ["malformed-labor-jobs", "toast_labor_summary", "labor_jobs_source_invalid", ["/labor/v1/timeEntries", "/labor/v1/jobs"]],
    ["malformed-labor-break-types", "toast_labor_summary", "labor_break_types_source_invalid", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes"]],
    ["malformed-labor-tip-withholding", "toast_labor_summary", "labor_tip_withholding_source_invalid", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes", "/config/v2/tipWithholding"]],
    ["malformed-labor-orders", "toast_labor_summary", "orders_source_invalid", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes", "/config/v2/tipWithholding", "/orders/v2/ordersBulk"]],
  ] as const) {
    const connection = createConnection(scenario);
    const stderr = observeFixtureStderr(connection.transport);
    try {
      await connection.client.connect(connection.transport);
      const result = await connection.client.callTool({ name, arguments: { businessDate: BUSINESS_DATE } });
      assert.equal(result.isError, true, scenario);
      assert.equal(structured(structured(result.structuredContent).denial).code, code, scenario);
      assert.deepEqual(sourceRequestPaths(stderr.output()), expectedPaths, scenario);
    } finally {
      try { await connection.client.close(); } finally { stderr.stop(); }
    }
  }
});

test("labor active output is incomplete and scope or source failures deny without totals", { timeout: 30_000 }, async () => {
  const active = createConnection("labor-active-entry");
  try {
    await active.client.connect(active.transport);
    const result = await active.client.callTool({
      name: "toast_labor_summary",
      arguments: { businessDate: BUSINESS_DATE },
    });
    assert.notEqual(result.isError, true);
    assert.equal(structured(result.structuredContent).status, "incomplete");
  } finally {
    await active.client.close();
  }

  for (const [scenario, name, absentTotal] of [
    ["missing-cash-scope", "toast_cash_summary", "cashEntryAmountMinor"],
    ["missing-labor-order-scope", "toast_labor_summary", "regularHours"],
    ["malformed-cash-source", "toast_cash_summary", "cashEntryAmountMinor"],
    ["malformed-labor-source", "toast_labor_summary", "regularHours"],
  ] as const) {
    const connection = createConnection(scenario);
    try {
      await connection.client.connect(connection.transport);
      const result = await connection.client.callTool({
        name,
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.equal(result.isError, true, scenario);
      const output = structured(result.structuredContent);
      assert.equal(output.status, "denied", scenario);
      assert.equal(absentTotal in output, false, scenario);
    } finally {
      await connection.client.close();
    }
  }
});

for (const [scenario, name, expectedPaths] of [
  ["cancel-cash-entries", "toast_cash_summary", ["/cashmgmt/v1/entries"]],
  ["cancel-cash-deposits", "toast_cash_summary", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits"]],
  ["cancel-cash-drawers", "toast_cash_summary", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers"]],
  ["cancel-cash-no-sale-reasons", "toast_cash_summary", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers", "/config/v2/noSaleReasons"]],
  ["cancel-cash-payout-reasons", "toast_cash_summary", ["/cashmgmt/v1/entries", "/cashmgmt/v1/deposits", "/config/v2/cashDrawers", "/config/v2/noSaleReasons", "/config/v2/payoutReasons"]],
  ["cancel-labor-time-entries", "toast_labor_summary", ["/labor/v1/timeEntries"]],
  ["cancel-labor-jobs", "toast_labor_summary", ["/labor/v1/timeEntries", "/labor/v1/jobs"]],
  ["cancel-labor-break-types", "toast_labor_summary", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes"]],
  ["cancel-labor-tip-withholding", "toast_labor_summary", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes", "/config/v2/tipWithholding"]],
  ["cancel-labor-orders", "toast_labor_summary", ["/labor/v1/timeEntries", "/labor/v1/jobs", "/config/v2/breakTypes", "/config/v2/tipWithholding", "/orders/v2/ordersBulk"]],
] as const) {
  test(`${scenario} aborts at its source stage and stops later requests`, { timeout: 20_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [REPORT_SERVER_PATH, scenario],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const stderr = observeFixtureStderr(transport);
    const client = createModernClient(`toast-t4-cancellation-${scenario}`);
    try {
      await client.connect(transport);
      await client.discover({ timeout: 5_000 });
      const controller = new AbortController();
      const marker = `${expectedPaths.at(-1)!.slice(1).replaceAll("/", "-")}-fetch`;
      const cancelled = client.callTool(
        { name, arguments: { businessDate: BUSINESS_DATE } },
        { signal: controller.signal, timeout: 5_000, toolDefinition: toolDefinition(name) },
      );
      await stderr.waitFor(`${marker}-started`);
      controller.abort("synthetic source-stage cancellation");
      await assert.rejects(cancelled);
      await stderr.waitFor(`${marker}-aborted`);
      assert.deepEqual(sourceRequestPaths(stderr.output()), expectedPaths, scenario);
    } finally {
      try {
        await client.close();
      } finally {
        stderr.stop();
      }
    }
  });
}

function createConnection(scenario: string): { readonly client: Client; readonly transport: StdioClientTransport } {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [REPORT_SERVER_PATH, scenario],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  return { client: createModernClient(`toast-t4-${scenario}`), transport };
}

function createModernClient(name: string): Client {
  return new Client(
    { name, version: "0.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
}

function toolDefinition(name: "toast_cash_summary" | "toast_labor_summary") {
  return {
    name,
    inputSchema: {
      type: "object" as const,
      properties: { businessDate: { type: "number" } },
      required: ["businessDate"],
      additionalProperties: false,
    },
  };
}

function structured(value: unknown): Record<string, any> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, any>;
}

function sourceRequestPaths(output: string): string[] {
  return output.split("\n")
    .filter((line) => line.startsWith("fixture-request:"))
    .map((line) => line.split(":")[1])
    .filter((pathValue): pathValue is string => SOURCE_PATHS.includes(pathValue as typeof SOURCE_PATHS[number]));
}

function observeFixtureStderr(transport: StdioClientTransport): {
  readonly output: () => string;
  readonly stop: () => void;
  readonly waitFor: (marker: string) => Promise<void>;
} {
  const stream = transport.stderr;
  assert.ok(stream !== null, "expected fixture stderr");
  let output = "";
  let resolveWaiter: (() => void) | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    resolveWaiter?.();
    resolveWaiter = undefined;
  };
  stream.on("data", onData);
  return {
    output: () => output,
    stop: () => stream.off("data", onData),
    waitFor: async (marker) => {
      while (!output.includes(marker)) {
        await new Promise<void>((resolve) => { resolveWaiter = resolve; });
      }
    },
  };
}
