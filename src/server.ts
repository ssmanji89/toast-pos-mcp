import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
 * T1-004 wires the shared Toast HTTP transport into process startup so future
 * slices can attach tools without reloading credentials. No Toast data tools,
 * resources, or prompts are registered by this slice.
 */
export function createServer(_options: CreateServerOptions = {}): McpServer {
  return new McpServer(SERVER_IDENTITY);
}
