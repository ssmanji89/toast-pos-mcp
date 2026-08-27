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
    - src/cash-report-limits.ts
    - test/cash-report.test.ts
    - test/cash-report-fold.test.ts
    - test/cash-report-r3.test.ts
    - test/cash-report-r4.test.ts
    - test/configuration-page-fold.test.ts
    - test/support/cash-report-fixtures.ts
  modified:
    - src/cash-report-source.ts
    - src/cash-report.ts
    - src/cash-report-fold.ts
    - src/cash-report-limits.ts
    - src/rate-limited-client.ts
    - src/report-core.ts
    - src/transport.ts
    - test/cash-report.test.ts
    - test/cash-report-fold.test.ts
    - test/cash-report-r3.test.ts
    - test/cash-report-r4.test.ts
    - test/configuration-page-fold.test.ts
    - test/support/cash-report-fixtures.ts
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
- **Files modified:** 8

## Accomplishments

- Added transient Cash Entry, Deposit, Cash Drawer, No Sale Reason, and Payout Reason schemas.
- Added a pure cash fold that preserves unknown entry types, source references, observed reversals, and unresolved cross-date reversal counts.
- Added `buildCashSummaryReport` with selected-location authority, `cashmgmt:read` and `config:read` preflight, cancellable source reads, detailed provenance, and structured denials.
- Corrected Deposit reversal treatment, removed unsupported drawer-to-Deposit attribution, and recorded absent drawers as an explicit completeness fact.
- Canonicalized Cash Management GUID identity in the fold and rejected duplicate canonical Entry and Deposit records.
- Bounded source records, open type values, aggregate type keys, and aggregate reference keys with fail-closed denials.
- Stripped unknown fields from all cash ingress records and GUID references before the report fold retains them.
- Denied configuration page aggregates above the source-record limit before later configuration sources can start.
- Consumed configuration pages sequentially through the rate-limited transport before each next-token request.
- Ordered open Cash Entry type totals by Unicode code units, independent of process locale.
- Accepted valid empty configuration pages while denying an absent configuration traversal.

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
5. **Third independent review corrections**
   - `ec359e1` `fix(04-01): bound cash source processing`
6. **Fourth independent review corrections**
   - `3bc2767` `fix(t4-001-04): bound cash source ingress`
7. **Fifth independent review corrections**
   - `f435cfe` `fix(t4-001-04): stream cash configuration pages`
8. **Sixth independent review corrections**
   - `e27b560` `fix(t4-001-04): accept empty cash configuration pages`

## Verification

`npm run build:test && node --test dist-test/test/cash-report.test.js dist-test/test/cash-report-fold.test.js dist-test/test/cash-report-r3.test.js`

- PASS: TypeScript compiled the cash source, fold, builder, and synthetic doubles.
- PASS: 16 focused tests passed.
- PASS: Tests cover canonical GUID identity, duplicate and self-referential reversals, record/type/reference boundaries, each later-source restaurant mismatch, two-page configuration success and failures, real cancellation, controlled HTTP 503 denial, paths, queries, headers, provenance, and denied-output privacy.
- PASS: `npm run check` compiled, ran 31 test files, and completed the package dry-run.
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

DOX: no durable public contract changed. This plan still does not register the cash report. The internal resource-bound contract is recorded in this summary.

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

## Independent Review Round R3

- **Review input:** PR #46 independent-review comment `issuecomment-5442819964` on head `bfd1677`.
- **Limits:** Each Cash Management array accepts at most 1,000 records. Entry type text accepts 128 characters. The fold accepts at most 100 distinct type buckets and 100 distinct keys for each reference output. Boundary-plus-one tests prove each guard.
- **Stable failure:** Oversize source arrays deny with `cash_source_invalid`. Fold output-limit violations raise the stable `cash_source_limit_exceeded` computation error. Neither path returns totals.
- **Reversal identity:** Canonical self-references deny. Distinct canonical entry and Deposit reversals remain valid.
- **Isolation and pages:** Direct tests cover Deposit, Cash Drawer, No Sale Reason, and Payout Reason location mismatches. Two-page configuration success adds the second request ID to provenance. Malformed or mismatched second pages deny and stop before later sources.
- **Ordering:** The builder parses each entry, Deposit, and configuration source before it starts the next source request. This closes a fail-closed ordering defect found by the second-page test.
- **Test split:** The original cash builder test is 231 lines. Fold and R3 coverage are separate 120-line and 83-line files. Shared synthetic fixtures are 144 lines.
- **Mutation checks:** Focused tests caught removal of the entry record cap, canonical self-reference rejection, and restaurant GUID comparison.
- **Result:** The focused suite passed 16/16. `npm run check` passed all 31 discovered test files and package dry-run.
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

## Independent Review Round R4

- **Review input:** PR #46 independent-review comment `5443024630` on head `7494be58b56da5cb306ae9d1d12cca5662eeac0a`.
- **Source minimization:** Cash Entry, Deposit, Drawer, No Sale Reason, Payout Reason, and nested GUID-reference schemas now explicitly use Zod strip behavior. Direct parse tests prove each invented raw field is removed before the fold receives the record.
- **Aggregate limit timing:** Configuration pages accumulate one page at a time. The builder denies when the combined count exceeds 1,000 before it starts the next configuration source.
- **Endpoint boundaries:** Each configuration endpoint accepts two synthetic pages of 500 records. Each endpoint denies 501 plus 500 records. Call-order assertions prove later sources do not start after the denial.
- **Mutation checks:** Changing a GUID-reference schema to passthrough fails the direct parse test. Changing the aggregate condition to reject the boundary fails the 500 plus 500 test. Both mutations were restored.
- **Result:** The focused suite passed 19/19. `npm run check` passed 32 discovered test files, 320 tests, and the package dry-run on Node 25.9.0. Node 20 and Node 22 executables are not available in this worktree, so their required integration gates remain deferred.
- **Review status:** This correction set is not self-approved. It requires a fresh independent review.

## Independent Review Round R5

- **Review input:** PR #46 independent-review comment `5443172536` on head `57d864265aa9e198b15eec226c6b62710d2e732d`.
- **Sequential source path:** `foldConfigurationPages` gives each page to the consumer before it fetches the next token. Cash consumers validate restaurant scope, parse stripped records, enforce the aggregate 1,000-record cap, and retain only normalized records plus minimal provenance metadata.
- **Restart safety:** A scoped 409 creates a fresh consumer state. Stale parsed records and provenance metadata never enter the cash result.
- **Transport proof:** The real rate-limited client test stops after a 500-record page and a 501-record page. It proves page three does not start. A second test proves the factory resets state on a scoped 409 and excludes stale data.
- **Deterministic ordering:** Open cash-entry types use JavaScript code-unit comparison. The `Z` and `Å` test fixes output order as `Z`, then `Å`, regardless of the process locale.
- **Mutation checks:** Removing the transport consumer made both sequential tests fail. Restoring `localeCompare` made the `Z` and `Å` test fail. Both mutations were restored.
- **Result:** The focused suite passed 22/22. `npm run check` passed 33 discovered test files, 323 tests, and the package dry-run on Node 25.9.0. Authentic `npm ci --no-audit --no-fund && npm run check` passed on Node 20.20.2 and Node 22.22.2.
- **Review status:** This correction set is not self-approved. It requires a fresh independent review.

## Independent Review Round R6

- **Review input:** PR #46 independent-review comment `5443385609` on head `20160b1e52398ccfc9014956dee84385cde94a8a`.
- **Empty sources:** The cash configuration consumer tracks valid pages separately from parsed record count. A valid empty array is complete source evidence. No valid page remains a `cash_source_invalid` denial.
- **Endpoint coverage:** Cash Drawer, No Sale Reason, and Payout Reason each have an independent valid-empty-array builder test. All continue through later sources and produce complete reports.
- **Bounded helpers:** `foldConfigurationPages` now delegates option validation and one-attempt processing. The orchestration method has 27 lines. The attempt method has 39 lines. Complete and restart outcomes preserve the prior page-token and scoped-409 semantics.
- **Mutation checks:** Replacing the page counter with record-count detection denies a valid empty source. Weakening the configuration page bound starts an extra page and fails the existing transport test. Both mutations were restored.
- **Result:** The focused suite passed 23/23. Authentic `npm ci --no-audit --no-fund && npm run check` passed 33 discovered test files, 324 tests, and the package dry-run on Node 20.20.2 and Node 22.22.2.
- **Review status:** This correction set is not self-approved. It requires a fresh independent review.

## Evidence Limits

- Synthetic fixtures are implementation evidence only.
- This plan does not claim live Toast API compatibility, MCP tool registration, Node 20/22 compatibility, public package publication, signing, or first-tool-request cancellation proof.
- Owner-authorized Merchant consent and live credential evidence remain external release gates.

## Next Phase Readiness

Plan 04-02 can proceed independently. Plan 04-03 can register this builder through the shared MCP boundary and add stdio-chain evidence.

## Self-Check: PASSED

- Confirmed all eight implementation and focused test artifacts and this summary exist.
- Confirmed all twelve TDD, implementation, correction, and refactor commits exist in the repository history.
