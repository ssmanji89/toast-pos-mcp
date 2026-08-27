import { z } from "zod";

import {
  guidSchema,
  isValidBusinessDate,
  isValidSourceDateTime,
} from "./orders-normalization-helpers.js";

const openStringSchema = z.string().min(1);
const sourceDateTimeSchema = z.string().min(1).refine(isValidSourceDateTime, {
  message: "must be a zoned ISO-8601 date-time",
});
const businessDateSchema = z.string().regex(/^\d{8}$/u).refine(
  (value) => isValidBusinessDate(Number(value)),
  { message: "must be a valid yyyyMMdd business date string" },
);
const nonNegativeFiniteSchema = z.number().finite().min(0);
const toastReferenceSchema = z.object({
  guid: guidSchema,
  entityType: openStringSchema,
}).strip();

const laborBreakSchema = z.object({
  guid: guidSchema,
  breakType: toastReferenceSchema,
  paid: z.boolean(),
  inDate: sourceDateTimeSchema.nullable(),
  outDate: sourceDateTimeSchema.nullable(),
  missed: z.boolean(),
  waived: z.boolean(),
  auditResponse: z.boolean().nullable(),
}).strip();

const laborTimeEntrySchema = z.object({
  guid: guidSchema,
  entityType: openStringSchema,
  deleted: z.boolean(),
  deletedDate: sourceDateTimeSchema.nullable().optional(),
  modifiedDate: sourceDateTimeSchema.optional(),
  employeeReference: toastReferenceSchema,
  jobReference: toastReferenceSchema,
  inDate: sourceDateTimeSchema,
  outDate: sourceDateTimeSchema.nullable(),
  businessDate: businessDateSchema,
  regularHours: nonNegativeFiniteSchema,
  overtimeHours: nonNegativeFiniteSchema,
  hourlyWage: z.number().finite().nullable().optional(),
  breaks: z.array(laborBreakSchema).default([]),
}).strip();

export const laborTimeEntryArraySchema = z.array(laborTimeEntrySchema);
export const laborJobsSchema = z.array(z.object({
  guid: guidSchema,
  entityType: openStringSchema,
  deleted: z.boolean(),
  excludeFromReporting: z.boolean(),
  tipped: z.boolean(),
  wageFrequency: openStringSchema.optional(),
  defaultWage: z.number().finite().optional(),
}).strip());
export const laborBreakTypesSchema = z.array(z.object({
  guid: guidSchema,
  entityType: openStringSchema,
  active: z.boolean(),
  paid: z.boolean(),
  duration: z.number().int().min(0),
  enforceMinimumTime: z.boolean(),
  trackMissedBreaks: z.boolean(),
  breakIntervalHrs: z.number().int().min(0).nullable(),
  breakIntervalMins: z.number().int().min(0).nullable(),
  trackBreakAcknowledgement: z.boolean(),
}).strip());
export const laborTipWithholdingSchema = z.object({
  guid: guidSchema,
  entityType: openStringSchema,
  enabled: z.boolean(),
  percentage: z.number().finite().min(0).max(1),
}).strip();

export interface LaborBreakFact {
  readonly breakTypeGuid: string;
  readonly paid: boolean;
  readonly missed: boolean;
  readonly waived: boolean;
}

export interface LaborTimeEntryFact {
  readonly guid: string;
  /** Internal join key. Never expose it in report output. */
  readonly employeeGuid: string;
  readonly jobGuid: string;
  readonly businessDate: string;
  readonly inDate: string;
  readonly outDate: string | undefined;
  readonly deleted: boolean;
  readonly active: boolean;
  readonly regularHours: number;
  readonly overtimeHours: number;
  readonly hourlyWage: number | null;
  readonly breaks: readonly LaborBreakFact[];
}

export function parseLaborTimeEntriesForBusinessDate(
  source: unknown,
  businessDate: number,
): readonly LaborTimeEntryFact[] {
  if (!isValidBusinessDate(businessDate)) {
    throw new TypeError("Labor report business date must be valid.");
  }
  const parsed = laborTimeEntryArraySchema.safeParse(source);
  if (!parsed.success) {
    throw new TypeError("Labor time-entry source payload is invalid.");
  }
  const requestedBusinessDate = String(businessDate);
  return Object.freeze(parsed.data.map((entry) => {
    if (entry.businessDate !== requestedBusinessDate) {
      throw new TypeError("Labor time-entry source business date does not match the requested date.");
    }
    return Object.freeze({
      guid: entry.guid.toLowerCase(),
      employeeGuid: entry.employeeReference.guid.toLowerCase(),
      jobGuid: entry.jobReference.guid.toLowerCase(),
      businessDate: entry.businessDate,
      inDate: entry.inDate,
      outDate: entry.outDate ?? undefined,
      deleted: entry.deleted,
      active: entry.outDate === null,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      hourlyWage: entry.hourlyWage ?? null,
      breaks: Object.freeze(entry.breaks.map((laborBreak) => Object.freeze({
        breakTypeGuid: laborBreak.breakType.guid.toLowerCase(),
        paid: laborBreak.paid,
        missed: laborBreak.missed,
        waived: laborBreak.waived,
      }))),
    });
  }));
}
