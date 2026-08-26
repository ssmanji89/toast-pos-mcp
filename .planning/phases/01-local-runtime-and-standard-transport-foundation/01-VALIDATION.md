---
phase: 1
slug: local-runtime-and-standard-transport-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for local stdio and Standard rate-limit proof.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner on Node 20.20.2 and Node 22.22.2 |
| **Config file** | `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && npm run build:test && node --test dist-test/test/server.test.js dist-test/test/protocol-cancellation.test.js dist-test/test/transport.test.js` |
| **Full suite command** | `npm ci --no-audit --no-fund && npm run check` |
| **Estimated runtime** | 8 seconds per runtime |

---

## Sampling Rate

- **After every task commit:** Run the focused compiled test files named by the task.
- **After every plan wave:** Run `npm run check` on Node 20.20.2 and Node 22.22.2.
- **Before `$gsd-verify-work`:** Restore the authentic lockfile and run both full runtime gates.
- **Max feedback latency:** 20 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | GH-4-REQ | T-1-01 | One process handles independent requests without hidden session dependence | child-process integration | `node --test dist-test/test/server.test.js` | ✅ strengthen | ⬜ pending |
| 1-01-02 | 01 | 1 | GH-4-CANCEL | T-1-02 | Official cancellation reaches the handler and the process remains usable | child-process integration | `node --test dist-test/test/protocol-cancellation.test.js` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | GH-32-HEADERS | T-1-03 | Only official `X-Toast-*` fields update bounded location-scoped state | unit and transport integration | `node --test dist-test/test/transport.test.js` | ✅ repair | ⬜ pending |
| 1-02-02 | 02 | 1 | GH-32-BOUND | T-1-03 | Absolute reset values remain bounded and invalid values fail closed | unit and negative | `node --test dist-test/test/transport.test.js` | ✅ extend | ⬜ pending |
| 1-03-01 | 03 | 2 | PH1-PUB | — | Exact-head evidence separates local proof from report and live proof | full gate and review | `npm ci --no-audit --no-fund && npm run check` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/protocol-cancellation.test.ts` — real official-client cancellation fixture.
- [ ] `test/server.test.ts` — retained-process sequential and concurrent requests for both protocol eras.
- [ ] `test/transport.test.ts` — official header-name fixtures and negative prefix coverage.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Independent exact-head review | PH1-PUB | Builders cannot self-approve | Review the exact pushed head after both runtime gates pass. |

No live Toast credential is required because current official Toast documentation defines the reset contract.

---

## Validation Sign-Off

- [ ] All tasks have automated verification or explicit Wave 0 dependencies.
- [ ] Sampling continuity has no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing test reference.
- [ ] No watch-mode flags exist.
- [ ] Feedback latency is less than 20 seconds.
- [ ] `nyquist_compliant: true` is set after the plan checker passes.

**Approval:** pending
