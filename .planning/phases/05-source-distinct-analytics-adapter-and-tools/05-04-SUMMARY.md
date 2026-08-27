---
phase: 05-source-distinct-analytics-adapter-and-tools
plan: 04
subsystem: analytics-report-jobs
tags: [typescript, toast-analytics, closed-contract, report-jobs, tdd]
requires:
  - phase: 05-03
    provides: private Analytics identity-bound restaurant selections
provides:
  - six-operation closed Analytics report-job create and retrieval contracts
  - opaque bounded report-request identifiers and body-free retrieval states
affects: [05-05-report-job-lifecycle, 05-06-analytics-tools]
tech-stack:
  added: []
  patterns: [private selection assertion before request construction, body-free incomplete result contract]
key-files:
  created:
    - src/analytics-report-jobs.ts
    - test/analytics-report-jobs.test.ts
  modified: []
key-decisions:
  - "The adapter allows only metrics, check, labor, menu, payout-by-settled-date, and payout-by-sales-date operations."
  - "Create identifiers stay opaque bounded strings; completed retrieval bodies remain unavailable until G05 closes."
  - "The adapter delegates private selection identity validation to AnalyticsAccessAdapter before route, body, or request creation."
patterns-established:
  - "Closed operation routes stay private; callers pass typed operation input, not paths, methods, query values, or bodies."
  - "A retrieval status classifier uses HTTP status only and never parses a completed result body while its source contract is gated."
requirements-completed: [T5-002]
duration: 4min
completed: 2026-08-27
status: complete
---

# Phase 05 Plan 04: Closed Analytics Report-Job Contracts Summary

**A six-operation, identity-bound Analytics job adapter with opaque request IDs and body-free completed-result states.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-08-27T23:37:02Z
- **Completed:** 2026-08-27T23:41:23Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Added six fixed POST/GET Analytics report-job route pairs.
- Rejected caller paths, methods, restaurant sets, exclusions, status queries, metrics aggregation, and employee grouping before a source request.
- Bound job creation to a private Analytics selection and kept 200, 202, 404, 409, and other retrieval states body-free.

## Task Commits

1. **Task 1: Specify failing six-operation outbound contract tests** — `63019a9` (`test`)
2. **Task 2: Implement the closed outbound catalog and gated retrieval contract** — `3fc11a9` (`feat`)

## Files Created/Modified

- `src/analytics-report-jobs.ts` — Closed create and retrieval adapter with private route construction.
- `test/analytics-report-jobs.test.ts` — Synthetic route, authority, opaque-ID, and body-free status tests.

## Decisions Made

- Excluded payout-by-payment and all guest routes under G01.
- Did not model `onlyInactiveRestaurants`, a status crosswalk, UUID-only identifiers, disputed metrics fields, or completed result data under G02 through G05.
- Recorded `complete` as `resultContract: "unavailable"` until a later plan proves the completed-result contract.

## Verification

- `npm run build:test && node --test dist-test/test/analytics-report-jobs.test.js` — 4/4 passed.
- `npm run check` — 40 test files and 388 tests passed; package dry run passed.
- Temporary mutations that removed selection validation, allowed unreviewed keys, or read retrieval bodies each failed the focused suite. The source was restored after each mutation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored locked dependencies before the RED command.**
- **Found during:** Task 1
- **Issue:** The worktree had no installed dependencies, so TypeScript could not reach the new missing-module failure.
- **Fix:** Ran `npm ci --no-audit --no-fund` using the existing lockfile.
- **Files modified:** None
- **Verification:** The second RED command failed on the absent `analytics-report-jobs` module, as intended.

**2. [Rule 1 - Test] Corrected two test-harness defects during GREEN.**
- **Found during:** Task 2
- **Issue:** The route-response counter advanced for GET requests, and the test expected local operation fields in the Toast create body.
- **Fix:** Advanced the counter only for POST and asserted only documented body fields.
- **Files modified:** `test/analytics-report-jobs.test.ts`
- **Verification:** The focused compiled suite passed 4/4.

**Total deviations:** 2 auto-fixed. The changes preserved the approved six-operation and G01-G05 boundaries.

## Known Stubs

None. The explicit `resultContract: "unavailable"` state is the required G05 gate, not a UI or data stub.

## Issues Encountered

The initial RED build stopped because dependencies were not installed. The existing lockfile restored the declared environment without adding a package.

## User Setup Required

None. This plan uses synthetic fixtures only and does not call Toast.

## Next Phase Readiness

Plan 05-05 can add lifecycle policy while preserving the closed descriptor, six-operation catalog, and body-free result gate.

DOX: no durable change. This plan implements the existing Phase 5 contract without changing its documented product or architecture boundary.

## Self-Check: PASSED

- Found `src/analytics-report-jobs.ts` and `test/analytics-report-jobs.test.ts`.
- Found commits `63019a9` and `3fc11a9`.
- No unexpected tracked-file deletion occurred.
