export const STANDARD_REPORT_SCHEMA_VERSION = 1 as const;

/**
 * Local stdio has no always-on Partners webhook. Toast currently recommends
 * polling Partners restaurant connections a few times per day and Restaurants
 * configuration at least once per location per day. Six hours is a
 * repository-owned conservative policy that satisfies both recommendations
 * while keeping the context entirely in memory.
 */
export const DEFAULT_LOCATION_CONTEXT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export interface ReportContextFreshness {
  readonly retrievedThroughEpochMs: number;
  readonly ageMs: number;
  readonly maxAgeMs: number;
}
