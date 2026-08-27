---
phase: 05-source-distinct-analytics-adapter-and-tools
plan: 01
subsystem: api
tags: [typescript, oauth, analytics, zod, rate-limit, security]
requires:
  - phase: T4
    provides: Standard runtime, OAuth ownership, capability preflight, and immutable registry patterns
provides:
  - Separate optional Analytics OAuth authority and scope decision
  - Closed management-group restaurant-information access adapter
  - Immutable Analytics restaurant selection and endpoint limiter controls
affects: [05-02, analytics-report-jobs, analytics-mcp-tools]
tech-stack:
  added: []
  patterns: [separate credential identity, literal Analytics route allowlist, immutable source minimization]
key-files:
  created: [src/analytics-access.ts, test/analytics-access-adapter.test.ts]
  modified: [src/config.ts, src/auth.ts, src/capabilities.ts, src/runtime.ts]
key-decisions:
  - "Analytics credentials use separate private WeakMap-backed configuration objects."
  - "T5-001 exposes only GET /era/v1/restaurants-information and no MCP tool."
  - "Analytics registry and limiter state are keyed by private Analytics identity objects."
patterns-established:
  - "Analytics authority does not reuse Standard locations, connection scopes, token managers, or HTTP clients."
  - "Analytics source records are validated and minimized before immutable publication."
requirements-completed: [T5-001]
duration: 38min
completed: 2026-08-27
status: complete
---

# Phase 05 Plan 01: Separate Analytics Authority and Management-Group Access Adapter Summary

**Separate optional Analytics OAuth authority with scope-gated, rate-limited management-group restaurant discovery and immutable selected-set validation.**

## Performance

- **Duration:** 38 min
- **Tasks:** 2/2
- **Files modified:** 9
- **Focused tests:** 17 passed
- **Full check:** 380 passed

## Accomplishments

- Added private Analytics configuration, credentials, and OAuth token ownership.
- Added Analytics-only `enterprise-metrics:read` preflight and one allowlisted GET.
- Added frozen, minimized management-group registry and canonical selected-set validation.
- Kept Standard locations, scopes, clients, report tools, and stdio registration unchanged.

## Task Commits

1. **Task 1: Write failing Analytics authority and guard tests** — `76661fa` (`test`)
2. **Task 2: Implement the closed Analytics adapter and make every guard green** — `693100f` (`feat`)

## Files Created/Modified

- `src/analytics-access.ts` — Closed Analytics request, validation, registry, selection, cancellation, and limiter boundary.
- `src/config.ts` — Optional Analytics configuration with non-serializable credentials.
- `src/auth.ts` — Separate Analytics OAuth token manager factory.
- `src/capabilities.ts` — Analytics-only scope context and denial decision.
- `src/runtime.ts` — Internal optional Analytics adapter composition.
- `test/analytics-*.test.ts` — Synthetic authority, privacy, isolation, and runtime-boundary proofs.
- `scripts/verify-t5-001-analytics-guard-mutations.mjs` — Enumerated focused mutation checks.

## Decisions Made

- Preserve the existing Standard configuration key and credential test interfaces.
- Do not create guest data routes, report jobs, tools, or stdio fixture paths.
- Defer durable operational documentation and the static guard matrix to Plan 05-02 ownership.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored locked dependencies before the required RED build**
- **Found during:** Task 1
- **Issue:** The assigned worktree had no installed dependencies, so TypeScript could not resolve the project baseline.
- **Fix:** Ran `npm ci --no-audit --no-fund` against the existing lockfile.
- **Verification:** RED then failed on the absent Analytics contracts; GREEN compiled and passed.

**2. [Rule 1 - Bug] Preserved Standard configuration test interfaces**
- **Found during:** Task 2
- **Issue:** Analytics environment keys widened Standard-only exported test sets.
- **Fix:** Kept Analytics key definitions private and separate from Standard sets.
- **Verification:** `npm run check` passed all 380 tests.
- **Committed in:** `693100f`

**3. [Rule 1 - Bug] Strengthened the scope mutation guard**
- **Found during:** Task 2
- **Issue:** The first scope mutation changed only an adapter error message.
- **Fix:** The mutation now changes the Analytics scope constant in `src/capabilities.ts`.
- **Verification:** All 10 mutations fail their focused tests.
- **Committed in:** `693100f`

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3).

## Known Stubs

None.

## DOX

DOX: no durable documentation change. Plan 05-02 owns the static guard matrix and durable operational documentation.

## Next Phase Readiness

Plan 05-02 can add the required documentation and final candidate evidence. T5-002 can build report-job lifecycle behavior on the isolated adapter. Live Analytics compatibility remains an owner-authorized external gate.

## Self-Check: PASSED

- Created Analytics adapter and all three Analytics test files exist.
- Task commits `76661fa` and `693100f` exist.
- No tracked files were deleted by this plan.
