import assert from "node:assert/strict";
import { setImmediate as delayUntilImmediate } from "node:timers/promises";
import test from "node:test";

import {
  serveStdio,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";

import { createServer } from "../src/server.js";
import { startStdioServer } from "../src/stdio.js";

const SYNTHETIC_TRANSPORT_ERROR_MARKER =
  "synthetic-stdio-error-marker-must-not-leak";

test("stdio transport failure is terminal, sanitized, and closes the owned handle", async () => {
  const originalExitCode = process.exitCode;
  const originalConsoleError = console.error;
  const stderrCalls: unknown[][] = [];
  let closeCount = 0;

  const fakeServe: typeof serveStdio = (_factory, options = {}) => {
    const handle: StdioServerHandle = {
      close: async () => {
        closeCount += 1;
      },
    };

    queueMicrotask(() => {
      options.onerror?.(new Error(SYNTHETIC_TRANSPORT_ERROR_MARKER));
    });

    return handle;
  };

  process.exitCode = undefined;
  console.error = (...values: unknown[]) => {
    stderrCalls.push(values);
  };

  try {
    startStdioServer(() => createServer(), { serve: fakeServe });
    await delayUntilImmediate();

    assert.equal(process.exitCode, 1);
    assert.equal(closeCount, 1);
    assert.deepEqual(stderrCalls, [["toast-pos-mcp stdio transport error"]]);
    assert.ok(
      !JSON.stringify(stderrCalls).includes(SYNTHETIC_TRANSPORT_ERROR_MARKER),
    );
  } finally {
    console.error = originalConsoleError;
    process.exitCode = originalExitCode;
  }
});

test("repeated stdio error callbacks trigger one terminal transition", async () => {
  let fatalCount = 0;
  let closeCount = 0;

  const fakeServe: typeof serveStdio = (_factory, options = {}) => {
    const handle: StdioServerHandle = {
      close: async () => {
        closeCount += 1;
      },
    };

    queueMicrotask(() => {
      options.onerror?.(new Error("synthetic-first"));
      options.onerror?.(new Error("synthetic-second"));
    });

    return handle;
  };

  startStdioServer(() => createServer(), {
    serve: fakeServe,
    onFatalError: () => {
      fatalCount += 1;
    },
  });
  await delayUntilImmediate();

  assert.equal(fatalCount, 1);
  assert.equal(closeCount, 1);
});
