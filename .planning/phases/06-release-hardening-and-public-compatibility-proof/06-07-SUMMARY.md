---
phase: 06-release-hardening-and-public-compatibility-proof
plan: "07"
subsystem: mcp-stdio-cancellation
tags: [typescript, mcp-sdk-v2, stdio, cancellation, testing]
requires:
  - phase: 06-06
    provides: "Current public MCP SDK v2 runtime baseline and release-gate plan"
provides:
  - "Public-SDK cancellation bridge for accepted numeric-zero and nonzero report calls"
  - "Executable modern source-abort and coalesced legacy pre-handler cancellation evidence"
affects: [06-08, issue-60, mcp-runtime]
tech-stack:
  added: []
  patterns: ["Official stdio transport decorator", "accepted-request-only cancellation", "sequence-numbered count-only executable observer"]
key-files:
  created: [src/mcp-request-cancellation.ts, src/accepted-request-transport.ts, test/first-tool-cancellation-e2e.test.ts]
  modified: [src/index.ts, src/server.ts, src/stdio.ts, test/fixtures/stdio-report-server.ts, test/fixtures/stdio-analytics-report-server.ts, test/server.test.ts, test/package-artifact-e2e.test.ts]
key-decisions:
  - "Retain official request allocation: legacy initialize ID 0 then tool ID 1; modern first tool ID 0."
  - "Use the documented serveStdio transport option and official StdioServerTransport without custom framing."
  - "Cancel only report IDs that the official entry accepted; unknown, late, and future IDs remain inert."
patterns-established:
  - "Pass accepted-request state from startStdioServer to every createServer factory."
  - "Remove bridge controllers, relays, and accepted IDs in terminal callback paths."
requirements-completed: []
duration: 48min
completed: 2026-08-28
status: complete
---

# Phase 06 Plan 07: First stdio tool-request cancellation bridge Summary

**Accepted-request cancellation bridge preserves official stdio framing and covers modern ID zero plus coalesced legacy cancellation.**

## Performance

- **Duration:** 48 min
- **Tasks:** 2
- **Files modified:** 10
- **Validation:** Clean-install `npm run check` passed on Node `20.20.2` and Node `22.22.2`. Each run reported 45 discovered test files, 434 normal tests, and one installed-artifact test.

## Accomplishments

- Decorated the official `StdioServerTransport` through the documented `serveStdio` transport option. The decorator does not parse or serialize frames.
- Retained cancellation state only for accepted report calls. Unknown, late, and future notification IDs cannot affect later calls.
- Proved modern first-tool ID `0` cancellation reaches the invented Orders source. Proved a coalesced legacy initialized, tool ID `1`, and cancellation sequence aborts before handler or Orders source access.
- Preserved later nonzero Standard and Analytics cancellation, result boundaries, cleanup, process reuse, and installed-artifact behavior.

## Task Commits

1. **Task 1: Write failing legacy-and-modern production-path contracts** - `ce5ed72` (test)
2. **Task 2: Add the public-SDK request-ID cancellation bridge** - `f4a6291` (feat)
3. **Corrected protocol contract** - `ad4d54c` (test)
4. **Independent-review race and cleanup repair** - `68803f6` (fix)
5. **Independent-review unknown-ID isolation repair** - `bb3f4b3` (fix)
6. **Accepted-request race repair** - `5617d3e` (fix)

## Files Created/Modified

- `src/accepted-request-transport.ts` - Records report calls after official entry dispatch and releases accepted IDs after output responses.
- `src/stdio.ts` - Supplies the registry to the server factory through the official `serveStdio` boundary.
- `src/mcp-request-cancellation.ts` - Uses accepted IDs for bridge cancellation and cleans terminal state.
- `src/index.ts` and `src/server.ts` - Pass the process registry into the production server composition.
- `test/first-tool-cancellation-e2e.test.ts` - Uses official client behavior and raw coalesced legacy frames against `dist/index.js`.
- `test/fixtures/stdio-report-server.ts` and `test/fixtures/stdio-analytics-report-server.ts` - Pass the registry through executable test composition.
- `test/package-artifact-e2e.test.ts` - Includes the new compiled bridge module in the strict artifact manifest.

## Decisions Made

- Legacy official stdio uses initialize ID `0` and first `tools/call` ID `1`.
- Modern pinned `2026-07-28` discovery precedes the first `tools/call` ID `0`.
- Coalesced legacy cancellation is a pre-handler proof. It must show no Orders source start, not a source abort.
- The executable observer reports only active-controller and relay-listener counts. It does not retain stderr or report data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Cancellation race] Used accepted-request tracking for cancellation that arrives before callback registration.**
- **Found during:** Independent review repair
- **Issue:** An active-only map ignored a valid cancellation in a coalesced legacy input sequence.
- **Fix:** Decorated the official transport to register only accepted report calls, then consumed cancellation state when the callback registers.
- **Files modified:** `src/accepted-request-transport.ts`, `src/stdio.ts`, `src/mcp-request-cancellation.ts`, `src/server.ts`, `src/index.ts`, `test/first-tool-cancellation-e2e.test.ts`
- **Verification:** Node `20.20.2` and Node `22.22.2` clean-install `npm run check`
- **Committed in:** `5617d3e`

**2. [Rule 3 - Blocking] Passed accepted-request state through executable fixtures and updated the package manifest test.**
- **Found during:** Full-gate validation
- **Issue:** Fixture factories created a separate registry, and the strict package list omitted the new compiled module.
- **Fix:** Passed the factory registry to both fixture servers and added `accepted-request-transport` to the expected artifact list.
- **Files modified:** `test/fixtures/stdio-report-server.ts`, `test/fixtures/stdio-analytics-report-server.ts`, `test/server.test.ts`, `test/package-artifact-e2e.test.ts`
- **Verification:** Node `20.20.2` and Node `22.22.2` clean-install `npm run check`
- **Committed in:** `5617d3e`

**Total deviations:** 2 auto-fixed issues. The repairs retain the public SDK boundary and do not change report contracts.

## Known Stubs

None.

## Next Phase Readiness

Plan 06-08 can run its independent mutation and immutable-candidate validation. Issue #60 remains open. This plan is local synthetic implementation evidence only. It does not establish independent review, live compatibility, Merchant consent, Toast approval, signing, or publication. DOX: no durable change.

## Self-Check: PASSED

- Task commits `ce5ed72`, `f4a6291`, `ad4d54c`, `68803f6`, `bb3f4b3`, and `5617d3e` exist.
- The accepted-request transport, bridge, executable test, and fixture wiring files exist.
