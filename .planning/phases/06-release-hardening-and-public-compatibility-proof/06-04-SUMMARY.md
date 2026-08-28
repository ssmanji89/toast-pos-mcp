---
phase: 06-release-hardening-and-public-compatibility-proof
plan: "04"
subsystem: mcp-public-runtime
tags: [mcp, stdio, application-runtime, zod, output-schema, tdd]
requires:
  - phase: 06-03
    provides: release-frontier baseline and local package evidence
provides:
  - one process-owned runtime for both retained stdio protocol factories
  - status-discriminated Standard output schemas for complete, denied, and labor-incomplete results
  - compiled protocol-era tests and isolated mutation proof for public runtime wiring
affects: [T6-003, public-stdio-compatibility, Standard-report-contracts]
tech-stack:
  added: []
  patterns: [shared process runtime across protocol factories, status-discriminated MCP output schemas, isolated worktree mutation batches]
key-files:
  created: [scripts/verify-t6-public-wiring-mutations.mjs]
  modified: [src/index.ts, src/server.ts, src/report-tools.ts, test/server.test.ts, test/report-tools-e2e.test.ts]
key-decisions:
  - "Retain legacy capability metadata while both protocol eras use the same process-owned runtime."
  - "Use per-tool complete and denied unions, with a labor incomplete branch, and permit unresolved location context only where builders omit it."
  - "Record synthetic exact-head evidence separately from live compatibility, release, and authority gates."
patterns-established:
  - "Construct ApplicationRuntime once at process startup and pass it to every stdio-era server factory."
  - "Use report-specific status unions for MCP output schemas instead of a broad status or report fallback."
requirements-completed: [T6-003]
duration: 50min
completed: 2026-08-28
status: complete
---

# Phase 06 Plan 04: Public Runtime Wiring and Standard Output Schemas Summary

**Both retained stdio eras now use one process-owned runtime, and every Standard tool advertises its safe complete, denied, and labor-incomplete result envelope.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-08-28T04:45:08Z
- **Completed:** 2026-08-28T05:35:03Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- The compiled legacy 2025 and pinned modern 2026 processes list and call the same six registered tools through one `ApplicationRuntime`.
- Standard report tools expose report-specific output unions for actual complete, denied, and labor-incomplete handler results.
- Synthetic exact-head checks passed on Node 20.20.2 and Node 22.22.2: 414 normal tests, one installed-artifact test, 35 focused compiled tests, and 14 caught compiling mutations.
- Independent source review was CLEAN at `cdba72a5dfbc2527d5317a0ad419b5c0c650646e`.

## Task Commits

1. **Task 1: Add failing public-runtime and output-schema contracts** - `2cfbc1a` (`test`)
2. **Task 2: Wire both eras to one runtime and publish sound Standard unions** - `41fe17b` (`feat`), with correctness repairs through `cdba72a`
3. **Task 3: Obtain independent exact-head review** - CLEAN source review recorded for `cdba72a5dfbc2527d5317a0ad419b5c0c650646e`

Task 2 also includes the focused harness repairs in `5dbf541`, `f4f683a`, `94ea2d4`, `04ae476`, `18950b3`, `f3ed6d7`, and `91e5536`.

## Files Created/Modified

- `src/index.ts` - Creates one process-owned runtime for both stdio eras.
- `src/server.ts` - Registers Standard and existing Analytics tools for production factories.
- `src/report-tools.ts` - Defines strict report-specific Standard result unions.
- `test/server.test.ts` - Proves compiled legacy and modern runtime behavior.
- `test/report-tools-e2e.test.ts` - Proves advertised schemas match actual result statuses.
- `scripts/verify-t6-public-wiring-mutations.mjs` - Runs isolated behavioral mutations in bounded batches.
- `LOOP.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` - Record source-candidate evidence without changing release gates.

## Decisions Made

- Keep the legacy `tools/list` capability difference, but never use it to select a runtime-free production server.
- Keep current request-signal forwarding and report provenance unchanged.
- Keep first-request cancellation, Analytics G01, live compatibility, signing, publication, consent, Terms, and brand approval as open gates.

## Verification Evidence

- Node 20.20.2 with npm 10.8.2: committed `npm ci --no-audit --no-fund`, `npm run check`, 35 focused compiled tests, and 14 caught mutations passed.
- Node 22.22.2 with npm 10.9.7: committed `npm ci --no-audit --no-fund`, `npm run check`, 35 focused compiled tests, and 14 caught mutations passed.
- Each runtime executed 414 normal tests and one installed-artifact test during `npm run check`.
- Mutation batches caught five, five, and four compiling mutations. Each batch used an isolated worktree and the committed lockfile.
- `git diff --check` passed for the source candidate.
- PR #55 records the candidate evidence and the request for independent review.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing valid cash result fields to the strict complete schema.**
- **Found during:** Task 2 Node 20 full validation.
- **Issue:** The cash handler returned valid `CashSummaryFold` fields that the advertised strict complete schema did not permit.
- **Fix:** Added the missing cash summary fields to the complete output branch.
- **Files modified:** `src/report-tools.ts`
- **Verification:** The focused output-schema tests and the final Node 20/22 checks passed.
- **Committed in:** `cdba72a`

**2. [Rule 1 - Test harness bug] Made mutation checks target the immutable candidate and unique compiling markers.**
- **Found during:** Task 2 mutation proof.
- **Issue:** The first harness version could use a stale worktree head or a nonunique source mutation marker.
- **Fix:** Pinned the candidate SHA, used unique compiling mutations, added a direct shared-runtime signal check, and split the isolated checks into bounded batches.
- **Files modified:** `scripts/verify-t6-public-wiring-mutations.mjs`, `test/server.test.ts`, `test/report-tools-e2e.test.ts`
- **Verification:** All 14 mutations were caught on Node 20.20.2 and Node 22.22.2.
- **Committed in:** `5dbf541`, `f4f683a`, `94ea2d4`, `04ae476`, `18950b3`, `f3ed6d7`, `91e5536`

---

**Total deviations:** 2 auto-fixed Rule 1 issues.
**Impact on plan:** The fixes make the advertised contract and mutation evidence correct. They do not add a product feature or change an external gate.

## Issues Encountered

- The planned compiled test required the production build before the compiled index existed. The executor restored only the committed lockfile and ran the production build before the focused test.
- The complete mutation command exceeds the executor command limit. The harness retains all 14 guards and runs them in three isolated batches.

## Known Stubs

None. The changed runtime and schemas use real handler data and do not add placeholder output.

## User Setup Required

None. This plan uses invented local fixtures only.

## Next Phase Readiness

- PR #55 requires fresh review of the final metadata head before merge.
- The CLEAN review applies only to source candidate `cdba72a5dfbc2527d5317a0ad419b5c0c650646e`.
- This work does not close #4/T6-003, T5-003-G01, #28, live Standard or Analytics compatibility, signing, publication, consent, Terms, or brand approval.

## Self-Check: PASSED

- The summary and all listed source files exist.
- The Task 1 and Task 2 commits exist in git history.
- The source candidate had a clean diff check before metadata edits.

---
*Phase: 06-release-hardening-and-public-compatibility-proof*
*Completed: 2026-08-28*
