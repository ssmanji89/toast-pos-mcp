---
phase: 06-release-hardening-and-public-compatibility-proof
plan: "07"
subsystem: mcp-stdio-cancellation
tags: [typescript, mcp-sdk-v2, stdio, cancellation, testing]
requires:
  - phase: 06-06
    provides: "Current public MCP SDK v2 runtime baseline and release-gate plan"
provides:
  - "Public-SDK bridge for numeric-zero, nonzero, and bounded early report request cancellation"
  - "Executable legacy and modern stdio cancellation proof with sequence-specific terminal cleanup observation"
affects: [06-08, issue-60, mcp-runtime]
tech-stack:
  added: []
  patterns: ["Public notification-handler bridge", "bounded early-cancellation retention", "sequence-numbered count-only executable lifecycle observer"]
key-files:
  created: [src/mcp-request-cancellation.ts, test/first-tool-cancellation-e2e.test.ts]
  modified: [src/index.ts, src/server.ts, src/report-tools.ts, src/analytics-report-tools.ts, test/fixtures/installed-artifact-fetch-preload.ts, test/server.test.ts, test/package-artifact-e2e.test.ts]
key-decisions:
  - "Preserve the official client request allocation: legacy initialize is ID 0 and first tool is ID 1; modern first tool is ID 0."
  - "Use one local bridge with public SDK APIs and no SDK, transport, or package modification."
patterns-established:
  - "Wrap every reviewed report callback through the explicit registration matrix."
  - "Remove bridge controllers and relays in one callback finalization path."
requirements-completed: []
duration: 32min
completed: 2026-08-28
status: complete
---

# Phase 06 Plan 07: First stdio tool-request cancellation bridge Summary

**Public SDK cancellation bridge for modern request ID zero, legacy request ID one, bounded early cancellation, and later report requests through the compiled stdio executable.**

## Performance

- **Duration:** 32 min
- **Tasks:** 2
- **Files modified:** 9
- **Validation:** Clean-install `npm run check` passed on Node `20.20.2` and Node `22.22.2`. Each run reported 45 discovered test files, 433 normal tests, and one installed-artifact test.

## Accomplishments

- Added a public notification-handler bridge that tracks exact request IDs, including numeric zero.
- Retained at most 128 early cancellation IDs for 30 seconds, then consumed matching IDs before callback source work starts.
- Forwarded the combined bridge and SDK signal to all five Standard tools and the constrained Analytics tool.
- Added executable legacy and modern tests for consecutive `tools/call` and cancellation frames, source aborts, bounded early-ID consumption, sequence-specific cleanup, reuse, and shutdown.

## Task Commits

1. **Task 1: Write failing legacy-and-modern production-path contracts** - `ce5ed72` (test)
2. **Task 2: Add the public-SDK request-ID cancellation bridge** - `f4a6291` (feat)
3. **Corrected protocol contract** - `ad4d54c` (test)
4. **Independent-review race and cleanup repair** - `68803f6` (fix)

## Files Created/Modified

- `src/mcp-request-cancellation.ts` - Owns active request controllers, signal relays, cleanup, and the six-tool matrix.
- `src/index.ts` and `src/server.ts` - Enable the count-only observer only for the executable test process.
- `src/report-tools.ts` and `src/analytics-report-tools.ts` - Register all report callbacks through the bridge.
- `test/first-tool-cancellation-e2e.test.ts` - Uses official stdio clients against `dist/index.js` for both protocol eras.
- `test/fixtures/installed-artifact-fetch-preload.ts` - Supplies opt-in invented abortable upstream routes.

## Decisions Made

- Legacy official stdio allocates initialize ID `0` and first `tools/call` ID `1`.
- Modern pinned `2026-07-28` discovery precedes its first `tools/call` ID `0`.
- The local bridge replaces only report callback cancellation dispatch and keeps existing report result boundaries.
- The executable observer records counts and sequence-local stderr markers only. It does not retain stderr or report data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test guard] Kept the startup-runtime guard aligned with the explicit observer gate.**
- **Found during:** Task 2
- **Issue:** The existing source-shape test rejected the required test-only observer wiring.
- **Fix:** The guard now requires both the shared runtime factory and the explicit observer gate.
- **Files modified:** `test/server.test.ts`
- **Verification:** `npm run check`
- **Committed in:** `ad4d54c`

**2. [Rule 1 - Package-artifact expectation] Added the bridge module to the artifact manifest test.**
- **Found during:** Task 2
- **Issue:** The strict package artifact test needed the new compiled module listed.
- **Fix:** Added `mcp-request-cancellation` to its expected artifact modules.
- **Files modified:** `test/package-artifact-e2e.test.ts`
- **Verification:** `npm run check`
- **Committed in:** `f4a6291`

**Total deviations:** 4 auto-fixed issues.

**3. [Rule 1 - Cancellation race] Retained bounded cancellation IDs received before callback registration.**
- **Found during:** Independent review repair.
- **Issue:** A cancellation could arrive before the active-controller map held its matching callback ID.
- **Fix:** The bridge retains only the request ID with a 128-entry and 30-second bound. The matching wrapper consumes it and aborts before source work. The executable test also proves consecutive request and cancellation frames abort an active source.
- **Files modified:** `src/mcp-request-cancellation.ts`, `src/index.ts`, `test/first-tool-cancellation-e2e.test.ts`, `test/fixtures/installed-artifact-fetch-preload.ts`
- **Verification:** Node `20.20.2` and Node `22.22.2` clean-install `npm run check`

**4. [Rule 1 - Cleanup proof] Replaced accumulated stderr substring checks with sequence-specific marker checks.**
- **Found during:** Independent review repair.
- **Issue:** A prior cleanup marker could satisfy a later terminal-path assertion.
- **Fix:** The executable test records line occurrences with monotonic sequence numbers. It proves fresh zero cleanup after later cancellation, successful resolution, and source rejection.
- **Files modified:** `test/first-tool-cancellation-e2e.test.ts`, `test/fixtures/installed-artifact-fetch-preload.ts`
- **Verification:** Node `20.20.2` and Node `22.22.2` clean-install `npm run check`

## Known Stubs

None.

## Next Phase Readiness

Plan 06-08 must run the isolated mutation harness and dual-runtime immutable-candidate validation. Issue #60 remains open. This plan provides local implementation and synthetic executable evidence only. It does not establish independent review, live compatibility, Merchant consent, Toast approval, signing, or publication.

## Self-Check: PASSED

- Task commits `ce5ed72`, `f4a6291`, `ad4d54c`, and `68803f6` exist.
- The bridge and executable test files exist.
