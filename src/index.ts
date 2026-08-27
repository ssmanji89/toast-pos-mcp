#!/usr/bin/env node

import { createApplicationRuntime } from "./runtime.js";
import { createServer } from "./server.js";
import { startStdioServer } from "./stdio.js";

async function main(): Promise<void> {
  // Validate runtime configuration and Merchant-AI-consent acknowledgment,
  // then construct exactly one config/token/HTTP/location/rate-limit identity
  // before opening MCP stdio. No Toast data request occurs during startup.
  const runtime = createApplicationRuntime();

  // The MCP SDK may construct more than one server instance while negotiating
  // protocol era, but every instance captures this same process-owned Toast
  // runtime. This is the production wiring path for the reporting tools.
  startStdioServer(({ era }) => createServer(
    era === "modern" ? { runtime } : { advertiseToolListChanged: true },
  ));
}

void main().catch(() => {
  // stdout is reserved for MCP JSON-RPC framing. Keep startup failure output
  // generic so credential-bearing details can never leak through this layer.
  console.error("toast-pos-mcp failed to start");
  process.exitCode = 1;
});
