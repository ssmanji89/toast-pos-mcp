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
  "serves a legacy 2025 stdio client without advertising Toast tools",
  { timeout: STDIO_CONNECT_TIMEOUT_MS + 5_000 },
  async () => {
    const { client } = createStdioClient("legacy");

    try {
      await connectWithTimeout(client);
      assertEmptyServerIdentity(client);
    } finally {
      await client.close();
    }
  },
);

test(
  "serves a pinned 2026-07-28 stdio client without advertising Toast tools",
  { timeout: STDIO_CONNECT_TIMEOUT_MS + 5_000 },
  async () => {
    const { client } = createStdioClient("modern");

    try {
      await connectWithTimeout(client);
      // Pinned negotiation has no legacy fallback. Reaching the common server
      // assertions therefore proves that this executable served the modern
      // 2026-07-28 era rather than silently using the legacy handshake.
      assertEmptyServerIdentity(client);
    } finally {
      await client.close();
    }
  },
);

test(
  "clean process restart reconnects without depending on hidden MCP session state",
  { timeout: STDIO_CONNECT_TIMEOUT_MS * 2 + 10_000 },
  async () => {
    const first = createStdioClient("modern");
    await connectWithTimeout(first.client);
    const firstPid = first.transport.pid;
    assert.ok(firstPid !== null);
    assertEmptyServerIdentity(first.client);
    await first.client.close();

    const second = createStdioClient("modern");
    try {
      await connectWithTimeout(second.client);
      const secondPid = second.transport.pid;
      assert.ok(secondPid !== null);
      assert.notEqual(secondPid, firstPid);
      assertEmptyServerIdentity(second.client);
    } finally {
      await second.client.close();
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

function createStdioClient(era: "legacy" | "modern"): {
  readonly client: Client;
  readonly transport: StdioClientTransport;
} {
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
    era === "modern"
      ? {
          versionNegotiation: {
            mode: { pin: MODERN_PROTOCOL_VERSION },
            probe: { timeoutMs: STDIO_CONNECT_TIMEOUT_MS },
          },
        }
      : {
          versionNegotiation: { mode: "legacy" },
        },
  );

  return { client, transport };
}

async function connectWithTimeout(client: Client): Promise<void> {
  const transport = (client as unknown as { transport?: StdioClientTransport }).transport;
  void transport;
  // The SDK owns the actual transport after connect; the explicit timeout
  // bounds a broken child-process handshake regardless of protocol era.
  const created = createTransportForClient(client);
  await withTimeout(
    client.connect(created),
    STDIO_CONNECT_TIMEOUT_MS,
    "Timed out connecting to the stdio MCP server",
  );
}

const transportsByClient = new WeakMap<Client, StdioClientTransport>();

function createTransportForClient(client: Client): StdioClientTransport {
  const existing = transportsByClient.get(client);
  if (existing !== undefined) {
    return existing;
  }
  throw new Error("Test client transport was not registered");
}

function assertEmptyServerIdentity(client: Client): void {
  const serverVersion = client.getServerVersion();
  assert.equal(serverVersion?.name, SERVER_IDENTITY.name);
  assert.equal(serverVersion?.version, SERVER_IDENTITY.version);
  assert.equal(client.getServerCapabilities()?.tools, undefined);
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
