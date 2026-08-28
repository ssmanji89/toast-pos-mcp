import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { McpServer } from "@modelcontextprotocol/server";

import { createServer, SERVER_IDENTITY } from "../src/server.js";
import {
  SYNTHETIC_CLIENT_SECRET_MARKER,
  SYNTHETIC_VALID_RUNTIME_ENV,
} from "./support/synthetic-runtime-env.js";

const STDIO_CONNECT_TIMEOUT_MS = 10_000;
const DIST_INDEX_PATH = path.resolve(process.cwd(), "dist", "index.js");
const MODERN_PROTOCOL_VERSION = "2026-07-28";

test("constructs a server without starting process IO", async () => {
  const server = createServer();

  assert.ok(server instanceof McpServer);
  await server.close();
});

test(
  "serves retained legacy 2025 requests without report tools",
  { timeout: STDIO_CONNECT_TIMEOUT_MS },
  async () => {
    const connection = createLegacyConnection();
    try {
      const initialize = await connection.request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "raw-legacy-test", version: "0.0.0" },
        },
      });
      assert.equal(initialize.result.serverInfo.name, SERVER_IDENTITY.name);
      assert.deepEqual(initialize.result.capabilities.tools, { listChanged: true });
      connection.notify({ jsonrpc: "2.0", method: "notifications/initialized" });

      const listed = await connection.request({
        jsonrpc: "2.0", id: 2, method: "tools/list", params: {},
      });
      assert.ok(
        "error" in listed || (Array.isArray(listed.result?.tools) && listed.result.tools.length === 0),
        "legacy tools/list must not expose report tools",
      );

      const call = await connection.request({
        jsonrpc: "2.0", id: 3, method: "tools/call",
        params: { name: "toast_sales_summary", arguments: { businessDate: 20260816 } },
      });
      assert.ok("error" in call, "legacy report call must be denied");
    } finally {
      connection.close();
    }
  },
);

test(
  "serves retained pinned 2026-07-28 requests with the production report tools",
  { timeout: STDIO_CONNECT_TIMEOUT_MS * 5 + 5_000 },
  async () => {
    const connection = createStdioClient("modern");

    try {
      await connectWithTimeout(connection);
      const pid = requireRetainedPid(connection);
      // Pinned negotiation has no legacy fallback. Reaching the common server
      // assertions therefore proves that this executable served the modern
      // 2026-07-28 era rather than silently using the legacy handshake.
      await assertReportServerIdentity(connection.client);
      await proveRetainedProcessRequests(connection, "modern", pid);
    } finally {
      await closeWithTimeout(connection);
    }
  },
);

test(
  "clean process restart reconnects without depending on hidden MCP session state",
  { timeout: STDIO_CONNECT_TIMEOUT_MS * 2 + 10_000 },
  async () => {
    const first = createStdioClient("modern");
    let firstPid: number;

    try {
      await connectWithTimeout(first);
      firstPid = requireRetainedPid(first);
      await assertReportServerIdentity(first.client);
    } finally {
      await closeWithTimeout(first);
    }

    const second = createStdioClient("modern");
    try {
      await connectWithTimeout(second);
      const secondPid = requireRetainedPid(second);
      assert.notEqual(secondPid, firstPid);
      await assertReportServerIdentity(second.client);
      await requestForEraWithTimeout(second, "modern");
      assert.equal(second.transport.pid, secondPid);
    } finally {
      await closeWithTimeout(second);
    }
  },
);

test(
  "fails closed and exits non-zero when Merchant-AI-consent acknowledgment is absent, without leaking the configured secret",
  { timeout: STDIO_CONNECT_TIMEOUT_MS },
  async () => {
    const { TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: _omitted, ...envWithoutConsent } =
      SYNTHETIC_VALID_RUNTIME_ENV;

    const result = await runIndexOnce(envWithoutConsent);

    assert.notEqual(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.ok(
      result.stderr.includes("toast-pos-mcp failed to start"),
      `expected a generic startup-failure message, got: ${result.stderr}`,
    );
    assert.ok(
      !result.stderr.includes(SYNTHETIC_CLIENT_SECRET_MARKER),
      "startup-failure stderr must never include the configured client secret",
    );
  },
);

test(
  "fails closed and exits non-zero when required runtime configuration is entirely missing",
  { timeout: STDIO_CONNECT_TIMEOUT_MS },
  async () => {
    const result = await runIndexOnce({});

    assert.notEqual(result.exitCode, 0);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes("toast-pos-mcp failed to start"));
  },
);

interface TestConnection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

function createLegacyConnection(): {
  readonly request: (message: Record<string, unknown>) => Promise<any>;
  readonly notify: (message: Record<string, unknown>) => void;
  readonly close: () => void;
} {
  const child = spawn(process.execPath, [DIST_INDEX_PATH], {
    cwd: process.cwd(),
    env: { PATH: process.env.PATH ?? "", ...SYNTHETIC_VALID_RUNTIME_ENV },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map<number, (message: any) => void>();
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      const message = JSON.parse(line) as { readonly id?: number };
      if (typeof message.id === "number") pending.get(message.id)?.(message);
    }
  });
  const send = (message: Record<string, unknown>): void => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  return {
    request: async (message) => new Promise((resolve, reject) => {
      const id = message.id as number;
      assert.equal(typeof id, "number", "legacy request must have numeric ID");
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Timed out waiting for raw legacy response"));
      }, STDIO_CONNECT_TIMEOUT_MS);
      pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      send(message);
    }),
    notify: send,
    close: () => child.kill(),
  };
}

function createStdioClient(era: "modern"): TestConnection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST_INDEX_PATH],
    cwd: process.cwd(),
    stderr: "pipe",
    env: { ...SYNTHETIC_VALID_RUNTIME_ENV },
  });
  const client = new Client(
    {
      name: `toast-pos-mcp-${era}-test-client`,
      version: "0.0.0",
    },
    {
      versionNegotiation: {
        mode: { pin: MODERN_PROTOCOL_VERSION },
        probe: { timeoutMs: STDIO_CONNECT_TIMEOUT_MS },
      },
    },
  );

  return { client, transport };
}

async function connectWithTimeout(connection: TestConnection): Promise<void> {
  await withTimeout(
    connection.client.connect(connection.transport),
    STDIO_CONNECT_TIMEOUT_MS,
    "Timed out connecting to the stdio MCP server",
  );
}

async function closeWithTimeout(connection: TestConnection): Promise<void> {
  await withTimeout(
    connection.client.close(),
    STDIO_CONNECT_TIMEOUT_MS,
    "Timed out closing the stdio MCP client",
  );
}

function requireRetainedPid(connection: TestConnection): number {
  const pid = connection.transport.pid;
  assert.ok(pid !== null, "expected a retained stdio child process PID");
  return pid;
}

async function proveRetainedProcessRequests(
  connection: TestConnection,
  era: "modern",
  pid: number,
): Promise<void> {
  await requestForEraWithTimeout(connection, era);
  assert.equal(connection.transport.pid, pid);

  await requestForEraWithTimeout(connection, era);
  assert.equal(connection.transport.pid, pid);

  await Promise.all([
    requestForEraWithTimeout(connection, era),
    requestForEraWithTimeout(connection, era),
  ]);
  assert.equal(connection.transport.pid, pid);
}

async function requestForEraWithTimeout(
  connection: TestConnection,
  era: "modern",
): Promise<void> {
  const request = connection.client.discover();
  await withTimeout(
    request,
    STDIO_CONNECT_TIMEOUT_MS,
    `Timed out sending a retained ${era} MCP request`,
  );
}

async function assertReportServerIdentity(client: Client): Promise<void> {
  const serverVersion = client.getServerVersion();
  assert.equal(serverVersion?.name, SERVER_IDENTITY.name);
  assert.equal(serverVersion?.version, SERVER_IDENTITY.version);
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    [
      "toast_analytics_metrics_day",
      "toast_cash_summary",
      "toast_item_sales_summary",
      "toast_labor_summary",
      "toast_payment_summary",
      "toast_sales_summary",
    ],
  );
}

interface RunResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Spawn the built entry point directly (bypassing the MCP client) so a
 * startup failure can be observed as a plain process exit rather than a
 * hung or rejected MCP handshake. */
async function runIndexOnce(
  env: Readonly<Record<string, string>>,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [DIST_INDEX_PATH], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMilliseconds: number,
  message: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMilliseconds);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
