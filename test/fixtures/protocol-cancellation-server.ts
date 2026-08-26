#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const HANDLER_STARTED_MARKER = "phase1-wait-handler-started";

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
    async () => {
      console.error(HANDLER_STARTED_MARKER);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 30_000);
      });
      return {
        content: [{ type: "text", text: "unexpected synthetic success" }],
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
