---
phase: 05-source-distinct-analytics-adapter-and-tools
plan: 08
subsystem: analytics-mcp-presentation
tags: [analytics, mcp, stdio, safety, tdd]
status: complete
dependency_graph:
  requires: [05-07, analytics-access, analytics-report-jobs]
  provides: [toast_analytics_metrics_day]
  affects: [stdio-server, analytics-verification]
tech_stack:
  added: []
  patterns: [strict-zod-input, body-free-envelope, child-process-stdio, semantic-mutations]
key_files:
  created: [src/analytics-report-tools.ts, test/analytics-report-tools-stdio.test.ts, test/fixtures/stdio-analytics-report-server.ts, test/support/analytics-report-tools-stdio-support.ts, scripts/verify-t5-003-analytics-mcp-guard-mutations.mjs, docs/verification/t5-003-analytics-mcp-guard-matrix.md]
  modified: [src/server.ts]
decisions:
  - Analytics Metrics/day uses one explicit Analytics-selected restaurant and numeric calendar business date.
  - Retrieval HTTP 200 maps to incomplete analytics_result_schema_unverified without body inspection.
  - Public envelopes expose only safe lifecycle provenance and fixed exclusion policy.
metrics:
  tasks_completed: 3
  focused_tests: 7
  guard_mutations: 18
  completed_date: 2026-08-27
---

# Phase 05 Plan 08: Analytics MCP Tool Summary

One read-only Metrics/day tool uses only process-owned Analytics authority and returns body-free denied or incomplete envelopes.

## Completed Work

- Registered `toast_analytics_metrics_day` only when `createServer()` receives the startup runtime.
- Required one UUID restaurant GUID and one calendar `YYYYMMDD` business date.
- Preserved T5-003-G01 by mapping retrieval HTTP 200 to `analytics_result_schema_unverified` without parsing its body.
- Added synthetic child-process stdio coverage for input, authority, lifecycle, provenance, fixed request shape, and nonzero request cancellation.
- Added 18 compiling semantic guard mutations and the durable public-boundary matrix.

## Decisions Made

- The tool never falls back to Standard location state or credentials.
- The public contract has no `complete` state, source body, amount, row, token, guest/payment value, or report request GUID.
- Analytics output states it is informational and non-GAAP.

## Verification

- `npm run build:test && node --test dist-test/test/analytics-report-tools-stdio.test.js` passed: 7/7 tests.
- `T5_GUARD_BATCH=first node scripts/verify-t5-003-analytics-mcp-guard-mutations.mjs` passed: 9 mutations.
- `T5_GUARD_BATCH=third node scripts/verify-t5-003-analytics-mcp-guard-mutations.mjs` passed: 5 mutations.
- `T5_GUARD_BATCH=fourth node scripts/verify-t5-003-analytics-mcp-guard-mutations.mjs` passed: 4 mutations.
- `npm run check` found two expected integration assertion updates in unowned `test/server.test.ts`. That file expects only five Standard tools and now sees the new Analytics tool. This executor did not modify it by assignment boundary.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 3 - Blocking] Restored locked Node dependencies with `npm ci --no-audit --no-fund --prefer-online` before the RED build.

2. [Rule 1 - Test reliability] The synthetic cancellation marker wait now has a bounded one-second timeout.

### Scope Boundary

- `test/server.test.ts` needs its tool-list expectation updated by its owner. It is outside this plan's assigned paths.

## External Gates

- T5-003-G01 needs corrected Toast OpenAPI evidence or written retrieval-shape confirmation.
- Live Analytics compatibility needs documented Merchant consent and separate review.
- T6-003 first-tool-request cancellation, #28, signing, and publication remain release gates.

## Known Stubs

None.

## Self-Check: PASSED

- The tool, focused test, fixture, guard harness, and matrix exist.
- Commits `1446083`, `4846240`, and `cd4309d` exist.
