import { McpServer } from "@modelcontextprotocol/server";

import type { ToastHttpClient } from "./transport.js";

export const SERVER_IDENTITY = {
  name: "toast-pos-mcp",
  version: "0.0.0",
} as const;

export interface CreateServerOptions {
  readonly toastHttpClient?: ToastHttpClient;
}

/**
 * Construct one isolated MCP server instance.
 *
 * The process stdio entry uses this as a cheap side-effect-free factory. MCP
 * protocol-era negotiation therefore owns connection state while application
 * dependencies can remain explicit process-owned objects captured by the
 * factory. No Toast data tools, resources, or prompts are registered yet.
 */
export function createServer(_options: CreateServerOptions = {}): McpServer {
  return new McpServer(SERVER_IDENTITY);
}
