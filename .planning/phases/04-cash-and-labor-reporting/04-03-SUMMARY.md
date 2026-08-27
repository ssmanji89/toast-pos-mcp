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

The immutable verification candidate was `16e1321d28dca1e86c55237d965098be6635a8cd`.

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

## Known Stubs

None. The plan does not leave an unwired report path or an empty UI data source.

## Self-Check: PASSED

- The summary exists at the declared path.
- Task commits `1b16613`, `63e0d0f`, and `16e1321` exist in this worktree history.
