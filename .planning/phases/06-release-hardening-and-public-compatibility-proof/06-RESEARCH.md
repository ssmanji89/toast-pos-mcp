# Phase 6: Release hardening and public compatibility proof - Research

**Researched:** 2026-08-27  
**Domain:** Toast API terms, branding, and public operator documentation  
**Confidence:** MEDIUM

## User Constraints

No `06-CONTEXT.md` exists. [VERIFIED: codebase grep]

### Locked Scope

- T6-002 covers the Toast terms and branding checkpoint plus public operator documentation. [VERIFIED: GitHub issue #22]
- T6-002 does not publish a package, sign an artifact, use live credentials, access Merchant Data, or claim a public release. [VERIFIED: GitHub issue #22]
- T6-002 must keep the documentation true for the registered body-free Analytics tool. [VERIFIED: `src/analytics-report-tools.ts`]
- T6-002 must not modify `LOOP.md`, `ROADMAP.md`, or `STATE.md` in this planning branch. [VERIFIED: task scope]

### Deferred and External Work

- T6-003 owns clean-install, tarball, installed-executable, stdio, signing, and publication evidence. [VERIFIED: GitHub issue #22]
- Owner-authorized live Standard access, live Analytics access, Toast approval, legal review, and publication authorization remain human or external gates. [VERIFIED: `LOOP.md`; GitHub issue #22]

## Summary

T6-002 should make the public documentation match the exact implementation that exists today. [VERIFIED: codebase graph; `src/report-tools.ts`; `src/analytics-report-tools.ts`] The repository has five registered Standard report tools and one registered Analytics lifecycle tool. [VERIFIED: codebase graph; `src/report-tools.ts`; `src/analytics-report-tools.ts`] The Analytics tool may return only `denied` or `incomplete` envelopes and does not project a completed result schema. [VERIFIED: `src/analytics-report-tools.ts`; `LOOP.md`] The documentation must state that distinction plainly.

Toast's current API Terms page is dated June 23, 2026. [CITED: https://pos.toasttab.com/api-terms-of-use] The Terms require Merchant consent before AI tools or services process Merchant Data. [CITED: https://pos.toasttab.com/api-terms-of-use] The Terms also require Toast's prior written consent before engaging a third-party provider for API use and before public use of Toast Brand Features. [CITED: https://pos.toasttab.com/api-terms-of-use] The Terms prohibit statements that suggest Toast partnership, sponsorship, or endorsement. [CITED: https://pos.toasttab.com/api-terms-of-use] T6-002 can record the reviewed Terms version and direct operators to it, but it cannot establish the missing approvals or declare the package publish-ready. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: GitHub issue #22]

**Primary recommendation:** Publish an operator guide and one report-contract catalog, then repair the README and current-state threat model to link to them and state only implemented, synthetic, and externally gated evidence. [VERIFIED: GitHub issue #22; VERIFIED: `README.md`; VERIFIED: `docs/architecture/public-use-boundary.md`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Terms review date and direct Terms link | Repository documentation | Toast / human review | The repository can record the observed Terms date; only Toast and an authorized reviewer can resolve approval obligations. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| Brand and non-endorsement wording | Repository documentation | Toast / human review | Public wording must not imply approval, partnership, sponsorship, or endorsement. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| Credential, consent, AI-provider, logging, retention, and subprocessor notice | Operator guide | Operator | The operator controls credentials and downstream processing choices. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: `docs/architecture/public-use-boundary.md`] |
| Tool catalog, source distinctions, formulas, and result states | Report-contract documentation | MCP presentation | The registered tools and result schemas define the durable public contract. [VERIFIED: codebase graph; VERIFIED: `src/report-contract.ts`; VERIFIED: `src/analytics-report-tools.ts`] |
| Publication, signing, tarball, installed stdio, and live compatibility claims | T6-003 evidence | Human / external gate | T6-002 documentation cannot replace the required package and live evidence. [VERIFIED: GitHub issue #22; VERIFIED: `LOOP.md`]

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|---|---:|---|---|
| Existing Markdown documentation | — | Public operator and contract documentation | T6-002 needs no new runtime or documentation package. [VERIFIED: GitHub issue #22; VERIFIED: `package.json`] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| Existing Node test runner | Documentation contract regression test | Use for stable assertions that public docs name the actual tools and do not make prohibited release claims. [VERIFIED: `package.json`; VERIFIED: `test/`] |
| Existing `npm run check` | Repository regression gate | Run after documentation and test changes when authentic dependencies are restored. [VERIFIED: `package.json`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Version-controlled Markdown | External legal/terms service | An external service would not prove the package's checked-in public text, and it adds an unapproved third-party processing path. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: GitHub issue #22] |

**Installation:** No package installation belongs to T6-002. [VERIFIED: GitHub issue #22]

## Package Legitimacy Audit

No external package is proposed or installed by T6-002. [VERIFIED: GitHub issue #22]

| Package | Verdict | Disposition |
|---|---|---|
| none | Not applicable | Do not run a package-legitimacy gate for this documentation-only slice. [VERIFIED: GitHub issue #22] |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: GitHub issue #22]

## Documentation Architecture

### System Architecture Diagram

```text
Current Toast API Terms and Developer Guide
                  |
                  v
          Terms / branding checkpoint
                  |
        +---------+----------+
        |                    |
        v                    v
Operator guide         Report-contract catalog
        |                    |
        +---------+----------+
                  |
                  v
README and threat-model current-state links
                  |
                  v
Evidence boundary: READY_FOR_HUMAN_GATE only
                  |
                  +--> T6-003 package and live proof remain required
```

The documentation path must distinguish source code that is implemented from evidence that is missing or human-gated. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22]

### Required Durable Documentation

| Path | T6-002 action | Required content | Acceptance condition |
|---|---|---|---|
| `README.md` | Update | One current product status, install/configuration prerequisites, fail-closed outcomes, the direct Terms link, non-endorsement wording, and links to the operator guide and report catalog. [VERIFIED: `README.md`; VERIFIED: GitHub issue #22] | It names the six registered tools accurately and does not say package publication, installed-artifact proof, live compatibility, or Toast approval occurred. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: GitHub issue #22] |
| `docs/operator-guide.md` (new) | Create | Operator checklist for authorized credentials, documented Merchant consent, provider/MCP-host/logging/retention/subprocessor review, no-training restriction, excluded data, local-stdio boundary, and failure handling. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: `docs/architecture/public-use-boundary.md`] | It tells operators that `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an acknowledgment, not proof of legal sufficiency. [VERIFIED: `README.md`; VERIFIED: `src/config.ts`] |
| `docs/architecture/report-contract.md` (new) | Create | Source, input, formula source, output schema version, freshness/completeness semantics, exclusions, and limitations for each registered tool. [VERIFIED: codebase graph; VERIFIED: `src/report-contract.ts`; VERIFIED: `src/analytics-report-tools.ts`] | It separates Standard API calculations from the Analytics API lifecycle envelope. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`] |
| `docs/architecture/public-use-boundary.md` | Update | Current Terms date/link, exact operator responsibilities, no-brand-approval assumption, and cross-links to the operator guide and catalog. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: `docs/architecture/public-use-boundary.md`] | It does not convert the Terms check into legal approval, Merchant consent, or Toast consent. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| `docs/architecture/threat-model.md` | Update its current-state section only | Replace pre-T3 status with exact current behavior and residual release gates. [VERIFIED: `docs/architecture/threat-model.md`; VERIFIED: `LOOP.md`] | It says the Analytics tool is body-free and incomplete-only, and it retains G01, #4/T6-003, #28, signing, and live proof as open gates. [VERIFIED: `LOOP.md`; VERIFIED: `src/analytics-report-tools.ts`] |

### Pattern 1: Evidence-state wording

**What:** State the evidence level beside every public capability statement. [VERIFIED: `AGENTS.md`]

**When to use:** Use it for every tool, installation instruction, compatibility statement, Terms statement, and release statement. [VERIFIED: GitHub issue #22]

**Required wording model:**

```markdown
Implemented and synthetic-test evidence: `toast_analytics_metrics_day` is registered.
Current limitation: it returns only `denied` or `incomplete` body-free envelopes.
Not proven: a complete Analytics result schema, live Analytics compatibility, publication, or Toast approval.
```

The model matches the current tool's schema and campaign gate. [VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: `LOOP.md`]

### Pattern 2: Operator action checklist

**What:** List operator actions before any AI processing occurs. [CITED: https://pos.toasttab.com/api-terms-of-use]

**When to use:** Use it in the new operator guide and summarize it in the README. [VERIFIED: GitHub issue #22]

**Required checklist:**

1. Use only credentials authorized for the selected restaurant. [VERIFIED: `README.md`; CITED: https://pos.toasttab.com/api-terms-of-use]
2. Hold documented Merchant consent before an AI tool or service processes Merchant Data. [CITED: https://pos.toasttab.com/api-terms-of-use]
3. Review the MCP host, model provider, prompts, tool logs, traces, retention, human review, and subprocessors. [VERIFIED: `docs/architecture/public-use-boundary.md`]
4. Do not allow API data or API-derived synthetic data to train or improve a model without Toast's prior written approval. [CITED: https://pos.toasttab.com/api-terms-of-use]
5. Do not enable excluded guest-linked or Analytics guest-payment data. [VERIFIED: `AGENTS.md`; VERIFIED: `src/analytics-report-tools.ts`]

### Anti-Patterns to Avoid

- **Terms-as-approval:** Do not state that a reviewed URL, local stdio, or an environment acknowledgment grants Merchant, Toast, provider, or branding approval. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: `README.md`]
- **Analytics-overclaim:** Do not call the registered Analytics tool a complete report, even after its lifecycle reaches HTTP 200. [VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: `LOOP.md`]
- **Stale branch narrative:** Do not retain README text that says capability preflight is under review or reporting tools are unavailable. [VERIFIED: `README.md`; VERIFIED: codebase graph]
- **Source conflation:** Do not present Analytics output as Standard API calculations or accounting, tax, payroll, GAAP, or certified data. [VERIFIED: `README.md`; VERIFIED: `src/analytics-report-tools.ts`]
- **Brand permission assumption:** Do not infer permission to use a Toast name, logo, certification claim, partner claim, or endorsement claim from the API Terms review. [CITED: https://pos.toasttab.com/api-terms-of-use]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Terms authority | A copied or paraphrased substitute for Toast terms | Direct link, observed update date, and human escalation for approvals | The Terms can change and only Toast controls approvals. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| Legal consent record | Consent storage in the package or repository | Operator-held documented consent outside the repository | The runtime acknowledgment does not establish legal sufficiency, and durable evidence would violate repository safety rules. [VERIFIED: `README.md`; VERIFIED: `AGENTS.md`] |
| Report truth | Marketing-style capability list | Source-derived tool and schema catalog | The code exposes tool-specific source and result-state contracts. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`] |

**Key insight:** Documentation must expose evidence boundaries, not reproduce external approvals or claim certainty that code and synthetic tests cannot prove. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22]

## Current State and Blockers

| Item | Current fact | T6-002 treatment |
|---|---|---|
| Package publication | `package.json` is version `0.0.0` and `private: true`. [VERIFIED: `package.json`] | State that no public release exists. Do not add publish instructions or a release-ready claim. [VERIFIED: GitHub issue #22] |
| Installed-artifact evidence | `npm pack --dry-run --json` cannot run in this worktree because dependencies are absent and TypeScript cannot find `@types/node`. [VERIFIED: local command `npm pack --dry-run --json`, 2026-08-27] | Record no package result. T6-003 must restore authentic dependencies and perform the gate. [VERIFIED: GitHub issue #22] |
| Terms and branding approval | The current Terms require Toast prior written consent for public Toast Brand Feature use and prohibit implications of endorsement. [CITED: https://pos.toasttab.com/api-terms-of-use] | Record the Terms date and link. Add a human legal/Toast approval checkpoint before public brand-feature use or a branding-based publication claim. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| Analytics complete result | G01 remains open because official Toast sources conflict on the completed retrieval response shape. [VERIFIED: `LOOP.md`; VERIFIED: `.planning/ROADMAP.md`] | Document only the body-free `denied`/`incomplete` tool behavior. [VERIFIED: `src/analytics-report-tools.ts`] |
| Live and release proof | First-tool-request cancellation, live Standard compatibility, live Analytics compatibility, signing, install smoke, and publication remain open gates. [VERIFIED: `LOOP.md`] | Link to the gates. Do not relabel synthetic test evidence as live or publish evidence. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22] |

The Phase 6 roadmap still lists rate-limit reset semantics as a release gate, while `LOOP.md` and `STATE.md` record the related implementation slice as closed. [VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `LOOP.md`; VERIFIED: `.planning/STATE.md`] T6-002 must not state that this gate is open or closed without the control-plane owner reconciling the records. [VERIFIED: `AGENTS.md`]

## Common Pitfalls

### Pitfall 1: A documentation refresh becomes a publish claim

**What goes wrong:** Public text says “release ready,” “compatible,” “approved,” or “official” after local documentation work. [VERIFIED: GitHub issue #22]

**Why it happens:** Implementation and synthetic test evidence are incorrectly treated as package, live-service, terms, or human approval evidence. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22]

**How to avoid:** Use the three labels “implemented,” “synthetic-test evidence,” and “external gate remains.” [VERIFIED: `AGENTS.md`]

**Warning signs:** The text omits G01, #4/T6-003, #28, signing, install smoke, or public-brand approval. [VERIFIED: `LOOP.md`; CITED: https://pos.toasttab.com/api-terms-of-use]

### Pitfall 2: An Analytics lifecycle is described as a report result

**What goes wrong:** The operator expects completed Analytics metrics. [VERIFIED: `src/analytics-report-tools.ts`]

**Why it happens:** The tool name and a successful lifecycle can hide the schema gate. [VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: `LOOP.md`]

**How to avoid:** State the exact output states and the `analytics_result_schema_unverified` reason. [VERIFIED: `src/analytics-report-tools.ts`]

**Warning signs:** Documentation uses “complete,” “metrics result,” or “Analytics report” without the body-free limitation. [VERIFIED: `src/analytics-report-tools.ts`]

### Pitfall 3: Local stdio is treated as a data-processing waiver

**What goes wrong:** An operator sends Merchant Data through an AI host, model provider, logger, or retention system without the required review. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: `docs/architecture/public-use-boundary.md`]

**Why it happens:** Credential locality is confused with downstream data locality and permission. [VERIFIED: `README.md`; VERIFIED: `docs/architecture/public-use-boundary.md`]

**How to avoid:** Put the operator checklist before all configuration examples. [CITED: https://pos.toasttab.com/api-terms-of-use]

**Warning signs:** The docs present `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` as consent proof. [VERIFIED: `README.md`; VERIFIED: `src/config.ts`]

## Code Examples

### Evidence-bound operator notice

```markdown
This package is not an official Toast product and does not claim Toast approval,
certification, partnership, sponsorship, or endorsement.

No public release exists at this revision. The package remains private until T6-003
records exact-head package, installed-artifact, stdio, and human-gated evidence.
```

This wording is a repository contract recommendation, not a grant of Toast trademark permission. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: GitHub issue #22]

### Analytics limitation notice

```markdown
`toast_analytics_metrics_day` is registered for a fixed Analytics Metrics/day lifecycle.
It returns only body-free `denied` or `incomplete` envelopes.
It does not expose or claim a completed Analytics result schema.
```

This wording follows the implemented tool schema. [VERIFIED: `src/analytics-report-tools.ts`]

## State of the Art

| Old wording | Required current wording | Impact |
|---|---|---|
| “Capability preflight is under review” and “Reporting tools remain unavailable.” [VERIFIED: `README.md`] | Current docs must list the registered Standard tools and the constrained Analytics tool. [VERIFIED: codebase graph; VERIFIED: `src/analytics-report-tools.ts`] | Operators receive a correct capability list without an unsupported release claim. [VERIFIED: GitHub issue #22] |
| “Analytics API reports” without a result-contract limitation. [VERIFIED: `README.md`] | Analytics output is a body-free lifecycle envelope that is `denied` or `incomplete` until G01 is resolved. [VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: `LOOP.md`] | Operators cannot mistake a lifecycle result for a complete analytics report. [VERIFIED: `LOOP.md`] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A new `docs/operator-guide.md` and `docs/architecture/report-contract.md` are the best final paths. [ASSUMED] | Documentation Architecture | The implementer can use different paths if the owning documentation structure gives a clearer single source of truth. |
| A2 | A documentation contract test can cover durable negative wording without creating a false legal proof. [ASSUMED] | Validation Architecture | The test may need a different repository-native location or may be unnecessary after human review. |

## Open Questions (RESOLVED)

### Public brand distribution

**Resolution:** T6-002 records the Toast Terms link and observed update date, and uses neutral wording only. [CITED: https://pos.toasttab.com/api-terms-of-use]

Toast, legal, and owner approval remain external gates before public Toast Brand Feature use or publication. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: GitHub issue #22]

## Open Questions

1. **Which single document owns the report formula catalog?**
   - What we know: Formula and schema facts are currently distributed across source modules and several architecture documents. [VERIFIED: codebase graph; VERIFIED: `docs/architecture/`] 
   - What's unclear: No current top-level catalog maps every public tool to its source, formula, schema, freshness, and exclusion contract. [VERIFIED: codebase grep]
   - Recommendation: Create one catalog and link every public guide to it. [ASSUMED]

## Environment Availability

T6-002 has no new external runtime dependency. [VERIFIED: GitHub issue #22]

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js / npm dependencies | Documentation contract test and repository check | ✗ in this worktree | `@types/node` is missing from restored dependencies. [VERIFIED: local command `npm pack --dry-run --json`, 2026-08-27] | Restore the committed lockfile before validation. [VERIFIED: `package.json`] |
| Current Toast Terms page | Terms date and exact public wording | ✓ | Updated 2026-06-23. [CITED: https://pos.toasttab.com/api-terms-of-use] | No offline substitute. [CITED: https://pos.toasttab.com/api-terms-of-use] |

**Missing dependencies with no fallback:** None for writing documentation. [VERIFIED: GitHub issue #22]

**Missing dependencies with fallback:** The documentation can be drafted now, but its Node-based contract test and full regression gate require authentic dependency restoration. [VERIFIED: `package.json`]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in test runner through `node scripts/run-tests.mjs`. [VERIFIED: `package.json`] |
| Config file | `scripts/run-tests.mjs`. [VERIFIED: `package.json`] |
| Quick run command | `node --test test/public-operator-docs.test.mjs` after dependency restoration. [ASSUMED] |
| Full suite command | `npm run check`. [VERIFIED: `package.json`] |

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| T6-002-DOCS-01 | Public docs name actual registered tools and source families. [VERIFIED: `src/report-tools.ts`; VERIFIED: `src/analytics-report-tools.ts`] | Documentation contract | `node --test test/public-operator-docs.test.mjs` [ASSUMED] | ❌ Wave 0 |
| T6-002-DOCS-02 | Public docs state no complete Analytics result and no public-release claim. [VERIFIED: `src/analytics-report-tools.ts`; VERIFIED: GitHub issue #22] | Documentation contract | `node --test test/public-operator-docs.test.mjs` [ASSUMED] | ❌ Wave 0 |
| T6-002-DOCS-03 | Full source/package regression gate remains green after the documentation change. [VERIFIED: `package.json`] | Regression | `npm run check` | ✓ infrastructure; blocked pending authentic dependency restoration. [VERIFIED: local command `npm pack --dry-run --json`, 2026-08-27] |

### Sampling Rate

- **Per documentation commit:** Run the focused documentation contract test after dependencies are restored. [ASSUMED]
- **Before merge:** Run `npm run check` and record the exact result. [VERIFIED: `package.json`; VERIFIED: `AGENTS.md`]
- **Phase gate:** Human review verifies exact Terms, brand wording, and all unresolved release gates remain explicit. [CITED: https://pos.toasttab.com/api-terms-of-use; VERIFIED: GitHub issue #22]

### Wave 0 Gaps

- [ ] `test/public-operator-docs.test.mjs` — assert tool catalog, source distinction, body-free Analytics limitation, non-endorsement text, and no-release boundary. [ASSUMED]
- [ ] Restore authentic dependencies with `npm ci --no-audit --no-fund` before a Node-based test or `npm run check`. [VERIFIED: `package.json`; VERIFIED: local command `npm pack --dry-run --json`, 2026-08-27]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Yes | Never put operator credentials in docs, examples, fixtures, or durable logs. [VERIFIED: `AGENTS.md`; VERIFIED: `README.md`] |
| V3 Session Management | No code change | Do not describe local stdio as a credential, consent, or authorization waiver. [VERIFIED: `AGENTS.md`; VERIFIED: `docs/architecture/public-use-boundary.md`] |
| V4 Access Control | Yes | State restaurant-bound authorization and explicit capability denials. [VERIFIED: `README.md`; VERIFIED: `AGENTS.md`] |
| V5 Input Validation | Yes | Document exact configuration names and fail-closed startup behavior without credential values. [VERIFIED: `README.md`; VERIFIED: `src/config.ts`] |
| V6 Cryptography | No code change | Do not introduce cryptography, secrets, or secret-export instructions. [VERIFIED: GitHub issue #22; VERIFIED: `AGENTS.md`] |

### Known Threat Patterns for Documentation

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| A configuration example becomes a secret fixture. [VERIFIED: `AGENTS.md`] | Information disclosure | Use placeholders only; scan the diff and package list for credential-shaped values. [VERIFIED: `AGENTS.md`; VERIFIED: GitHub issue #22] |
| Public words imply Toast approval or endorsement. [CITED: https://pos.toasttab.com/api-terms-of-use] | Spoofing | Use neutral identification, direct Terms link, and a human brand-approval checkpoint. [CITED: https://pos.toasttab.com/api-terms-of-use] |
| Docs make `incomplete` data look authoritative. [VERIFIED: `src/analytics-report-tools.ts`] | Tampering | State source, status, freshness, exclusions, and unresolved gate beside each tool. [VERIFIED: `AGENTS.md`; VERIFIED: `src/report-contract.ts`] |

## Sources

### Primary (MEDIUM confidence)

- [Toast API Terms of Use](https://pos.toasttab.com/api-terms-of-use) — current update date, API use, credentials, third-party providers, branding, attribution, Merchant Data, and AI restrictions. [CITED: https://pos.toasttab.com/api-terms-of-use]
- [Toast API overview](https://doc.toasttab.com/doc/devguide/apiOverview.html) — Toast positions the developer guide for third-party-system integrations. [CITED: https://doc.toasttab.com/doc/devguide/apiOverview.html]
- [Toast integration types](https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html) — Standard and Analytics are separate API access models. [CITED: https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html]

### Repository Evidence (HIGH confidence)

- `AGENTS.md` — binding product, security, documentation, and evidence rules. [VERIFIED: `AGENTS.md`]
- GitHub issue #22 — T6-002 outcome and T6-003 human-gated release scope. [VERIFIED: GitHub issue #22]
- `LOOP.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` — current campaign gates and control-plane discrepancy. [VERIFIED: `LOOP.md`; VERIFIED: `.planning/ROADMAP.md`; VERIFIED: `.planning/STATE.md`]
- `src/report-tools.ts`, `src/analytics-report-tools.ts`, and `src/report-contract.ts` — registered tool and result contracts. [VERIFIED: codebase graph; VERIFIED: `src/analytics-report-tools.ts`]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — T6-002 needs no new package and uses repository-native Markdown and tests. [VERIFIED: GitHub issue #22; VERIFIED: `package.json`]
- Architecture: HIGH — the documentation map follows current public tool registrations and the approved repository control plane. [VERIFIED: codebase graph; VERIFIED: GitHub issue #22]
- Terms and branding: MEDIUM — the Terms page is current and direct, but it cannot resolve this repository's exact public-brand approval case. [CITED: https://pos.toasttab.com/api-terms-of-use]
- Pitfalls: HIGH — they follow binding repository evidence rules and the implemented Analytics schema gate. [VERIFIED: `AGENTS.md`; VERIFIED: `src/analytics-report-tools.ts`]

**Research date:** 2026-08-27  
**Valid until:** 2026-09-03, or earlier if Toast changes its Terms or developer documentation. [CITED: https://pos.toasttab.com/api-terms-of-use]
