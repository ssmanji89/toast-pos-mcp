import assert from "node:assert/strict";
import test from "node:test";

import {
  laborBreakTypesSchema,
  laborJobsSchema,
  laborTimeEntryArraySchema,
  laborTipWithholdingSchema,
  parseLaborTimeEntriesForBusinessDate,
} from "../src/labor-report-source.js";

const G = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString(16).padStart(12, "0").slice(-12)}`;

const EMPLOYEE_GUID = G(401);
const JOB_GUID = G(402);
const BREAK_GUID = G(403);

test("validates and retains labor lifecycle facts without human-readable employee data", () => {
  const result = parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260816);
  const entry = result[0];

  assert.equal(entry?.employeeGuid, EMPLOYEE_GUID);
  assert.equal(entry?.jobGuid, JOB_GUID);
  assert.equal(entry?.state, "FUTURE_TIME_ENTRY_STATE");
  assert.equal(entry?.archived, true);
  assert.equal(entry?.revised, true);
  assert.equal(entry?.deleted, false);
  assert.equal(entry?.active, false);
  assert.equal(entry?.hourlyWage, null);
  assert.equal(entry?.breaks[0]?.state, "FUTURE_BREAK_STATE");
  assert.equal(entry?.breaks[0]?.missed, true);
  assert.ok(Object.isFrozen(entry));
  assert.ok(!JSON.stringify(entry).includes("synthetic-name-must-not-survive"));
});

test("rejects invalid source timestamps and business-date mismatches", () => {
  const malformed = timeEntry();
  malformed.inDate = "not-a-zoned-timestamp";
  assert.equal(laborTimeEntryArraySchema.safeParse([malformed]).success, false);

  assert.throws(() => parseLaborTimeEntriesForBusinessDate([timeEntry()], 20260817));
});

test("accepts open-string job, break, and withholding configuration values", () => {
  assert.equal(laborJobsSchema.safeParse([{ guid: JOB_GUID, name: "omit", state: "FUTURE_JOB_STATE" }]).success, true);
  assert.equal(laborBreakTypesSchema.safeParse([{ guid: BREAK_GUID, state: "FUTURE_BREAK_TYPE_STATE" }]).success, true);
  assert.equal(laborTipWithholdingSchema.safeParse({ state: "FUTURE_WITHHOLDING_STATE", percentage: 0.15 }).success, true);
});

function timeEntry(): Record<string, unknown> {
  return {
    guid: G(400),
    employeeGuid: EMPLOYEE_GUID,
    jobGuid: JOB_GUID,
    businessDate: 20260816,
    inDate: "2026-08-16T08:00:00-05:00",
    outDate: "2026-08-16T16:00:00-05:00",
    state: "FUTURE_TIME_ENTRY_STATE",
    revised: true,
    archived: true,
    deleted: false,
    regularHours: 7.5,
    overtimeHours: 0.5,
    hourlyWage: null,
    breaks: [{
      breakTypeGuid: BREAK_GUID,
      state: "FUTURE_BREAK_STATE",
      minutes: 30,
      missed: true,
    }],
    employeeName: "synthetic-name-must-not-survive",
    externalEmployeeId: "synthetic-external-id-must-not-survive",
  };
}
