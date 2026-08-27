---
phase: 04-cash-and-labor-reporting
plan: "03"
subsystem: mcp-stdio-reporting
tags: [typescript, node, mcp, toast, cash, labor, stdio]
requires:
  - phase: 04-01
    provides: deterministic cash source, fold, and report builder
  - phase: 04-02
    provides: deterministic labor source and report builder
provides:
  - production stdio registration for cash and labor reports
  - official-client end-to-end proof for both tools
  - durable source, privacy, and failure-contract documentation
affects: [phase-05, phase-06, mcp-tool-consumers]
tech-stack:
  added: []
  patterns: [shared-runtime-tool-registration, structured-incomplete-denial, official-client-stdio-e2e]
key-files:
  created:
    - .planning/phases/04-cash-and-labor-reporting/04-03-SUMMARY.md
  modified:
    - src/report-tools.ts
    - test/fixtures/stdio-report-server.ts
    - test/report-tools-e2e.test.ts
    - test/server.test.ts
    - docs/architecture/standard-report-tools.md
    - docs/architecture/orders-normalization-contract.md
    - docs/research/toast-api-reporting-landscape.md
decisions:
  - Cash and labor use the same production runtime, capability checks, rate limits, and cancellation signal as item-sales reporting.
  - Valid active labor facts return structured incomplete output without an MCP error; missing scope or malformed source data returns a denial without totals.
  - Labor reporting exposes aggregates only and keeps the normalized server GUID in memory only for the labor join.
metrics:
  duration: 25 minutes
  completed: 2026-08-27
status: complete
requirements: [T4-001, T4-002]
---

# Phase 04 Plan 03: Cash and Labor Stdio Integration Summary

Cash and labor reports now use the production stdio MCP boundary with deterministic failure, provenance, privacy, rate-limit, and cancellation behavior.

## Delivered

- Registered `toast_cash_summary` and `toast_labor_summary` through the shared production runtime.
- Added independently invented stdio fixtures and official MCP client end-to-end tests.
- Documented the exact cash and labor sources, scopes, current-snapshot rules, output states, and aggregate-only privacy boundary.
- Documented that `Order.server.guid` becomes `NormalizedOrder.serverGuid` only for the in-memory labor join.

## Source Ownership

| Slice | Owns |
| --- | --- |
| 04-01 | Cash source reads, validation, fold, and report construction. |
| 04-02 | Labor source reads, normalization, current-snapshot semantics, and report construction. |
| 04-03 | Production tool registration, synthetic stdio fixture wiring, official-client proof, and durable documentation. |

## Verification Evidence

The initial immutable verification candidate was `16e1321d28dca1e86c55237d965098be6635a8cd`.

| Runtime | Head before | Result | Head after |
| --- | --- | --- | --- |
| Node `v20.20.2`, npm `10.8.2` | `16e1321d` | `npm ci`, `npm run check`, compiled stdio E2E, and `npm pack --dry-run --json` passed. The full check ran 34 test files and 348 tests. The focused stdio E2E ran 27 tests. The package listed 139 files. | `16e1321d` |
| Node `v22.22.2`, npm `10.9.7` | `16e1321d` | `npm ci`, `npm run check`, compiled stdio E2E, and `npm pack --dry-run --json` passed. The full check ran 34 test files and 348 tests. The focused stdio E2E ran 27 tests. The package listed 139 files. | `16e1321d` |

The commands used the locally installed NVM runtime selector. No live Toast request or real Merchant Data was used.

## Mutation Coverage

| Mutated behavior | Proof that caught it |
| --- | --- |
| Cash or labor tool registration name | Tool discovery and official-client stdio test. |
| Labor incomplete mapping | Active-entry incomplete-output test. |
| Missing report scope | Scope-denial test with no fabricated totals. |
| Wrong restaurant request header | Selected-restaurant source assertion. |
| Archived labor entry counted as current | Current-snapshot and archived-entry test. |
| Rate-limit state omitted | Delayed later cash-report stdio test with provenance. |
| Privacy marker removed | Aggregate-only output serialization assertion. |
| Cancellation signal omitted | Nonzero-ID cash and labor cancellation tests. |

## Documentation and Safety

`standard-report-tools.md` now records each tool's inputs, source APIs, scopes, provenance, and complete, incomplete, or denied behavior. Cash totals do not represent guest cash payments, expected drawer amounts, or deposit reconciliation. Labor sales and tips use Orders data, not TimeEntry fields. Labor does not calculate overtime wages without an explicit multiplier.

`orders-normalization-contract.md` now limits server attribution to `NormalizedOrder.serverGuid`. The value is not retained, exposed, or used for employee identity output.

DOX: updated for the durable Standard report and normalization contracts.

## External Gates

- Toast scope approval and live credential compatibility remain external gates: #28 and #4 / T6-003.
- Toast terms, branding, package signing, publish credentials, and public package publication remain release gates.
- The synthetic stdio evidence proves the local runtime path only. It does not prove live Toast API compatibility or Toast approval.

## Deviations from Plan

### Auto-fixed Issues

None. The implementation matched the planned tool, fixture, test, and documentation scope.

## R1 Review Remediation

Candidate `c1743dd80fbb5cc358a8e9f80a1bf67acd3b62fa` resolves PR #48 findings T4-003-R1-F1 and T4-003-R1-F2.

- `report-tools-t4-e2e.test.ts` proves every cash source stage and every labor source stage through an official MCP stdio client.
- The suite checks complete, incomplete, and denied outcomes; every cash and labor provenance request ID; an accessible explicit alternate restaurant GUID; alternate-location headers; and request stopping after cancellation at each source stage.
- The fixture now has route-level synthetic request markers. It records only independently invented fixture facts.
- The R1 fixture and E2E test split used focused files below 600 lines at that candidate. R7 later extracted payment routes to keep the current fixture server below that limit.
- Mutation checks passed: changing the cash-drawer request ID caused the complete-source assertion to fail, and forcing the default restaurant header caused the alternate-location assertion to fail.

| Runtime | Head before | Result | Head after |
| --- | --- | --- | --- |
| Node `v20.20.2`, npm `10.8.2` | `c1743dd` | `npm ci`, `npm run check`, all three compiled E2E files, and `npm pack --dry-run --json` passed. The full check discovered 36 test files. Focused E2E ran 40 tests. The package listed 139 files. | `c1743dd` |
| Node `v22.22.2`, npm `10.9.7` | `c1743dd` | `npm ci`, `npm run check`, all three compiled E2E files, and `npm pack --dry-run --json` passed. The full check discovered 36 test files. Focused E2E ran 40 tests. The package listed 139 files. | `c1743dd` |

## R2 Review Remediation

Candidate `7eece04ef77dda2f6f2ab8f0769c0f29cb67f263` adds child-process malformed-source denials for deposits, all cash configuration stages, labor jobs, labor configuration stages, and Labor Orders. Each case asserts its structured denial and the exact request sequence before the failure.

Alternate restaurant assertions now validate name, requested and effective business dates, timezone, currency, context provenance, and full serialized MCP result privacy. The serialization rejects synthetic token, guest, contact, employee, raw-source, and card markers.

Both Node `v20.20.2` and `v22.22.2` exact-head gates passed with 36 discovered test files and 361 tests. The three compiled report E2E files passed 41 tests. Each package dry-run listed 139 files.

## R3 Review Remediation

Candidate `c673e0c71e7dda74d78ac3214ccc946aa9a55fb1` resolves PR #48 findings T4-003-R3-F1 through T4-003-R3-F4.

- The malformed first cash and labor source cases now prove the exact initial request paths: `/cashmgmt/v1/entries` and `/labor/v1/timeEntries`.
- The alternate-restaurant path now asserts both context provenance request IDs and every freshness field.
- Invoked cash and labor fixtures now contain unique synthetic guest and contact markers. Full MCP result serialization proves those markers never reach tool output.
- Both exact-runtime gates passed on the immutable candidate with 36 test files and 362 tests. The three compiled report E2E files passed 41 tests. Each package dry-run listed 139 files.

| Runtime | Head before | Result | Head after |
| --- | --- | --- | --- |
| Node `v20.20.2`, npm `10.8.2` | `c673e0c` | `npm ci`, `npm run check`, all three compiled E2E files, and `npm pack --dry-run --json` passed. | `c673e0c` |
| Node `v22.22.2`, npm `10.9.7` | `c673e0c` | `npm ci`, `npm run check`, all three compiled E2E files, and `npm pack --dry-run --json` passed. | `c673e0c` |

## R4-R9 Final Review Remediation

The final implementation candidate is `16f154f19e8973ba8a98e6231d1e54e15392db66`.

- R4 extracts cash and labor tool registrations. `registerStandardReportTools` is a 68-line coordinator.
- R5 rejects `SYNTHETIC_CLIENT_SECRET_MARKER` from the full serialized cash and labor MCP result.
- R6 makes `syntheticToastFetch` a 26-line dispatcher and splits the former core E2E callback into three discovered tests: cash/labor, sales/payment, and item/dimension.
- R7 moves the cohesive payment route group into `stdio-report-payment-routes.ts`. The dispatcher and all route behavior remain unchanged.
- R8 candidate `322b95a0035d3dabd38b97a4dae7dee854e7eddd` uses one `as const` fixture scenario list, a derived scenario type, bounded membership validation, separate cash entries/deposits/configuration handlers, and real `setTimeout` rate-limit sleep.
- R9 splits the 136-line `syntheticOrder` fixture into focused order, check, selection, payment, and service-charge builders. `syntheticOrder` is now 20 lines and preserves the existing values.

Both exact runtime gates passed on the final implementation candidate. Each ran `npm ci --no-audit --no-fund`, `npm run check`, the three compiled report E2E files, and `npm pack --dry-run --json`. The full check discovered 36 files and 364 tests. The three report E2E files passed 43 tests. The package dry-run listed 139 files.

| File | Lines | Status |
| --- | ---: | --- |
| `test/fixtures/stdio-report-data.ts` | 414 | `syntheticOrder` is below the 100-line function limit. |
| `test/fixtures/stdio-report-server.ts` | 521 | Below 600-line limit. |
| `test/fixtures/stdio-report-cash-routes.ts` | 138 | Focused entries, deposits, and configuration route handlers. |
| `test/fixtures/stdio-report-payment-routes.ts` | 58 | New focused payment fixture route module. |
| `test/report-tools-core-e2e.test.ts` | 239 | Three discovered callbacks are each below 100 lines. |
| `test/report-tools-t4-e2e.test.ts` | 310 | Below 600-line limit. |
| `test/report-tools-e2e.test.ts` | 570 | Below 600-line limit. |

## Known Stubs

None. The plan does not leave an unwired report path or an empty UI data source.

## Self-Check: PASSED

- The summary exists at the declared path.
- Task commits `1b16613`, `63e0d0f`, and `16e1321` exist in this worktree history.
