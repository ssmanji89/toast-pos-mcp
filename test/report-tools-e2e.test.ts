import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const STDIO_CONNECT_TIMEOUT_MS = 10_000;
const REPORT_SERVER_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "stdio-report-server.js",
);
const BUSINESS_DATE = 20260816;
const INACCESSIBLE_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000009999";

type FixtureScenario =
  | "success"
  | "missing-scope"
  | "malformed-source"
  | "broken-pagination"
  | "cancel-active-report"
  | "rate-limit-wait";

test(
  "production-wired legacy stdio lists and calls both Standard report tools",
  { timeout: 30_000 },
  async () => {
    const connection = createConnection("legacy");
    try {
      await connectWithTimeout(connection);
      const listed = await connection.client.listTools();
      const names = listed.tools.map((tool) => tool.name).sort();
      assert.ok(names.includes("toast_sales_summary"));
      assert.ok(names.includes("toast_payment_summary"));

      const sales = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(sales.isError, true);
      const salesOutput = structured(sales.structuredContent);
      assert.equal(salesOutput.schemaVersion, 1);
      assert.equal(salesOutput.status, "complete");
      assert.equal(salesOutput.report, "sales_summary");
      assert.equal(salesOutput.restaurantName, "Synthetic Tool Cafe");
      assert.equal(salesOutput.requestedBusinessDate, BUSINESS_DATE);
      assert.equal(salesOutput.effectiveBusinessDate, BUSINESS_DATE);
      assert.equal(structured(salesOutput.contextFreshness).maxAgeMs, 21_600_000);
      assert.ok(Array.isArray(salesOutput.formulaNotes));
      const combined = structured(salesOutput.combined);
      assert.equal(combined.grossCheckAmountMinor, 1000);
      assert.equal(combined.netOrderAmountMinor, 900);
      // One selection satisfies both deferred and HOUSE_ACCOUNT_PAY_BALANCE;
      // Toast's exclusion predicate is OR, so its $1 price is deducted once.
      assert.equal(combined.netSalesMinor, 600);
      assert.equal(combined.ordersEmbeddedRefundAmountMinor, 200);
      assert.equal(combined.fundraisingContributionAmountMinor, 100);
      assert.equal(structured(salesOutput.future).orderCount, 0);
      assert.equal(structured(salesOutput.currentAndPast).orderCount, 1);
      assert.ok(!JSON.stringify(salesOutput).includes("must-not-leak"));

      const payments = await connection.client.callTool({
        name: "toast_payment_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(payments.isError, true);
      const paymentOutput = structured(payments.structuredContent);
      assert.equal(paymentOutput.schemaVersion, 1);
      assert.equal(paymentOutput.status, "complete");
      assert.equal(paymentOutput.report, "payment_summary");
      assert.equal(paymentOutput.restaurantName, "Synthetic Tool Cafe");
      assert.equal(paymentOutput.requestedBusinessDate, BUSINESS_DATE);
      assert.equal(paymentOutput.effectiveBusinessDate, BUSINESS_DATE);
      assert.equal(paymentOutput.eventListCount, 3);
      assert.equal(paymentOutput.paymentDetailsProcessed, 1);
      assert.equal(structured(paymentOutput.paid).amountMinor, 1000);
      assert.equal(structured(paymentOutput.paid).tipAmountMinor, 100);
      assert.equal(structured(paymentOutput.refunded).refundAmountMinor, 200);
      assert.equal(structured(paymentOutput.refunded).tipRefundAmountMinor, 50);
      assert.equal(structured(paymentOutput.voided).amountMinor, 1000);
      assert.equal(paymentOutput.uniquePaymentCount, 1);
      assert.ok(Array.isArray(paymentOutput.formulaNotes));
      assert.ok(!JSON.stringify(paymentOutput).includes("must-not-leak"));
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "production-wired pinned 2026-07-28 stdio exposes and calls a real report tool",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern");
    try {
      await connectWithTimeout(connection);
      const listed = await connection.client.listTools();
      assert.ok(listed.tools.some((tool) => tool.name === "toast_sales_summary"));

      const result = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      const output = structured(result.structuredContent);
      assert.equal(output.status, "complete");
      assert.equal(output.schemaVersion, 1);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "MCP input schema rejects impossible business dates before report orchestration",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("legacy");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: 20260230 },
      });
      assert.equal(result.isError, true);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "built stdio denies before Orders fetch when the required provisioned scope is missing",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied("missing-scope", {}, "capability_missing_scope");
  },
);

test(
  "built stdio denies an inaccessible restaurant instead of returning empty totals",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied(
      "success",
      { restaurantGuid: INACCESSIBLE_RESTAURANT_GUID },
      "runtime_restaurant_inaccessible",
    );
  },
);

test(
  "built stdio denies malformed Orders source instead of fabricating a complete report",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied("malformed-source", {}, "orders_source_invalid");
  },
);

test(
  "built stdio denies broken ordersBulk pagination instead of silently stopping early",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied(
      "broken-pagination",
      {},
      "pagination_integrity_failed",
    );
  },
);

test(
  "a nonzero-ID active report cancellation aborts Standard fetch and returns a structured denial",
  { timeout: 20_000 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [REPORT_SERVER_PATH, "cancel-active-report"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const stderr = observeFixtureStderr(transport);
    const client = new Client(
      { name: "toast-report-cancellation-test", version: "0.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    try {
      await client.connect(transport);
      await client.discover({ timeout: 5_000 });

      const controller = new AbortController();
      const cancelled = client.callTool(
        {
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATE },
        },
        {
          signal: controller.signal,
          timeout: 5_000,
          toolDefinition: {
            name: "toast_sales_summary",
            inputSchema: {
              type: "object",
              properties: { businessDate: { type: "number" } },
              required: ["businessDate"],
              additionalProperties: false,
            },
          },
        },
      );
      await stderr.waitFor("orders-fetch-started");
      controller.abort("synthetic active cancellation");
      await assert.rejects(cancelled);

      // `server/discover` consumes ID zero on this retained modern connection.
      // The active report request therefore uses a nonzero ID.
      await stderr.waitFor("orders-fetch-aborted");
      await client.discover({ timeout: 5_000 });
    } finally {
      try {
        await client.close();
      } finally {
        stderr.stop();
      }
    }
  },
);

test(
  "a stored upstream rate limit delays a later stdio report without bypassing report provenance",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("legacy", "rate-limit-wait");
    try {
      await connectWithTimeout(connection);
      const first = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.equal(first.isError, undefined);

      const startedAt = Date.now();
      const second = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs >= 900, `expected rate-limit delay, observed ${elapsedMs}ms`);
      assert.equal(second.isError, undefined);
      const output = structured(second.structuredContent);
      assert.equal(output.status, "complete");
      assert.equal(structured(output.combined).netSalesMinor, 600);
      assert.ok(
        structured(output.provenance)
          .upstreamRequestIds.includes("fixture-rate-limited-orders-2"),
      );
    } finally {
      await connection.client.close();
    }
  },
);

interface Connection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

function createConnection(
  era: "legacy" | "modern",
  scenario: FixtureScenario = "success",
): Connection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [REPORT_SERVER_PATH, scenario],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    {
      name: `toast-report-e2e-${era}-${scenario}`,
      version: "0.0.0",
    },
    era === "modern"
      ? {
          versionNegotiation: {
            mode: { pin: "2026-07-28" },
            probe: { timeoutMs: STDIO_CONNECT_TIMEOUT_MS },
          },
        }
      : { versionNegotiation: { mode: "legacy" } },
  );
  return { client, transport };
}

async function assertSalesDenied(
  scenario: FixtureScenario,
  extraArguments: Readonly<Record<string, unknown>>,
  expectedCode: string,
): Promise<void> {
  const connection = createConnection("legacy", scenario);
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_sales_summary",
      arguments: {
        businessDate: BUSINESS_DATE,
        ...extraArguments,
      },
    });
    assert.equal(result.isError, true);
    const output = structured(result.structuredContent);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.status, "denied");
    assert.equal(structured(output.denial).code, expectedCode);
    assert.equal("combined" in output, false);
  } finally {
    await connection.client.close();
  }
}

async function connectWithTimeout(connection: Connection): Promise<void> {
  await Promise.race([
    connection.client.connect(connection.transport),
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out connecting to synthetic report stdio server")),
        STDIO_CONNECT_TIMEOUT_MS,
      );
      timer.unref();
    }),
  ]);
}

function structured(value: unknown): Record<string, any> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, any>;
}

function observeFixtureStderr(transport: StdioClientTransport): {
  readonly waitFor: (marker: string) => Promise<void>;
  readonly stop: () => void;
} {
  const stream = transport.stderr;
  assert.ok(stream !== null, "expected fixture stderr");
  let output = "";
  let waiter: Deferred<void> | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    waiter?.resolve();
    waiter = undefined;
  };
  stream.on("data", onData);
  return {
    waitFor: async (marker: string): Promise<void> => {
      while (!output.includes(marker)) {
        waiter = deferred<void>();
        await waiter.promise;
      }
    },
    stop: () => stream.off("data", onData),
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((next) => { resolve = next; }),
    resolve,
  };
}
