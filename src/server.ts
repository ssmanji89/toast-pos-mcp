import { McpServer } from "@modelcontextprotocol/server";

import { registerStandardReportTools } from "./report-tools.js";
import { registerAnalyticsReportTools } from "./analytics-report-tools.js";
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
   * construction tests and the raw 2025 compatibility surface. The pinned
   * 2026-07-28 executable path supplies this exact runtime.
   */
  readonly runtime?: ApplicationRuntime;
  /** Retained 2025 clients receive tool-list capability metadata without tools. */
  readonly advertiseToolListChanged?: boolean;
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
  const server = new McpServer(
    SERVER_IDENTITY,
    options.advertiseToolListChanged === true
      ? { capabilities: { tools: { listChanged: true } } }
      : undefined,
  );
  if (options.runtime !== undefined) {
    registerStandardReportTools(server, options.runtime);
    registerAnalyticsReportTools(server, options.runtime);
  }
  return server;
}
