import {
  serveStdio,
  type StdioServerHandle,
} from "@modelcontextprotocol/server/stdio";

export type StdioServerFactory = Parameters<typeof serveStdio>[0];

export interface StartStdioServerOptions {
  /** Injectable only so the owned failure path can be exercised without a second server implementation. */
  readonly serve?: typeof serveStdio;
  /**
   * Fatal-error sink. The callback intentionally receives no caught Error so
   * transport/SDK details can never cross this boundary by accident.
   */
  readonly onFatalError?: () => void;
}

/**
 * Start the one process-owned MCP stdio boundary.
 *
 * `serveStdio()` reports transport-start and later wire errors through
 * `onerror`; its asynchronous start rejection is not propagated to the
 * caller. This wrapper therefore makes every such error terminal for the
 * process while keeping the original Error object inside the SDK boundary.
 * The returned handle is also closed so a broken transport cannot leave a
 * half-alive process waiting on stdio.
 */
export function startStdioServer(
  factory: StdioServerFactory,
  options: StartStdioServerOptions = {},
): StdioServerHandle {
  const serve = options.serve ?? serveStdio;
  const onFatalError = options.onFatalError ?? defaultFatalError;
  let handle: StdioServerHandle | undefined;
  let failed = false;

  const failClosed = (): void => {
    if (failed) {
      return;
    }
    failed = true;
    onFatalError();

    // `serveStdio` may call onerror from the asynchronous start path after
    // returning the handle, or a custom transport may report synchronously.
    // Queue the close so the handle assignment has completed in either case.
    queueMicrotask(() => {
      void handle?.close().catch(() => {
        // The original failure is already terminal. Never surface a close
        // failure with transport-shaped detail from this sanitization layer.
      });
    });
  };

  handle = serve(factory, {
    legacy: "serve",
    onerror: failClosed,
  });

  return handle;
}

function defaultFatalError(): void {
  console.error("toast-pos-mcp stdio transport error");
  process.exitCode = 1;
}
