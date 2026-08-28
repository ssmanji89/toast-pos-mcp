---
phase: 06
slug: release-hardening-and-public-compatibility-proof
status: incomplete
nyquist_compliant: false
execution_status: 06-05-candidate-pending-final-gates
created: 2026-08-27
updated: 2026-08-28
---

# Phase 06 Validation Strategy

This map records named local test evidence and named pending gates.
It does not prove Toast approval, Merchant consent, live compatibility,
signing, publication, or legal sufficiency.

## Candidate Rules

1. The final candidate uses the committed lockfile on Node 20.20.2 and Node 22.22.2.
2. The final candidate SHA stays unchanged before and after each gate.
3. Final command output belongs in the 06-05 PR only.
4. No tracked file changes after either final candidate gate.

## Test Commands

| Scope | Command |
| --- | --- |
| Full repository | `npm ci --no-audit --no-fund && npm run check` |
| Public documentation | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` |
| Public runtime | `npm run build:test && node --test --enable-source-maps dist-test/test/server.test.js` |
| Standard schemas | `npm run build:test && node --test --enable-source-maps dist-test/test/report-tools-e2e.test.js` |
| Mutation batches | `T6_PUBLIC_WIRING_GUARD_BATCH=first|second|third node scripts/verify-t6-public-wiring-mutations.mjs` |

## Validation Map

| ID | Direct behavior | Named test or harness | Evidence status | Limitation |
| --- | --- | --- | --- | --- |
| T6-002-DOCS-01 | Public documentation lists the five Standard tools and their source boundaries. | `test/public-operator-docs.test.ts` | Historical local evidence exists from the named documentation command. | A current candidate result remains a PR-only final gate. |
| T6-002-DOCS-02 | Public documentation keeps Analytics body-free and distinguishes local evidence from authority gates. | `test/public-operator-docs.test.ts` | Historical local evidence exists from the named documentation command. | This does not prove consent, approval, publication, or live compatibility. |
| T6-002-DOCS-03 | The documentation contract and repository gate use the committed lockfile. | `test/public-operator-docs.test.ts`; `npm run check` | Historical local evidence exists from the named commands. | The final 06-05 candidate must run both supported Node gates. |
| P06-04-RUNTIME-01 | Retained legacy and modern stdio factories use the production runtime. | `test/server.test.ts` — `serves retained legacy 2025 requests through the production report runtime` | Historical 06-04 local evidence exists. | This does not prove first-tool-request cancellation or live MCP host compatibility. |
| P06-04-SCHEMA-01 | Top-level Standard status branches match real handler results. | `test/report-tools-e2e.test.ts` — `tools/list advertises only the real Standard result branches` | Historical 06-04 local evidence exists. | This row does not claim nested-shape coverage. |
| P06-04-MUTATION-01 | Public runtime and top-level output guards reject the 14 historical 06-04 mutations. | `scripts/verify-t6-public-wiring-mutations.mjs` | Historical 06-04 local evidence exists. | Current mutation batches include added 06-05 guards and require final candidate execution. |
| T6-005-NESTED-01 | Fixture-proved fixed nested report records are strict; unknown Toast-derived values remain strings. | `test/report-tools-e2e.test.ts` — `nested Standard output schemas match invented complete results without closing Toast strings` | Candidate test required. | `dimensionContext` remains intentionally extensible across Menu and Configuration sources. |
| T6-005-NESTED-02 | Each 06-05 strict nested schema fails when its schema becomes loose. | `scripts/verify-t6-public-wiring-mutations.mjs` | Candidate mutation batches required. | Each isolated mutation must compile, run its named test, fail, and restore the worktree. |

## Evidence Limits and Pending Gates

| Gate | State | Reason |
| --- | --- | --- |
| Formal Phase 06 requirement coverage | pending | `.planning/REQUIREMENTS.md` is absent. The owner reference is `T6-003`, but no formal all-requirements coverage claim is available. |
| PR #55 independent final metadata-head review | pending | Observed GitHub state: `MERGED`; merge commit `bcd819fb7c423d4e19274448417829b9821173ee`; final metadata head `db1270e963850aef3fb5bbb5c6fad402fdb212e2`; `reviews` was empty. |
| #4/T6-003 first-tool-request cancellation | open | Local synthetic tests do not close this SDK/runtime release gate. |
| T5-003-G01 | open | The complete Analytics retrieval response contract remains unverified. |
| #28 live Standard compatibility | open | Owner-authorized live Standard credentials are required. |
| Live Analytics compatibility | open | Authorized access and documented Merchant consent are required. |
| Signing and publication | open | No signing or publication action occurs in this repository validation. |
| Consent, Toast Terms, and brand approval | open | Local tests cannot grant Merchant consent, legal sufficiency, or Toast approval. |

## Safety Boundaries

- Use only independently invented fixtures.
- Do not use Toast credentials, Merchant Data, package publication, signing, or live endpoints.
- Keep the five Standard tools separate from the incomplete-only Analytics lifecycle tool.
- Keep Toast-derived enum data open strings. Do not replace it with a closed enum.

DOX: updated. This record corrects the Phase 06 validation-state contradiction and defines evidence boundaries. It does not change a product, report, or release authority.
