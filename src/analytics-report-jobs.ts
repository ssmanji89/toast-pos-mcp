import {
  type AnalyticsAccessAdapter,
  type AnalyticsRestaurantSelection,
  type AnalyticsTokenManager,
} from "./analytics-access.js";

const MAX_REPORT_REQUEST_ID_LENGTH = 512;
const DATE_PATTERN = /^\d{8}$/u;
const jobOwnerByDescriptor = new WeakMap<AnalyticsReportJobDescriptor, AnalyticsReportJobAdapter>();

type AnalyticsReportOperation =
  | "metrics"
  | "check"
  | "labor"
  | "menu"
  | "payout_settled_date"
  | "payout_sales_date";

type AnalyticsBusinessDate = string;

export type AnalyticsReportJobCreateInput =
  | {
      readonly operation: "metrics";
      readonly timeRange: "custom" | "day" | "week" | "month" | "year";
      readonly startBusinessDate: AnalyticsBusinessDate;
      readonly endBusinessDate?: AnalyticsBusinessDate;
    }
  | {
      readonly operation: "check";
      readonly timeRange: "day";
      readonly startBusinessDate: AnalyticsBusinessDate;
      readonly endBusinessDate: AnalyticsBusinessDate;
    }
  | {
      readonly operation: "labor";
      readonly timeRange: "day" | "week" | "month";
      readonly startBusinessDate: AnalyticsBusinessDate;
      readonly endBusinessDate: AnalyticsBusinessDate;
    }
  | {
      readonly operation: "menu";
      readonly timeRange: "custom" | "day" | "week" | "month" | "year";
      readonly startBusinessDate: AnalyticsBusinessDate;
      readonly endBusinessDate?: AnalyticsBusinessDate;
    }
  | {
      readonly operation: "payout_settled_date" | "payout_sales_date";
      readonly timeRange: "day" | "week" | "month";
      readonly startDate: AnalyticsBusinessDate;
      readonly endDate: AnalyticsBusinessDate;
    };

export interface AnalyticsReportJobDescriptor {
  readonly operation: AnalyticsReportOperation;
  readonly reportRequestId: string;
  readonly restaurantGuids: readonly string[];
  readonly createdAtEpochMs: number;
}

export type AnalyticsReportJobRetrievalStatus =
  | { readonly status: "complete"; readonly resultContract: "unavailable" }
  | { readonly status: "pending" }
  | { readonly status: "invalid_or_expired" }
  | { readonly status: "replacement_required" }
  | { readonly status: "failed_or_incomplete" };

export type AnalyticsReportJobErrorCode =
  | "analytics_report_job_input_invalid"
  | "analytics_report_job_descriptor_invalid"
  | "analytics_report_job_request_failed"
  | "analytics_report_job_response_invalid";

export class AnalyticsReportJobError extends Error {
  readonly code: AnalyticsReportJobErrorCode;

  constructor(code: AnalyticsReportJobErrorCode, message: string) {
    super(message);
    this.name = "AnalyticsReportJobError";
    this.code = code;
  }
}

export interface AnalyticsReportJobAdapterOptions {
  readonly access: AnalyticsAccessAdapter;
  readonly tokenManager: AnalyticsTokenManager;
  readonly hostname: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface AnalyticsReportJobRequestOptions {
  readonly signal?: AbortSignal;
}

/**
 * Closed Analytics report-job source. It has no result parser while G05 stays
 * open. It accepts only six reviewed operations and private selections.
 */
export class AnalyticsReportJobAdapter {
  #access: AnalyticsAccessAdapter;
  #fetch: typeof fetch;
  #hostname: string;
  #now: () => number;
  #sleep: (milliseconds: number) => Promise<void>;
  #tokenManager: AnalyticsTokenManager;

  constructor(options: AnalyticsReportJobAdapterOptions) {
    this.#access = options.access;
    this.#fetch = options.fetch ?? fetch;
    this.#hostname = options.hostname;
    this.#now = options.now ?? Date.now;
    this.#sleep = options.sleep ?? (async (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#tokenManager = options.tokenManager;
  }

  async create(
    selection: AnalyticsRestaurantSelection,
    input: AnalyticsReportJobCreateInput,
    options: AnalyticsReportJobRequestOptions = {},
  ): Promise<AnalyticsReportJobDescriptor> {
    throwIfCancelled(options.signal);
    this.#access.assertSelectionForCurrentIdentity(selection);
    const validated = validateCreateInput(input);
    const route = createRouteFor(validated);
    const body = createBodyFor(validated, selection.restaurantGuids);
    const authorization = await this.#authorizationHeader();
    let response: Response;
    try {
      response = await this.#fetch(`https://${this.#hostname}${route}`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
    } catch {
      throw requestFailure();
    }
    if (!response.ok) throw requestFailure();
    const reportRequestId = await readOpaqueReportRequestId(response);
    const descriptor = Object.freeze({
      operation: validated.operation,
      reportRequestId,
      restaurantGuids: Object.freeze([...selection.restaurantGuids]),
      createdAtEpochMs: this.#now(),
    });
    jobOwnerByDescriptor.set(descriptor, this);
    return descriptor;
  }

  async retrieve(
    descriptor: AnalyticsReportJobDescriptor,
    options: AnalyticsReportJobRequestOptions = {},
  ): Promise<AnalyticsReportJobRetrievalStatus> {
    throwIfCancelled(options.signal);
    if (jobOwnerByDescriptor.get(descriptor) !== this) {
      throw new AnalyticsReportJobError(
        "analytics_report_job_descriptor_invalid",
        "Analytics report-job retrieval requires a descriptor created by this adapter.",
      );
    }
    const route = retrieveRouteFor(descriptor.operation, descriptor.reportRequestId);
    const authorization = await this.#authorizationHeader();
    let response: Response;
    try {
      response = await this.#fetch(`https://${this.#hostname}${route}`, {
        method: "GET",
        headers: { authorization },
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      });
    } catch {
      throw requestFailure();
    }
    return classifyAnalyticsReportJobRetrievalStatus(response.status);
  }

  async #authorizationHeader(): Promise<string> {
    try {
      return await this.#tokenManager.getAuthorizationHeader();
    } catch {
      throw requestFailure();
    }
  }
}

export function createAnalyticsReportJobAdapter(
  options: AnalyticsReportJobAdapterOptions,
): AnalyticsReportJobAdapter {
  return new AnalyticsReportJobAdapter(options);
}

export function classifyAnalyticsReportJobRetrievalStatus(
  statusCode: number,
): AnalyticsReportJobRetrievalStatus {
  switch (statusCode) {
    case 200:
      return Object.freeze({ status: "complete", resultContract: "unavailable" });
    case 202:
      return Object.freeze({ status: "pending" });
    case 404:
      return Object.freeze({ status: "invalid_or_expired" });
    case 409:
      return Object.freeze({ status: "replacement_required" });
    default:
      return Object.freeze({ status: "failed_or_incomplete" });
  }
}

function createRouteFor(input: AnalyticsReportJobCreateInput): string {
  switch (input.operation) {
    case "metrics":
      return input.timeRange === "custom" ? "/era/v1/metrics" : `/era/v1/metrics/${input.timeRange}`;
    case "check":
      return "/era/v1/check/day";
    case "labor":
      return `/era/v1/labor/${input.timeRange}`;
    case "menu":
      return input.timeRange === "custom" ? "/era/v1/menu" : `/era/v1/menu/${input.timeRange}`;
    case "payout_settled_date":
      return `/era/v1/payout/${input.timeRange}`;
    case "payout_sales_date":
      return `/era/v1/payout/sales-date/${input.timeRange}`;
  }
}

function retrieveRouteFor(operation: AnalyticsReportOperation, reportRequestId: string): string {
  const encodedId = encodeURIComponent(reportRequestId);
  switch (operation) {
    case "metrics":
      return `/era/v1/metrics/${encodedId}`;
    case "check":
      return `/era/v1/check/${encodedId}`;
    case "labor":
      return `/era/v1/labor/${encodedId}`;
    case "menu":
      return `/era/v1/menu/${encodedId}`;
    case "payout_settled_date":
      return `/era/v1/payout/${encodedId}`;
    case "payout_sales_date":
      return `/era/v1/payout/sales-date/${encodedId}`;
  }
}

function createBodyFor(
  input: AnalyticsReportJobCreateInput,
  restaurantGuids: readonly string[],
): Record<string, unknown> {
  const base = {
    restaurantIds: restaurantGuids,
    excludedRestaurantIds: [] as const,
  };
  switch (input.operation) {
    case "metrics":
    case "check":
    case "labor":
    case "menu":
      return {
        ...base,
        startBusinessDate: input.startBusinessDate,
        ...(input.endBusinessDate !== undefined
          ? { endBusinessDate: input.endBusinessDate }
          : {}),
      };
    case "payout_settled_date":
    case "payout_sales_date":
      return { ...base, startDate: input.startDate, endDate: input.endDate };
  }
}

function validateCreateInput(input: AnalyticsReportJobCreateInput): AnalyticsReportJobCreateInput {
  if (!isRecord(input) || typeof input.operation !== "string" || typeof input.timeRange !== "string") {
    throw inputError();
  }
  switch (input.operation) {
    case "metrics":
      return validateBusinessDateInput(input, ["custom", "day", "week", "month", "year"], ["operation", "timeRange", "startBusinessDate", "endBusinessDate"], "metrics");
    case "check":
      return validateBusinessDateInput(input, ["day"], ["operation", "timeRange", "startBusinessDate", "endBusinessDate"], "check");
    case "labor":
      return validateBusinessDateInput(input, ["day", "week", "month"], ["operation", "timeRange", "startBusinessDate", "endBusinessDate"], "labor");
    case "menu":
      return validateBusinessDateInput(input, ["custom", "day", "week", "month", "year"], ["operation", "timeRange", "startBusinessDate", "endBusinessDate"], "menu");
    case "payout_settled_date":
    case "payout_sales_date":
      return validatePayoutInput(input);
    default:
      throw inputError();
  }
}

function validateBusinessDateInput(
  input: Record<string, unknown>,
  ranges: readonly string[],
  allowedKeys: readonly string[],
  operation: "metrics" | "check" | "labor" | "menu",
): AnalyticsReportJobCreateInput {
  if (!hasOnlyKeys(input, allowedKeys) || !ranges.includes(String(input.timeRange)) || !isBusinessDate(input.startBusinessDate)) {
    throw inputError();
  }
  const end = input.endBusinessDate;
  if (end !== undefined && !isBusinessDate(end)) throw inputError();
  if ((operation === "check" || operation === "labor") && end === undefined) throw inputError();
  if (input.timeRange === "custom" && end === undefined) throw inputError();
  if (end !== undefined) validateDateRange(input.timeRange, input.startBusinessDate, end, operation);
  return input as AnalyticsReportJobCreateInput;
}

function validatePayoutInput(input: Record<string, unknown>): AnalyticsReportJobCreateInput {
  if (
    !hasOnlyKeys(input, ["operation", "timeRange", "startDate", "endDate"])
    || !["day", "week", "month"].includes(String(input.timeRange))
    || !isBusinessDate(input.startDate)
    || !isBusinessDate(input.endDate)
  ) {
    throw inputError();
  }
  validateDateRange(input.timeRange, input.startDate, input.endDate, "payout");
  return input as AnalyticsReportJobCreateInput;
}

function validateDateRange(
  timeRange: unknown,
  start: string,
  end: string,
  operation: "metrics" | "check" | "labor" | "menu" | "payout",
): void {
  const startEpoch = dateEpoch(start);
  const endEpoch = dateEpoch(end);
  if (endEpoch < startEpoch) throw inputError();
  const inclusiveDays = Math.floor((endEpoch - startEpoch) / 86_400_000) + 1;
  if ((operation === "check" || (operation === "labor" && timeRange === "day") || (operation === "payout" && timeRange === "day")) && inclusiveDays !== 1) throw inputError();
  if ((operation === "metrics" || operation === "menu" || operation === "payout") && timeRange === "week" && inclusiveDays > 7) throw inputError();
  if ((operation === "metrics" || operation === "menu" || operation === "payout") && timeRange === "month" && inclusiveDays > 31) throw inputError();
  if ((operation === "metrics" || operation === "menu") && timeRange === "year" && inclusiveDays > 366) throw inputError();
  if (operation === "metrics" && timeRange === "custom" && inclusiveDays > 366) throw inputError();
}

function isBusinessDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const epoch = dateEpoch(value);
  const date = new Date(epoch);
  return date.getUTCFullYear() === Number(value.slice(0, 4))
    && date.getUTCMonth() + 1 === Number(value.slice(4, 6))
    && date.getUTCDate() === Number(value.slice(6, 8));
}

function dateEpoch(value: string): number {
  return Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)));
}

function hasOnlyKeys(input: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(input).every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readOpaqueReportRequestId(response: Response): Promise<string> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AnalyticsReportJobError(
      "analytics_report_job_response_invalid",
      "Analytics report-job creation returned an unusable request identifier.",
    );
  }
  if (
    typeof payload !== "string"
    || payload.trim().length === 0
    || payload.length > MAX_REPORT_REQUEST_ID_LENGTH
  ) {
    throw new AnalyticsReportJobError(
      "analytics_report_job_response_invalid",
      "Analytics report-job creation returned an unusable request identifier.",
    );
  }
  return payload;
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw requestFailure();
}

function inputError(): AnalyticsReportJobError {
  return new AnalyticsReportJobError(
    "analytics_report_job_input_invalid",
    "Analytics report-job input did not match a reviewed request contract.",
  );
}

function requestFailure(): AnalyticsReportJobError {
  return new AnalyticsReportJobError(
    "analytics_report_job_request_failed",
    "Analytics report-job request did not complete.",
  );
}
