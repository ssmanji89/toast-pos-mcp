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
  entityType: openStringSchema.optional(),
}).strip();

const laborBreakSchema = z.object({
  guid: guidSchema,
  breakType: toastReferenceSchema.optional(),
  paid: z.boolean(),
  inDate: sourceDateTimeSchema.nullable(),
  outDate: sourceDateTimeSchema.nullable(),
  missed: z.boolean(),
  waived: z.boolean(),
  auditResponse: z.boolean().nullable(),
}).strip();

const laborTimeEntrySchema = z.object({
  guid: guidSchema,
  entityType: openStringSchema.optional(),
  deleted: z.boolean(),
  deletedDate: sourceDateTimeSchema.nullable().optional(),
  modifiedDate: sourceDateTimeSchema.optional(),
  employeeReference: toastReferenceSchema,
  jobReference: toastReferenceSchema.optional(),
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
  entityType: openStringSchema.optional(),
  deleted: z.boolean().optional(),
  excludeFromReporting: z.boolean().optional(),
  tipped: z.boolean().optional(),
  wageFrequency: openStringSchema.optional(),
  defaultWage: z.number().finite().optional(),
}).strip());
export const laborBreakTypesSchema = z.array(z.object({
  guid: guidSchema,
  entityType: openStringSchema.optional(),
  active: z.boolean().optional(),
  paid: z.boolean().optional(),
  duration: z.number().int().min(0).optional(),
  enforceMinimumTime: z.boolean().optional(),
  trackMissedBreaks: z.boolean().optional(),
  breakIntervalHrs: z.number().int().min(0).nullable().optional(),
  breakIntervalMins: z.number().int().min(0).nullable().optional(),
  trackBreakAcknowledgement: z.boolean().optional(),
}).strip());
export const laborTipWithholdingSchema = z.object({
  guid: guidSchema,
  entityType: openStringSchema,
  enabled: z.boolean(),
  percentage: z.number().finite().min(0).max(1),
}).strip();

export interface LaborBreakFact {
  readonly guid: string;
  readonly breakTypeGuid: string | undefined;
  readonly paid: boolean;
  readonly missed: boolean;
  readonly waived: boolean;
}

export interface LaborTimeEntryFact {
  readonly guid: string;
  /** Internal join key. Never expose it in report output. */
  readonly employeeGuid: string;
  readonly jobGuid: string | undefined;
  readonly businessDate: string;
  readonly inDate: string;
  readonly outDate: string | undefined;
  readonly deleted: boolean;
  readonly active: boolean;
  readonly regularHours: number;
  readonly overtimeHours: number;
  readonly hourlyWage: number | null | undefined;
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
  const seenTimeEntryGuids = new Set<string>();
  const seenBreakGuids = new Set<string>();
  return Object.freeze(parsed.data.map((entry) => {
    if (entry.businessDate !== requestedBusinessDate) {
      throw new TypeError("Labor time-entry source business date does not match the requested date.");
    }
    const guid = entry.guid.toLowerCase();
    if (seenTimeEntryGuids.has(guid)) {
      throw new TypeError("Labor time-entry source contains a duplicate GUID.");
    }
    seenTimeEntryGuids.add(guid);
    return Object.freeze({
      guid,
      employeeGuid: entry.employeeReference.guid.toLowerCase(),
      jobGuid: entry.jobReference?.guid.toLowerCase(),
      businessDate: entry.businessDate,
      inDate: entry.inDate,
      outDate: entry.outDate ?? undefined,
      deleted: entry.deleted,
      active: entry.outDate === null,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      hourlyWage: entry.hourlyWage,
      breaks: Object.freeze(entry.breaks.map((laborBreak) => Object.freeze({
        guid: assertUniqueBreakGuid(laborBreak.guid, seenBreakGuids),
        breakTypeGuid: laborBreak.breakType?.guid.toLowerCase(),
        paid: laborBreak.paid,
        missed: laborBreak.missed,
        waived: laborBreak.waived,
      }))),
    });
  }));
}

function assertUniqueBreakGuid(guid: string, seenBreakGuids: Set<string>): string {
  const normalizedGuid = guid.toLowerCase();
  if (seenBreakGuids.has(normalizedGuid)) {
    throw new TypeError("Labor time-entry source contains a duplicate break GUID.");
  }
  seenBreakGuids.add(normalizedGuid);
  return normalizedGuid;
}
