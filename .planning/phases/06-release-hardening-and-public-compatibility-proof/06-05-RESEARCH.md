# Phase 6 Plan 05 — Validation reconciliation and nested Standard schemas

**Researched:** 2026-08-28 America/Chicago  
**Scope:** Correct Phase 06 evidence records and test whether published nested
Standard-report schemas can become more specific without closing Toast enums.

## Verified audit facts

| ID | Fact | Evidence | Planning consequence |
| --- | --- | --- | --- |
| VA-01 | `origin/main` and this planning base resolve to `2290e7b121a27c9ba64359bbb5a97bdd079bb28b`. | `git ls-remote origin refs/heads/main`; `git rev-parse HEAD` | Record later evidence against the candidate SHA. Do not represent this planning SHA as code validation. |
| VA-02 | PR #55 merged at `bcd819fb7c423d4e19274448417829b9821173ee`; its final metadata head is `db1270e963850aef3fb5bbb5c6fad402fdb212e2`. | `gh pr view 55 --json ...` | Preserve the independent final-review gate as unverified/pending. No plan task may close it. |
| VA-03 | `06-VALIDATION.md` says `status: complete`, `nyquist_compliant: true`, and `wave_0_complete: true`, while every listed T6-002 map row says the test file is absent and the row is pending. | Validation front matter and rows 49-54 | Reconcile the header and rows from commands run on one identified candidate. Do not retain conflicting status claims. |
| VA-04 | Plan 06-04 has no validation-map rows. Existing source-level evidence is limited to the named runtime, schema-branch, and mutation tests. | `06-04-SUMMARY.md`, `test/server.test.ts`, `test/report-tools-e2e.test.ts`, and `scripts/verify-t6-public-wiring-mutations.mjs` | Add only rows whose behavior has a direct named test and recorded command result. Do not create coverage for independent review or external gates. |
| VA-05 | `.planning/REQUIREMENTS.md` is absent and the Phase 06 roadmap section has no formal phase requirement list. | Repository file check and `ROADMAP.md` | Use the existing owner `T6-003` for plan traceability, but state that a formal all-requirements coverage claim is unavailable. |

## Nested-schema finding

`src/report-tools.ts` uses `z.object({}).passthrough()` for several nested
complete-report fields. The current `tools/list` test proves top-level status
branches and required fields. It does not prove nested JSON-schema shapes.

The current successful fixtures include an unknown Toast-derived value,
`NEW_ENUM_TAG`, in item-tag output. This proves that a nested-schema repair
must keep vendor-evolving values as validated strings. It must not replace
open data strings with closed `z.enum` values.

Zod 4 documents `z.strictObject()` for schemas that reject unknown object keys
and `z.looseObject()` for schemas that preserve them. The investigation must
use exact emitted JSON Schema and real invented fixture results to decide each
nested field's contract. It must not convert an object to strict only because
the field name appears stable. Source: [Zod object schemas](https://zod.dev/api?id=sets).

## Existing test seams

| Test or harness | What it proves now | Limit |
| --- | --- | --- |
| `test/server.test.ts` | The compiled legacy and modern stdio paths share one runtime and return a Standard sales result or structured denial. | It does not inspect nested output objects. |
| `test/report-tools-e2e.test.ts` | `tools/list` exposes the real top-level Standard status branches, denial fields, provenance fields, and item dimension. It also observes unknown item-tag data. | It does not assert nested `additionalProperties` or nested required fields. |
| `scripts/verify-t6-public-wiring-mutations.mjs` | Fourteen source mutations break a named behavioral test. | It has no guard for any nested output schema. |
| `test/public-operator-docs.test.ts` | The T6-002 public-documentation contract exists and passed in prior recorded evidence. | The validation map currently contradicts this record and needs a fresh exact-candidate result. |

## Guardrails

- Use only invented fixture data. Do not access Toast, Merchant Data, live
  credentials, packages, signing, or publication systems.
- Preserve `D-01` through `D-09`, including body-free Analytics behavior and
  all open release gates.
- Preserve open Toast enum values as `z.string()` data where the report
  contract permits them.
- Add a strict nested object only after a failing test identifies its required
  fields and the existing complete handler results satisfy that exact shape.
- If a nested field is intentionally extensible, retain its open shape and
  record the reason in the validation evidence. This is not a passing strict
  contract claim.

## Package legitimacy audit

No package is installed, added, upgraded, removed, or published. The existing
committed lockfile may be restored only for validation. No package legitimacy
checkpoint is required.
