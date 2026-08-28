# Phase 6: Release hardening and public compatibility proof - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning
**Mode:** Autonomous safe defaults

<domain>
## Phase Boundary

T6-002 updates the Toast terms and branding checkpoint plus public operator
documentation. It must describe the current local read-only MCP accurately.
It must not publish a package, sign an artifact, use live Toast credentials,
access Merchant Data, or claim public release readiness.

</domain>

<decisions>
## Implementation Decisions

### Evidence and public wording
- **D-01:** State implemented behavior, synthetic-test evidence, and remaining
  external gates separately for every public capability claim.
- **D-02:** Do not state or imply Toast approval, certification, partnership,
  sponsorship, endorsement, legal approval, Merchant consent, or publication.
- **D-03:** Link to the current Toast API Terms. Record the observed Terms date.
  Treat public brand-feature approval as a human or Toast gate.

### Operator safety
- **D-04:** Put the operator consent, credential, provider, logging, retention,
  subprocessor, and no-training obligations before configuration guidance.
- **D-05:** Explain that the consent acknowledgment environment variable is not
  proof of legal sufficiency.
- **D-06:** Preserve the guest-linked and guest-payment exclusions at the
  request boundary.

### Source and release boundaries
- **D-07:** List the real Standard report tools and distinguish them from the
  body-free Analytics lifecycle tool.
- **D-08:** State that `toast_analytics_metrics_day` returns only `denied` or
  `incomplete` envelopes while T5-003-G01 remains unresolved.
- **D-09:** Keep T5-003-G01, first-tool-request cancellation, live Standard and
  Analytics compatibility, installed-artifact smoke, signing, and publication
  as open gates.

### the agent's Discretion

Use the existing Markdown documentation structure. Add one focused
documentation contract test only if it prevents a durable mismatch between the
registered public tools and public wording.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Repository contracts
- `AGENTS.md` — binding safety, source separation, evidence, and DOX rules.
- `LOOP.md` — authoritative slice state and release gates.
- `.planning/ROADMAP.md` — Phase 6 required gates and evidence levels.
- `.planning/STATE.md` — reconciled campaign snapshot only.
- `.planning/phases/06-release-hardening-and-public-compatibility-proof/06-RESEARCH.md` — current terms and document research.

### Existing public behavior
- `README.md` — existing public install and configuration guidance.
- `docs/architecture/public-use-boundary.md` — consent and local execution boundary.
- `docs/architecture/threat-model.md` — current threat and residual release gates.
- `src/report-tools.ts` — registered Standard tool names and behavior.
- `src/analytics-report-tools.ts` — registered Analytics tool and incomplete-only contract.
- `src/report-contract.ts` — Standard report contract and provenance types.

</canonical_refs>

<specifics>
## Specific Ideas

Use direct primary-source links for Toast terms. Do not copy Toast terms or
OpenAPI content into the repository. Use only invented placeholders in examples.

</specifics>

<deferred>
## Deferred Ideas

- T6-003 owns package tarball, installed executable, stdio host, signing, and
  publication evidence.
- T5-003-G01 owns a verified complete Analytics result contract.
- Owner-authorized live Standard and Analytics access remain external gates.

</deferred>

---

*Phase: 6-release-hardening-and-public-compatibility-proof*
*Context gathered: 2026-08-27 through autonomous safe defaults*
