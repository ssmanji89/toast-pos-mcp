---
phase: 06
slug: release-hardening-and-public-compatibility-proof
status: complete
nyquist_compliant: true
wave_0_complete: true
execution_status: task_3_complete
created: 2026-08-27
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for T6-002 public operator documentation.
> This contract proves repository documentation against synthetic source fixtures.
> It does not prove Toast approval, Merchant consent, live compatibility, package installation, signing, or publication.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiled tests and the Node built-in test runner |
| **Config file** | `tsconfig.test.json` and `scripts/run-tests.mjs` |
| **Focused RED command** | `npm run build:test && ! node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` |
| **Focused GREEN command** | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` |
| **Full suite command** | `npm ci --no-audit --no-fund && npm run check` |
| **Expected feedback limit** | 60 seconds for the focused test; record the observed full-suite duration |

The focused test reads only repository TypeScript, Markdown, and license metadata.
It must not start the server, read environment credentials, contact Toast, or load Merchant Data.

---

## Sampling Rate

- **Task 1 RED:** Run the focused RED command after `test/public-operator-docs.test.ts` exists and before any public-documentation edit.
- **Task 2 GREEN:** Run the focused GREEN command after every public-documentation change.
- **Task 3 final gate:** Run the full suite command after the candidate head is fixed. Record the same `git rev-parse HEAD` value before and after it.
- **Before review:** Run `git diff --check` and the documentation claims scan. Record the changed paths and the scan result.
- **No watch mode:** All commands terminate and return an exit status.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type and File | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|--------------------|-------------------|-------------|--------|
| T6-002-DOCS-01 | 06-01 Task 1 | 1 | Every registered Standard tool is documented with its Standard API source and completeness boundary. | T-06-02 | The source-derived catalog and README list exactly `toast_sales_summary`, `toast_payment_summary`, `toast_item_sales_summary`, `toast_cash_summary`, and `toast_labor_summary`. A registration or documentation drift fails. | Documentation contract — `test/public-operator-docs.test.ts` | RED: `npm run build:test && ! node --test --enable-source-maps dist-test/test/public-operator-docs.test.js`; GREEN: `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` | ❌ Wave 0 | ⬜ pending |
| T6-002-DOCS-02 | 06-01 Tasks 1–2 | 1 | The Analytics lifecycle tool is source-distinct, body-free, and only `denied` or `incomplete`; it is not a complete Analytics report. | T-06-02, T-06-05 | The test compares `toast_analytics_metrics_day` with public wording. It requires the unresolved `analytics_result_schema_unverified` boundary and rejects a completed body, formula, report, or live-compatibility claim. | Documentation contract — `test/public-operator-docs.test.ts` | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` | ❌ Wave 0 | ⬜ pending |
| T6-002-DOCS-01 | 06-01 Task 2 | 1 | Operators see authorized-credential, Merchant-consent, AI-provider, logging, retention, subprocessor, no-training, and guest-data duties before configuration guidance. | T-06-01, T-06-03, T-06-05 | The test requires the operator checklist before configuration instructions. It requires that `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an acknowledgment, not proof. It requires excluded guest-linked data, Analytics guest-payment data, delivery addresses, and payment identifiers. | Documentation contract — `test/public-operator-docs.test.ts` | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` | ❌ Wave 0 | ⬜ pending |
| T6-002-DOCS-02 | 06-01 Task 2 | 1 | Public documentation separates implemented behavior, synthetic-test evidence, and still-open external or human gates. | T-06-01, T-06-04 | The test requires all three evidence labels. The docs retain T5-003-G01, #4/T6-003, #28, live Analytics, installed-artifact smoke, signing, publication, and human brand or Terms approval as open gates. | Documentation contract and documentation claims scan — `test/public-operator-docs.test.ts` | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` | ❌ Wave 0 | ⬜ pending |
| T6-002-DOCS-02 | 06-01 Task 2 | 1 | The documentation makes no approval, endorsement, certification, partnership, publication, installed-artifact-proof, or live-compatibility claim. | T-06-01, T-06-04 | A declarative positive claim of Toast approval, endorsement, certification, partnership, publication, installed-artifact proof, or live compatibility fails. Explicit denials and explicit open-gate statements are required and allowed. | Documentation contract and documentation claims scan — `test/public-operator-docs.test.ts` | `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` | ❌ Wave 0 | ⬜ pending |
| T6-002-DOCS-03 | 06-01 Tasks 1–3 | 1 | The documentation contract, license checkpoint, and repository regression gate are green on one unchanged candidate head. | T-06-02, T-06-03, T-06-04 | The focused test asserts `LICENSE` starts with `Apache License`, `package.json` and the package-lock root use `Apache-2.0`, and no `NOTICE` file exists. The absent NOTICE is a recorded fact only. The full gate uses the committed lockfile and does not claim package proof. | Documentation contract — `test/public-operator-docs.test.ts`; full repository regression | `test -f .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md && rg -F 'T6-002-DOCS-01' .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md && rg -F 'T6-002-DOCS-02' .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md && rg -F 'T6-002-DOCS-03' .planning/phases/06-release-hardening-and-public-compatibility-proof/06-VALIDATION.md && npm ci --no-audit --no-fund && npm run check` | ✅ validation map / ❌ documentation test | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ limitation*

---

## License and Notice Checkpoint

Task 1 adds these assertions to the focused documentation contract test:

1. `LICENSE` begins with `Apache License`.
2. `package.json` has `license: "Apache-2.0"`.
3. The package-lock root package has `license: "Apache-2.0"`.
4. `NOTICE` does not exist.

This is read-only evidence. It does not create a notice, change package metadata, alter package contents, or establish signing, installed-artifact, or publication proof.

---

## Documentation Claims Scan

Run this scan on the candidate diff. It catches accidental credential-shaped additions and presents all public-boundary wording for review.

```sh
git diff --check && \
! git diff -- README.md docs/operator-guide.md docs/architecture/report-contract.md docs/architecture/public-use-boundary.md docs/architecture/threat-model.md | \
  rg -n -i '(client[_-]?secret[[:space:]]*[:=][[:space:]]*[^<[:space:]][^[:space:]]+|authorization:[[:space:]]*bearer[[:space:]]+[^<[:space:]][^[:space:]]+|TOAST_[A-Z_]*(SECRET|TOKEN|PASSWORD)[[:space:]]*=[[:space:]]*[^<[:space:]][^[:space:]]+)'
git diff -- README.md docs/operator-guide.md docs/architecture/report-contract.md docs/architecture/public-use-boundary.md docs/architecture/threat-model.md | \
  rg -n -i 'toast|approval|endorsement|certif|partner|publish|install|live.compatib|analytics|merchant|consent|training|notice' || true
```

The second command is review output, not proof of an external gate. Review it against the precise negative boundaries below.

### Precise Negative Boundaries

- Do not add a positive Toast approval, endorsement, certification, partnership, sponsorship, or brand-permission statement.
- Do not add a package-published, release-ready, signed, installed-artifact-proven, or live-compatible statement.
- Do not describe `toast_analytics_metrics_day` as a complete Analytics result, body, formula, or report.
- Do not add live-credential, tarball-install, signing, publishing, or release procedures.
- Do not add a client secret, bearer token, raw credential payload, Merchant Data, copied Toast Terms text, approval record, package artifact, package-metadata change, or control-plane change.
- Allow direct Terms links, an observed Terms date, explicit denials, and explicit statements that external gates remain open.

## Observed Execution Evidence

**Implementation:** `README.md`, `docs/operator-guide.md`,
`docs/architecture/report-contract.md`, `docs/architecture/public-use-boundary.md`,
`docs/architecture/threat-model.md`, `test/public-operator-docs.test.ts`, and
this validation map changed. Reviewed registrations: `src/report-tools.ts` and
`src/analytics-report-tools.ts`. The PR also carries four phase records:
`06-CONTEXT.md`, `06-RESEARCH.md`, `06-01-PLAN.md`, and `06-01-SUMMARY.md`.

**Synthetic validation:** The RED command failed as expected before public
documentation existed. The focused GREEN command passed 5 of 5 tests.
`npm ci --no-audit --no-fund && npm run check` passed on unchanged candidate
`467d6e9536c138c6c1bb0b742c6f6ccf169204b8`, with 42 discovered test files
and 411 passing tests. The command used Node `v25.9.0` and npm `11.12.1`.
It used only the committed lockfile. `npm pack --dry-run` ran inside the
repository gate; no tarball install, signing, publication, live credential, or
Merchant Data activity occurred.

**Read-only license checkpoint:** `LICENSE` begins with `Apache License`.
`package.json` and the root `package-lock.json` declare `Apache-2.0`. `NOTICE`
does not exist. This records current metadata only. It does not create a
notice, change package metadata, or establish release evidence.

**Terms and documentation evidence:** The documentation records the observed
2026-06-23 Terms date and direct `https://pos.toasttab.com/api-terms-of-use`
link. It records issue #22 and `DOX: updated`. The changed-path and diff scan
found seven implementation paths plus four phase records. It found no secret, Merchant Data, copied
Toast documentation, approval record, package artifact, package-metadata
change, or control-plane change.

**External gates:** T5-003-G01, #4/T6-003, #28, live Standard compatibility,
live Analytics compatibility, installed-artifact smoke, signing, publication,
and human brand and Terms approvals remain open. This evidence does not claim
reviewer approval, legal approval, publication authorization, or live proof.

---

## Wave 0 Requirements

- [ ] `test/public-operator-docs.test.ts` — source-registration catalog, Standard/Analytics source distinction, denied/incomplete Analytics boundary, operator safety order, evidence labels, precise negative claims, and license/NOTICE checkpoint.
- [ ] Run the focused RED command before Task 2 changes public documentation.
- [ ] Record the expected non-zero test result without weakening the test.

Task 1 owns this Wave 0 dependency. Task 2 cannot be green before it exists and passes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toast Terms, brand-feature, and public-distribution approval | T6-002 D-02/D-03 | Repository text and synthetic tests cannot grant Toast or legal approval. | Verify the direct Terms link and observed date. Obtain required human or Toast approval outside the repository before any public brand-feature use or publication claim. |
| Merchant consent and AI-provider processing approval | T6-002 D-04/D-05 | An environment acknowledgment is not legal-sufficiency proof. | Verify operator-held documented Merchant consent and review the host, provider, logging, retention, human-review, and subprocessor controls before Merchant Data enters an AI service. |
| Live Standard and Analytics compatibility | #28; T5-003-G01 | No authorized live credentials exist here. G01 lacks a verified complete Analytics schema. | Keep #28, T5-003-G01, and live Analytics compatibility open. Do not use fixtures as live proof. |
| Package installation, signing, and publication | T6-003 | T6-003 owns the actual artifact and external release authority. | Keep first-tool-request cancellation (#4/T6-003), installed-artifact smoke, signing, and publication open. Do not run or document a release action in T6-002. |
| Independent exact-head review | Delivery standard | A builder cannot approve this documentation or its evidence. | Review the final candidate SHA, exact commands, changed-path list, `git diff --check`, claims scan, and remaining external gates. |

---

## Validation Sign-Off

- [x] Every T6-002 must-have maps to Task 1, Task 2, or Task 3.
- [x] T6-002-DOCS-01 and T6-002-DOCS-02 map to the focused documentation contract test.
- [x] T6-002-DOCS-03 maps to clean-install and the full `npm run check` gate.
- [x] The Wave 0 test includes the license and absent-NOTICE checkpoint.
- [x] The claims scan and precise negative boundaries are defined.
- [x] No watch-mode command exists.
- [x] Task 1 RED result recorded: `npm run build:test && ! node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` exited 0 on 2026-08-27 because the new contract test failed as expected. The missing `docs/architecture/report-contract.md` caused the deliberate initial failure. The prior no-dependency compile failure was corrected by authentic `npm ci --no-audit --no-fund`; no test assertion changed.
- [x] Task 2 GREEN result recorded: `npm run build:test && node --test --enable-source-maps dist-test/test/public-operator-docs.test.js` passed 5 of 5 tests.
- [x] Task 3 full-gate result and candidate SHA recorded: `467d6e9536c138c6c1bb0b742c6f6ccf169204b8` remained unchanged before and after `npm ci --no-audit --no-fund && npm run check`; 42 files and 411 tests passed.
- [x] `nyquist_compliant: true` set after the observed final checks pass.

**Approval:** implementation evidence complete — independent review remains required.

## T6-003 installed artifact validation

| ID | Behavior | Wave 0 state | Evidence |
| --- | --- | --- | --- |
| T6-003-PKG-01 | Exact package path allowlist and checksum | pending | RED test added; real npm pack required. |
| T6-003-PKG-02 | Empty consumer installed-bin modern MCP path | pending | RED test added; absent preload must fail after package installation. |
| T6-003-PKG-03 | Standard completion and constrained Analytics envelope | pending | RED test added; existing body-free Analytics boundary only. |
| T6-003-PKG-04 | Preload runtime identity and unmatched-route rejection | pending | Test-only preload not yet present. |
| T6-003-PKG-05 | Node 20.20.2 exact-head gate | pending | Committed dependency restore and full gate required. |
| T6-003-PKG-06 | Node 22.22.2 exact-head gate | pending | Committed dependency restore and full gate required. |
| T6-003-PKG-07 | Dependency, license, and advisory inspection | pending | Bounded no-change inspection required. |
| T6-003-PKG-08 | Evidence keeps external gates open | pending | README, threat model, docs contract, and LOOP update required. |

RED command pending observation: `npm run build:test && ! node --test --enable-source-maps dist-test/test/package-artifact-e2e.test.js`.
