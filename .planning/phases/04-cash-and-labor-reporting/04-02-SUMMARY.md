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
  - Regular wages use exact minor-unit arithmetic; overtime has hours only because no multiplier source exists.
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
16 tests passed.
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
- Revised and archived facts are limited to the current invocation. Deleted facts are exclusions. Active facts produce `incomplete` only after all required sources validate.

## Decisions Made

- Use Orders check amounts and payment tips only for sales/tip attribution.
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

## Self-Check: PASSED

- Source, report, and focused test files exist.
- Task commits `86d3414`, `2e9ffb3`, `f89a1ff`, and `ececd13` exist.
