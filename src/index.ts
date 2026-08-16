#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

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

  // MCP v2's stdio entry owns protocol-era negotiation. The same cheap server
  // factory serves legacy 2025 clients and 2026-07-28 clients while the
  // process-owned Toast runtime remains explicit and shared. No data request
  // occurs until a later tool handler actually uses the transport.
  serveStdio(() => createServer({ toastHttpClient }), {
    legacy: "serve",
    onerror: () => {
      // Do not interpolate SDK/transport errors. Future failures may include
      // credential- or upstream-shaped detail, and stderr is not a secret sink.
      console.error("toast-pos-mcp stdio transport error");
    },
  });
}

void main().catch(() => {
  // stdout is reserved for MCP JSON-RPC framing. Keep startup failure output
  // generic so later credential-bearing errors cannot leak through this layer.
  console.error("toast-pos-mcp failed to start");
  process.exitCode = 1;
});
