import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { buildItemSalesSummaryReport } from "./item-sales-report.js";
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

const baseCompleteOutputSchema = z
  .object({
    schemaVersion: z.literal(STANDARD_REPORT_SCHEMA_VERSION),
    status: z.literal("complete"),
    report: z.enum([
      "sales_summary",
      "payment_summary",
      "item_sales_summary",
    ]),
    source: z.literal("standard_api"),
    restaurantGuid: z.string().uuid(),
    restaurantName: z.string().min(1),
    businessDate: businessDateSchema,
    requestedBusinessDate: businessDateSchema,
    effectiveBusinessDate: businessDateSchema,
    timezone: z.string().min(1),
    currencyCode: z.string().regex(/^[A-Z]{3}$/u),
    generatedAtEpochMs: z.number().int().nonnegative(),
    formulaNotes: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .passthrough();

export function registerStandardReportTools(
  server: McpServer,
  runtime: ApplicationRuntime,
): void {
  server.registerTool(
    "toast_sales_summary",
    {
      title: "Toast Sales Summary",
      description:
        "Calculate a deterministic read-only Standard API sales summary for one Toast business date, with future orders separated from current/past sales and explicit completeness/provenance metadata.",
      inputSchema: reportInputSchema,
      outputSchema: baseCompleteOutputSchema,
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
      outputSchema: baseCompleteOutputSchema,
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
      outputSchema: baseCompleteOutputSchema,
      annotations: readOnlyAnnotations(),
    },
    async (input, ctx) => toolResult(await buildItemSalesSummaryReport(
      runtime,
      input,
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
  result: { readonly status: "complete" | "denied" } & object,
) {
  const structuredContent = result as Record<string, unknown>;
  return {
    content: [{
      type: "text" as const,
      text: result.status === "complete"
        ? `Toast ${String(structuredContent.report)} completed for business date ${String(structuredContent.businessDate)}.`
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
