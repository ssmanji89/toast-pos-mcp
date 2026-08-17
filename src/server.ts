import { McpServer } from "@modelcontextprotocol/server";

import { registerStandardReportTools } from "./report-tools.js";
import type { ApplicationRuntime } from "./runtime.js";

export const SERVER_IDENTITY = {
  name: "toast-pos-mcp",
  version: "0.0.0",
} as const;

export interface CreateServerOptions {
  /**
   * Process-owned Toast runtime. When present, the server registers the
   * production report tools against this exact runtime identity. Omitting it
   * is intentionally supported only for side-effect-free protocol/factory
   * construction tests; the executable path always supplies one.
   */
  readonly runtime?: ApplicationRuntime;
}

/**
 * Construct one isolated MCP server instance.
 *
 * MCP protocol-era/session state belongs to this server instance. Toast
 * credential/config/location/rate-limit/report state belongs to the captured
 * process-owned ApplicationRuntime and is shared across every instance the
 * stdio era-negotiation factory creates.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(SERVER_IDENTITY);
  if (options.runtime !== undefined) {
    registerStandardReportTools(server, options.runtime);
  }
  return server;
}
