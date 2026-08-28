---
phase: 06-release-hardening-and-public-compatibility-proof
plan: "02"
subsystem: package-validation
tags: [npm, artifact, stdio, mcp, node-20, node-22]
requires:
  - phase: 06-01
    provides: public evidence and operator-boundary documentation
provides:
  - real-tarball empty-consumer installed-bin MCP evidence
  - exact-head Node 20.20.2 and Node 22.22.2 validation facts
  - serialized artifact test ordering after the regular compiled suite
affects: [release-evidence, public-documentation, T6-003]
tech-stack:
  added: []
  patterns: [external test-only preload, exact tar path allowlist, detached runtime validation]
key-files:
  created: [test/package-artifact-e2e.test.ts, test/fixtures/installed-artifact-fetch-preload.ts]
  modified: [scripts/run-tests.mjs, README.md, docs/architecture/threat-model.md, test/public-operator-docs.test.ts, .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md, LOOP.md]
key-decisions:
  - "Use an external NODE_OPTIONS preload with invented responses, not a product runtime injection."
  - "Run the package test after all ordinary compiled tests because npm prepack removes dist-test."
  - "Record local artifact evidence as synthetic validation and retain live, approval, signing, and publication gates."
metrics:
  duration: 37min
  tasks_completed: 3
  files_modified: 9
completed: 2026-08-27
status: complete
---

# Phase 06 Plan 02: Exact-Head Installed Artifact Evidence Summary

**A real npm tarball installed into an empty temporary consumer and served the production stdio boundary using invented external fetch responses.**

## Accomplishments

- Added a TDD installed-artifact test that checks the exact npm and tar path lists, starts only the consumer-installed bin, negotiates MCP `2026-07-28`, lists six tools, and calls Standard and constrained Analytics paths.
- Added a test-only external preload that rejects all unmatched child fetch routes and never enters the package artifact.
- Serialized the package test after 42 regular compiled files, then rebuilt test output after npm prepack cleanup.
- Validated immutable package candidate `d5c47f39321f13c991d2abe6fcf3c035a020c9d2` on Node 20.20.2 and 22.22.2.

## Task Commits

1. **Task 1: Add the failing installed-artifact contract** — `144d704`
2. **Task 2: Make the installed-artifact contract pass** — `8f8e947`
3. **Task 3: Separate artifact evidence from release gates** — `d5c47f3`
4. **Task 3: Record exact artifact validation** — `007d738`
5. **Task 3 follow-up: Finalize the validation map** — `179d7a2`

## Validation

- Evidence date: 2026-08-27, America/Chicago (CDT).
- RED: `npm run build:test && ! node --test --enable-source-maps dist-test/test/package-artifact-e2e.test.js` passed because the installed child could not load the absent external preload marker.
- GREEN: `npm run build:test && node --test --enable-source-maps dist-test/test/package-artifact-e2e.test.js` passed.
- Full local gate: 43 discovered files, 411 normal tests, and one artifact test passed. The runner rebuilt `dist-test` after artifact packaging.
- Node 20.20.2: `npm ci --no-audit --no-fund && npm run check` passed with npm 10.8.2.
- Node 22.22.2: `npm ci --no-audit --no-fund && npm run check` passed with npm 10.9.7.
- Each runtime created the same 151-path tarball with SHA-256 `2e319e3e13be48907508dc0e3d46b673e6b5721b1021906b3ae4e9d1374f2be0`.
- Production dependency inspection passed: root Apache-2.0; `@modelcontextprotocol/server@2.0.0` MIT; `zod@4.4.3` MIT; audit totals low 0, moderate 0, high 0, critical 0.

## Decisions Made

- The test uses the consumer `node_modules/.bin/toast-pos-mcp` path only. It does not run source files, a fixture server, or a linked package.
- The local artifact result proves no live Toast compatibility, first-tool-request cancellation, Analytics result schema, consent, signing, publication, legal sufficiency, or Toast approval.
- DOX: updated.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] Restored committed dependencies before the RED gate**
   - The clean worktree lacked Node type declarations.
   - Ran `npm ci --no-audit --no-fund`, then reran the unchanged RED command.

2. **[Rule 1 - Bug] Compared npm JSON paths and tar paths in their native forms**
   - npm JSON paths omit the `package/` prefix while `tar -tzf` includes it.
   - The test now checks the same explicit allowlist with the correct representation for each command.

3. **[Rule 1 - Bug] Added the required invented `excessFood` field to the preload order**
   - The production normalizer correctly denied the incomplete invented order.
   - The preload now supplies the required false boolean and the Standard report completes.

## External Gates

T5-003-G01, #4/T6-003 first-tool-request cancellation, #28, live Standard compatibility, live Analytics compatibility, signing, publication, and human or Toast brand and Terms approvals remain open. Independent exact-head review is pending.

## Control Plane

`LOOP.md` records the T6-003 BUILT state and exact evidence. `STATE.md` and
`ROADMAP.md` remain unchanged because the plan and repository rules reserve
their snapshot and outcome updates for an explicit control-plane slice.

## Known Stubs

None. The fixture data is intentionally test-only and fully wired through the installed artifact boundary.

## Self-Check

PASSED. All planned files exist, all five task commits exist, and `git diff --check` passed. The only matched placeholder wording is the pre-existing documentation statement that examples use placeholders; it is not a runtime stub.
