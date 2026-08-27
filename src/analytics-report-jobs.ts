import {
  type AnalyticsAccessAdapter,
  type AnalyticsRestaurantSelection,
  type AnalyticsTokenManager,
} from "./analytics-access.js";
import { decideAnalyticsCapability } from "./capabilities.js";

const MAX_REPORT_REQUEST_ID_LENGTH = 512;
const DATE_PATTERN = /^\d{8}$/u;
/** Local safety policy. These values are not Toast rate-limit facts. */
export const ANALYTICS_REPORT_JOB_POLL_INTERVAL_MS = 1_000;
export const ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS = 30;
export const ANALYTICS_REPORT_JOB_MAX_POLL_ELAPSED_MS = 30_000;
export const ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS = 1;
const jobOwnerByDescriptor = new WeakMap<AnalyticsReportJobDescriptor, AnalyticsReportJobAdapter>();
const selectionByDescriptor = new WeakMap<AnalyticsReportJobDescriptor, AnalyticsRestaurantSelection>();
const limiterByAnalyticsIdentity = new WeakMap<object, Map<string, number[]>>();

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
  readonly timeRange: AnalyticsReportJobCreateInput["timeRange"];
}

export type AnalyticsReportJobLifecycleStatus =
  | "capability_denied"
  | "result_contract_unavailable"
  | "pending_exhausted"
  | "invalid_or_expired"
  | "replacement_exhausted"
  | "failed_or_incomplete";

export interface AnalyticsReportJobLifecycleResult {
  readonly status: AnalyticsReportJobLifecycleStatus;
  readonly completeness: Readonly<{
    readonly state: "denied" | "incomplete";
    readonly reason: AnalyticsReportJobLifecycleStatus;
  }>;
  readonly provenance: Readonly<{
    readonly apiFamily: "analytics";
    readonly operation: AnalyticsReportOperation;
    readonly timeRange: AnalyticsReportJobCreateInput["timeRange"];
    readonly restaurantGuids: readonly string[];
    readonly createdAtEpochMs: number;
    readonly completedAtEpochMs: number;
    readonly pollCount: number;
    readonly replacementCount: number;
    readonly responseRequestIds: readonly string[];
  }>;
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
  | "analytics_report_job_response_invalid"
  | "analytics_report_job_cancelled";

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
  /** The private Analytics config identity. It never enters a result envelope. */
  readonly identity?: object;
  readonly tokenManager: AnalyticsTokenManager;
  readonly hostname: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number, options?: AnalyticsReportJobRequestOptions) => Promise<void>;
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
  #identity: object;
  #limiter: Map<string, number[]>;
  #now: () => number;
  #sleep: (milliseconds: number, options?: AnalyticsReportJobRequestOptions) => Promise<void>;
  #tokenManager: AnalyticsTokenManager;

  constructor(options: AnalyticsReportJobAdapterOptions) {
    this.#access = options.access;
    this.#fetch = options.fetch ?? fetch;
    this.#hostname = options.hostname;
    this.#identity = options.identity ?? options.access;
    this.#limiter = limiterByAnalyticsIdentity.get(this.#identity) ?? new Map();
    limiterByAnalyticsIdentity.set(this.#identity, this.#limiter);
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
    return this.#createValidated(selection, validated, options.signal);
  }

  async retrieve(
    descriptor: AnalyticsReportJobDescriptor,
    options: AnalyticsReportJobRequestOptions = {},
  ): Promise<AnalyticsReportJobRetrievalStatus> {
    return (await this.#retrieveDescriptor(descriptor, options.signal)).status;
  }

  /**
   * Run one finite lifecycle. The result is always a body-free non-success
   * envelope while G05 remains open. Cancellation rejects with a sanitized
   * error and never publishes an envelope after the caller stops waiting.
   */
  async runReportJob(
    selection: AnalyticsRestaurantSelection,
    input: AnalyticsReportJobCreateInput,
    options: AnalyticsReportJobRequestOptions = {},
  ): Promise<AnalyticsReportJobLifecycleResult> {
    const signal = options.signal;
    throwIfCancelled(signal);
    this.#access.assertSelectionForCurrentIdentity(selection);
    const validated = validateCreateInput(input);
    const startedAtEpochMs = this.#now();
    let pollCount = 0;
    let replacementCount = 0;
    let descriptor: AnalyticsReportJobDescriptor;
    try {
      descriptor = await this.#createValidated(selection, validated, signal);
    } catch (error) {
      if (isCancellation(signal, error)) throw cancellationFailure();
      if (error instanceof AnalyticsReportJobError && error.code === "analytics_report_job_request_failed") {
        return this.#lifecycleResult("failed_or_incomplete", validated, selection, startedAtEpochMs, pollCount, replacementCount, []);
      }
      throw error;
    }

    const responseRequestIds: string[] = [];
    for (;;) {
      throwIfCancelled(signal);
      const turn = await this.#retrieveDescriptor(descriptor, signal);
      throwIfCancelled(signal);
      if (turn.requestId !== undefined) responseRequestIds.push(turn.requestId);
      switch (turn.status.status) {
        case "complete":
          return this.#lifecycleResult("result_contract_unavailable", validated, selection, startedAtEpochMs, pollCount, replacementCount, responseRequestIds);
        case "invalid_or_expired":
          return this.#lifecycleResult("invalid_or_expired", validated, selection, startedAtEpochMs, pollCount, replacementCount, responseRequestIds);
        case "failed_or_incomplete":
          return this.#lifecycleResult("failed_or_incomplete", validated, selection, startedAtEpochMs, pollCount, replacementCount, responseRequestIds);
        case "replacement_required":
          if (replacementCount >= ANALYTICS_REPORT_JOB_MAX_REPLACEMENTS) {
            return this.#lifecycleResult("replacement_exhausted", validated, selection, startedAtEpochMs, pollCount, replacementCount, responseRequestIds);
          }
          replacementCount += 1;
          descriptor = await this.#createValidated(selection, validated, signal);
          continue;
        case "pending":
          pollCount += 1;
          if (
            pollCount >= ANALYTICS_REPORT_JOB_MAX_POLL_ATTEMPTS
            || this.#now() - startedAtEpochMs >= ANALYTICS_REPORT_JOB_MAX_POLL_ELAPSED_MS
          ) {
            return this.#lifecycleResult("pending_exhausted", validated, selection, startedAtEpochMs, pollCount, replacementCount, responseRequestIds);
          }
          await awaitWithCancellation(
            this.#sleep(ANALYTICS_REPORT_JOB_POLL_INTERVAL_MS, { ...(signal === undefined ? {} : { signal }) }),
            signal,
          );
      }
    }
  }

  async #createValidated(
    selection: AnalyticsRestaurantSelection,
    validated: AnalyticsReportJobCreateInput,
    signal: AbortSignal | undefined,
  ): Promise<AnalyticsReportJobDescriptor> {
    await this.#assertCapability(signal);
    await this.#waitForCapacity(validated.operation, "POST", validated.timeRange, selection.restaurantGuids, signal);
    throwIfCancelled(signal);
    const route = createRouteFor(validated);
    const body = createBodyFor(validated, selection.restaurantGuids);
    const authorization = await this.#authorizationHeader(signal);
    let response: Response;
    try {
      response = await awaitWithCancellation(this.#fetch(`https://${this.#hostname}${route}`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        ...(signal !== undefined ? { signal } : {}),
      }), signal);
    } catch {
      if (signal?.aborted) throw cancellationFailure();
      throw requestFailure();
    }
    throwIfCancelled(signal);
    if (!response.ok) throw requestFailure();
    const reportRequestId = await readOpaqueReportRequestId(response, signal);
    throwIfCancelled(signal);
    const descriptor = Object.freeze({
      operation: validated.operation,
      reportRequestId,
      restaurantGuids: Object.freeze([...selection.restaurantGuids]),
      createdAtEpochMs: this.#now(),
      timeRange: validated.timeRange,
    });
    jobOwnerByDescriptor.set(descriptor, this);
    selectionByDescriptor.set(descriptor, selection);
    return descriptor;
  }

  async #retrieveDescriptor(
    descriptor: AnalyticsReportJobDescriptor,
    signal: AbortSignal | undefined,
  ): Promise<Readonly<{ status: AnalyticsReportJobRetrievalStatus; requestId?: string }>> {
    throwIfCancelled(signal);
    if (jobOwnerByDescriptor.get(descriptor) !== this) {
      throw new AnalyticsReportJobError(
        "analytics_report_job_descriptor_invalid",
        "Analytics report-job retrieval requires a descriptor created by this adapter.",
      );
    }
    const selection = selectionByDescriptor.get(descriptor);
    if (selection === undefined) throw requestFailure();
    this.#access.assertSelectionForCurrentIdentity(selection);
    await this.#assertCapability(signal);
    await this.#waitForCapacity(descriptor.operation, "GET", descriptor.timeRange, descriptor.restaurantGuids, signal);
    throwIfCancelled(signal);
    const route = retrieveRouteFor(descriptor.operation, descriptor.reportRequestId);
    const authorization = await this.#authorizationHeader(signal);
    let response: Response;
    try {
      response = await awaitWithCancellation(this.#fetch(`https://${this.#hostname}${route}`, {
        method: "GET",
        headers: { authorization },
        ...(signal !== undefined ? { signal } : {}),
      }), signal);
    } catch {
      if (signal?.aborted) throw cancellationFailure();
      throw requestFailure();
    }
    throwIfCancelled(signal);
    if (response.status === 429) await this.#waitFor429(response, signal);
    const requestId = response.headers?.get("x-request-id") ?? response.headers?.get("toast-request-id") ?? undefined;
    return Object.freeze({ status: classifyAnalyticsReportJobRetrievalStatus(response.status), ...(requestId === undefined ? {} : { requestId }) });
  }

  async #authorizationHeader(signal: AbortSignal | undefined): Promise<string> {
    try {
      const manager = this.#tokenManager as SignalAwareAnalyticsTokenManager;
      return await awaitWithCancellation(manager.getAuthorizationHeader({ ...(signal === undefined ? {} : { signal }) }), signal);
    } catch {
      if (signal?.aborted) throw cancellationFailure();
      throw requestFailure();
    }
  }

  async #assertCapability(signal: AbortSignal | undefined): Promise<void> {
    const manager = this.#tokenManager as SignalAwareAnalyticsTokenManager;
    const decision = await awaitWithCancellation(decideAnalyticsCapability({
      getProvisionedScopes: () => manager.getProvisionedScopes({ ...(signal === undefined ? {} : { signal }) }),
    }), signal);
    throwIfCancelled(signal);
    if (decision.status === "denied") {
      throw new AnalyticsReportJobError("analytics_report_job_request_failed", "Analytics report-job capability is unavailable.");
    }
  }

  async #waitForCapacity(
    operation: AnalyticsReportOperation,
    method: "POST" | "GET",
    timeRange: AnalyticsReportJobCreateInput["timeRange"],
    restaurantGuids: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    throwIfCancelled(signal);
    const limits = rateLimitsFor(operation, method, timeRange);
    const key = `${operation}|${method}|${timeRange}|${restaurantGuids.join(",")}`;
    const now = this.#now();
    const prior = (this.#limiter.get(key) ?? []).filter((at) => at > now - limits.windowMs);
    if (prior.length >= limits.maxRequests) {
      const delay = Math.max(1, prior[0]! + limits.windowMs - now);
      await awaitWithCancellation(this.#sleep(delay, { ...(signal === undefined ? {} : { signal }) }), signal);
      throwIfCancelled(signal);
      return this.#waitForCapacity(operation, method, timeRange, restaurantGuids, signal);
    }
    prior.push(now);
    this.#limiter.set(key, prior);
  }

  async #waitFor429(response: Response, signal: AbortSignal | undefined): Promise<void> {
    const retryAfter = response.headers?.get("retry-after");
    const seconds = retryAfter === null || retryAfter === undefined ? 1 : Number(retryAfter);
    const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1_000, 30_000) : 1_000;
    await awaitWithCancellation(this.#sleep(delay, { ...(signal === undefined ? {} : { signal }) }), signal);
    throwIfCancelled(signal);
  }

  #lifecycleResult(
    status: AnalyticsReportJobLifecycleStatus,
    input: AnalyticsReportJobCreateInput,
    selection: AnalyticsRestaurantSelection,
    createdAtEpochMs: number,
    pollCount: number,
    replacementCount: number,
    responseRequestIds: readonly string[],
  ): AnalyticsReportJobLifecycleResult {
    return Object.freeze({
      status,
      completeness: Object.freeze({ state: status === "capability_denied" ? "denied" : "incomplete", reason: status }),
      provenance: Object.freeze({
        apiFamily: "analytics",
        operation: input.operation,
        timeRange: input.timeRange,
        restaurantGuids: Object.freeze([...selection.restaurantGuids]),
        createdAtEpochMs,
        completedAtEpochMs: this.#now(),
        pollCount,
        replacementCount,
        responseRequestIds: Object.freeze([...responseRequestIds]),
      }),
    });
  }
}

export function createAnalyticsReportJobAdapter(
  options: AnalyticsReportJobAdapterOptions,
): AnalyticsReportJobAdapter {
  return new AnalyticsReportJobAdapter(options);
}

interface SignalAwareAnalyticsTokenManager {
  getAuthorizationHeader(options?: AnalyticsReportJobRequestOptions): Promise<string>;
  getProvisionedScopes(options?: AnalyticsReportJobRequestOptions): Promise<unknown>;
}

interface AnalyticsLimiterBudget {
  readonly maxRequests: number;
  readonly windowMs: number;
}

function rateLimitsFor(
  operation: AnalyticsReportOperation,
  method: "POST" | "GET",
  timeRange: AnalyticsReportJobCreateInput["timeRange"],
): AnalyticsLimiterBudget {
  if (method === "GET") return { maxRequests: 5, windowMs: 1_000 };
  if (operation === "check") return { maxRequests: 5, windowMs: 60_000 };
  if (timeRange === "custom" || timeRange === "month" || timeRange === "year") {
    return { maxRequests: 10, windowMs: 3_600_000 };
  }
  return { maxRequests: 10, windowMs: 60_000 };
}

function isCancellation(signal: AbortSignal | undefined, _error: unknown): boolean {
  return signal?.aborted === true;
}

async function awaitWithCancellation<T>(
  operation: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return operation;
  throwIfCancelled(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(cancellationFailure()));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => finish(() => resolve(value)),
      () => finish(() => reject(requestFailure())),
    );
  });
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

async function readOpaqueReportRequestId(
  response: Response,
  signal: AbortSignal | undefined,
): Promise<string> {
  let payload: unknown;
  try {
    payload = await awaitWithCancellation(response.json(), signal);
  } catch {
    if (signal?.aborted) throw cancellationFailure();
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
  if (signal?.aborted) throw cancellationFailure();
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

function cancellationFailure(): AnalyticsReportJobError {
  return new AnalyticsReportJobError(
    "analytics_report_job_cancelled",
    "Analytics report-job request was cancelled before completion.",
  );
}
