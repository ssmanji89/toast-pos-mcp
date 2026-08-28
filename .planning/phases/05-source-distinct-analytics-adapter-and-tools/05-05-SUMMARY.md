---
phase: 05-source-distinct-analytics-adapter-and-tools
plan: 05
subsystem: analytics-report-jobs
tags: [typescript, toast-analytics, lifecycle, cancellation, rate-limit, mutation-testing]
requires:
  - phase: 05-04
    provides: six closed Analytics report-job descriptors and opaque identifiers
provides:
  - bounded body-free Analytics report-job lifecycle
  - private identity-bound create and retrieval limiter state
  - internal runtime Analytics job adapter seam without MCP registration
affects: [05-06-analytics-report-tools, T5-002-review]
tech-stack:
  added: []
  patterns: [bounded polling policy, caller-owned cancellation propagation, body-free completeness envelopes]
key-files:
  created:
    - scripts/verify-t5-002-analytics-job-guard-mutations.mjs
    - docs/verification/t5-002-analytics-job-guard-matrix.md
  modified:
    - src/analytics-report-jobs.ts
    - src/runtime.ts
    - test/analytics-report-jobs.test.ts
key-decisions:
  - "The one-second, 30-attempt, 30-second, and one-replacement limits are local safety policy, not Toast facts."
  - "HTTP 200 stays result_contract_unavailable until G05 supplies a reviewed result contract."
  - "The runtime shares one private Analytics identity and token manager between access and job adapters without MCP exposure."
patterns-established:
  - "Each Analytics POST and GET repeats capability, limiter, cancellation, and selection checks."
  - "Cancelled deferred work rejects with a sanitized error and cannot publish a later lifecycle envelope."
requirements-completed: [T5-002]
duration: 31min
completed: 2026-08-27
status: complete
---

# Phase 05 Plan 05: Bounded Analytics Job Lifecycle Summary

**Body-free Analytics report-job lifecycle with finite polling, replacement, cancellation, provenance, and private limiter state.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-08-27T23:27:30Z
- **Completed:** 2026-08-27T23:58:54Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Added finite 202 polling, 404 invalid-or-expired handling, one bounded 409 replacement, and explicit incomplete lifecycle envelopes.
- Propagated one caller signal through capability, token, limiter, sleep, POST, and GET work.
- Added a private Analytics runtime seam with no Standard transport or MCP registration bridge.

## Task Commits

1. **Task 1: Add lifecycle proofs (RED)** — `317b192` (`test`)
2. **Task 1: Add bounded lifecycle, cancellation, provenance, and isolated limiter proofs (GREEN)** — `b1e71f5` (`feat`)
3. **Task 2: Compose the internal adapter and prove every guard by mutation** — `3413645` (`feat`)

## Files Created/Modified

- `src/analytics-report-jobs.ts` — Runs bounded source lifecycle turns and creates body-free envelopes.
- `src/runtime.ts` — Shares the private Analytics configuration and token owner with the internal adapter.
- `test/analytics-report-jobs.test.ts` — Proves polling, replacement, cancellation, and no-registration behavior.
- `scripts/verify-t5-002-analytics-job-guard-mutations.mjs` — Runs 18 focused mutations and restores source bytes.
- `docs/verification/t5-002-analytics-job-guard-matrix.md` — Maps lifecycle guards and G01-G05 gates to local proof.

## Decisions Made

- Used opaque bounded report identifiers and retained no completed result body.
- Kept G01-G05 open. The excluded route, inactive-status option, UUID parser, disputed metrics fields, and strict result parser remain absent.
- Used a private limiter map keyed by Analytics identity, operation, method, time-range form, and canonical selected set.

## Verification

- `npm run build:test && node --test dist-test/test/analytics-report-jobs.test.js` — 9/9 passed.
- `node scripts/verify-t5-002-analytics-job-guard-mutations.mjs` — 18/18 focused mutations caught and source restored.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored existing locked dependencies for the RED build.**
- **Found during:** Task 1
- **Issue:** The worktree had no installed dependencies.
- **Fix:** Ran `npm ci --no-audit --no-fund` with the existing lockfile.
- **Files modified:** None
- **Verification:** The RED build then failed only for the missing lifecycle exports.

**2. [Rule 1 - Test harness] Replaced unstable and non-terminating mutation markers.**
- **Found during:** Task 2
- **Issue:** A repeated signal marker and a zero-capacity limiter mutation did not provide finite focused proof.
- **Fix:** Used unique markers and type-safe failing mutations. The harness restores the original source in `finally`.
- **Files modified:** `scripts/verify-t5-002-analytics-job-guard-mutations.mjs`
- **Verification:** All 18 mutations now fail the compiled focused check.

**Total deviations:** 2 auto-fixed. The changes preserve the approved six-operation and G01-G05 boundaries.

## Known Stubs

None. `result_contract_unavailable` is the required G05 gate, not a stub.

## User Setup Required

None. This plan uses invented synthetic values only.

## Next Phase Readiness

Plan 05-06 can consume the internal Analytics job adapter. It must keep G01-G05 open and add MCP presentation only through its own reviewed boundary.

DOX: updated. The guard matrix documents the durable lifecycle proof contract.

## Self-Check: PASSED

- Found all five source, test, proof, and documentation files.
- Found commits `317b192`, `b1e71f5`, and `3413645`.
- No tracked file deletion occurred.
