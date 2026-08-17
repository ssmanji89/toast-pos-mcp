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
      assert.equal(salesOutput.status, "complete");
      assert.equal(salesOutput.report, "sales_summary");
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
      assert.equal(paymentOutput.status, "complete");
      assert.equal(paymentOutput.report, "payment_summary");
      assert.equal(structured(paymentOutput.paid).amountMinor, 1000);
      assert.equal(structured(paymentOutput.paid).tipAmountMinor, 100);
      assert.equal(structured(paymentOutput.refunded).refundAmountMinor, 200);
      assert.equal(structured(paymentOutput.refunded).tipRefundAmountMinor, 50);
      assert.equal(structured(paymentOutput.voided).amountMinor, 1000);
      assert.equal(paymentOutput.uniquePaymentCount, 1);
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
      assert.equal(structured(result.structuredContent).status, "complete");
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

interface Connection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

function createConnection(era: "legacy" | "modern"): Connection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [REPORT_SERVER_PATH],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    {
      name: `toast-report-e2e-${era}`,
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
