# Phase 06 Plan 06: Formal Requirements Coverage Research

**Researched:** 2026-08-28  
**Base:** `761cba89b70c3da96f71cb84b3eaa4ef849438c5`  
**Purpose:** Repair the missing formal requirements-coverage control without creating a release claim.

## Finding

`.planning/REQUIREMENTS.md` does not exist. Phase 06 validation therefore has
no source-traceable, all-requirements inventory. `T6-003` is a work owner. It
is not a formal requirement set.

The inventory must distinguish four types of facts:

| Type | Meaning | May establish release proof? |
| --- | --- | --- |
| Canonical requirement | A binding product, safety, architecture, delivery, or phase outcome statement from its named source. | No. |
| Implementation link | A code or document path that claims to implement a requirement. | No. |
| Local evidence | A named synthetic test, mutation, package, or exact-head result. | No. |
| External gate | A fact that needs owner, Toast, legal, registry, signing, publication, or live-service authority. | No. |

## Canonical Source Order

The auditor must quote requirement text only from the following sources. A
summary, validation record, or test may provide evidence links. It must never
replace the source requirement text.

| Order | Canonical source | Use |
| --- | --- | --- |
| 1 | `AGENTS.md` — Product contract, Binding safety rules, Architecture constraints, Delivery standard, DOX | Repository-wide binding rules. |
| 2 | GitHub issue [#1](https://github.com/ssmanji89/toast-pos-mcp/issues/1) — Objective and Binding product boundary | Public product objective and initial boundary. |
| 3 | `LOOP.md` — Objective, Product boundary, Phase map, Slice ledger, Handoff rules, Release frontier, Cross-phase decision register | Authoritative campaign state, slice ownership, and release gates. |
| 4 | `.planning/ROADMAP.md` — Phase 1 through Phase 6 goals, outcomes, required behavior, wiring proof, and Phase 6 gates | Outcome projection and phase-level acceptance intent. |
| 5 | `docs/architecture/report-contract.md`, `docs/architecture/public-use-boundary.md`, and `docs/architecture/threat-model.md` | Durable implementation contracts. These may clarify a canonical requirement. They do not silently relax one. |

The inventory must record the source commit, repository-relative path or GitHub
URL, heading, and a bounded exact quote for every requirement. It must identify
the source hierarchy when two sources overlap. It must create separate rows when
one source paragraph contains independently testable obligations.

## Required Coverage Domains

The audit must enumerate all applicable atomic requirements. It must not use a
single broad row such as "safe MCP server" for several distinct obligations.

1. Read-only operations, secret and Merchant Data exclusion, guest-linked data
   exclusion, location isolation, deterministic report semantics, business-date
   semantics, open vendor strings, no accounting or tax claims, and fail-closed
   capability handling.
2. Node and MCP transport baseline, Standard and Analytics adapter separation,
   bounded output and memory, rate-limit and retry behavior, both pagination
   families, and Analytics job lifecycle behavior.
3. Product and operational boundary: operator-owned credentials, local stdio,
   consent and no-training duties, source separation, provenance, completeness,
   and invented fixtures.
4. Phase and slice outcomes from T0 through T6, including production-chain
   reachability and the distinct local-validation, review, merged, and
   externally proven evidence levels.
5. Delivery rules: exact-head review, GitHub and `LOOP.md` authority, DOX,
   requirement coverage, and no simulated infrastructure proof.

## Mandatory Open Gates

The evidence matrix needs a row for each gate below. These rows are not
requirements that local tests can complete. They must retain their owner,
required proof, and state.

| Gate | Owner and current source | Required proof | Current state |
| --- | --- | --- | --- |
| #60 / T6-003 | GitHub issue #60; `LOOP.md` Release frontier | Corrected SDK or separately reviewed local fix. Prove request ID `0` cancellation through the real stdio chain. | Open. |
| #28 | GitHub issue #28; `LOOP.md` Release frontier | Owner-authorized, read-only Standard credential probe with only sanitized protocol facts. | Open. |
| T5-003-G01 | `.planning/ROADMAP.md` Phase 5; `LOOP.md` Release frontier | Current corrected Toast retrieval contract or written vendor confirmation before a complete Analytics result contract. | Open. |
| PR #55 review | GitHub PR #55; Phase 06 validation | GitHub-attributable independent review of the final metadata head. | Pending. |
| PR #58 review | GitHub PR #58; Phase 06 validation | GitHub-attributable independent review of the reviewed exact head. | Reviewer-pending. |
| Merchant consent and live Analytics | `AGENTS.md`; issue #1; Phase 06 validation | Documented Merchant consent plus authorized access and required review. | External. |
| Terms and brand | `AGENTS.md`; Phase 06 research; Phase 06 validation | Applicable human, legal, or Toast authority. | External. |
| Signing and publication | `LOOP.md`; Phase 06 validation | Authorized signing and publication actions outside repository-local validation. | External. |

## Evidence Rules

- An inventory row can state `implemented`, `synthetic-tested`,
  `independently-reviewed`, `production-wired`, `live-proven`, or `external`.
  It must not combine these values into one completion claim.
- An implementation path must include an exact file and stable symbol, test,
  command, or GitHub evidence link. Missing evidence is recorded as `unverified`.
- Synthetic fixtures prove local behavior only. They do not prove Toast
  compatibility, consent, terms, brand approval, signing, or publication.
- The audit must use no credential, token, raw Toast response, Merchant Data,
  copied Toast Terms, or fabricated external result.
- The auditor must preserve every unknown Toast-derived enum as an open-string
  requirement. It must not infer a closed value set from fixtures.

## Executable Audit Design

Plan 06-06 should create `scripts/audit-requirements-traceability.mjs`. The
script is a structural gate, not a semantic reviewer. It must:

1. Read `.planning/REQUIREMENTS.md` and the evidence matrix.
2. Require each requirement ID exactly once in the inventory and at least once
   in the matrix.
3. Require source commit, source path or URL, heading, exact canonical quote,
   implementation status, evidence status, and gate disposition for each row.
4. Reject a row that treats `synthetic-tested`, `reviewed`, or `merged` as
   `live-proven` or as a closed external gate.
5. Require separate mandatory-gate rows for #60, #28, T5-003-G01, PR #55,
   PR #58, consent/live Analytics, Terms/brand, and signing/publication.
6. Report missing, duplicate, stale-source, unlinked, and gate-collapse rows
   with nonzero exit status.

The script cannot decide whether source meaning is complete. A reviewer must
inspect the canonical quote, row split, evidence classification, and every
unverified or external disposition.

## Verification Procedure

1. Complete and commit every tracked inventory, matrix, validation, and
   control-plane pending-review update.
2. Start from the clean final candidate head and record its SHA.
3. Run the traceability script and clean-worktree Node 20.20.2 and Node
   22.22.2 gates with the required base source commit.
4. Record matching before and after SHAs and run `git diff --check`.
5. Obtain a findings-only independent review on that final tracked SHA.
6. Do not change a tracked file after review. If a finding requires a change,
   create a new candidate and repeat steps 1 through 5.

This procedure does not run live Toast operations. It does not sign or publish
a package. It does not convert a successful local command into an external
proof claim.

## Source Audit

| Source | Item | Status | Plan treatment |
| --- | --- | --- | --- |
| GOAL | Phase 06 publishable-artifact goal requires legal, operator, live, packaging, security, and E2E gates. | Covered | Inventory maps phase outcome and all gate rows. |
| REQ | Phase 6 T6-001, T6-002, and T6-003 owners and delivery obligations. | Covered | Formal rows receive canonical sources and evidence links. |
| RESEARCH | Existing Phase 05/06 research requires source separation and evidence-bound wording. | Covered | Matrix keeps source and evidence classifications separate. |
| CONTEXT | Phase 06 D-01 through D-09 require distinct evidence, consent, Terms, exclusions, source separation, and open gates. | Covered | Inventory maps each applicable decision to a canonical requirement row. |

## No New External Discovery

This is a documentation and control-plane audit. It needs no new package or
external library. Existing official-source links remain references. The audit
does not claim the current web content proves a vendor, legal, or live gate.
