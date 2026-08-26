# Phase 1: Local runtime and Standard transport foundation - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning
**Source:** GSD autonomous infrastructure-phase synthesis

<domain>
## Phase Boundary

This phase verifies the merged local MCP v2 stdio runtime and Standard transport foundation. It does not rebuild T1-001 through T1-006 or add reporting tools. It closes or explicitly carries the remaining evidence gates in GitHub issues #4 and #32.

</domain>

<decisions>
## Implementation Decisions

### Existing implementation
- Treat T1-001 through T1-006 and PR #24 as merged implementation evidence.
- Use GitHub and `LOOP.md` as the atomic state authority.
- Do not replace authentic Node 20 and Node 22 execution with validation doubles.

### Protocol compatibility gate
- Scope issue #4 to local stdio behavior only.
- Verify initialization, capability negotiation, independent requests, process restart, reconnect, cancellation, and deterministic missing-state failure.
- Keep Streamable HTTP, remote listeners, and hosted transport out of scope.

### Rate-limit semantics gate
- Accept only current official Toast documentation or sanitized owner-authorized live evidence for issue #32.
- Do not infer `Toast-RateLimit-Reset` semantics from another vendor or header naming.
- Current official Toast documentation resolves the absolute-reset contract and names the `X-Toast-*` fields.
- PR #37 already owns the `X-Toast-*` header repair, hierarchy, tests, and documentation. Rebase, validate, review, and merge that PR. Do not duplicate its implementation in a new Phase 1 branch.
- Close issue #32 only after PR #37 lands with exact-head evidence.

### Publication claim
- Do not mark the package publish-ready from Phase 1 evidence.
- Preserve explicit separation between implemented, validated, reviewed, wired, and externally proven claims.

### the agent's Discretion
- Select the smallest protocol test additions or documentation corrections needed to close issue #4.
- Select the exact evidence format for issue #32 closure after PR #37 merges.

</decisions>

<canonical_refs>
## Canonical References

### Repository authority
- `AGENTS.md` — binding safety, architecture, validation, and GSD bridge rules.
- `LOOP.md` — authoritative slice ledger and exact historical evidence.
- `.planning/ROADMAP.md` — Phase 1 outcome and production-proof projection.
- `.planning/STATE.md` — non-authoritative campaign snapshot that must be reconciled.

### GitHub gates
- `https://github.com/ssmanji89/toast-pos-mcp/issues/4` — local protocol compatibility assessment.
- `https://github.com/ssmanji89/toast-pos-mcp/issues/32` — Toast rate-limit reset semantics.
- `https://github.com/ssmanji89/toast-pos-mcp/pull/24` — merged MCP v2 runtime evidence.

</canonical_refs>

<specifics>
## Specific Ideas

- Reuse the real child-process stdio executable and official MCP clients for protocol proof.
- Record exact executable heads, Node versions, discovered test counts, package checks, and reviewer disposition.
- Keep all Toast fixtures independently invented and synthetic.

</specifics>

<deferred>
## Deferred Ideas

- User-facing Standard report tools belong to Phase 3.
- Remote Streamable HTTP needs a separate threat model and authorization design.
- Live Toast evidence needs owner authorization and applicable Merchant consent.

</deferred>

---

*Phase: 01-local-runtime-and-standard-transport-foundation*
*Context gathered: 2026-08-26 via GSD autonomous infrastructure-phase synthesis*
