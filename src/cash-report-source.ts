import { z } from "zod";

import {
  guidSchema,
  isValidSourceDateTime,
} from "./orders-normalization-helpers.js";

const openStringSchema = z.string().min(1);
const sourceMoneySchema = z.number().finite();
const sourceDateTimeSchema = z.string().min(1).refine(
  isValidSourceDateTime,
  { message: "must be a zoned ISO-8601 date-time" },
);
const guidReferenceSchema = z.object({
  guid: guidSchema,
}).passthrough();

/**
 * These schemas are transient ingress guards. The report fold retains only
 * money, type, and identifier references needed for aggregate reporting.
 */
const cashEntrySchema = z.object({
  guid: guidSchema,
  date: sourceDateTimeSchema,
  amount: sourceMoneySchema,
  type: openStringSchema,
  cashDrawer: guidReferenceSchema,
  undoes: guidSchema.nullable().optional(),
  noSaleReason: guidReferenceSchema.nullable().optional(),
  payoutReason: guidReferenceSchema.nullable().optional(),
}).passthrough();

const cashDepositSchema = z.object({
  guid: guidSchema,
  date: sourceDateTimeSchema,
  amount: sourceMoneySchema,
  undoes: guidSchema.nullable().optional(),
}).passthrough();

const cashDrawerSchema = z.object({
  guid: guidSchema,
}).passthrough();

const noSaleReasonSchema = z.object({
  guid: guidSchema,
}).passthrough();

const payoutReasonSchema = z.object({
  guid: guidSchema,
}).passthrough();

export const cashEntryArraySchema = z.array(cashEntrySchema);
export const cashDepositArraySchema = z.array(cashDepositSchema);
export const cashDrawerArraySchema = z.array(cashDrawerSchema);
export const noSaleReasonArraySchema = z.array(noSaleReasonSchema);
export const payoutReasonArraySchema = z.array(payoutReasonSchema);

export type CashEntrySource = z.infer<typeof cashEntrySchema>;
export type CashDepositSource = z.infer<typeof cashDepositSchema>;
export type CashDrawerSource = z.infer<typeof cashDrawerSchema>;
export type NoSaleReasonSource = z.infer<typeof noSaleReasonSchema>;
export type PayoutReasonSource = z.infer<typeof payoutReasonSchema>;
