---
phase: 5
slug: source-distinct-analytics-adapter-and-tools
status: active
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-27
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for T5-001. It proves local synthetic behavior only. It does not prove live Analytics compatibility.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiled tests and the Node built-in test runner |
| **Config file** | `tsconfig.test.json` and `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build:test && node --test dist-test/test/analytics-config.test.js dist-test/test/analytics-capabilities.test.js dist-test/test/analytics-access-adapter.test.js` |
| **Full suite command** | `npm ci --no-audit --no-fund && npm run check` |
| **Supported runtimes** | Node 20.20.2 and Node 22.22.2 with each runtime's paired npm |

## Sampling Rate

- **After every RED or GREEN task:** Run the focused compiled Analytics tests.
- **After every safety-guard change:** Run `node scripts/verify-t5-001-analytics-guard-mutations.mjs`.
- **After Plan 05-01:** Select one clean final candidate. Run the full clean-install, check, focused-test, mutation, and package sequence on Node 20.20.2 and Node 22.22.2.
- **Before independent review:** Record matching before-and-after `git rev-parse HEAD` values around each runtime sequence in the pull request. Leave the committed guard matrix unchanged.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test and Mutation Mapping | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|---------------------------|-------------------|-------------|--------|
| T5-001-01 | 05-01 Task 1 | 1 | T5-001 / D-01 | T5-001-01 | An absent Analytics hostname, access type, client ID, and client secret set leaves Standard startup unchanged. A partial set fails closed and credentials do not serialize. | `test/analytics-config.test.ts`; `analytics-config-completeness`, `analytics-config-secret-serialization` mutations | `npm run build:test; test $? -ne 0` for RED, then the quick run command for GREEN | ❌ Wave 0 | ⬜ pending |
| T5-001-02 | 05-01 Task 1 | 1 | T5-001 / D-02, D-03 | T5-001-01, T5-001-04 | An Analytics identity needs `enterprise-metrics:read`. It cannot use Standard connection scopes or identity state. | `test/analytics-capabilities.test.ts`; `analytics-scope-preflight`, `analytics-standard-scope-substitution`, `analytics-cross-identity-state` mutations | `npm run build:test; test $? -ne 0` for RED, then the quick run command for GREEN | ❌ Wave 0 | ⬜ pending |
| T5-001-03 | 05-01 Task 1 | 1 | T5-001 / D-04, D-05, D-06 | T5-001-02 | Only the allowlisted management-group GET can run. It uses no Standard restaurant header and cannot request guest-linked data. | `test/analytics-access-adapter.test.ts`; `analytics-method`, `analytics-path`, `analytics-standard-header`, `analytics-guest-route` mutations | `npm run build:test; test $? -ne 0` for RED, then the quick run command for GREEN | ❌ Wave 0 | ⬜ pending |
| T5-001-04 | 05-01 Task 2 | 1 | T5-001 / D-07 | T5-001-03, T5-001-04 | Malformed or duplicate source records cannot publish. A selected set is a non-empty canonical UUID subset bound to its Analytics identity. | `test/analytics-access-adapter.test.ts`; `analytics-schema`, `analytics-duplicate-guid`, `analytics-atomic-publication`, `analytics-selection-uuid`, `analytics-selection-duplicate`, `analytics-selection-membership`, `analytics-selection-canonicalization`, `analytics-selection-identity` mutations | quick run command and `node scripts/verify-t5-001-analytics-guard-mutations.mjs` | ❌ Wave 0 | ⬜ pending |
| T5-001-05 | 05-01 Task 2 | 1 | T5-001 / D-01 through D-07 | T5-001-01 through T5-001-05 | Cancellation reaches the request. The limiter stays endpoint-only and identity-scoped. No internal adapter adds MCP tool wiring. | `test/analytics-access-adapter.test.ts`; `analytics-cancellation`, `analytics-endpoint-limiter`, `analytics-limiter-isolation`, `analytics-runtime-tool-boundary` mutations | quick run command and `node scripts/verify-t5-001-analytics-guard-mutations.mjs` | ❌ Wave 0 | ⬜ pending |
| T5-001-06 | 05-02 Task 1 | 2 | T5-001 / D-01 through D-09 | T5-001-E-04 | Durable documents and the guard matrix state the internal boundary and all later-slice ownership. The matrix is static before a candidate exists. | Documentation review plus the compiled tests and mutation harness named above | quick run command and mutation harness | ❌ Wave 0 | ⬜ pending |
| T5-001-07 | 05-02 Tasks 2–3 | 2 | T5-001 evidence | T5-001-E-01 through E-03 | The unchanged final candidate passes authentic Node 20/22 and package gates. The pull request records execution and independent review evidence for that one SHA. | Pull-request evidence only; no post-candidate change to the committed guard matrix | Node 20.20.2 and Node 22.22.2: `npm ci --no-audit --no-fund && npm run check && npm run build:test && node --test dist-test/test/analytics-config.test.js dist-test/test/analytics-capabilities.test.js dist-test/test/analytics-access-adapter.test.js && node scripts/verify-t5-001-analytics-guard-mutations.mjs && npm pack --dry-run --json` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ limitation*

## Wave 0 Requirements

- [ ] `test/analytics-config.test.ts` — optional four-value Analytics configuration completeness, Standard compatibility, immutability, and secret-safe rendering.
- [ ] `test/analytics-capabilities.test.ts` — accepted, missing, malformed, frozen, and cross-identity Analytics scope decisions.
- [ ] `test/analytics-access-adapter.test.ts` — preflight order, literal route, header absence, cancellation, validation, atomic registry, selection, limiter, state isolation, and internal-runtime boundary.
- [ ] `scripts/verify-t5-001-analytics-guard-mutations.mjs` — one focused failing mutation for every named guard in this map.
- [ ] `docs/verification/t5-001-analytics-adapter-guard-matrix.md` — static guard-to-test-and-mutation mapping committed before candidate selection.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Authorized live Analytics compatibility | T5-001 external gate | The repository has no authorized Analytics credentials. | Use documented Merchant consent and an authorized Analytics account. Verify only the allowlisted discovery response, scope, header behavior, and response schema. |
| Independent exact-head review | Delivery standard | A builder cannot approve their own implementation. | Review the pull-request evidence for the final candidate SHA. Confirm the reviewer reports findings for the same SHA. |
| First tool-request cancellation and public release | #4 / T6-003 | T5-001 has no MCP tool path. Signing and publication require later authority. | Keep both release gates open until T6 has reviewed evidence. |

## Validation Sign-Off

- [x] Every implementation task has an automated check or a Wave 0 dependency.
- [x] Every safety behavior maps to a focused test and named mutation identifier.
- [x] The final candidate mapping covers Node 20.20.2, Node 22.22.2, authentic package restore, package output, and pull-request evidence.
- [x] The committed guard matrix stays static before candidate selection.
- [x] No watch-mode command exists.

**Approval:** planned 2026-08-27
