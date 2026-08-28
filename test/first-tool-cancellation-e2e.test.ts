import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const BUSINESS_DATES = {
  immediateCancellation: 20260815,
  firstCancellation: 20260816,
  laterCancellation: 20260817,
  resolve: 20260818,
  reject: 20260819,
  reuse: 20260820,
} as const;
const PROTOCOL_TIMEOUT_MS = 10_000;
const CLEANUP_SNAPSHOT = "gate60-cancellation-snapshot:activeControllers=0 earlyCancellations=0 relayListeners=0";
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
      const stderr = observeStderr(transport);
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
        const earlyCursor = stderr.cursor();
        const preRegisteredRequestId = firstRequestId + 1;
        await client.notification({
          method: "notifications/cancelled",
          params: { requestId: preRegisteredRequestId, reason: "invented pre-registration cancellation" },
        });
        const earlyCancellation = await stderr.waitFor(
          "gate60-cancellation-snapshot:activeControllers=0 earlyCancellations=1 relayListeners=0",
          earlyCursor,
        );
        const preRegistered = callTool(client, "toast_sales_summary", BUSINESS_DATES.firstCancellation);
        await waitUntil(() => transport.lastToolCallId() === preRegisteredRequestId, "missing pre-registered tools/call request ID");
        const preRegisteredResult = await preRegistered.result as { readonly isError?: boolean };
        assert.equal(preRegisteredResult.isError, true, "the retained early cancellation must abort the matching report request");
        await transport.waitForDeniedResponse(preRegisteredRequestId);
        await stderr.waitFor(CLEANUP_SNAPSHOT, earlyCancellation.sequence);

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

        const resolveCursor = stderr.cursor();
        const resolvedPromise = client.callTool({
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATES.resolve },
        });
        const sourceResolved = await stderr.waitFor("gate60-orders-resolved:20260818", resolveCursor);
        const resolved = await resolvedPromise;
        assert.notEqual(resolved.isError, true);
        await stderr.waitFor(CLEANUP_SNAPSHOT, sourceResolved.sequence);

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

function observeStderr(transport: StdioClientTransport): {
  cursor(): number;
  waitFor(marker: string, afterSequence?: number): Promise<StderrMarker>;
  stop(): void;
} {
  const stream = transport.stderr;
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
    stop: () => stream.off("data", onData),
  };
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
