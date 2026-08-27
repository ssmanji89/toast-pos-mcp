---
phase: 04-cash-and-labor-reporting
plan: 01
subsystem: cash-reporting
tags: [typescript, zod, toast-standard-api, cash-management, deterministic-reporting]
requires:
  - phase: 03-standard-reporting
    provides: ApplicationRuntime, capability preflight, rate-limited transport, report provenance
provides:
  - Strict Cash Management source schemas that discard raw display and contact fields.
  - A reversal-safe, source-distinct cash fold in integer minor units.
  - A location-bound cash summary builder with capability preflight and structured denials.
affects: [04-02-labor-reporting, 04-03-cash-labor-integration, report-tools]
tech-stack:
  added: []
  patterns: [strict transient source validation, restaurant-bound configuration traversal, aggregate-only cash results]
key-files:
  created:
    - src/cash-report-source.ts
    - src/cash-report.ts
    - src/cash-report-fold.ts
    - test/cash-report.test.ts
  modified:
    - src/cash-report-source.ts
    - src/cash-report.ts
    - src/cash-report-fold.ts
    - test/cash-report.test.ts
key-decisions:
  - "Cash entries and deposits remain source-distinct Cash Management facts, not guest cash payments or expected deposits."
  - "Cross-date reversal references remain observed entries and create a warning instead of guessed netting."
  - "Cash and configuration scopes are preflighted together before every business-data read."
patterns-established:
  - "Cash reports validate every detailed source response against its selected restaurant before aggregation."
  - "Required Configuration sources use the shared cancellable page-token traversal and contribute to report provenance."
requirements-completed: [T4-001]
duration: 8min
completed: 2026-08-27
status: complete
---

# Phase 4 Plan 01: Cash Source and Builder Summary

**Location-isolated Cash Management summaries with strict source validation, reversal-safe minor-unit totals, and aggregate-only denial-safe output.**

## Performance

- **Duration:** 8 minutes
- **Started:** 2026-08-27T16:35:53Z
- **Completed:** 2026-08-27T16:43:41Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Added transient Cash Entry, Deposit, Cash Drawer, No Sale Reason, and Payout Reason schemas.
- Added a pure cash fold that preserves unknown entry types, source references, observed reversals, and unresolved cross-date reversal counts.
- Added `buildCashSummaryReport` with selected-location authority, `cashmgmt:read` and `config:read` preflight, cancellable source reads, detailed provenance, and structured denials.
- Corrected Deposit reversal treatment, removed unsupported drawer-to-Deposit attribution, and recorded absent drawers as an explicit completeness fact.
- Canonicalized Cash Management GUID identity in the fold and rejected duplicate canonical Entry and Deposit records.

## Task Commits

1. **Task 1: Define and prove the cash source and reversal-safe fold contract**
   - `5259588` `test(04-01): add failing cash report contract`
   - `672026f` `feat(04-01): implement cash source fold`
2. **Task 2: Build the location-bound cash report with capability and denial contracts**
   - `6fdde65` `test(04-01): add failing cash builder contract`
   - `0531b89` `feat(04-01): build location-bound cash summary`
3. **Independent review corrections**
   - `80843e5` `fix(04-01): correct cash source reversal facts`
   - `903b304` `test(04-01): cover cash source boundary failures`
   - `9a83660` `refactor(04-01): split cash report builder`
4. **Second independent review corrections**
   - `a0e67a4` `fix(04-01): harden cash source identity`

## Verification

`npm run build:test && node --test dist-test/test/cash-report.test.js`

- PASS: TypeScript compiled the cash source, fold, builder, and synthetic doubles.
- PASS: 15 focused tests passed.
- PASS: Tests cover canonical GUID identity, duplicate source rejection, every recognized Entry counter type, same-day and cross-date Entry and Deposit reversals, malformed entry/deposit/configuration sources, real cancellation, controlled HTTP 503 denial, paths, queries, headers, provenance, and denied-output privacy.
- PASS: `git diff --check 523fdd3a7aba64be3ab68a86fd89874bb2b616ba..HEAD` reported no whitespace errors.

## Negative Checks

- Malformed entry, drawer, no-sale reason, payout reason, and configuration traversal inputs deny or reject before totals.
- Missing `config:read` stops before every business-data request.
- Restaurant-scope mismatch, cancellation, and empty configuration traversal deny without totals.
- Serialization tests reject raw arrays and synthetic guest, employee, card, token, and contact markers.

## Decisions Made

- Used the documented Cash Management fields `date`, `cashDrawer`, `noSaleReason`, `payoutReason`, and `undoes`.
- Preserved unresolved drawer and reason GUID references as aggregate identifiers only.
- Kept deposit facts separate because deposit payloads do not supply a drawer reference.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected synthetic drawer-reference assertion**

- **Found during:** Task 1
- **Issue:** The test expected one entry for a drawer that two invented entries referenced.
- **Fix:** Corrected the expected aggregate count.
- **Files modified:** `test/cash-report.test.ts`
- **Verification:** Focused compiled test passed after the correction.
- **Committed in:** `672026f`

**2. [Rule 1 - Bug] Corrected synthetic configuration provenance assertion**

- **Found during:** Task 2
- **Issue:** The test expected a shortened request identifier that the controlled source did not produce.
- **Fix:** Matched the tested bounded provenance identifier.
- **Files modified:** `test/cash-report.test.ts`
- **Verification:** Focused compiled test passed after the correction.
- **Committed in:** `0531b89`

**Total deviations:** 2 auto-fixed (2 Rule 1 test-contract corrections).

**Impact on plan:** No scope expansion occurred.

## Known Stubs

None. The report has a production-shaped runtime path and does not return placeholder data.

## DOX

DOX: no durable change. This plan intentionally does not modify shared report registration or durable documentation.

## Independent Review Round R1

- **Review input:** PR #46 independent-review comment `issuecomment-5442396740` on pre-correction head `977316c`.
- **Deposit reversals:** Positive Deposits remain required. An `undoes` Deposit subtracts its amount. Same-date reversals net in the invocation. Cross-date reversals remain negative observed facts and increment an unresolved count.
- **Drawer attribution:** Drawer references now contain Entry counts only. The report does not invent a Deposit-to-drawer relationship.
- **Optional drawers:** A missing or null Cash Entry `cashDrawer` is valid. The fold records `cashEntriesWithoutDrawerCount`.
- **Boundary and cancellation coverage:** Tests independently deny malformed entry, Deposit, and each configuration source. The builder uses the caller signal for every source request. An `AbortController` test stops after its first cancelled read.
- **Route contract coverage:** The runtime test checks the documented Cash Management paths, `businessDate` query for entry and Deposit requests, and the selected restaurant header on every request.
- **Complexity:** `buildCashSummaryReport` is now a coordinator. Context resolution, source loading, completion, denial, and warnings are separate helpers.
- **Mutation checks:** Focused tests caught an incorrect Deposit reversal sign, acceptance of zero Deposit amounts, rejection of null drawers, an incorrect Deposit route, and loss of the cancellation signal. The lost-signal mutation left the cancellation test pending until the test process was stopped.
- **Result:** `npm run build:test && node --test dist-test/test/cash-report.test.js` passed 12/12 tests after every mutation was restored.
- **Review status:** This correction set is not self-approved. It requires a fresh independent review.

## Independent Review Round R2

- **Review input:** PR #46 independent-review comment `issuecomment-5442610405` on head `384ab05`.
- **Canonical identity:** Entry and Deposit GUID identity is lower-case UUID identity. The fold rejects repeated canonical Entry or Deposit GUIDs before it calculates totals. Reference GUIDs are also emitted in canonical lower case.
- **Recognized types:** A table test covers `NO_SALE`, `CASH_IN`, `CASH_OUT`, `CASH_COLLECTED`, `TIP_OUT`, `PAY_OUT`, `UNDO_PAY_OUT`, `DRIVER_REIMBURSEMENT`, and all three closeout forms.
- **HTTP denial:** A controlled, real Toast transport 503 response preserves `request_failed`, `retryable: true`, status `503`, and `toast-request-id`. It returns no totals and starts no later business-data request.
- **Cancellation:** The source-entry barrier is deterministic. The node:test timeout is 1 second. A removed request signal now fails and times out within that bound.
- **Complexity:** `cash-report-fold.ts` owns cash fold types and logic. `cash-report.ts` owns builder orchestration. The files contain 257 and 413 lines. A focused script confirmed every function in both files is 100 lines or fewer.
- **Mutation checks:** Focused tests caught raw-case duplicate identity, omitted `UNDO_PAY_OUT` counting, and removed source cancellation propagation.
- **Result:** `npm run build:test && node --test dist-test/test/cash-report.test.js` passed 15/15 after every mutation was restored.
- **Review status:** This correction set is not self-approved. It requires a fresh independent review.

## Evidence Limits

- Synthetic fixtures are implementation evidence only.
- This plan does not claim live Toast API compatibility, MCP tool registration, Node 20/22 compatibility, public package publication, signing, or first-tool-request cancellation proof.
- Owner-authorized Merchant consent and live credential evidence remain external release gates.

## Next Phase Readiness

Plan 04-02 can proceed independently. Plan 04-03 can register this builder through the shared MCP boundary and add stdio-chain evidence.

## Self-Check: PASSED

- Confirmed all four implementation artifacts and this summary exist.
- Confirmed all eight TDD, implementation, correction, and refactor commits exist in the repository history.
