---
phase: 04-cash-and-labor-reporting
plan: 02
subsystem: labor-reporting
tags: [typescript, zod, standard-api, orders, labor, privacy]
requires:
  - T3 Orders normalization and bounded page fold
provides:
  - Identifier-only Orders server attribution
  - Strict transient labor source facts
  - Capability-gated aggregate labor summary builder
affects:
  - Plan 04-03 MCP tool registration and stdio integration
tech-stack:
  added: []
  patterns: [immutable normalized facts, capability preflight, detailed provenance, bounded Orders fold]
key-files:
  created: [src/labor-report-source.ts, src/labor-report.ts, test/labor-report.test.ts]
  modified: [src/orders-normalization-source.ts, src/orders-normalization-traversal.ts, src/orders-normalization-types.ts, test/orders-normalization.test.ts]
decisions:
  - Orders server attribution retains only a normalized GUID and remains internal to the labor fold.
  - Active validated entries produce incomplete; malformed or inaccessible sources produce denied.
  - Regular wages round each documented fractional-hour product to the nearest minor unit, with exact halves rounded up.
metrics:
  tasks_completed: 2
  files_changed: 7
  completed_date: 2026-08-27
status: complete
---

# Phase 04 Plan 02: Labor Source and Summary Builder Summary

The plan adds a deterministic, restaurant-scoped labor summary that joins minimal Orders attribution in memory and returns aggregate-only output.

## Completed Tasks

1. Added strict, stripped transient labor schemas and immutable lifecycle facts.
   Added immutable identifier-only Orders server attribution.
2. Added the capability-first labor builder.
   It reads bounded labor/configuration sources, folds Orders pages, records provenance, and distinguishes complete, incomplete, and denied outcomes.

## Verification

Passed:

```text
npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
15 tests passed.
```

Negative checks passed:

- Removing `config:read` from the preflight caused the missing-scope denial test to fail.
- Removing `includeArchived=true` and forcing `complete` caused the active-entry finality test to fail.
- Replacing Orders sales attribution with zero was included in the local mutation set and restored before final verification.

`npm ci --no-audit --no-fund` restored the existing lockfile dependencies after this isolated worktree had no `node_modules` directory. It changed no package files.

## Safety Results

- Every labor, configuration, and Orders request uses the selected restaurant GUID and caller abort signal.
- One capability decision requires `labor:read`, `config:read`, and `orders:read` before any business-data read.
- The output excludes employee identifiers, names, external IDs, guest fields, card fields, raw source arrays, and credentials.
- Deleted facts are exclusions. Active facts produce `incomplete` only after all required sources validate.

## Decisions Made

- Use non-voided Orders payment amounts and tip amounts, less their explicit refunds, for sales/tip attribution.
- Do not request employee or shifts endpoints.
- Do not calculate an overtime wage.

## DOX

DOX: no durable documentation change. Plan 04-03 owns shared MCP and architecture documentation updates.

## Deviations from Plan

### Auto-fixed Issues

1. [Rule 3 - Blocking issue] Restored declared dependencies with `npm ci --no-audit --no-fund`.
- **Found during:** Task 1 RED verification.
- **Issue:** The isolated worktree had no installed dependencies, so TypeScript could not resolve the existing project packages.
- **Fix:** Restored the lockfile dependency tree without package-file changes.

## Known Stubs

None. The builder is intentionally not registered with MCP until Plan 04-03.

## Deferred Evidence

- Live Toast API payload, scope, and cancellation compatibility remains an external authorization gate.
- Plan 04-03 owns real stdio wiring and independent integration review.

## Review Round 1 Fixes

The independent review at `784ba6e` found five blockers. Commit `f4c9f12` resolves them.

1. `labor-report-source.ts` now accepts documented TimeEntry nested `employeeReference`, `jobReference`, and `breakType` objects.
   It validates string `businessDate` values and strips names and external IDs.
2. The labor fold now excludes entries for documented `Job.excludeFromReporting=true` jobs.
   It reports the aggregate exclusion count.
3. Enabled documented `TipWithholding` now produces aggregate withheld and net tip totals.
4. Orders sales and tips now use non-voided payment values less explicit refund values.
   Check totals do not determine employee sales.
5. Fractional-hour wages now use nine-decimal integer normalization and half-up minor-unit rounding.

The replacement synthetic fixtures use documented TimeEntry, Job, BreakType, and TipWithholding shapes.
They cover source validation, cancellation, source failures, restaurant-scope mismatch, payment/check mismatch, job exclusion, active/deleted finality, and serialization privacy.

Review-fix verification passed:

```text
npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
15 tests passed.
```

Review-fix mutation checks passed. Removing job exclusion, withholding, payment-level totals, or half-up rounding each caused the focused labor test to fail. The implementation was restored before final verification.

## Review Round 2 Fixes

The independent review at `b10f4e2` found four blockers. Commit `7f77963` resolves them.

1. The builder collects distinct TimeEntry job GUIDs and reads Jobs by `jobIds` in batches of at most 100.
   Every referenced job must return, including a deleted job, before the builder applies reporting exclusions.
   Missing job references deny the report with no fabricated aggregate.
2. The Orders fold now uses `SalesCrossPageIdentityGuard` for every normalized Order.
   A repeated Order, check, or payment identity across pages denies the report before duplicated values enter aggregates.
3. Tip withholding now uses only eligible credit-card tip minor units as its basis.
   The report retains total tips, withholding basis, withheld amount, and net tips.
4. The tests assert the exact closeout-hour interval across the fall DST change.
   They assert all required scope denials perform no business request.
   They assert each labor, configuration, and Orders request uses the selected restaurant GUID.
   They assert the caller cancellation signal reaches each staged source and stops later reads.

The builder functions are split to at most 100 TypeScript source lines each.

Review-round-two verification passed:

```text
npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
18 tests passed.
```

Targeted mutation checks passed. Removing unresolved-job rejection, cross-page identity checking, card-tip withholding basis, or closeout-hour bounds each caused its focused test to fail. The implementation was restored before final verification.

DOX: updated this plan summary because the report's withholding basis and source-validation rules are durable output-contract facts.

## Review Round 3 Fixes

The independent review at `7888469` found three blockers. Commit `bef762a` resolves them.

1. Optional TimeEntry `jobReference` and break `breakType` values now remain explicit unresolved facts.
   A missing job reference excludes that entry from formula-dependent totals and marks the report incomplete.
   A missing break-type reference remains counted and marks the report incomplete.
   A Job without its required `excludeFromReporting` formula field denies the report.
2. The source boundary rejects duplicate TimeEntry GUIDs.
   Each Jobs response must contain exactly the requested GUID set, with no duplicate or extra Job GUID.
   BreakType GUIDs are unique across all configuration pages.
3. Regular and overtime hours use the repository exact-decimal arithmetic module.
   The builder converts only a finite aggregate to a number and denies an overflow before result construction.

Review-round-three verification passed:

```text
Node 20.20.2: npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
Node 22.22.2: npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
21 tests passed on each runtime.

Node 22.22.2: npm run check
313 tests passed and npm pack --dry-run --json passed.
```

Targeted mutation checks passed. Requiring an optional job reference, accepting a non-exact Jobs response set, or allowing an infinite decimal aggregate each caused its focused test to fail. The implementation was restored before final verification.

DOX: updated this plan summary because unresolved-reference finality, source identity, and numeric-overflow behavior are durable report-contract facts.

## Review Round 4 Fixes

The independent review at `04cfab2` found five blockers. Commit `719bdc7` resolves them.

1. An absent `hourlyWage` now remains undefined and marks the result incomplete.
   Only an explicit source `null` marks salaried context.
2. TimeEntryBreak GUIDs are unique across the complete TimeEntry source snapshot.
   A duplicate within one entry or across entries denies the report.
3. The BreakType source now returns its GUID set for labor validation.
   Missing or unmatched TimeEntry break-type references remain explicit unresolved facts and mark the result incomplete.
4. Wage and tip-withholding products use exact decimal coefficients with BigInt multiplication.
   The result rounds exact half minor units up and no longer quantizes factors at `1e-9`.
5. The report permits at most 1,000 distinct Job GUIDs, or ten 100-GUID Jobs batches.
   A larger source snapshot denies before its first Jobs request.

Review-round-four verification passed:

```text
Node 20.20.2: npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
Node 22.22.2: npm run build:test && node --test dist-test/test/orders-normalization.test.js dist-test/test/labor-report.test.js
25 tests passed on each runtime.

Node 22.22.2: npm run check
Passed with full tests and npm pack --dry-run --json.
```

Targeted mutation checks passed. Collapsing an absent wage to null, accepting duplicate breaks, ignoring unmatched BreakTypes, restoring `1e-9` factor quantization, or removing the full-report Jobs limit each caused its focused test to fail. The implementation was restored before final verification.

DOX: updated this plan summary because wage-state finality, break-reference validation, exact rounding, and source-request bounds are durable report-contract facts.

## Self-Check: PASSED

- Source, report, and focused test files exist.
- Task commits `86d3414`, `2e9ffb3`, `f89a1ff`, `ececd13`, `f4c9f12`, `7f77963`, `bef762a`, and review-fix commit `719bdc7` exist.
