import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const BUSINESS_DATES = {
  firstCancellation: 20260816,
  laterCancellation: 20260817,
  resolve: 20260818,
  reject: 20260819,
  reuse: 20260820,
} as const;
const PROTOCOL_TIMEOUT_MS = 10_000;
const PRODUCTION_SERVER_PATH = path.resolve(process.cwd(), "dist", "index.js");
const PRELOAD_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "installed-artifact-fetch-preload.js",
);

for (const era of ["legacy", "modern"] as const) {
  test(
    `${era} official stdio client cancels first request zero and later nonzero report requests through the production executable`,
    { timeout: PROTOCOL_TIMEOUT_MS * 8 },
    async () => {
      const transport = new ObservedStdioClientTransport({
        command: process.execPath,
        args: [PRODUCTION_SERVER_PATH],
        cwd: process.cwd(),
        stderr: "pipe",
        env: executableTestEnvironment(),
      });
      const stderr = observeStderr(transport);
      const client = new Client(
        { name: `toast-first-tool-cancellation-${era}`, version: "0.0.0" },
        era === "legacy"
          ? { versionNegotiation: { mode: "legacy" } }
          : { versionNegotiation: { mode: { pin: "2026-07-28" }, probe: { timeoutMs: PROTOCOL_TIMEOUT_MS } } },
      );

      try {
        await client.connect(transport);

        const first = callTool(client, "toast_sales_summary", BUSINESS_DATES.firstCancellation);
        await stderr.waitFor("gate60-orders-started:20260816");
        first.controller.abort("invented request-zero cancellation");
        await assert.rejects(first.result);
        await stderr.waitFor("gate60-orders-aborted:20260816");
        await stderr.waitFor("gate60-cancellation-snapshot:activeControllers=0 relayListeners=0");
        assert.equal(transport.firstToolCallId(), 0, "the first post-connect tools/call must use numeric JSON-RPC ID zero");

        const later = callTool(client, "toast_payment_summary", BUSINESS_DATES.laterCancellation);
        await stderr.waitFor("gate60-payments-started:20260817");
        assert.notEqual(transport.lastToolCallId(), 0, "the later tools/call must use a nonzero JSON-RPC ID");
        later.controller.abort("invented nonzero cancellation");
        await assert.rejects(later.result);
        await stderr.waitFor("gate60-payments-aborted:20260817");
        await stderr.waitFor("gate60-cancellation-snapshot:activeControllers=0 relayListeners=0");

        const resolved = await client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.resolve },
        });
        assert.notEqual(resolved.isError, true);
        await stderr.waitFor("gate60-cancellation-snapshot:activeControllers=0 relayListeners=0");

        const rejected = await client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.reject },
        });
        assert.equal(rejected.isError, true, "an invented source rejection must retain the denied report boundary");
        await stderr.waitFor("gate60-cancellation-snapshot:activeControllers=0 relayListeners=0");

        const reused = await client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.reuse },
        });
        assert.notEqual(reused.isError, true, "the retained production process must serve a later report");
      } finally {
        try {
          await client.close();
        } finally {
          stderr.stop();
        }
      }
    },
  );
}

function callTool(
  client: Client,
  name: "toast_sales_summary" | "toast_payment_summary",
  businessDate: number,
): { readonly controller: AbortController; readonly result: Promise<unknown> } {
  const controller = new AbortController();
  return {
    controller,
    result: client.callTool(
      { name, arguments: { businessDate } },
      {
        signal: controller.signal,
        timeout: PROTOCOL_TIMEOUT_MS,
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
    ),
  };
}

class ObservedStdioClientTransport extends StdioClientTransport {
  readonly #toolCallIds: unknown[] = [];

  override async send(message: Parameters<StdioClientTransport["send"]>[0]): Promise<void> {
    const candidate = message as { readonly method?: unknown; readonly id?: unknown };
    if (candidate.method === "tools/call") this.#toolCallIds.push(candidate.id);
    await super.send(message);
  }

  firstToolCallId(): unknown {
    return this.#toolCallIds[0];
  }

  lastToolCallId(): unknown {
    return this.#toolCallIds.at(-1);
  }
}

function executableTestEnvironment(): Record<string, string> {
  return {
    TOAST_API_HOSTNAME: "ws-api.gate60-invented.invalid",
    TOAST_CLIENT_ID: "gate60-invented-client",
    TOAST_CLIENT_SECRET: "gate60-invented-secret-not-real",
    TOAST_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
    TOAST_DEFAULT_RESTAURANT_GUID: "00000000-0000-4000-8000-000000000002",
    TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED: "true",
    TOAST_MCP_EXECUTABLE_TEST_OBSERVER: "true",
    TOAST_MCP_EXECUTABLE_TEST_FETCH: "true",
    NODE_OPTIONS: `--import ${PRELOAD_PATH}`,
    PATH: path.dirname(process.execPath),
  };
}

function observeStderr(transport: StdioClientTransport): { waitFor(marker: string): Promise<void>; stop(): void } {
  const stream = transport.stderr;
  assert.ok(stream !== null, "the production executable must expose stderr");
  let output = "";
  let wake: (() => void) | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    wake?.();
    wake = undefined;
  };
  stream.on("data", onData);
  return {
    waitFor: async (marker) => {
      while (!output.includes(marker)) {
        await Promise.race([
          new Promise<void>((resolve) => { wake = resolve; }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`missing test marker ${marker}`)), PROTOCOL_TIMEOUT_MS)),
        ]);
      }
    },
    stop: () => stream.off("data", onData),
  };
}
