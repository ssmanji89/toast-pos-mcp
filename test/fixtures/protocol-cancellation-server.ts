#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const HANDLER_STARTED_MARKER = "phase1-wait-handler-started";
const HANDLER_ABORT_OBSERVED_MARKER = "phase1-wait-handler-abort-observed";
const HANDLER_ABORT_STATE_PROBE_MARKER = "phase1-wait-handler-abort-state-probe";

function createProtocolCancellationServer(): McpServer {
  const server = new McpServer({
    name: "toast-pos-mcp-protocol-cancellation-fixture",
    version: "0.0.0",
  });
  let activeWaitSignal: AbortSignal | undefined;

  server.registerTool(
    "phase1_wait",
    {
      description: "Synthetic test-only wait operation.",
    },
    (ctx) => {
      activeWaitSignal = ctx.mcpReq.signal;
      return new Promise<never>((_resolve, reject) => {
        let observed = false;
        const observeAbort = (): void => {
          if (observed) {
            return;
          }
          observed = true;
          console.error(HANDLER_ABORT_OBSERVED_MARKER);
          reject(new Error("phase1 synthetic request cancelled"));
        };

        ctx.mcpReq.signal.addEventListener("abort", observeAbort, {
          once: true,
        });
        console.error(HANDLER_STARTED_MARKER);
        if (ctx.mcpReq.signal.aborted) {
          observeAbort();
        }
      });
    },
  );

  server.registerTool(
    "phase1_probe_wait_abort_state",
    {
      description: "Synthetic test-only cancellation state probe.",
    },
    () => {
      if (activeWaitSignal === undefined) {
        throw new Error("phase1 wait handler has not started");
      }

      const handlerAborted = activeWaitSignal.aborted;
      console.error(
        `${HANDLER_ABORT_STATE_PROBE_MARKER}:${handlerAborted ? "aborted" : "unaborted"}`,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ handlerAborted }),
          },
        ],
      };
    },
  );

  return server;
}

serveStdio(createProtocolCancellationServer, {
  legacy: "serve",
  onerror: () => {
    console.error("phase1-cancellation-fixture-transport-error");
    process.exitCode = 1;
  },
});
