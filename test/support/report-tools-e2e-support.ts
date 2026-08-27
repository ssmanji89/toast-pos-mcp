import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import type { FixtureScenario as ReportFixtureScenario } from "../fixtures/stdio-report-data.js";

export const STDIO_CONNECT_TIMEOUT_MS = 10_000;
export const REPORT_SERVER_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "stdio-report-server.js",
);
export const BUSINESS_DATE = 20260816;
export const RESTAURANT_GUID = "00000000-0000-4000-8000-000000000002";
export const INACCESSIBLE_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000009999";
export const ITEM_GUID = "00000000-0000-4000-8000-000000000811";
export const SECOND_ITEM_GUID = "00000000-0000-4000-8000-000000000812";
export const SALES_CATEGORY_GUID = "00000000-0000-4000-8000-000000000814";
export const TAG_LUNCH_GUID = "00000000-0000-4000-8000-000000000818";
export const TAG_UNKNOWN_GUID = "00000000-0000-4000-8000-000000000819";

export type FixtureScenario = ReportFixtureScenario;


interface Connection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

export function createConnection(
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

export async function assertSalesDenied(
  scenario: FixtureScenario,
  extraArguments: Readonly<Record<string, unknown>>,
  expectedCode: string,
): Promise<void> {
  const connection = createConnection("modern", scenario);
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

export async function assertReportDenied(
  scenario: FixtureScenario,
  name: "toast_cash_summary" | "toast_labor_summary",
  expectedCode: string,
  absentTotal: string,
): Promise<void> {
  const connection = createConnection("modern", scenario);
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name,
      arguments: { businessDate: BUSINESS_DATE },
    });
    assert.equal(result.isError, true, scenario);
    const output = structured(result.structuredContent);
    assert.equal(output.status, "denied", scenario);
    assert.equal(structured(output.denial).code, expectedCode, scenario);
    assert.equal(absentTotal in output, false, scenario);
  } finally {
    await connection.client.close();
  }
}

export async function assertCancelledReport(
  scenario: FixtureScenario,
  name: "toast_cash_summary" | "toast_labor_summary",
  marker: string,
): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [REPORT_SERVER_PATH, scenario],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const stderr = observeFixtureStderr(transport);
  const client = new Client(
    { name: `toast-report-cancellation-${name}`, version: "0.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(transport);
    await client.discover({ timeout: 5_000 });
    const controller = new AbortController();
    const cancelled = client.callTool(
      {
        name,
        arguments: { businessDate: BUSINESS_DATE },
      },
      {
        signal: controller.signal,
        timeout: 5_000,
        toolDefinition: {
          name,
          inputSchema: {
            type: "object",
            properties: { businessDate: { type: "number" } },
            required: ["businessDate"],
            additionalProperties: false,
          },
        },
      },
    );
    await stderr.waitFor(`${marker}-started`);
    controller.abort("synthetic active cancellation");
    await assert.rejects(cancelled);
    await stderr.waitFor(`${marker}-aborted`);
  } finally {
    try {
      await client.close();
    } finally {
      stderr.stop();
    }
  }
}

export function groupByGuid(
  output: Record<string, any>,
  guid: string,
): Record<string, any> {
  assert.ok(Array.isArray(output.groups));
  const group = (output.groups as unknown[]).find((candidate) =>
    structured(candidate).guid === guid);
  assert.ok(group, `expected group for GUID ${guid}`);
  return structured(group);
}

export async function connectWithTimeout(connection: Connection): Promise<void> {
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

export function structured(value: unknown): Record<string, any> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, any>;
}

export function textContent(result: { readonly content: readonly { readonly type: string; readonly text?: string }[] }): string {
  const content = result.content.find((entry) => entry.type === "text");
  assert.ok(content?.text !== undefined, "expected bounded text content");
  return content.text;
}

export function observeFixtureStderr(transport: StdioClientTransport): {
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
