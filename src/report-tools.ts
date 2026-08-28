import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { buildCashSummaryReport } from "./cash-report.js";
import { buildItemSalesSummaryReport } from "./item-sales-report.js";
import { buildLaborSummaryReport } from "./labor-report.js";
import { buildPaymentSummaryReport } from "./payment-report.js";
import { STANDARD_REPORT_SCHEMA_VERSION } from "./report-contract.js";
import type { ApplicationRuntime } from "./runtime.js";
import { buildSalesSummaryReport } from "./sales-report.js";

const businessDateSchema = z
  .number()
  .int()
  .refine(isValidBusinessDate, {
    message: "businessDate must be a real calendar date in yyyyMMdd form",
  });

const restaurantGuidSchema = z
  .string()
  .uuid()
  .optional()
  .describe(
    "Optional Toast restaurant GUID. When omitted, the validated TOAST_DEFAULT_RESTAURANT_GUID is used.",
  );

const reportInputSchema = z.object({
  businessDate: businessDateSchema.describe(
    "Toast restaurant business date in yyyyMMdd form, for example 20260816.",
  ),
  restaurantGuid: restaurantGuidSchema,
});

const itemSalesInputSchema = z.object({
  businessDate: businessDateSchema.describe(
    "Toast restaurant business date in yyyyMMdd form, for example 20260816.",
  ),
  dimension: z.enum([
    "item",
    "sales_category",
    "revenue_center",
    "dining_option",
    "item_tag",
    "order_source",
    "service_period",
  ]).default("item").describe(
    "Grouping dimension. Item uses additive top-level Selection facts; category/tag/dining dimensions use explicit check-attribution semantics.",
  ),
  restaurantGuid: restaurantGuidSchema,
});

const standardEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(STANDARD_REPORT_SCHEMA_VERSION),
    source: z.literal("standard_api"),
    businessDate: businessDateSchema,
    requestedBusinessDate: businessDateSchema,
    generatedAtEpochMs: z.number().int().nonnegative(),
    formulaNotes: z.array(z.string()),
    warnings: z.array(z.string()),
  });

const contextFreshnessSchema = z.object({
  retrievedThroughEpochMs: z.number().int().nonnegative(),
  ageMs: z.number().int().nonnegative(),
  maxAgeMs: z.number().int().nonnegative(),
}).strict();

const requestProvenanceSchema = z.object({
  retrievedThroughEpochMs: z.number().int().nonnegative().nullable(),
  upstreamRequestIds: z.array(z.string()),
  upstreamRequestIdCount: z.number().int().nonnegative(),
  upstreamRequestIdsTruncated: z.boolean(),
}).strict();

const completeStandardEnvelopeSchema = standardEnvelopeSchema.extend({
  status: z.literal("complete"),
  restaurantGuid: z.string().uuid(),
  restaurantName: z.string().min(1),
  effectiveBusinessDate: businessDateSchema,
  timezone: z.string().min(1),
  currencyCode: z.string().regex(/^[A-Z]{3}$/u),
  contextFreshness: contextFreshnessSchema,
  contextProvenance: requestProvenanceSchema,
  provenance: requestProvenanceSchema,
});

const deniedStandardEnvelopeSchema = standardEnvelopeSchema.extend({
  status: z.literal("denied"),
  restaurantGuid: z.string().uuid().optional(),
  restaurantName: z.string().min(1).optional(),
  effectiveBusinessDate: businessDateSchema.optional(),
  contextFreshness: contextFreshnessSchema.optional(),
  contextProvenance: requestProvenanceSchema.optional(),
  denial: z.object({
    code: z.string().min(1),
    retryable: z.boolean(),
    upstreamStatus: z.number().int().nullable().optional(),
    upstreamRequestId: z.string().min(1).nullable().optional(),
  }).strict(),
  missingScopes: z.array(z.string()),
  missingProvisionedScopes: z.array(z.string()),
  missingConnectionScopes: z.array(z.string()),
  excludedScopes: z.array(z.string()),
});

const salesSummaryOutputSchema = z.union([
  completeStandardEnvelopeSchema.extend({
    report: z.literal("sales_summary"),
    closeoutHour: z.number().int(),
    pagesProcessed: z.number().int().nonnegative(),
    sourceOrdersProcessed: z.number().int().nonnegative(),
    currentAndPast: z.object({}).passthrough(),
    future: z.object({}).passthrough(),
    combined: z.object({}).passthrough(),
    exclusions: z.object({}).passthrough(),
  }),
  deniedStandardEnvelopeSchema.extend({ report: z.literal("sales_summary") }),
]);

const paymentSummaryOutputSchema = z.union([
  completeStandardEnvelopeSchema.extend({
    report: z.literal("payment_summary"),
    closeoutHour: z.number().int(),
    eventListCount: z.literal(3),
    paymentDetailsProcessed: z.number().int().nonnegative(),
    uniquePaymentCount: z.number().int().nonnegative(),
    paid: z.object({}).passthrough(),
    refunded: z.object({}).passthrough(),
    voided: z.object({}).passthrough(),
    paidByType: z.array(z.object({}).passthrough()),
    paymentStatusCounts: z.array(z.object({}).passthrough()),
    refundStatusCounts: z.array(z.object({}).passthrough()),
  }),
  deniedStandardEnvelopeSchema.extend({ report: z.literal("payment_summary") }),
]);

const itemSalesSummaryOutputSchema = z.union([
  completeStandardEnvelopeSchema.extend({
    report: z.literal("item_sales_summary"),
    dimension: z.string().min(1),
    metricBasis: z.string().min(1),
    nonAdditiveAcrossGroups: z.boolean(),
    pagesProcessed: z.number().int().nonnegative(),
    sourceOrdersProcessed: z.number().int().nonnegative(),
    modifierSelectionsTraversed: z.number().int().nonnegative(),
    unresolvedContributionCount: z.number().int().nonnegative(),
    dimensionContext: z.object({}).passthrough(),
    groups: z.array(z.object({}).passthrough()),
  }),
  deniedStandardEnvelopeSchema.extend({
    report: z.literal("item_sales_summary"),
    dimension: z.string().min(1),
  }),
]);

const cashSummaryOutputSchema = z.union([
  completeStandardEnvelopeSchema.extend({
    report: z.literal("cash_summary"),
    closeoutHour: z.number().int(),
    cashEntryCount: z.number().int().nonnegative(),
    depositCount: z.number().int().nonnegative(),
    cashEntryAmountMinor: z.number().int(),
    depositAmountMinor: z.number().int(),
    noSaleCount: z.number().int().nonnegative(),
    cashEntriesWithoutDrawerCount: z.number().int().nonnegative(),
    cashInCount: z.number().int().nonnegative(),
    cashOutCount: z.number().int().nonnegative(),
    cashCollectedCount: z.number().int().nonnegative(),
    tipOutCount: z.number().int().nonnegative(),
    payoutCount: z.number().int().nonnegative(),
    reimbursementCount: z.number().int().nonnegative(),
    closeoutCount: z.number().int().nonnegative(),
    observedReversalCount: z.number().int().nonnegative(),
    unresolvedCrossDateReversalCount: z.number().int().nonnegative(),
    observedDepositReversalCount: z.number().int().nonnegative(),
    unresolvedCrossDateDepositReversalCount: z.number().int().nonnegative(),
    cashEntryTotalsByType: z.array(z.object({}).passthrough()),
    cashDrawerReferences: z.array(z.object({}).passthrough()),
    noSaleReasonReferences: z.array(z.object({}).passthrough()),
    payoutReasonReferences: z.array(z.object({}).passthrough()),
  }),
  deniedStandardEnvelopeSchema.extend({ report: z.literal("cash_summary") }),
]);

const laborAggregateSchema = {
  timeEntryCount: z.number().int().nonnegative(),
  activeTimeEntryCount: z.number().int().nonnegative(),
  deletedTimeEntryCount: z.number().int().nonnegative(),
  excludedJobTimeEntryCount: z.number().int().nonnegative(),
  unresolvedJobTimeEntryCount: z.number().int().nonnegative(),
  unresolvedHourlyWageTimeEntryCount: z.number().int().nonnegative(),
  salariedTimeEntryCount: z.number().int().nonnegative(),
  regularHours: z.number().nonnegative(),
  overtimeHours: z.number().nonnegative(),
  regularWagesMinor: z.number().int(),
  breakCount: z.number().int().nonnegative(),
  missedBreakCount: z.number().int().nonnegative(),
  unresolvedBreakTypeCount: z.number().int().nonnegative(),
  ordersSalesMinor: z.number().int(),
  ordersTipsMinor: z.number().int(),
  tipWithholdingEnabled: z.boolean(),
  tipWithholdingBasisMinor: z.number().int(),
  tipWithholdingMinor: z.number().int(),
  netOrdersTipsMinor: z.number().int(),
  ordersWithServerAttributionCount: z.number().int().nonnegative(),
} as const;

const laborSummaryOutputSchema = z.union([
  completeStandardEnvelopeSchema.extend({
    ...laborAggregateSchema,
    report: z.literal("labor_summary"),
    closeoutHour: z.number().int(),
    jobsSourceCount: z.number().int().nonnegative(),
    breakTypeSourceCount: z.number().int().nonnegative(),
  }),
  completeStandardEnvelopeSchema.extend({
    ...laborAggregateSchema,
    status: z.literal("incomplete"),
    report: z.literal("labor_summary"),
    closeoutHour: z.number().int(),
    jobsSourceCount: z.number().int().nonnegative(),
    breakTypeSourceCount: z.number().int().nonnegative(),
  }),
  deniedStandardEnvelopeSchema.extend({ report: z.literal("labor_summary") }),
]);

export function registerStandardReportTools(
  server: McpServer,
  runtime: ApplicationRuntime,
): void {
  registerCashSummaryTool(server, runtime);
  registerLaborSummaryTool(server, runtime);

  server.registerTool(
    "toast_sales_summary",
    {
      title: "Toast Sales Summary",
      description:
        "Calculate a deterministic read-only Standard API sales summary for one Toast business date, with future orders separated from current/past sales and explicit completeness/provenance metadata.",
      inputSchema: reportInputSchema,
      outputSchema: salesSummaryOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildSalesSummaryReport(
      runtime,
      input.restaurantGuid === undefined
        ? { businessDate: input.businessDate }
        : { businessDate: input.businessDate, restaurantGuid: input.restaurantGuid },
      { signal: ctx.mcpReq.signal },
    )),
  );

  server.registerTool(
    "toast_payment_summary",
    {
      title: "Toast Payment Summary",
      description:
        "Calculate a deterministic read-only Standard API payment summary for one Toast business date using paid, refunded, and voided payment event sources separately.",
      inputSchema: reportInputSchema,
      outputSchema: paymentSummaryOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildPaymentSummaryReport(
      runtime,
      input.restaurantGuid === undefined
        ? { businessDate: input.businessDate }
        : { businessDate: input.businessDate, restaurantGuid: input.restaurantGuid },
      { signal: ctx.mcpReq.signal },
    )),
  );

  server.registerTool(
    "toast_item_sales_summary",
    {
      title: "Toast Item and Dimension Sales Summary",
      description:
        "Group historical Standard Orders facts by item, sales category, revenue center, dining option, item tag, order source, or service period. Current Menus/Configuration data is enrichment only and unresolved historical references are retained rather than guessed by name.",
      inputSchema: itemSalesInputSchema,
      outputSchema: itemSalesSummaryOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildItemSalesSummaryReport(
      runtime,
      input.restaurantGuid === undefined
        ? { businessDate: input.businessDate, dimension: input.dimension }
        : {
            businessDate: input.businessDate,
            dimension: input.dimension,
            restaurantGuid: input.restaurantGuid,
          },
      { signal: ctx.mcpReq.signal },
    )),
  );
}

function registerCashSummaryTool(
  server: McpServer,
  runtime: ApplicationRuntime,
): void {
  server.registerTool(
    "toast_cash_summary",
    {
      title: "Toast Cash Summary",
      description:
        "Calculate a deterministic read-only Standard API cash-entry and deposit summary for one Toast business date. Cash Management source facts remain distinct from guest cash payments.",
      inputSchema: reportInputSchema,
      outputSchema: cashSummaryOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildCashSummaryReport(
      runtime,
      input.restaurantGuid === undefined
        ? { businessDate: input.businessDate }
        : { businessDate: input.businessDate, restaurantGuid: input.restaurantGuid },
      { signal: ctx.mcpReq.signal },
    )),
  );
}

function registerLaborSummaryTool(
  server: McpServer,
  runtime: ApplicationRuntime,
): void {
  server.registerTool(
    "toast_labor_summary",
    {
      title: "Toast Labor Summary",
      description:
        "Calculate a deterministic read-only Standard API labor summary for one Toast business date. Active or unresolved labor facts return an explicit incomplete result.",
      inputSchema: reportInputSchema,
      outputSchema: laborSummaryOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildLaborSummaryReport(
      runtime,
      input.restaurantGuid === undefined
        ? { businessDate: input.businessDate }
        : { businessDate: input.businessDate, restaurantGuid: input.restaurantGuid },
      { signal: ctx.mcpReq.signal },
    )),
  );
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  } as const;
}

function toolResult(
  result: { readonly status: "complete" | "incomplete" | "denied" } & object,
) {
  const structuredContent = result as Record<string, unknown>;
  return {
    content: [{
      type: "text" as const,
      text: result.status === "complete"
        ? `Toast ${String(structuredContent.report)} completed for business date ${String(structuredContent.businessDate)}.`
        : result.status === "incomplete"
          ? `Toast ${String(structuredContent.report)} is incomplete for business date ${String(structuredContent.businessDate)}; inspect warnings before use.`
        : `Toast ${String(structuredContent.report)} was denied for business date ${String(structuredContent.businessDate)}.`,
    }],
    structuredContent,
    ...(result.status === "denied" ? { isError: true } : {}),
  };
}

function isValidBusinessDate(value: number): boolean {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}
