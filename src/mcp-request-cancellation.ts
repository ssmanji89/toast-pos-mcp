import type {
  McpServer,
  RequestId,
  ServerContext,
} from "@modelcontextprotocol/server";

export const REPORT_TOOL_REGISTRATION_MATRIX = Object.freeze([
  "toast_sales_summary",
  "toast_payment_summary",
  "toast_item_sales_summary",
  "toast_cash_summary",
  "toast_labor_summary",
  "toast_analytics_metrics_day",
] as const);

export type RegisteredReportToolName = (typeof REPORT_TOOL_REGISTRATION_MATRIX)[number];

export interface CancellationSnapshot {
  readonly activeControllers: number;
  readonly relayListeners: number;
}

export type CancellationSnapshotObserver = (snapshot: CancellationSnapshot) => void;

export interface McpRequestCancellationBridge {
  wrap<Input, Result>(
    toolName: RegisteredReportToolName,
    callback: (input: Input, context: ServerContext) => Result | Promise<Result>,
  ): (input: Input, context: ServerContext) => Promise<Result>;
}

/**
 * Correct the installed SDK's request-zero cancellation gap at the report-tool
 * boundary. The bridge uses only public SDK context and notification APIs.
 */
export function installMcpRequestCancellationBridge(
  server: McpServer,
  observer: CancellationSnapshotObserver | undefined = undefined,
): McpRequestCancellationBridge {
  const activeControllers = new Map<RequestId, AbortController>();
  let relayListeners = 0;

  const observe = (): void => observer?.({
    activeControllers: activeControllers.size,
    relayListeners,
  });

  server.server.setNotificationHandler("notifications/cancelled", (notification) => {
    const requestId = notification.params.requestId;
    if (requestId === undefined) return;
    activeControllers.get(requestId)?.abort(notification.params.reason);
  });

  return {
    wrap<Input, Result>(
      toolName: RegisteredReportToolName,
      callback: (input: Input, context: ServerContext) => Result | Promise<Result>,
    ): (input: Input, context: ServerContext) => Promise<Result> {
      assertRegisteredReportTool(toolName);
      return async (input, context) => {
        const bridgeController = new AbortController();
        const combinedController = new AbortController();
        const requestId = context.mcpReq.id;
        const abortFromSdk = (): void => combinedController.abort(context.mcpReq.signal.reason);
        const abortFromBridge = (): void => combinedController.abort(bridgeController.signal.reason);
        context.mcpReq.signal.addEventListener("abort", abortFromSdk, { once: true });
        bridgeController.signal.addEventListener("abort", abortFromBridge, { once: true });
        relayListeners += 2;
        activeControllers.set(requestId, bridgeController);
        observe();

        try {
          if (context.mcpReq.signal.aborted) abortFromSdk();
          if (bridgeController.signal.aborted) abortFromBridge();
          return await callback(input, {
            ...context,
            mcpReq: {
              ...context.mcpReq,
              signal: combinedController.signal,
            },
          });
        } finally {
          context.mcpReq.signal.removeEventListener("abort", abortFromSdk);
          bridgeController.signal.removeEventListener("abort", abortFromBridge);
          relayListeners -= 2;
          if (activeControllers.get(requestId) === bridgeController) {
            activeControllers.delete(requestId);
          }
          observe();
        }
      };
    },
  };
}

function assertRegisteredReportTool(toolName: RegisteredReportToolName): void {
  if (!REPORT_TOOL_REGISTRATION_MATRIX.includes(toolName)) {
    throw new Error("Only the reviewed report-tool registration matrix may use the cancellation bridge.");
  }
}
