import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import type { Stream } from "node:stream";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const BUSINESS_DATES = {
  immediateCancellation: 20260815,
  laterCancellation: 20260817,
  resolve: 20260818,
  reject: 20260819,
  reuse: 20260820,
} as const;
const PROTOCOL_TIMEOUT_MS = Number.parseInt(process.env.GATE60_PROTOCOL_TIMEOUT_MS ?? "10000", 10);
const CLEANUP_SNAPSHOT = "gate60-cancellation-snapshot:activeControllers=0 relayListeners=0";
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
    `${era} official stdio client preserves actual request IDs and cancels first and later report requests through the production executable`,
    { timeout: PROTOCOL_TIMEOUT_MS * 8 },
    async () => {
      const transport = new ObservedStdioClientTransport({
        command: process.execPath,
        args: [PRODUCTION_SERVER_PATH],
        cwd: process.cwd(),
        stderr: "pipe",
        env: executableTestEnvironment(),
      });
      const stderr = observeStderr(transport.stderr);
      const client = new Client(
        { name: `toast-first-tool-cancellation-${era}`, version: "0.0.0" },
        era === "legacy"
          ? { versionNegotiation: { mode: "legacy" } }
          : { versionNegotiation: { mode: { pin: "2026-07-28" }, probe: { timeoutMs: PROTOCOL_TIMEOUT_MS } } },
      );

      try {
        await client.connect(transport);
        transport.observeInboundMessages();

        const immediateCursor = stderr.cursor();
        const immediate = callTool(client, "toast_sales_summary", BUSINESS_DATES.immediateCancellation);
        await waitUntil(() => transport.firstToolCallId() !== undefined, "missing first tools/call request ID");
        const firstRequestId = transport.firstToolCallId();
        if (era === "legacy") {
          assert.equal(transport.firstOutboundId("initialize"), 0, "legacy initialize must use numeric ID zero");
          assert.equal(firstRequestId, 1, "legacy first tools/call must use numeric ID one");
        } else {
          assert.ok(transport.outboundBefore("server/discover", "tools/call"), "modern discovery must precede the first tools/call");
          assert.equal(firstRequestId, 0, "modern first tools/call must use numeric ID zero");
        }
        await client.notification({
          method: "notifications/cancelled",
          params: { requestId: firstRequestId, reason: "invented immediate cancellation" },
        });
        assert.ok(
          transport.outboundImmediatelyAfter("tools/call", "notifications/cancelled"),
          "the executable test must send tools/call and cancellation as consecutive stdio frames",
        );
        assert.equal(transport.lastCancellationRequestId(), firstRequestId, "the first cancellation notification must target its matching request ID");
        const immediateStarted = await stderr.waitFor("gate60-orders-started:20260815", immediateCursor);
        const immediateResult = await immediate.result as { readonly isError?: boolean };
        assert.equal(immediateResult.isError, true, "the immediate cancellation must retain the denied report boundary");
        const immediateAborted = await stderr.waitFor("gate60-orders-aborted:20260815", immediateStarted.sequence);
        await transport.waitForDeniedResponse(firstRequestId);
        await stderr.waitFor(CLEANUP_SNAPSHOT, immediateAborted.sequence);

        assert.equal(typeof firstRequestId, "number", "the official client must allocate numeric request IDs");
        const ignoredCancellationCursor = stderr.cursor();
        const futureRequestId = firstRequestId + 1;
        await client.notification({
          method: "notifications/cancelled",
          params: { requestId: `invented-unknown-${era}`, reason: "invented unknown cancellation" },
        });
        await client.notification({
          method: "notifications/cancelled",
          params: { requestId: firstRequestId, reason: "invented late cancellation" },
        });
        await client.notification({
          method: "notifications/cancelled",
          params: { requestId: futureRequestId, reason: "invented future cancellation" },
        });
        const unknownCancellation = await stderr.waitFor(CLEANUP_SNAPSHOT, ignoredCancellationCursor);
        const lateCancellation = await stderr.waitFor(CLEANUP_SNAPSHOT, unknownCancellation.sequence);
        const futureCancellation = await stderr.waitFor(CLEANUP_SNAPSHOT, lateCancellation.sequence);

        const resolveCursor = stderr.cursor();
        const resolvedPromise = client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.resolve },
        });
        await waitUntil(() => transport.lastToolCallId() === futureRequestId, "missing later valid tools/call request ID");
        const sourceResolved = await stderr.waitFor("gate60-orders-resolved:20260818", futureCancellation.sequence);
        const resolved = await resolvedPromise;
        assert.notEqual(resolved.isError, true, "unknown and late cancellation notifications must not poison a later valid request");
        await stderr.waitFor(CLEANUP_SNAPSHOT, Math.max(resolveCursor, sourceResolved.sequence));

        const laterCursor = stderr.cursor();
        const later = callTool(client, "toast_payment_summary", BUSINESS_DATES.laterCancellation);
        const laterStarted = await stderr.waitFor("gate60-payments-started:20260817", laterCursor);
        const laterRequestId = transport.lastToolCallId();
        assert.notEqual(laterRequestId, 0, "the later tools/call must use a nonzero JSON-RPC ID");
        later.controller.abort("invented nonzero cancellation");
        await assert.rejects(later.result);
        const laterAborted = await stderr.waitFor("gate60-payments-aborted:20260817", laterStarted.sequence);
        assert.equal(transport.lastCancellationRequestId(), laterRequestId, "the later cancellation notification must target its matching request ID");
        await transport.waitForDeniedResponse(laterRequestId);
        await stderr.waitFor(CLEANUP_SNAPSHOT, laterAborted.sequence);

        const rejectCursor = stderr.cursor();
        const rejectedPromise = client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.reject },
        });
        const sourceRejected = await stderr.waitFor("gate60-orders-rejected:20260819", rejectCursor);
        const rejected = await rejectedPromise;
        assert.equal(rejected.isError, true, "an invented source rejection must retain the denied report boundary");
        await stderr.waitFor(CLEANUP_SNAPSHOT, sourceRejected.sequence);

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

test(
  "coalesced legacy initialized, tools/call ID one, and cancellation abort before tool source access",
  { timeout: PROTOCOL_TIMEOUT_MS * 4 },
  async () => {
    const child = spawn(process.execPath, [PRODUCTION_SERVER_PATH], {
      cwd: process.cwd(),
      env: executableTestEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stderr = observeStderr(child.stderr);
    const stdout = observeJsonMessages(child.stdout);

    try {
      writeRawMessages(child.stdin, [{
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "toast-coalesced-cancellation-test", version: "0.0.0" },
        },
      }]);
      await stdout.waitFor((message) => hasResponseId(message, 0), "missing legacy initialize response");

      const sourceCursor = stderr.cursor();
      writeRawMessages(child.stdin, [
        { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "toast_sales_summary",
            arguments: { businessDate: BUSINESS_DATES.immediateCancellation },
          },
        },
        {
          jsonrpc: "2.0",
          method: "notifications/cancelled",
          params: { requestId: 1, reason: "invented coalesced legacy cancellation" },
        },
      ]);

      const enteredHandler = await stderr.waitFor(
        "gate60-cancellation-snapshot:activeControllers=1 relayListeners=2",
        sourceCursor,
      );
      const cleanup = await stderr.waitFor(CLEANUP_SNAPSHOT, enteredHandler.sequence);
      await stderr.assertAbsentFor("gate60-orders-started:20260815", sourceCursor);
      assert.ok(cleanup.sequence > enteredHandler.sequence, "the pre-aborted legacy handler must finalize after registration");
    } finally {
      stderr.stop();
      stdout.stop();
      if (child.exitCode === null) child.kill();
    }
  },
);

for (const [name, arguments_] of [
  ["toast_sales_summary", { businessDate: BUSINESS_DATES.immediateCancellation }],
  ["toast_payment_summary", { businessDate: BUSINESS_DATES.immediateCancellation }],
  ["toast_item_sales_summary", { businessDate: BUSINESS_DATES.immediateCancellation, dimension: "item" }],
  ["toast_cash_summary", { businessDate: BUSINESS_DATES.immediateCancellation }],
  ["toast_labor_summary", { businessDate: BUSINESS_DATES.immediateCancellation }],
  ["toast_analytics_metrics_day", {
    restaurantGuid: "00000000-0000-4000-8000-000000000002",
    businessDate: BUSINESS_DATES.immediateCancellation,
  }],
] as const) {
  test(
    `legacy compiled registration wrapper: ${name}`,
    { timeout: PROTOCOL_TIMEOUT_MS * 4 },
    async () => {
      const child = spawn(process.execPath, [PRODUCTION_SERVER_PATH], {
        cwd: process.cwd(),
        env: executableTestEnvironment(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stderr = observeStderr(child.stderr);
      const stdout = observeJsonMessages(child.stdout);

      try {
        writeRawMessages(child.stdin, [{
          jsonrpc: "2.0",
          id: 0,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: `toast-registration-wrapper-${name}`, version: "0.0.0" },
          },
        }]);
        await stdout.waitFor((message) => hasResponseId(message, 0), "missing legacy initialize response");

        const snapshotCursor = stderr.cursor();
        writeRawMessages(child.stdin, [
          { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: arguments_ },
          },
          {
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: 1, reason: `invented ${name} registration cancellation` },
          },
        ]);

        const enteredBridge = await stderr.waitFor(
          "gate60-cancellation-snapshot:activeControllers=1 relayListeners=2",
          snapshotCursor,
        );
        await stderr.waitFor(CLEANUP_SNAPSHOT, enteredBridge.sequence);
      } finally {
        stderr.stop();
        stdout.stop();
        if (child.exitCode === null) child.kill();
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
  readonly #outboundMessages: Array<{ readonly method: string; readonly id: unknown; readonly params: unknown }> = [];
  readonly #inboundMessages: unknown[] = [];
  #inboundObserverInstalled = false;

  override async send(message: Parameters<StdioClientTransport["send"]>[0]): Promise<void> {
    const candidate = message as { readonly method?: unknown; readonly id?: unknown; readonly params?: unknown };
    if (typeof candidate.method === "string") {
      this.#outboundMessages.push({ method: candidate.method, id: candidate.id, params: candidate.params });
    }
    await super.send(message);
  }

  observeInboundMessages(): void {
    if (this.#inboundObserverInstalled) return;
    this.#inboundObserverInstalled = true;
    const original = this.onmessage;
    this.onmessage = (message) => {
      this.#inboundMessages.push(message);
      original?.(message);
    };
  }

  firstToolCallId(): unknown {
    return this.#outboundMessages.find((message) => message.method === "tools/call")?.id;
  }

  lastToolCallId(): unknown {
    return this.#outboundMessages.filter((message) => message.method === "tools/call").at(-1)?.id;
  }

  firstOutboundId(method: string): unknown {
    return this.#outboundMessages.find((message) => message.method === method)?.id;
  }

  outboundBefore(firstMethod: string, secondMethod: string): boolean {
    return this.#outboundMessages.findIndex((message) => message.method === firstMethod)
      < this.#outboundMessages.findIndex((message) => message.method === secondMethod);
  }

  outboundImmediatelyAfter(firstMethod: string, secondMethod: string): boolean {
    const firstIndex = this.#outboundMessages.map((message) => message.method).lastIndexOf(firstMethod);
    return firstIndex >= 0 && this.#outboundMessages[firstIndex + 1]?.method === secondMethod;
  }

  lastCancellationRequestId(): unknown {
    const cancellation = this.#outboundMessages.filter((message) => message.method === "notifications/cancelled").at(-1);
    return (cancellation?.params as { readonly requestId?: unknown } | undefined)?.requestId;
  }

  async waitForDeniedResponse(id: unknown): Promise<void> {
    await waitUntil(
      () => this.#inboundMessages.some((message) => isDeniedToolResponse(message, id)),
      `missing denied response for request ${String(id)}`,
    );
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

interface StderrMarker {
  readonly sequence: number;
  readonly text: string;
}

function observeStderr(stream: Stream | null): {
  cursor(): number;
  waitFor(marker: string, afterSequence?: number): Promise<StderrMarker>;
  assertAbsentFor(marker: string, afterSequence: number): Promise<void>;
  stop(): void;
} {
  assert.ok(stream !== null, "the production executable must expose stderr");
  const markers: StderrMarker[] = [];
  let output = "";
  let nextSequence = 1;
  let wake: (() => void) | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    let newlineIndex = output.indexOf("\n");
    while (newlineIndex >= 0) {
      markers.push({ sequence: nextSequence, text: output.slice(0, newlineIndex) });
      nextSequence += 1;
      output = output.slice(newlineIndex + 1);
      newlineIndex = output.indexOf("\n");
    }
    wake?.();
    wake = undefined;
  };
  stream.on("data", onData);
  return {
    cursor: () => nextSequence - 1,
    waitFor: async (marker, afterSequence = 0) => {
      while (true) {
        const found = markers.find((candidate) => candidate.sequence > afterSequence && candidate.text.includes(marker));
        if (found !== undefined) return found;
        await Promise.race([
          new Promise<void>((resolve) => { wake = resolve; }),
          new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(`missing test marker ${marker}`)), PROTOCOL_TIMEOUT_MS)),
        ]);
      }
    },
    assertAbsentFor: async (marker, afterSequence) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        markers.some((candidate) => candidate.sequence > afterSequence && candidate.text.includes(marker)),
        false,
        `unexpected test marker ${marker}`,
      );
    },
    stop: () => stream.off("data", onData),
  };
}

function observeJsonMessages(stream: Stream | null): {
  waitFor(predicate: (message: unknown) => boolean, failure: string): Promise<void>;
  stop(): void;
} {
  assert.ok(stream !== null, "the production executable must expose stdout");
  const messages: unknown[] = [];
  let buffer = "";
  const onData = (chunk: Buffer | string): void => {
    buffer += chunk.toString();
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) messages.push(JSON.parse(line));
      newlineIndex = buffer.indexOf("\n");
    }
  };
  stream.on("data", onData);
  return {
    waitFor: async (predicate, failure) => {
      await waitUntil(() => messages.some(predicate), failure);
    },
    stop: () => stream.off("data", onData),
  };
}

function writeRawMessages(
  stdin: NonNullable<ReturnType<typeof spawn>["stdin"]>,
  messages: readonly Record<string, unknown>[],
): void {
  stdin.write(messages.map((message) => `${JSON.stringify(message)}\n`).join(""));
}

function hasResponseId(message: unknown, id: number): boolean {
  return message !== null && typeof message === "object"
    && "id" in message && (message as { readonly id?: unknown }).id === id;
}

function isDeniedToolResponse(message: unknown, id: unknown): boolean {
  if (message === null || typeof message !== "object") return false;
  const response = message as {
    readonly id?: unknown;
    readonly result?: { readonly structuredContent?: { readonly status?: unknown } };
  };
  return response.id === id && response.result?.structuredContent?.status === "denied";
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started >= PROTOCOL_TIMEOUT_MS) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
