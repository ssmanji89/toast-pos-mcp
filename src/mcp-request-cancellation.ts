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
  readonly earlyCancellations: number;
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
  const earlyCancellations = new Map<RequestId, ReturnType<typeof setTimeout>>();
  let relayListeners = 0;

  const observe = (): void => observer?.({
    activeControllers: activeControllers.size,
    earlyCancellations: earlyCancellations.size,
    relayListeners,
  });

  const removeEarlyCancellation = (requestId: RequestId): boolean => {
    const timeout = earlyCancellations.get(requestId);
    if (timeout === undefined) return false;
    clearTimeout(timeout);
    earlyCancellations.delete(requestId);
    observe();
    return true;
  };

  const retainEarlyCancellation = (requestId: RequestId): void => {
    removeEarlyCancellation(requestId);
    const timeout = setTimeout(() => {
      if (earlyCancellations.get(requestId) !== timeout) return;
      earlyCancellations.delete(requestId);
      observe();
    }, EARLY_CANCELLATION_TTL_MS);
    timeout.unref();
    earlyCancellations.set(requestId, timeout);
    while (earlyCancellations.size > MAX_EARLY_CANCELLATIONS) {
      const oldestRequestId = earlyCancellations.keys().next().value;
      if (oldestRequestId === undefined) break;
      removeEarlyCancellation(oldestRequestId);
    }
    observe();
  };

  server.server.setNotificationHandler("notifications/cancelled", (notification) => {
    const requestId = notification.params.requestId;
    if (requestId === undefined) return;
    const controller = activeControllers.get(requestId);
    if (controller !== undefined) {
      controller.abort(notification.params.reason);
      return;
    }
    retainEarlyCancellation(requestId);
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
        const cancelledBeforeRegistration = removeEarlyCancellation(requestId);
        activeControllers.set(requestId, bridgeController);
        observe();

        try {
          if (context.mcpReq.signal.aborted) abortFromSdk();
          if (cancelledBeforeRegistration) bridgeController.abort();
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

const MAX_EARLY_CANCELLATIONS = 128;
const EARLY_CANCELLATION_TTL_MS = 30_000;

function assertRegisteredReportTool(toolName: RegisteredReportToolName): void {
  if (!REPORT_TOOL_REGISTRATION_MATRIX.includes(toolName)) {
    throw new Error("Only the reviewed report-tool registration matrix may use the cancellation bridge.");
  }
}
