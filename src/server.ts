import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const SERVER_IDENTITY = {
  name: "toast-pos-mcp",
  version: "0.0.0",
} as const;

/**
 * Construct one isolated MCP server instance.
 *
 * Tools, resources, prompts, credentials, and Toast transports are added only
 * by later reviewed slices. Keeping construction separate from process startup
 * makes the empty runtime testable without importing an auto-running module.
 */
export function createServer(): McpServer {
  return new McpServer(SERVER_IDENTITY);
}
