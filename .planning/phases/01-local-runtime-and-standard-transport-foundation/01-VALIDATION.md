---
phase: 1
slug: local-runtime-and-standard-transport-foundation
status: active
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-26
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for local stdio and Standard rate-limit proof.

---

## Structured GitHub Evidence Protocol

Every machine-checked evidence comment contains one JSON object and no Markdown wrapper. Prose comments never satisfy an evidence gate.

The independent reviewer uses `toast-pos-mcp/exact-head-review@1`. Its `subject` names the repository, PR number, exact head SHA, and scope. Its `review` contains distinct non-empty `reviewer_id` and `builder_id` values, `independent: true`, `disposition: CLEAN` or `FINDINGS`, and `finding_ids`. A CLEAN marker has an empty `finding_ids` array. The GitHub comment URL is authoritative and is not copied into its own body.

PR #37 uses `toast-pos-mcp/pr37-gate@1`. The marker contains `pr_number: 37`, `issue_number: 32`, exact `head_sha` and `merge_sha`, the CLEAN review comment URL, and a `gate` object. The `gate` contains these fields:

- `contract.source_url` equals `https://doc.toasttab.com/doc/devguide/apiRateLimiting.html`.
- `contract.retrieved_on` is an ISO date. `contract.reset_semantics` equals `absolute-unix-epoch-seconds-or-milliseconds-bounded`.
- `contract.header_names` contains only `Retry-After`, `X-Toast-RateLimit-By`, `X-Toast-RateLimit-Limit`, `X-Toast-RateLimit-Remaining`, and `X-Toast-RateLimit-Reset`.
- `contract.non_official_prefix_negative.result` equals `PASS`.
- `runtime_gates.node20.node_version` equals `v20.20.2`. `runtime_gates.node22.node_version` equals `v22.22.2`.
- Each runtime records exact install, check, and pack commands, `result: PASS`, and `exit_code: 0`.
- Each check records positive `test_files` and `tests_total`, with `tests_passed` equal to `tests_total` and `tests_failed: 0`.
- Each pack gate records positive `package_files` and the complete parsed `npm pack --dry-run --json` output in `raw_json`. The summed `files` lengths equal `package_files`.
- `mutation_gate` records `result: PASS`, positive equal `caught` and `total`, `survivors: 0`, and `restored: true`.
- `dox` equals `updated` or `no durable change`.

Issue #32 uses `toast-pos-mcp/issue32-closure@1`. It repeats the PR number, issue number, head SHA, merge SHA, PR evidence URL, CLEAN review URL, and the complete `gate` object. The issue `gate` must equal the PR `gate` exactly.

The Phase 1 candidate PR uses `toast-pos-mcp/phase1-candidate@1`. Issue #4 uses `toast-pos-mcp/issue4-closure@1`. Both repeat one identical `gate` object. It contains the same runtime fields and raw pack JSON contract. It also contains exactly two caught GH-4 mutations: `ignore-handler-signal` and `terminate-process-on-cancel`. Each mutation records `focused_test_result: FAIL`, `result: CAUGHT`, and `restored: true`. The marker records `dox`, the candidate SHA, merge SHA, and CLEAN review URL.

The post-merge control-plane PR uses `toast-pos-mcp/phase1-control-plane@1`. It records the exact head and merge SHAs, the candidate and candidate merge SHAs, `roadmap_analyze: PASS`, `git_diff_check: PASS`, the CLEAN review URL, and `dox`.

For PR #37, the Phase 1 candidate PR, and the control-plane PR, the structured evidence marker must be the latest top-level comment. Its CLEAN URL must resolve to one valid `exact-head-review@1` marker for the same PR, head, and scope. The checker derives `clean_comment_id` from that resolved comment and `evidence_comment_id` from the final evidence marker. It requires `clean_comment_id < evidence_comment_id` and zero other top-level comment IDs in that open interval. The checker also rejects later native `COMMENTED` reviews and unresolved review threads. This invariant rejects a top-level finding posted after CLEAN but before final evidence.

For each issue, the structured closure marker must be the latest issue comment. The checker rejects a later comment because it can invalidate the recorded closure evidence.

PR #37 and issue #32 satisfy their structured evidence protocol. Plan 01-01 records the exact reviewed head, CLEAN URL, evidence URLs, merge SHA, comment interval, and ancestry proof.

PR #45 contains the implemented GH-4 proof. Its immutable Node 20/22 gates, repeated mutations, and independent exact-head review remain pending.

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

- **After Plan 01-01 Tasks 2 and 3:** Run the focused compiled test files named by each implementation task.
- **After Plan 01-02 Task 1 commits the candidate:** Run no further tracked edit before the final runtime gates.
- **Before `$gsd-verify-work`:** Restore the authentic lockfile and run both full runtime gates.
- **Max feedback latency:** 20 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | GH-32 | T-01-07 | One complete preflight proves PR #37 head, structured review, an empty CLEAN-to-evidence comment interval, issue evidence, merge, and ancestry | external prerequisite | Standalone JSON parsing plus the comment-ID interval, review-thread, and `git merge-base --is-ancestor` gates from Plan 01-01 | N/A external | ✅ green |
| 1-01-02 | 01 | 1 | GH-4-REQ | T-01-01 | One process handles era-correct independent requests without hidden session dependence | child-process integration | `npm run build && npm run build:test && node --test dist-test/test/server.test.js` | ✅ exists | ✅ green |
| 1-01-03 | 01 | 1 | GH-4-CANCEL | T-01-02 | Official cancellation reaches the handler and the process remains usable | child-process integration and mutation | `npm run build && npm run build:test && node --test dist-test/test/protocol-cancellation.test.js dist-test/test/server.test.js` | ✅ exists | ✅ green |
| 1-02-01 | 02 | 2 | PH1-PUB | T-02-02 | All tracked edits finish and commit before the immutable candidate gates | focused integration and planning validation | `npm run build && npm run build:test && node --test dist-test/test/server.test.js dist-test/test/protocol-cancellation.test.js && node /Users/sully/.codex/gsd-core/bin/gsd-tools.cjs query roadmap.analyze && git diff --check` | ✅ exists | ✅ green |
| 1-02-02 | 02 | 2 | GH-4, PH1-PUB | T-02-02, T-02-03 | One unchanged candidate passes both runtimes, and candidate and control evidence have empty CLEAN-to-evidence comment intervals | full exact-head gate and external review | Exact runtime execution plus candidate and control comment-ID intervals and the issue JSON parser from Plan 01-02 | N/A external disposition | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/protocol-cancellation.test.ts` — real official-client cancellation fixture.
- [x] `test/server.test.ts` — retained-process sequential and concurrent requests for both protocol eras.

External prerequisite: PR #37 owns `test/transport.test.ts`, official `X-Toast-*` header fixtures, absolute seconds-or-milliseconds bounds, negative prefix coverage, exact-head Node gates, independent CLEAN review, and the empty CLEAN-to-evidence comment interval. Phase 1 does not modify or duplicate those transport tests.

After final Node gates start, the reviewed candidate receives no tracked edit or commit. Exact commands, counts, and reviewer evidence go to GitHub. Post-merge GSD reconciliation uses a separate control-plane branch from merged main.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Independent exact-head review | PH1-PUB | Builders cannot self-approve | Review the exact pushed head after both runtime gates pass. |

No live Toast credential is required because current official Toast documentation defines the reset contract.

---

## Validation Sign-Off

- [x] All tasks have automated verification or explicit Wave 0 dependencies.
- [x] Sampling continuity has no three consecutive tasks without automated verification.
- [x] Wave 0 covers every missing test reference.
- [x] No watch-mode flags exist.
- [x] Feedback latency is less than 20 seconds.
- [x] All three PR gates enforce `clean_comment_id < evidence_comment_id` with an empty open interval.

**Approval:** approved 2026-08-26
