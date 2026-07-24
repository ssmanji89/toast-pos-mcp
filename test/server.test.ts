import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createServer, SERVER_IDENTITY } from "../src/server.js";

test("constructs a server without starting process IO", async () => {
  const server = createServer();

  assert.ok(server instanceof McpServer);
  await server.close();
});

test("starts over stdio without advertising Toast tools", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(process.cwd(), "dist", "index.js")],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({
    name: "toast-pos-mcp-test-client",
    version: "0.0.0",
  });

  try {
    await client.connect(transport);

    const serverVersion = client.getServerVersion();
    assert.equal(serverVersion?.name, SERVER_IDENTITY.name);
    assert.equal(serverVersion?.version, SERVER_IDENTITY.version);
    assert.equal(client.getServerCapabilities()?.tools, undefined);
  } finally {
    await client.close();
  }
});
