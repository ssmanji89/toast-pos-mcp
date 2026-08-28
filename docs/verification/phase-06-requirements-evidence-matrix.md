# Phase 06 Requirements Evidence Matrix

**Canonical inventory:** [`.planning/REQUIREMENTS.md`](../../.planning/REQUIREMENTS.md) at source commit `761cba89b70c3da96f71cb84b3eaa4ef849438c5`.  
**Classification rule:** This matrix links implementation, local evidence, review, runtime reachability, and external authority. A local pass, merged pull request, or local agent review cannot close an external gate.

| Requirement ID | Implementation links | Local evidence | Review evidence | Production reachability | Evidence level | Gate disposition |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-PROD-004A | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004C | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004D | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004E | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004F | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004G | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-001 | `package.json`; `tsconfig.json` | `npm run check` | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-001 | `LOOP.md`; GitHub issue and PR records | unverified | unverified | production-wired | unverified | external |
| REQ-DEL-002 | `.planning/ROADMAP.md` | `npm run check` | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-003 | `.planning/ROADMAP.md`; `LOOP.md` | local validation documents | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-004 | `LOOP.md` Release frontier | unverified | unverified | production-wired | unverified | external |
| REQ-DEL-005 | `.planning/ROADMAP.md` | committed-lockfile checks | unverified | production-wired | synthetic-tested | external |
| REQ-DEL-006 | `AGENTS.md`; `LOOP.md` | unverified | unverified | unverified | unverified | external |
| REQ-DEL-007 | GitHub pull request reviews | unverified | unverified | unverified | unverified | external |
| REQ-DEL-008 | `LOOP.md` | slice evidence | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-001A | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-001B | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-001C | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-001D | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T0-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-002A | `src/runtime-config.ts` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-002B | `src/runtime-config.ts` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-002C | `src/runtime-config.ts` | `test/runtime-config.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-003A | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-003B | `test/fixtures/` | repository fixture tests | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-004B | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005A | `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005B | `docs/architecture/public-use-boundary.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005C | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005D | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-005E | `src/normalization/` | `test/orders-normalization.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-006A | `src/location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-006B | `src/toast-http-client.ts` | `test/partners-transport.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-006C | `src/location-registry.ts` | `test/location-registry.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-006D | `src/toast-http-client.ts` | `test/partners-transport.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-006E | `src/toast-http-client.ts` | `test/partners-transport.test.ts` | `LOOP.md` T2-001 record | production-wired | synthetic-tested | external |
| REQ-PROD-007A | `src/reports/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007B | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007C | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007D | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007E | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007F | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-007G | `src/report-result.ts` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008A | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008B | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008C | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008D | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-008E | `src/business-date.ts` | `test/business-date.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-009A | `src/normalization/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-009B | `src/normalization/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-009C | `src/normalization/` | `test/report-tools-e2e.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-010A | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-010B | `docs/architecture/report-contract.md` | `test/public-operator-docs.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-PROD-011A | `src/capability-preflight.ts` | `test/capabilities.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011B | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011C | `src/capability-preflight.ts` | `test/capabilities.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011D | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011E | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011F | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-PROD-011G | `src/report-tools.ts` | `test/report-tools-e2e.test.ts` | `LOOP.md` T2-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-002A | `src/index.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external |
| REQ-ARCH-002B | `src/index.ts` | `test/stdio-lifecycle.test.ts` | `LOOP.md` PR #24 record | production-wired | synthetic-tested | external |
| REQ-ARCH-003A | unverified | unverified | unverified | unverified | unverified | external |
| REQ-ARCH-003B | unverified | unverified | unverified | unverified | unverified | external |
| REQ-ARCH-003C | unverified | unverified | unverified | unverified | unverified | external |
| REQ-ARCH-003D | unverified | unverified | unverified | unverified | unverified | external |
| REQ-ARCH-005A | `src/report-tools.ts`; `src/analytics-report-tools.ts` | `test/analytics-report-tools.test.ts` | `LOOP.md` T5-003 record | production-wired | synthetic-tested | external |
| REQ-ARCH-006A | `src/pagination/` | `test/orders-page-fold.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-006B | `src/pagination/` | `test/orders-page-fold.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-006C | `src/pagination/` | `test/orders-page-fold.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-006D | `src/pagination/` | `test/orders-page-fold.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-006E | `src/pagination/` | `test/orders-page-fold.test.ts` | unverified | production-wired | synthetic-tested | external |
| REQ-ARCH-007A | `src/toast-http-client.ts` | `test/transport.test.ts` | `LOOP.md` PR #37 record | production-wired | synthetic-tested | external |
| REQ-ARCH-007B | `src/toast-http-client.ts` | `test/transport.test.ts` | `LOOP.md` PR #37 record | production-wired | synthetic-tested | external |
| REQ-ARCH-008A | `src/pagination/` | `test/orders-bulk-pagination.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external |
| REQ-ARCH-008B | `src/pagination/` | `test/configuration-page-fold.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external |
| REQ-ARCH-008C | `src/pagination/` | `test/configuration-page-fold.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external |
| REQ-ARCH-008D | `src/pagination/` | `test/configuration-page-fold.test.ts` | `LOOP.md` PR #35 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009A | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009B | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009C | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009D | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009E | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |
| REQ-ARCH-009F | `src/analytics/report-job.ts` | `test/analytics-report-jobs.test.ts` | `LOOP.md` T5-002 record | production-wired | synthetic-tested | external |

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
