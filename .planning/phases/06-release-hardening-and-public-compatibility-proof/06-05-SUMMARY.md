---
phase: 06-release-hardening-and-public-compatibility-proof
plan: "05"
subsystem: release-evidence
tags: [mcp, zod, output-schema, validation, node20, node22, mutation-testing]
requires:
  - phase: 06-04
    provides: public runtime and top-level Standard output-schema evidence
provides:
  - fixture-proved strict nested Standard schemas with open Toast-derived strings
  - exact candidate and post-merge local validation evidence
  - reconciled validation state that separates local proof from pending gates
affects: [T6-003, public-stdio-compatibility, release-evidence]
tech-stack:
  added: []
  patterns: [strict fixed records with open vendor strings, exact-SHA validation, reviewer-pending release evidence]
key-files:
  created: []
  modified: [src/report-tools.ts, test/report-tools-e2e.test.ts, scripts/verify-t6-public-wiring-mutations.mjs, .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md]
key-decisions:
  - "Make only fixture-proved fixed nested records strict, while keeping Toast-derived strings and extensible context open."
  - "Record independent-agent CLEAN separately from absent GitHub-attributable review."
  - "Keep formal requirements coverage and all release authority gates pending."
patterns-established:
  - "Record exact command, runtime, candidate SHA, and named test evidence before making a validation claim."
requirements-completed: []
requirements-traceability: "pending: .planning/REQUIREMENTS.md is absent; T6-003 is an owner reference, not formal coverage"
duration: recorded-in-pr
completed: 2026-08-28
status: complete
review-status: reviewer-pending
---

# Phase 06 Plan 05: Validation Reconciliation and Nested Standard Schemas Summary

**Fixture-proved nested Standard schemas are strict where safe, while the merged validation record keeps local evidence, GitHub review, and release authority separate.**

## Performance

- **Candidate:** `9403bff75b677a97bcceae244efa755bee91778b`
- **Merge:** PR #58 at `69f4052302dd27c1dd6ed92ff406c78d3c5f5a3c`
- **Tasks:** 3
- **Files modified:** 4 implementation/evidence files

## Accomplishments

- Fixed nested report records use strict schemas only after invented-fixture proof.
- Open Toast-derived strings, open-key maps, and extensible `dimensionContext` remain open.
- Node 20.20.2 and Node 22.22.2 candidate gates passed 415 normal tests, one installed-artifact test, 41 focused tests, and 25 mutations.
- Post-merge Node 22.22.2 passed 415 normal tests and one installed-artifact test at the merge SHA.

## Task Commits

1. **Task 1: Prove or reject each proposed nested Standard contract** - `13aac12` (`test`)
2. **Task 2: Implement only fixture-proved nested schemas and mutation guards** - `9403bff` (`feat`)
3. **Task 3: Obtain independent review of the immutable candidate** - Independent agent CLEAN at `9403bff`; GitHub-attributable review remains reviewer-pending.

## Files Created/Modified

- `src/report-tools.ts` - Defines strict fixed nested report objects and open vendor-derived values.
- `test/report-tools-e2e.test.ts` - Tests emitted nested schemas and invented complete responses.
- `scripts/verify-t6-public-wiring-mutations.mjs` - Guards each strict nested contract with isolated mutations.
- `06-VALIDATION.md` - Records executed local evidence and pending authority gates.

## Decisions Made

- Treat the independent agent CLEAN result as local review evidence only.
- Keep PR #55 and PR #58 GitHub-attributable review states pending because the observed GitHub review arrays are empty.
- Do not mark formal requirements coverage, Nyquist compliance, release readiness, or any external gate complete.

## Deviations from Plan

None - the merged candidate implemented the planned schema, mutation, and validation work. This post-merge control-plane record preserves its evidence limits.

## Known Stubs

None. The report schemas use real invented-handler fixture data.

## Next Phase Readiness

- Local implementation and validation evidence are merged.
- Formal requirements coverage, GitHub-attributable review for PR #55 and PR #58, #4/T6-003, T5-003-G01, #28, live compatibility, signing, publication, consent, Terms, and brand approval remain open.
- `06-VALIDATION.md` remains `status: incomplete` and `nyquist_compliant: false`.

## Self-Check: PASSED

- PR #58 merge, candidate, candidate gates, and post-merge Node 22 result match the recorded GitHub evidence.
- The formal requirements file is absent, and the two GitHub review arrays are empty.

DOX: updated. This reconciliation changes release-evidence records only. It does not change a product contract, release authority, or external approval.

---
*Phase: 06-release-hardening-and-public-compatibility-proof*
*Completed: 2026-08-28*
