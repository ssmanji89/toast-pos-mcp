#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createOAuthTokenManager } from "./auth.js";
import { loadRuntimeConfig } from "./config.js";
import { createServer } from "./server.js";
import { createToastHttpClient } from "./transport.js";

async function main(): Promise<void> {
  // Fail closed before any MCP transport starts: runtime configuration must
  // validate and the operator must have explicitly acknowledged documented
  // Merchant consent for AI processing. See
  // docs/architecture/public-use-boundary.md.
  const config = loadRuntimeConfig();
  const tokenManager = createOAuthTokenManager(config);
  const toastHttpClient = createToastHttpClient(config, tokenManager);

  const server = createServer({ toastHttpClient });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

void main().catch(() => {
  // stdout is reserved for MCP JSON-RPC framing. Keep startup failure output
  // generic so later credential-bearing errors cannot leak through this layer.
  console.error("toast-pos-mcp failed to start");
  process.exitCode = 1;
});
