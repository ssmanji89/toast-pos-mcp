import type {
  JSONRPCMessage,
  RequestId,
  Transport,
} from "@modelcontextprotocol/server";

import { REPORT_TOOL_REGISTRATION_MATRIX } from "./mcp-request-cancellation.js";

const REPORT_TOOL_NAMES = new Set<string>(REPORT_TOOL_REGISTRATION_MATRIX);

/**
 * Tracks only report calls that the official stdio entry has already
 * dispatched. Unknown notification IDs are never retained.
 */
export class AcceptedReportRequestRegistry {
  readonly #accepted = new Map<RequestId, boolean>();

  acceptInbound(message: JSONRPCMessage): boolean {
    if (!isReportToolRequest(message)) return true;
    if (this.#accepted.has(message.id)) return false;
    this.#accepted.set(message.id, false);
    return true;
  }

  observeOutbound(message: JSONRPCMessage): void {
    if (!isResponse(message)) return;
    this.#accepted.delete(message.id);
  }

  markCancelled(requestId: RequestId): boolean {
    if (!this.#accepted.has(requestId)) return false;
    this.#accepted.set(requestId, true);
    return true;
  }

  consumeCancellation(requestId: RequestId): boolean {
    return this.#accepted.get(requestId) === true;
  }

  complete(requestId: RequestId): void {
    this.#accepted.delete(requestId);
  }

  clear(): void {
    this.#accepted.clear();
  }
}

/**
 * Delegates every framing operation to the official transport. It observes a
 * decoded report request only after forwarding it into the stdio entry.
 */
export class AcceptedRequestTrackingTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  readonly #transport: Transport;
  readonly #acceptedRequests: AcceptedReportRequestRegistry;

  constructor(
    transport: Transport,
    acceptedRequests: AcceptedReportRequestRegistry,
  ) {
    this.#transport = transport;
    this.#acceptedRequests = acceptedRequests;
    this.#transport.onmessage = (message) => {
      if (!this.#acceptedRequests.acceptInbound(message)) return;
      this.onmessage?.(message);
    };
    this.#transport.onerror = (error) => this.onerror?.(error);
    this.#transport.onclose = () => {
      this.#acceptedRequests.clear();
      this.onclose?.();
    };
  }

  start(): Promise<void> {
    return this.#transport.start();
  }

  close(): Promise<void> {
    this.#acceptedRequests.clear();
    return this.#transport.close();
  }

  send(message: JSONRPCMessage): Promise<void> {
    this.#acceptedRequests.observeOutbound(message);
    return this.#transport.send(message);
  }
}

function isReportToolRequest(message: JSONRPCMessage): message is JSONRPCMessage & {
  readonly id: RequestId;
  readonly method: "tools/call";
  readonly params: { readonly name: string };
} {
  if (message === null || typeof message !== "object") return false;
  if (!("id" in message) || !("method" in message) || !("params" in message)) return false;
  if (message.method !== "tools/call" || !isRequestId(message.id)) return false;
  const params = message.params;
  return params !== null && typeof params === "object" && "name" in params
    && typeof params.name === "string" && REPORT_TOOL_NAMES.has(params.name);
}

function isResponse(message: JSONRPCMessage): message is JSONRPCMessage & { readonly id: RequestId } {
  return message !== null && typeof message === "object" && "id" in message && !("method" in message)
    && isRequestId(message.id);
}

function isRequestId(value: unknown): value is RequestId {
  return typeof value === "string" || typeof value === "number";
}
