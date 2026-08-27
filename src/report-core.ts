import { ToastAuthError } from "./auth.js";
import { ApplicationRuntimeError } from "./runtime.js";
import { ToastLocationError } from "./locations.js";
import { OrdersNormalizationError } from "./orders-normalization.js";
import { ToastHttpError, type ToastDetailedJsonResult } from "./transport.js";

const MAX_REPORT_REQUEST_IDS = 100;

export interface ReportProvenance {
  readonly retrievedThroughEpochMs: number | undefined;
  readonly upstreamRequestIds: readonly string[];
  readonly upstreamRequestIdCount: number;
  readonly upstreamRequestIdsTruncated: boolean;
}

export interface ReportDenial {
  readonly code: string;
  readonly retryable: boolean;
  readonly upstreamStatus: number | undefined;
  readonly upstreamRequestId: string | undefined;
}

export class ReportComputationError extends Error {
  readonly code: string;
  readonly retryable: false;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReportComputationError";
    this.code = code;
    this.retryable = false;
  }
}

export class ReportProvenanceCollector {
  #requestIds = new Set<string>();
  #shownRequestIds: string[] = [];
  #retrievedThroughEpochMs: number | undefined;

  add(result: ToastDetailedJsonResult): void {
    if (
      !Number.isSafeInteger(result.retrievedAtEpochMs)
      || result.retrievedAtEpochMs < 0
    ) {
      throw new ReportComputationError(
        "report_provenance_invalid",
        "A successful Toast response did not carry usable retrieval provenance.",
      );
    }

    this.#retrievedThroughEpochMs = Math.max(
      this.#retrievedThroughEpochMs ?? 0,
      result.retrievedAtEpochMs,
    );

    const requestId = result.upstreamRequestId;
    if (requestId === undefined || this.#requestIds.has(requestId)) {
      return;
    }
    this.#requestIds.add(requestId);
    if (this.#shownRequestIds.length < MAX_REPORT_REQUEST_IDS) {
      this.#shownRequestIds.push(requestId);
    }
  }

  snapshot(): ReportProvenance {
    return Object.freeze({
      retrievedThroughEpochMs: this.#retrievedThroughEpochMs,
      upstreamRequestIds: Object.freeze([...this.#shownRequestIds]),
      upstreamRequestIdCount: this.#requestIds.size,
      upstreamRequestIdsTruncated:
        this.#requestIds.size > this.#shownRequestIds.length,
    });
  }
}

export function moneyToMinorUnits(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw moneyError(field);
  }

  const twoDecimalRoundTrip = Number(value.toFixed(2));
  if (twoDecimalRoundTrip !== value) {
    throw moneyError(field);
  }

  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor)) {
    throw moneyError(field);
  }
  return minor;
}

export function addMinorUnits(...values: readonly number[]): number {
  let result = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new ReportComputationError(
        "report_minor_units_invalid",
        "A report calculation received an invalid integer minor-unit value.",
      );
    }
    result += value;
    if (!Number.isSafeInteger(result)) {
      throw new ReportComputationError(
        "report_minor_units_overflow",
        "A report total exceeded safe integer minor-unit precision.",
      );
    }
  }
  return result;
}

export function denialFromError(error: unknown): ReportDenial {
  if (error instanceof ToastHttpError) {
    return Object.freeze({
      code: error.code,
      retryable: error.retryable,
      upstreamStatus: error.upstreamStatus,
      upstreamRequestId: error.upstreamRequestId,
    });
  }
  if (error instanceof ToastAuthError) {
    return Object.freeze({
      code: error.code,
      retryable: false,
      upstreamStatus: error.upstreamStatus,
      upstreamRequestId: error.upstreamRequestId,
    });
  }
  if (
    error instanceof ToastLocationError
    || error instanceof ApplicationRuntimeError
    || error instanceof OrdersNormalizationError
    || error instanceof ReportComputationError
  ) {
    return Object.freeze({
      code: error.code,
      retryable: false,
      upstreamStatus: undefined,
      upstreamRequestId: undefined,
    });
  }

  return Object.freeze({
    code: "report_internal_failure",
    retryable: false,
    upstreamStatus: undefined,
    upstreamRequestId: undefined,
  });
}

function moneyError(field: string): ReportComputationError {
  return new ReportComputationError(
    "report_money_precision_invalid",
    `${field} could not be represented exactly as two-decimal minor units.`,
  );
}
