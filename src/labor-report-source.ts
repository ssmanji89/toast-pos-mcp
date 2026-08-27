import { z } from "zod";

import {
  guidSchema,
  isValidBusinessDate,
  isValidSourceDateTime,
} from "./orders-normalization-helpers.js";

const openStringSchema = z.string().min(1);
const businessDateSchema = z.number().int().refine(isValidBusinessDate, {
  message: "must be a valid yyyyMMdd business date",
});
const sourceDateTimeSchema = z.string().min(1).refine(isValidSourceDateTime, {
  message: "must be a zoned ISO-8601 date-time",
});
const nonNegativeFiniteSchema = z.number().finite().min(0);

const laborBreakSchema = z.object({
  breakTypeGuid: guidSchema.optional().nullable(),
  state: openStringSchema,
  minutes: nonNegativeFiniteSchema,
  missed: z.boolean().default(false),
}).strip();

const laborTimeEntrySchema = z.object({
  guid: guidSchema,
  employeeGuid: guidSchema,
  jobGuid: guidSchema.optional().nullable(),
  businessDate: businessDateSchema,
  inDate: sourceDateTimeSchema,
  outDate: sourceDateTimeSchema.nullable(),
  state: openStringSchema,
  revised: z.boolean().default(false),
  archived: z.boolean().default(false),
  deleted: z.boolean().default(false),
  regularHours: nonNegativeFiniteSchema.default(0),
  overtimeHours: nonNegativeFiniteSchema.default(0),
  hourlyWage: z.number().finite().nullable().default(null),
  breaks: z.array(laborBreakSchema).default([]),
}).strip();

export const laborTimeEntryArraySchema = z.array(laborTimeEntrySchema);
export const laborJobsSchema = z.array(z.object({
  guid: guidSchema,
  state: openStringSchema,
}).strip());
export const laborBreakTypesSchema = z.array(z.object({
  guid: guidSchema,
  state: openStringSchema,
}).strip());
export const laborTipWithholdingSchema = z.object({
  state: openStringSchema,
  percentage: z.number().finite().min(0).max(1).optional(),
}).strip();

export interface LaborBreakFact {
  readonly breakTypeGuid: string | undefined;
  readonly state: string;
  readonly minutes: number;
  readonly missed: boolean;
}

export interface LaborTimeEntryFact {
  readonly guid: string;
  /** Internal join key. Never expose it in report output. */
  readonly employeeGuid: string;
  readonly jobGuid: string | undefined;
  readonly businessDate: number;
  readonly inDate: string;
  readonly outDate: string | undefined;
  readonly state: string;
  readonly revised: boolean;
  readonly archived: boolean;
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
  return Object.freeze(parsed.data.map((entry) => {
    if (entry.businessDate !== businessDate) {
      throw new TypeError("Labor time-entry source business date does not match the requested date.");
    }
    return Object.freeze({
      guid: entry.guid.toLowerCase(),
      employeeGuid: entry.employeeGuid.toLowerCase(),
      jobGuid: entry.jobGuid?.toLowerCase(),
      businessDate: entry.businessDate,
      inDate: entry.inDate,
      outDate: entry.outDate ?? undefined,
      state: entry.state,
      revised: entry.revised,
      archived: entry.archived,
      deleted: entry.deleted,
      active: entry.outDate === null,
      regularHours: entry.regularHours,
      overtimeHours: entry.overtimeHours,
      hourlyWage: entry.hourlyWage,
      breaks: Object.freeze(entry.breaks.map((laborBreak) => Object.freeze({
        breakTypeGuid: laborBreak.breakTypeGuid?.toLowerCase(),
        state: laborBreak.state,
        minutes: laborBreak.minutes,
        missed: laborBreak.missed,
      }))),
    });
  }));
}
