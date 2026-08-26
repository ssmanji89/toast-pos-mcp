#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const HANDLER_STARTED_MARKER = "phase1-wait-handler-started";
const HANDLER_ABORT_OBSERVED_MARKER = "phase1-wait-handler-abort-observed";

function createProtocolCancellationServer(): McpServer {
  const server = new McpServer({
    name: "toast-pos-mcp-protocol-cancellation-fixture",
    version: "0.0.0",
  });

  server.registerTool(
    "phase1_wait",
    {
      description: "Synthetic test-only wait operation.",
    },
    (ctx) => {
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

  return server;
}

serveStdio(createProtocolCancellationServer, {
  legacy: "serve",
  onerror: () => {
    console.error("phase1-cancellation-fixture-transport-error");
    process.exitCode = 1;
  },
});
