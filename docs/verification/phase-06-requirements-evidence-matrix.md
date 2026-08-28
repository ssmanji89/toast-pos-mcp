# Phase 06 Requirements Evidence Matrix

**Canonical inventory:** [`.planning/REQUIREMENTS.md`](../../.planning/REQUIREMENTS.md) at source commit `761cba89b70c3da96f71cb84b3eaa4ef849438c5`.  
**Classification rule:** This matrix links implementation, local evidence, review, runtime reachability, and external authority. A local pass, merged pull request, or local agent review cannot close an external gate.

| Requirement ID | Implementation links | Local evidence | Review evidence | Production reachability | Evidence level | Gate disposition |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-PROD-001 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-002 | `src/runtime-config.ts` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-003 | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004A | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005 | `src/analytics-report-tools.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-006 | `src/location-registry.ts`; `src/analytics-location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-007 | `src/reports/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008 | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-009 | `src/normalization/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-010 | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-011 | `src/capability-preflight.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-001 | `package.json`; `tsconfig.json` | `npm run check` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-002 | `src/index.ts`; `src/server.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external |
| REQ-ARCH-003 | `src/index.ts` | `test/stdio-lifecycle.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-004 | `src/toast-http-client.ts`; `src/analytics/report-job.ts`; `src/report-tools.ts` | `npm run check` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-005 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external |
| REQ-ARCH-006 | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-007 | `src/toast-http-client.ts` | `test/toast-http-client.test.ts` | `LOOP.md` PR #37 record | production-wired | synthetic-tested | external |
| REQ-ARCH-008 | `src/pagination/` | `test/orders-bulk-pagination.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009 | `src/analytics/report-job.ts` | `test/analytics-report-job.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-DEL-001 | `LOOP.md`; GitHub issue and PR records | unverified | unverified | production-wired | unverified | external |
| REQ-DEL-002 | `.planning/ROADMAP.md` | `npm run check` | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-003 | `.planning/ROADMAP.md`; `LOOP.md` | local validation documents | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-004 | `LOOP.md` Release frontier | unverified | unverified | production-wired | unverified | external |
| REQ-DEL-005 | `.planning/ROADMAP.md` | committed-lockfile checks | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-006 | `AGENTS.md`; `LOOP.md` | unverified | unverified | unverified | unverified | external |
| REQ-DEL-007 | GitHub pull request reviews | unverified | unverified | unverified | unverified | external |
| REQ-DEL-008 | `LOOP.md` | slice evidence | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-001 | `src/index.ts`; `docs/architecture/report-contract.md` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-002 | `src/index.ts`; `docs/architecture/public-use-boundary.md` | `test/stdio-lifecycle.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-003 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-004 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-005 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-006 | `src/analytics/report-job.ts`; `src/normalization/` | `test/analytics-report-tools.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-007 | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-008 | `src/report-result.ts`; `docs/architecture/report-contract.md` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ISSUE-009 | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-001 | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-002 | `docs/architecture/public-use-boundary.md`; `package.json` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-003 | `src/runtime-config.ts`; `docs/architecture/public-use-boundary.md` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-004 | `src/location-registry.ts`; `src/analytics-location-registry.ts` | `test/location-registry.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-005 | `src/analytics-report-tools.ts`; `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-006 | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-DOC-007 | `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external |
| REQ-DOC-008 | `docs/architecture/threat-model.md` | installed-artifact test | unverified | production-wired | synthetic-tested | external |
| REQ-PHASE-001 | `docs/architecture/public-use-boundary.md`; `docs/architecture/threat-model.md` | T0-001 evidence | `LOOP.md` T0-001 record | production-wired | independent-review | external |
| REQ-PHASE-002 | `src/index.ts`; `src/runtime-config.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external |
| REQ-PHASE-003 | `src/runtime.ts`; `src/location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PHASE-004 | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` PR #40 record | production-wired | synthetic-tested | external |
| REQ-PHASE-005 | `src/cash-report.ts`; `src/labor-report.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T4 records | production-wired | synthetic-tested | external |
| REQ-PHASE-006 | `src/analytics/report-job.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external |
| REQ-PHASE-007 | unverified | unverified | unverified | unverified | unverified | external |

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
