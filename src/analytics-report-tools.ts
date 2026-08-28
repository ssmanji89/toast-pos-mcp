import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  AnalyticsAccessError,
  validateAnalyticsRestaurantSelection,
} from "./analytics-access.js";
import {
  AnalyticsReportJobError,
  type AnalyticsReportJobLifecycleResult,
} from "./analytics-report-jobs.js";
import type { ApplicationRuntime } from "./runtime.js";

const ANALYTICS_REPORT_SCHEMA_VERSION: 1 = 1;
const ANALYTICS_METRICS_DAY_TOOL = "toast_analytics_metrics_day";
const analyticsBusinessDateSchema = z.number().int().refine(isValidBusinessDate, {
  message: "businessDate must be a real calendar date in yyyyMMdd form",
});
const analyticsToolInputSchema = z.object({
  restaurantGuid: z.string().uuid().describe("One Analytics-authorized Toast restaurant GUID."),
  businessDate: analyticsBusinessDateSchema.describe("One explicit restaurant business date in yyyyMMdd form."),
}).strict();
const lifecycleProvenanceSchema = z.object({
  apiFamily: z.literal("analytics"),
  operation: z.literal("metrics"),
  timeRange: z.literal("day"),
  restaurantGuids: z.array(z.string().uuid()).length(1),
  createdAtEpochMs: z.number().int().nonnegative(),
  completedAtEpochMs: z.number().int().nonnegative(),
  pollCount: z.number().int().nonnegative(),
  replacementCount: z.number().int().nonnegative(),
  responseRequestIds: z.array(z.string().min(1)),
});
const analyticsEnvelopeSchema = z.object({
  schemaVersion: z.literal(ANALYTICS_REPORT_SCHEMA_VERSION),
  status: z.union([z.literal("denied"), z.literal("incomplete")]),
  reason: z.string().min(1),
  source: z.literal("analytics_api"),
  report: z.literal("analytics_metrics_day"),
  restaurantGuid: z.string().uuid(),
  businessDate: analyticsBusinessDateSchema,
  provenance: lifecycleProvenanceSchema.optional(),
  requestPolicyExclusions: z.array(z.string()),
  formulaNote: z.string().min(1),
}).strict();

const requestPolicyExclusions = Object.freeze([
  "guest_linked_data",
  "payment_data",
  "restaurant_name",
  "grouping",
  "inactive_only",
]);
const formulaNote = "Analytics output is informational and non-GAAP. Completed source result schemas are not projected.";

export function registerAnalyticsReportTools(
  server: McpServer,
  runtime: ApplicationRuntime,
): void {
  server.registerTool(
    ANALYTICS_METRICS_DAY_TOOL,
    {
      title: "Toast Analytics Metrics Day",
      description: "Return a body-free, read-only Analytics Metrics/day lifecycle envelope for one selected restaurant and business date.",
      inputSchema: analyticsToolInputSchema,
      outputSchema: analyticsEnvelopeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const access = runtime.analyticsAccess;
      const jobs = runtime.analyticsReportJobs;
      if (access === undefined || jobs === undefined) {
        return analyticsToolResult(deniedEnvelope(input.restaurantGuid, input.businessDate, "analytics_runtime_unavailable"));
      }

      try {
        const registry = await access.refreshManagementGroupRestaurants({ signal });
        const selection = validateAnalyticsRestaurantSelection(registry, [input.restaurantGuid]);
        const lifecycle = await jobs.runReportJob(selection, {
          operation: "metrics",
          timeRange: "day",
          startBusinessDate: String(input.businessDate),
          endBusinessDate: String(input.businessDate),
        }, { signal });
        return analyticsToolResult(lifecycleEnvelope(input.restaurantGuid, input.businessDate, lifecycle));
      } catch (error) {
        if (signal.aborted || (error instanceof AnalyticsReportJobError && error.code === "analytics_report_job_cancelled")) {
          throw new AnalyticsReportJobError("analytics_report_job_cancelled", "Analytics report tool request was cancelled.");
        }
        if (error instanceof AnalyticsAccessError) {
          if (error.code === "analytics_scope_unavailable") {
            return analyticsToolResult(deniedEnvelope(input.restaurantGuid, input.businessDate, "analytics_scope_unavailable"));
          }
          if (error.code === "analytics_selection_invalid") {
            return analyticsToolResult(deniedEnvelope(input.restaurantGuid, input.businessDate, "analytics_selection_invalid"));
          }
          return analyticsToolResult(incompleteEnvelope(input.restaurantGuid, input.businessDate, "analytics_access_unavailable"));
        }
        return analyticsToolResult(incompleteEnvelope(input.restaurantGuid, input.businessDate, "analytics_failed_or_incomplete"));
      }
    },
  );
}

function lifecycleEnvelope(
  restaurantGuid: string,
  businessDate: number,
  lifecycle: AnalyticsReportJobLifecycleResult,
): AnalyticsEnvelope {
  const reason = lifecycle.status === "result_contract_unavailable"
    ? "analytics_result_schema_unverified"
    : `analytics_${lifecycle.status}`;
  return Object.freeze({
    ...baseEnvelope(restaurantGuid, businessDate),
    status: lifecycle.completeness.state,
    reason,
    provenance: Object.freeze({
      apiFamily: lifecycle.provenance.apiFamily,
      operation: "metrics",
      timeRange: "day",
      restaurantGuids: Object.freeze([...lifecycle.provenance.restaurantGuids]),
      createdAtEpochMs: lifecycle.provenance.createdAtEpochMs,
      completedAtEpochMs: lifecycle.provenance.completedAtEpochMs,
      pollCount: lifecycle.provenance.pollCount,
      replacementCount: lifecycle.provenance.replacementCount,
      responseRequestIds: Object.freeze([...lifecycle.provenance.responseRequestIds]),
    }),
  });
}

function deniedEnvelope(restaurantGuid: string, businessDate: number, reason: string): AnalyticsEnvelope {
  return Object.freeze({ ...baseEnvelope(restaurantGuid, businessDate), status: "denied", reason });
}

function incompleteEnvelope(restaurantGuid: string, businessDate: number, reason: string): AnalyticsEnvelope {
  return Object.freeze({ ...baseEnvelope(restaurantGuid, businessDate), status: "incomplete", reason });
}

function baseEnvelope(restaurantGuid: string, businessDate: number) {
  return {
    schemaVersion: ANALYTICS_REPORT_SCHEMA_VERSION,
    source: "analytics_api" as const,
    report: "analytics_metrics_day" as const,
    restaurantGuid,
    businessDate,
    requestPolicyExclusions,
    formulaNote,
  };
}

function analyticsToolResult(result: AnalyticsEnvelope) {
  const structuredContent = result as Record<string, unknown>;
  return {
    content: [{
      type: "text" as const,
      text: result.status === "denied"
        ? "Toast Analytics Metrics/day request was denied."
        : "Toast Analytics Metrics/day result is incomplete.",
    }],
    structuredContent,
    ...(result.status === "denied" ? { isError: true } : {}),
  };
}

type AnalyticsEnvelope = {
  readonly schemaVersion: 1;
  readonly status: "denied" | "incomplete";
  readonly reason: string;
  readonly source: "analytics_api";
  readonly report: "analytics_metrics_day";
  readonly restaurantGuid: string;
  readonly businessDate: number;
  readonly provenance?: Readonly<{
    readonly apiFamily: "analytics";
    readonly operation: "metrics";
    readonly timeRange: "day";
    readonly restaurantGuids: readonly string[];
    readonly createdAtEpochMs: number;
    readonly completedAtEpochMs: number;
    readonly pollCount: number;
    readonly replacementCount: number;
    readonly responseRequestIds: readonly string[];
  }>;
  readonly requestPolicyExclusions: readonly string[];
  readonly formulaNote: string;
};

function isValidBusinessDate(value: number): boolean {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
