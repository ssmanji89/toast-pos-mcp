---
phase: 01-local-runtime-and-standard-transport-foundation
plan: "01"
subsystem: testing
tags: [mcp, stdio, cancellation, node-test, tdd]

requires:
  - phase: merged-runtime-foundation
    provides: "MCP SDK v2 serveStdio runtime, official legacy and modern clients, and merged PR #37 rate-limit evidence"
provides:
  - "Fail-closed PR #37 and issue #32 dependency evidence"
  - "Retained-process request and restart proof for legacy and modern protocol eras"
  - "Handler-observed cancellation with same-process reuse after a nonzero request ID"
  - "A fixture test that records the MCP SDK 2.0.0 first-request cancellation limitation"
  - "Caught cancellation regression mutations"
affects:
  - 01-02-phase-candidate-validation
  - phase-3-production-report-cancellation

tech-stack:
  added: []
  patterns:
    - "Official MCP clients against compiled child-process stdio executables"
    - "Synthetic test-only handler observes ctx.mcpReq.signal"
    - "TDD RED and GREEN commits with scoped mutation proof"

key-files:
  created:
    - test/protocol-cancellation.test.ts
    - test/fixtures/protocol-cancellation-server.ts
  modified:
    - test/server.test.ts

key-decisions:
  - "Keep the synthetic wait tool outside production source and package exports."
  - "Treat MCP SDK 2.0.0 first-request cancellation as an explicit T6-003 release gate."
  - "Keep production report cancellation as a Phase 3 gate."

patterns-established:
  - "Retained-process proof captures one PID and checks it after sequential and concurrent era-correct requests."
  - "Cancellation proof waits for handler start, observes the exact handler abort marker, and then reuses the same PID."

requirements-completed: [GH-32]

duration: 25min
completed: 2026-08-26
status: complete
---

# Phase 1 Plan 01: Local stdio lifecycle and cancellation proof Summary

**Official stdio clients prove retained requests and restart, while recording the MCP SDK 2.0.0 first-request cancellation limitation.**

## Performance

- **Duration:** 24m 55s
- **Started:** 2026-08-26T21:32:06Z
- **Completed:** 2026-08-26T21:57:01Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Validated the complete PR #37 and issue #32 dependency gate before any tracked edit.
- Proved four retained requests for each protocol era on one stable child PID.
- Proved restart with a different PID and a supported request on the new process.
- Proved official-client cancellation reaches the exact test handler signal after a nonzero request ID.
- Proved the same child PID remains usable after that nonzero-ID cancellation.

## Dependency Preflight Evidence

- **PR #37 head:** `7053df064d491e38b75e9a9cb4f6dd488f215860`
- **PR #37 merge:** `793784e69bb538624ef5b0281abd9ab25481a25e`
- **Independent CLEAN:** https://github.com/ssmanji89/toast-pos-mcp/pull/37#issuecomment-5431333874
- **PR evidence:** https://github.com/ssmanji89/toast-pos-mcp/pull/37#issuecomment-5431345857
- **Issue #32 evidence:** https://github.com/ssmanji89/toast-pos-mcp/issues/32#issuecomment-5431347540
- **CLEAN-to-evidence interval:** IDs `5431333874 < 5431345857`, with zero comments in the open interval.
- **Review state:** Zero later current-head COMMENTED reviews and zero unresolved review threads.
- **Ancestry:** The merge is an ancestor of both `origin/main` and the execution HEAD.

## Task Commits

1. **Task 1: Dependency preflight** — no tracked edit or commit
2. **Task 2 RED: Retained-process protocol proof** — `3a93499` (test)
3. **Task 2 GREEN: Retained-process protocol behavior** — `629f24d` (feat)
4. **Task 3 RED: Handler cancellation proof** — `f8c7526` (test)
5. **Task 3 GREEN: Handler-observed cancellation** — `0e27a4d` (feat)
6. **Task 3 REFACTOR: Request sequencing rationale** — `8478d0c` (refactor)

## Files Created/Modified

- `test/server.test.ts` — Proves sequential and concurrent retained requests, bounded cleanup, and restart reuse.
- `test/protocol-cancellation.test.ts` — Records first-request cancellation as unsupported in MCP SDK 2.0.0, then verifies nonzero-ID cancellation and same-PID reuse.
- `test/fixtures/protocol-cancellation-server.ts` — Registers one synthetic test-only wait tool and observes its request signal.

## Verification

- `npm run build && npm run build:test && node --test dist-test/test/server.test.js` — 6 of 6 passed.
- `npm run build && npm run build:test && node --test dist-test/test/protocol-cancellation.test.js dist-test/test/server.test.js` — 7 of 7 passed.
- `npm run check` — 19 test files discovered, 218 of 218 tests passed, and 47 package files validated.
- `git diff -- package.json package-lock.json src/server.ts src/index.ts src/stdio.ts` — empty.
- Production exports and the production tool surface remain unchanged.

## Mutation Verification

1. **ignore-handler-signal** — CAUGHT for the nonzero-ID cancellation path. The focused test failed with `The handler did not observe its MCP request signal abort`.
2. **terminate-process-on-cancel** — CAUGHT for the nonzero-ID cancellation path. The focused test failed with `CONNECTION_CLOSED` before post-cancel reuse.

Both mutations were restored with targeted patches. The restored focused suite passed.

## TDD Gate Compliance

- Task 2 RED commit `3a93499` failed only the two unimplemented retained-process proofs.
- Task 2 GREEN commit `629f24d` passed all six focused server tests.
- Task 3 RED commit `f8c7526` failed because the handler did not observe cancellation.
- Task 3 GREEN commit `0e27a4d` passed handler cancellation and retained-process reuse after a nonzero request ID.
- Task 3 REFACTOR commit `8478d0c` preserved the passing focused test.

## Decisions Made

- Used `ping()` only for legacy retained requests.
- Used `discover()` only for modern retained requests and restart proof.
- Kept all process operations bounded and all client cleanup inside `finally`.
- Used fixed synthetic stderr markers. Stdout remains protocol-only.
- Added no dependency, production tool, remote listener, credential access, or Merchant Data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected the preflight runtime expression**

- **Found during:** Task 1
- **Issue:** The planned `jq all($items[] as $item; ...)` form did not compile with the installed `jq`.
- **Fix:** Used the equivalent valid `all($items[]; ...)` expression without changing any gate condition.
- **Files modified:** None
- **Verification:** The complete preflight passed with every expected SHA, URL, comment ID, and ancestry check.
- **Committed in:** Not applicable

**2. [Rule 3 - Blocking] Sequenced cancellation after a retained modern request**

- **Found during:** Task 3 GREEN
- **Issue:** MCP SDK 2.0.0 treats cancellation request ID `0` as absent, so the first retained request did not abort its handler.
- **Fix:** Sent one bounded retained-process `discover()` before the synthetic tool request. The tool request then used a nonzero ID.
- **Files modified:** `test/protocol-cancellation.test.ts`
- **Verification:** The handler observed the exact abort, both mutations failed, and the same PID answered after cancellation.
- **Committed in:** `0e27a4d`, rationale in `8478d0c`

---

**Total deviations:** 2 auto-fixed blocking issues

**Impact on plan:** The fixes preserve every plan boundary. Production cancellation remains a Phase 3 gate.

## Compatibility Limitation

- **Finding:** `PH1-R1-F1`.
- **Behavior:** MCP SDK 2.0.0 ignores cancellation for request ID `0`. The first tool request can reject at the client while its handler signal remains un-aborted.
- **Evidence:** `test/protocol-cancellation.test.ts` directly proves the first-request limitation and separately proves handler cancellation after a nonzero request ID.
- **Requirement status:** GH-4 is not complete.
- **Owned release gate:** T6-003 requires either an SDK correction or a separately reviewed local runtime correction that proves first-request handler cancellation.

### AGENTS.md-Driven Adjustment

- The repository STATE refresh rule permits STATE changes only in an explicit documentation or control-plane slice.
- This test slice therefore leaves `.planning/STATE.md` unchanged.
- The ROADMAP progress handler reported Phase 1 as 1 of 2 summaries and `In Progress`.
- No `.planning/REQUIREMENTS.md` file exists, so no requirement registry changed.

## Issues Encountered

- The initial worktree branch failed the mandatory branch guard. The coordinator renamed it before any tracked edit.
- The worktree lacked restored dependencies. `npm ci --no-audit --no-fund` restored the reviewed lockfile without manifest changes.
- Context7 was unavailable. The implementation used the exact installed MCP SDK 2.0.0 declarations and runtime source.

## Documentation Check

**DOX: updated.** The compatibility and release-gate documentation now records an SDK limitation that affects Phase 1 evidence claims.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Plan 01-02 can consume this summary without repeating the PR #37 preflight.
- Phase 3 still owns production report-handler cancellation through real Toast fetch and page-fold paths.
- T6-003 owns first-tool-request cancellation until the SDK or a separately reviewed local correction resolves it.

---

*Phase: 01-local-runtime-and-standard-transport-foundation*
*Completed: 2026-08-26*

## Self-Check: PASSED

- All three created or modified test files exist.
- All five TDD task commits exist.
- The plan summary exists at the required phase path.
