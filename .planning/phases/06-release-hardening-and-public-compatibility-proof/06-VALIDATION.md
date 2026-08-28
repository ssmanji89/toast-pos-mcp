---
phase: 06
slug: release-hardening-and-public-compatibility-proof
status: incomplete
nyquist_compliant: false
execution_status: 06-06-requirements-audit-merged-findings-only-review-external-gates
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
3. Final command output belongs in the 06-06 PR only.
4. No tracked file changes after either final candidate gate.

## Merged Execution Evidence

PR #58 merged candidate `9403bff75b677a97bcceae244efa755bee91778b` into
`main` at `69f4052302dd27c1dd6ed92ff406c78d3c5f5a3c`. Node 20.20.2 and Node
22.22.2 each used the committed lockfile. Each candidate gate passed `npm ci
--no-audit --no-fund && npm run check`, package dry-run, 43 discovered test
files, 415 normal tests, and one installed-artifact test. The focused command
passed 41 tests. The first, second, and third mutation batches caught all 25
isolated compiling behavioral mutations on both runtimes. `git diff --check`,
`git diff --quiet`, and `git diff --cached --quiet` passed after the candidate
gates. Post-merge Node 22.22.2 passed committed restore and `npm run check` at
the merge SHA with 43 discovered test files, 415 normal tests, and one
installed-artifact test.

An independent agent recorded CLEAN for the exact candidate. GitHub currently
reports an empty reviews array for PR #58. This is local evidence only, and
the GitHub-attributable exact-head review remains reviewer-pending.

PR #63 merged candidate `9fb060b24819a0373465675fc63c1e4c15ee130d` into
`main` at `b61d6ee5f479861e40f6ebe4eb0b4a7caa533d61`. An independent
findings-only review comment recorded CLEAN for that exact candidate. GitHub
reports `reviews: []` for PR #63. The empty array means no GitHub-attributable
approval exists. The findings-only comment remains independent review evidence,
not an approval. Post-merge Node 22 passed `npm run check` with 431 normal
tests and one installed-artifact test. The structural audit passed. This merged
local evidence does not close an external gate.

## Test Commands

| Scope | Command |
| --- | --- |
| Full repository | `npm ci --no-audit --no-fund && npm run check` |
| Public documentation | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` |
| Public runtime | `npm run build:test && node --test --enable-source-maps dist-test/test/server.test.js` |
| Standard schemas | `npm run build:test && node --test --enable-source-maps dist-test/test/report-tools-e2e.test.js` |
| Mutation batches | `T6_PUBLIC_WIRING_GUARD_BATCH=first|second|third node scripts/verify-t6-public-wiring-mutations.mjs` |
| Requirements traceability | `npm run build:test && node --test dist-test/test/requirements-traceability-audit.test.js && node scripts/audit-requirements-traceability.mjs --inventory .planning/REQUIREMENTS.md --matrix docs/verification/phase-06-requirements-evidence-matrix.md --manifest docs/verification/phase-06-required-leaf-manifest.md --required-source-commit 761cba89b70c3da96f71cb84b3eaa4ef849438c5` |

## Validation Map

| ID | Direct behavior | Named test or harness | Evidence status | Limitation |
| --- | --- | --- | --- | --- |
| T6-002-DOCS-01 | Public documentation lists the five Standard tools and their source boundaries. | `test/public-operator-docs.test.ts` | The final candidate focused command passed on Node 20.20.2 and Node 22.22.2. | This does not prove consent, approval, publication, or live compatibility. |
| T6-002-DOCS-02 | Public documentation keeps Analytics body-free and distinguishes local evidence from authority gates. | `test/public-operator-docs.test.ts` | The final candidate focused command passed on Node 20.20.2 and Node 22.22.2. | This does not prove consent, approval, publication, or live compatibility. |
| T6-002-DOCS-03 | The documentation contract and repository gate use the committed lockfile. | `test/public-operator-docs.test.ts`; `npm run check` | Both final candidate gates restored the committed lockfile and passed. | This does not make the candidate release-ready. |
| P06-04-RUNTIME-01 | Retained legacy and modern stdio factories use the production runtime. | `test/server.test.ts` — `serves retained legacy 2025 requests through the production report runtime` | Historical 06-04 local evidence exists. | This does not prove first-tool-request cancellation or live MCP host compatibility. |
| P06-04-SCHEMA-01 | Top-level Standard status branches match real handler results. | `test/report-tools-e2e.test.ts` — `tools/list advertises only the real Standard result branches` | Historical 06-04 local evidence exists. | This row does not claim nested-shape coverage. |
| P06-04-MUTATION-01 | Public runtime and top-level output guards reject the 14 historical 06-04 mutations. | `scripts/verify-t6-public-wiring-mutations.mjs` | Historical 06-04 local evidence exists. | Current mutation batches include added 06-05 guards and require final candidate execution. |
| T6-005-NESTED-01 | Fixture-proved fixed nested report records are strict; unknown Toast-derived values remain strings. | `test/report-tools-e2e.test.ts` — `nested Standard output schemas match invented complete results without closing Toast strings` | The final candidate focused command passed on Node 20.20.2 and Node 22.22.2. | `dimensionContext` remains intentionally extensible across Menu and Configuration sources. |
| T6-005-NESTED-02 | Each 06-05 strict nested schema fails when its schema becomes loose. | `scripts/verify-t6-public-wiring-mutations.mjs` | All three final candidate mutation batches passed on Node 20.20.2 and Node 22.22.2; 25 mutations were caught. | Each isolated mutation compiled, ran its named test, failed that test, and restored the worktree. |

## Evidence Limits and Pending Gates

| Gate | State | Reason |
| --- | --- | --- |
| Formal Phase 06 requirement coverage | merged local evidence; findings-only review recorded | PR #63 merged candidate `9fb060b24819a0373465675fc63c1e4c15ee130d` as `b61d6ee5f479861e40f6ebe4eb0b4a7caa533d61`. An independent findings-only CLEAN comment exists. GitHub reports `reviews: []`, so no GitHub-attributable approval exists. This does not close any external gate. |
| PR #55 independent final metadata-head review | pending | Observed GitHub state: `MERGED`; merge commit `bcd819fb7c423d4e19274448417829b9821173ee`; final metadata head `db1270e963850aef3fb5bbb5c6fad402fdb212e2`; `reviews` was empty. |
| PR #58 GitHub-attributable exact-head review | reviewer-pending | An independent agent recorded CLEAN for candidate `9403bff75b677a97bcceae244efa755bee91778b`, but the observed GitHub `reviews` array is empty. |
| #60/T6-003 first-tool-request cancellation | GitHub issue OPEN; substantive gate open | Issue #60 was reopened after PR #63 auto-closed it by reference. It owns this SDK/runtime release gate. Local synthetic tests do not close it. Current `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/client@2.0.0` leave no local dependency-upgrade action. |
| T5-003-G01 | open | The complete Analytics retrieval response contract remains unverified. |
| #28 live Standard compatibility | open | Owner-authorized live Standard credentials are required. |
| Live Analytics compatibility | open | Authorized access and documented Merchant consent are required. |
| Signing and publication | open | No signing or publication action occurs in this repository validation. |
| Consent, Toast Terms, and brand approval | open | Local tests cannot grant Merchant consent, legal sufficiency, or Toast approval. |

## Issue #60 Candidate Evidence

Candidate `3818c36dc2a9eb67d45fb25d88393c77af6d621c` adds isolated mutations for numeric ID zero, nonzero dispatch, exact ID matching, combined signal propagation, both cleanup paths, and all six registered report tools. The executable matrix uses compiled `dist/index.js` with the official stdio transport. The modern official client proves first `tools/call` ID `0` reaches and aborts the invented Orders source. The legacy official client uses initialize ID `0` then first `tools/call` ID `1`. The coalesced legacy sequence proves pre-handler cancellation before Orders source access.

Node `20.20.2` with npm `10.8.2` restored the committed lockfile, passed `npm run check` with 45 discovered files, 440 normal tests, and one installed-artifact test, then passed the 39-test focused executable suite and all 12 isolated mutations. The candidate SHA was unchanged before and after the gate, and tracked and index diffs were empty.

Node `22.22.2` with npm `10.9.7` restored the same committed lockfile, passed `npm run check` with 45 discovered files, 440 normal tests, and one installed-artifact test, then passed the same 39-test focused executable suite. Its isolated mutation sequence is incomplete at this handoff. It completed numeric ID zero, nonzero dispatch, exact ID matching, combined signal, active-controller cleanup, relay-listener cleanup, and sales/payment registration wrappers. It still requires item, cash, labor, and Analytics registration mutations before the exact candidate can claim a completed dual-runtime mutation gate.

Issue #60 remains OPEN. Independent findings-only review is pending. This local synthetic evidence does not close #28, T5-003-G01, live Analytics compatibility, Merchant consent, Terms or brand approval, signing, publication, or the PR #55 and PR #58 GitHub-review gaps. DOX: updated.

## Safety Boundaries

- Use only independently invented fixtures.
- Do not use Toast credentials, Merchant Data, package publication, signing, or live endpoints.
- Keep the five Standard tools separate from the incomplete-only Analytics lifecycle tool.
- Keep Toast-derived enum data open strings. Do not replace it with a closed enum.

DOX: updated. This record corrects the Phase 06 validation-state contradiction and defines evidence boundaries. It does not change a product, report, or release authority.
