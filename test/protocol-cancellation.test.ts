import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const PROTOCOL_TIMEOUT_MS = 5_000;
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "protocol-cancellation-server.js",
);
const HANDLER_STARTED_MARKER = "phase1-wait-handler-started";
const HANDLER_ABORT_OBSERVED_MARKER = "phase1-wait-handler-abort-observed";

test(
  "observes official-client cancellation in the handler and reuses the retained process",
  { timeout: PROTOCOL_TIMEOUT_MS * 4 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: process.cwd(),
      stderr: "pipe",
      env: { PATH: process.env.PATH ?? "" },
    });
    const stderr = observeFixtureStderr(transport);
    const client = new Client(
      { name: "toast-pos-mcp-cancellation-test-client", version: "0.0.0" },
      {
        versionNegotiation: {
          mode: { pin: MODERN_PROTOCOL_VERSION },
          probe: { timeoutMs: PROTOCOL_TIMEOUT_MS },
        },
      },
    );

    try {
      await withTimeout(
        client.connect(transport),
        PROTOCOL_TIMEOUT_MS,
        "Timed out connecting to the cancellation fixture",
      );
      const pid = transport.pid;
      assert.ok(pid !== null, "expected a retained cancellation fixture PID");

      // The SDK cancellation handler treats request ID zero as absent.
      // Prime the retained process so the cancelled tool request uses a
      // nonzero ID and tests the handler signal through the official wire.
      await withTimeout(
        client.discover({ timeout: PROTOCOL_TIMEOUT_MS }),
        PROTOCOL_TIMEOUT_MS,
        "The retained process did not answer before cancellation",
      );
      assert.equal(transport.pid, pid);

      const controller = new AbortController();
      const pending = client.callTool(
        { name: "phase1_wait", arguments: {} },
        {
          signal: controller.signal,
          timeout: PROTOCOL_TIMEOUT_MS,
          toolDefinition: {
            name: "phase1_wait",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
      );

      await withTimeout(
        stderr.waitFor(HANDLER_STARTED_MARKER),
        PROTOCOL_TIMEOUT_MS,
        "The synthetic wait handler did not start",
      );
      controller.abort("phase1 synthetic cancellation proof");

      await assert.rejects(
        withTimeout(
          pending,
          PROTOCOL_TIMEOUT_MS,
          "The cancelled tool request did not reject",
        ),
      );
      await withTimeout(
        stderr.waitFor(HANDLER_ABORT_OBSERVED_MARKER),
        PROTOCOL_TIMEOUT_MS,
        "The handler did not observe its MCP request signal abort",
      );

      await withTimeout(
        client.discover({ timeout: PROTOCOL_TIMEOUT_MS }),
        PROTOCOL_TIMEOUT_MS,
        "The retained process did not answer after cancellation",
      );
      assert.equal(transport.pid, pid);
    } finally {
      try {
        await withTimeout(
          client.close(),
          PROTOCOL_TIMEOUT_MS,
          "Timed out closing the cancellation fixture client",
        );
      } finally {
        stderr.stop();
      }
    }
  },
);

interface FixtureStderrObserver {
  readonly waitFor: (marker: string) => Promise<void>;
  readonly stop: () => void;
}

function observeFixtureStderr(
  transport: StdioClientTransport,
): FixtureStderrObserver {
  const stream = transport.stderr;
  assert.ok(stream !== null, "expected piped fixture stderr");

  let output = "";
  const waiters = new Map<string, Set<() => void>>();
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    for (const [marker, resolvers] of waiters) {
      if (!output.includes(marker)) {
        continue;
      }
      waiters.delete(marker);
      for (const resolve of resolvers) {
        resolve();
      }
    }
  };
  stream.on("data", onData);

  return {
    waitFor: async (marker: string): Promise<void> => {
      if (output.includes(marker)) {
        return;
      }
      await new Promise<void>((resolve) => {
        const resolvers = waiters.get(marker) ?? new Set<() => void>();
        resolvers.add(resolve);
        waiters.set(marker, resolvers);
      });
    },
    stop: (): void => {
      stream.off("data", onData);
      waiters.clear();
    },
  };
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
