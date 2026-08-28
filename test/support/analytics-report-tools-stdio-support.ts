import assert from "node:assert/strict";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export const ANALYTICS_SERVER_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "stdio-analytics-report-server.js",
);
export const ANALYTICS_BUSINESS_DATE = 20260816;
export const ANALYTICS_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000005003";
export const INACCESSIBLE_ANALYTICS_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000005099";

export type AnalyticsFixtureScenario =
  | "success"
  | "absent-analytics-runtime"
  | "missing-analytics-scope"
  | "inaccessible-analytics-restaurant"
  | "pending-exhausted"
  | "invalid-or-expired"
  | "replacement-exhausted"
  | "request-failed"
  | "result-contract-unavailable"
  | "cancel-active-analytics";

interface Connection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

export function createAnalyticsConnection(
  scenario: AnalyticsFixtureScenario = "success",
): Connection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ANALYTICS_SERVER_PATH, scenario],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    { name: `toast-analytics-report-tools-${scenario}`, version: "0.0.0" },
    {
      versionNegotiation: {
        mode: { pin: "2026-07-28" },
        probe: { timeoutMs: 10_000 },
      },
    },
  );
  return { client, transport };
}

export async function connectAnalytics(connection: Connection): Promise<void> {
  await connection.client.connect(connection.transport);
}

export function structured(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

export function observeFixtureStderr(transport: StdioClientTransport): {
  readonly waitFor: (marker: string) => Promise<void>;
  readonly stop: () => void;
} {
  const stream = transport.stderr;
  assert.ok(stream !== null, "expected Analytics fixture stderr");
  let output = "";
  let resolveWaiter: (() => void) | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    resolveWaiter?.();
    resolveWaiter = undefined;
  };
  stream.on("data", onData);
  return {
    waitFor: async (marker: string): Promise<void> => {
      while (!output.includes(marker)) {
        await new Promise<void>((resolve) => { resolveWaiter = resolve; });
      }
    },
    stop: () => stream.off("data", onData),
  };
}
