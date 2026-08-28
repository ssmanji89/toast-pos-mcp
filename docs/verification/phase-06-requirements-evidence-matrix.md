# Phase 06 Requirements Evidence Matrix

**Canonical inventory:** [`.planning/REQUIREMENTS.md`](../../.planning/REQUIREMENTS.md) at source commit `761cba89b70c3da96f71cb84b3eaa4ef849438c5`.  
**Classification rule:** This matrix links implementation, local evidence, review, runtime reachability, and external authority. A local pass, merged pull request, or local agent review cannot close an external gate.

| Requirement ID | Implementation links | Local evidence | Review evidence | Production reachability | Evidence level | Gate disposition |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-PROD-001 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external: live access does not prove the boundary |
| REQ-PROD-002 | `src/runtime-config.ts` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external: secret custody remains operator-controlled |
| REQ-PROD-003 | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external: fixture provenance remains reviewer-checked |
| REQ-PROD-004 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: consent and Toast authority remain open |
| REQ-PROD-005 | `src/analytics-report-tools.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: new source scope needs review |
| REQ-PROD-006 | `src/location-registry.ts`; `src/analytics-location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external: #28 and live Analytics remain open |
| REQ-PROD-007 | `src/reports/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: live report behavior remains open |
| REQ-PROD-008 | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external: Toast date behavior remains live-unproven |
| REQ-PROD-009 | `src/normalization/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: future vendor strings remain open |
| REQ-PROD-010 | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: no accounting or tax authority is claimed |
| REQ-PROD-011 | `src/capability-preflight.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external: live capability behavior remains open |
| REQ-ARCH-001 | `package.json`; `tsconfig.json` | `npm run check` | unverified | production-wired | synthetic-tested | external: publication remains open |
| REQ-ARCH-002 | `src/index.ts`; `src/server.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external: #60 remains open |
| REQ-ARCH-003 | `src/index.ts` | `test/stdio-lifecycle.test.ts` | unverified | production-wired | synthetic-tested | external: remote transport needs separate review |
| REQ-ARCH-004 | `src/toast-http-client.ts`; `src/analytics/report-job.ts`; `src/report-tools.ts` | `npm run check` | unverified | production-wired | synthetic-tested | external: live compatibility remains open |
| REQ-ARCH-005 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external: T5-003-G01 remains open |
| REQ-ARCH-006 | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: output limits remain live-unproven |
| REQ-ARCH-007 | `src/toast-http-client.ts` | `test/toast-http-client.test.ts` | `LOOP.md` PR #37 record | production-wired | synthetic-tested | external: Toast header behavior remains open |
| REQ-ARCH-008 | `src/pagination/` | `test/orders-bulk-pagination.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external: live page behavior remains open |
| REQ-ARCH-009 | `src/analytics/report-job.ts` | `test/analytics-report-job.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external: G01 and live Analytics remain open |
| REQ-DEL-001 | `LOOP.md`; GitHub issue and PR records | unverified | unverified | production-wired | unverified | external: GitHub is current-state authority |
| REQ-DEL-002 | `.planning/ROADMAP.md` | `npm run check` | unverified | production-wired | synthetic-tested | external: live and human gates remain open |
| REQ-DEL-003 | `.planning/ROADMAP.md`; `LOOP.md` | local validation documents | unverified | production-wired | synthetic-tested | external: authority remains separate |
| REQ-DEL-004 | `LOOP.md` Release frontier | unverified | unverified | production-wired | unverified | external: named owners control closure |
| REQ-DEL-005 | `.planning/ROADMAP.md` | committed-lockfile checks | unverified | production-wired | synthetic-tested | external: authentic live proof remains open |
| REQ-DEL-006 | `AGENTS.md`; `LOOP.md` | unverified | unverified | unverified | unverified | external: reviewer checks process evidence |
| REQ-DEL-007 | GitHub pull request reviews | unverified | unverified | unverified | unverified | external: independent reviewer must report on the candidate |
| REQ-DEL-008 | `LOOP.md` | slice evidence | unverified | production-wired | synthetic-tested | external: reviewer checks the record |
| REQ-ISSUE-001 | `src/index.ts`; `docs/architecture/report-contract.md` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: authorized credentials and live proof remain open |
| REQ-ISSUE-002 | `src/index.ts`; `docs/architecture/public-use-boundary.md` | `test/stdio-lifecycle.test.ts` | unverified | production-wired | synthetic-tested | external: distribution approval remains open |
| REQ-ISSUE-003 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: documented consent remains open |
| REQ-ISSUE-004 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: Toast written approval remains open |
| REQ-ISSUE-005 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | unverified | production-wired | synthetic-tested | external: complete Analytics contract remains G01-blocked |
| REQ-ISSUE-006 | `src/analytics/report-job.ts`; `src/normalization/` | `test/analytics-report-tools.test.ts` | unverified | production-wired | synthetic-tested | external: scope expansion needs approval |
| REQ-ISSUE-007 | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external: fixture provenance remains reviewer-checked |
| REQ-ISSUE-008 | `src/report-result.ts`; `docs/architecture/report-contract.md` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: live source facts remain open |
| REQ-ISSUE-009 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: live behavior remains open |
| REQ-DOC-001 | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: no Toast approval or live compatibility is claimed |
| REQ-DOC-002 | `docs/architecture/public-use-boundary.md`; `package.json` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: signing and publication remain open |
| REQ-DOC-003 | `src/runtime-config.ts`; `docs/architecture/public-use-boundary.md` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external: consent and provider approval remain open |
| REQ-DOC-004 | `src/location-registry.ts`; `src/analytics-location-registry.ts` | `test/location-registry.test.ts` | unverified | production-wired | synthetic-tested | external: #28 and live Analytics remain open |
| REQ-DOC-005 | `src/analytics-report-tools.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external: complete Analytics result remains G01-blocked |
| REQ-DOC-006 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external: scope expansion needs a superseding decision |
| REQ-DOC-007 | `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external: T5-003-G01 remains open |
| REQ-DOC-008 | `docs/architecture/threat-model.md` | installed-artifact test | unverified | production-wired | synthetic-tested | external: all named release gates remain open |
| REQ-PHASE-001 | `docs/architecture/public-use-boundary.md`; `docs/architecture/threat-model.md` | T0-001 evidence | `LOOP.md` T0-001 record | production-wired | independent-review | external: live access remains open |
| REQ-PHASE-002 | `src/index.ts`; `src/runtime-config.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external: #60 and #28 remain open |
| REQ-PHASE-003 | `src/runtime.ts`; `src/location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external: #28 remains open |
| REQ-PHASE-004 | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` PR #40 record | production-wired | synthetic-tested | external: live Standard compatibility remains open |
| REQ-PHASE-005 | `src/cash-report.ts`; `src/labor-report.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T4 records | production-wired | synthetic-tested | external: live compatibility remains open |
| REQ-PHASE-006 | `src/analytics/report-job.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external: G01 and consent/live Analytics remain open |
| REQ-PHASE-007 | unverified | unverified | unverified | unverified | unverified | external: every Phase 06 owner gate remains open |

## Mandatory external gates

| Gate ID | Owner | Required proof | State | Evidence basis |
| --- | --- | --- | --- | --- |
| #60 | GitHub issue #60 | Corrected SDK or separately reviewed local fix proves request ID `0` cancellation through the real stdio chain. | open | external |
| #28 | GitHub issue #28 | Owner-authorized read-only Standard credential probe records sanitized protocol facts. | open | external |
| T5-003-G01 | `LOOP.md` Release frontier | Corrected current Toast retrieval contract or written vendor confirmation. | open | external |
| PR #55 review | GitHub PR #55 | GitHub-attributable independent review of metadata head `db1270e963850aef3fb5bbb5c6fad402fdb212e2`. | pending | external |
| PR #58 review | GitHub PR #58 | GitHub-attributable independent review of candidate `9403bff75b677a97bcceae244efa755bee91778b`. | pending | external |
| Merchant consent and live Analytics | Merchant operator and Toast authority | Documented Merchant consent, authorized access, and required Toast review. | external | external |
| Terms and brand approval | Human, legal, or Toast authority | Applicable Terms, brand-feature, name-use, and distribution approval. | external | external |
| Signing and publication | Authorized release owner | Authorized signing and publication actions. | external | external |
