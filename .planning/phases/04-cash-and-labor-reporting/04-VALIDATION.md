---
phase: 4
slug: cash-and-labor-reporting
status: active
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-27
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for deterministic cash and labor MCP tools.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiled tests and the Node built-in test runner |
| **Config file** | `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build:test && node --test dist-test/test/cash-report.test.js dist-test/test/labor-report.test.js` |
| **Full suite command** | `npm ci --no-audit --no-fund && npm run check` |
| **Estimated runtime** | 30 seconds per Node runtime |

## Sampling Rate

- **After every task commit:** Run the focused compiled tests for the changed report.
- **After every plan wave:** Run `npm run check` on Node 20.20.2 and Node 22.22.2.
- **Before independent review:** Validate one immutable candidate head with package checks and stdio child-process tests.
- **Max feedback latency:** 45 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| T4-001 | cash | 1 | Cash source boundary | T4-CASH-01 | The tool uses restaurant-bound cash entries and deposits. It rejects malformed or inaccessible data without zero totals. | unit and stdio | `npm run build:test && node --test dist-test/test/cash-report.test.js dist-test/test/report-tools-e2e.test.js` | ❌ Wave 0 | ⬜ pending |
| T4-002 | labor | 1 | Labor source boundary | T4-LABOR-01 | The tool uses Orders facts for sales and tips. It returns aggregate output without employee identifiers. | unit and stdio | `npm run build:test && node --test dist-test/test/labor-report.test.js dist-test/test/report-tools-e2e.test.js` | ❌ Wave 0 | ⬜ pending |
| T4-001/T4-002 | integration | 2 | Production tool chain | T4-CHAIN-01 | The official MCP client invokes each registered tool through stdio and observes capability, transport, provenance, and structured response behavior. | child-process integration | `npm run build:test && node --test dist-test/test/report-tools-e2e.test.js` | ✅ extend | ⬜ pending |
| T4-001/T4-002 | candidate | 3 | Exact-head release evidence | T4-CHAIN-02 | The same candidate passes Node 20/22 install, check, and package gates before fresh independent review. | authentic runtime | Node 20.20.2 and Node 22.22.2 `npm ci --no-audit --no-fund && npm run check && npm pack --dry-run --json` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ limitation*

## Wave 0 Requirements

- [ ] `test/cash-report.test.ts` — source schemas, cash/deposit totals, reversals, missing scopes, cancellation, and output privacy.
- [ ] `test/labor-report.test.ts` — deleted and active entries, breaks, salaried records, regular/overtime hours, and Orders-only sales/tips.
- [ ] Extend `test/fixtures/stdio-report-server.ts` — bounded cash and labor fixtures plus malformed, denied, and cancellation cases.
- [ ] Extend `test/report-tools-e2e.test.ts` — tool discovery, stdio success, denial, cancellation, provenance, and no employee-data output.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Standard API compatibility | #28 | No owner-authorized Toast credentials are available. | Use documented Merchant consent and an authorized location. Verify scopes, restaurant headers, and real endpoint payload compatibility. |
| First tool-request cancellation | #4 / T6-003 | The current SDK path has no accepted first-request proof. | Retain this release gate until a reviewed correction proves first-handler cancellation. |
| Public package release | T6-002 / T6-003 | Terms review, signing, and package credentials require human authority. | Complete the release checklist after all code phases and external gates are closed. |

## Validation Sign-Off

- [x] Every execution task has an automated check or a Wave 0 dependency.
- [x] No three consecutive tasks lack automated verification.
- [x] Wave 0 covers each missing report and stdio integration test.
- [x] No watch-mode command exists.
- [x] Each candidate uses authentic registry restore and package output.
- [x] The GSD plan checker approved the final map on 2026-08-27.

**Approval:** planned 2026-08-27
