# Phase 6: T6-003 post-merge release-frontier reconciliation - Research

**Researched:** 2026-08-27 America/Chicago  
**Scope:** Control-plane reconciliation after PR #53  
**Confidence:** HIGH for repository and GitHub facts; HIGH for npm registry facts at the observation time

## Purpose

Reconcile the canonical campaign ledger and its projections after T6-003 merged.
This record does not authorize package publication, signing, live Toast access, or a
release-ready claim.

## Observed facts

| Source | Observed fact | Planning effect |
| --- | --- | --- |
| GitHub PR #53 | PR #53 is `MERGED` into `main` at `f2ea7627c006907b5026079d62b861d8cda52dfe` on 2026-08-27 America/Chicago. | Move T6-003 from `BUILT` to the ledger state `MERGED`. |
| GitHub PR #53 comment | Independent exact-head review is `CLEAN` at `ab1180d76dae139b813b7a8c4aa5bfa903eb02b2`. | Remove the obsolete review-pending statement. Do not invent a new review gate. |
| GitHub PR #53 comment | Post-merge Node 22.22.2 validation passed `npm ci --no-audit --no-fund && npm run check && npm pack --dry-run --json` at merge `f2ea7627`; 43 test files, 411 normal tests, one installed-artifact test, and 151 packaged paths passed. | Record the post-merge local package evidence precisely. |
| `06-VALIDATION.md` | Candidate `d5c47f39321f13c991d2abe6fcf3c035a020c9d2` has matching Node 20.20.2 and 22.22.2 local synthetic package evidence, 151 tar paths, and SHA-256 `2e319e3e13be48907508dc0e3d46b673e6b5721b1021906b3ae4e9d1374f2be0`. | Preserve the candidate facts and distinguish them from post-merge validation. |
| GitHub issue #4 | The first tool request cannot produce handler cancellation with MCP SDK 2.0.0. | Keep #4/T6-003 open. Do not plan a local version upgrade. |
| npm registry | `@modelcontextprotocol/server@2.0.0` and `@modelcontextprotocol/client@2.0.0` are each tagged `latest` at the observation time. | The current registry supplies no local upgrade path for the first-request cancellation gate. Do not alter package files. |
| GitHub issue #28 | Live Standard credential-wide location discovery requires an owner-authorized read-only Standard credential probe. | Keep #28 open as a human and vendor gate. |
| GitHub issue #22 and `AGENTS.md` | Publication, signing, live access, Merchant Data processing, and approval actions remain separate from local engineering evidence. | Keep all release-authority gates explicit. Do not mark T6-003 release-ready or closed. |

## Required control-plane result

`LOOP.md` is authoritative. It must state `MERGED — local synthetic package evidence
and reviewed post-merge evidence recorded; release gates remain open` for T6-003.
The wording must name the merge SHA, CLEAN review SHA, candidate SHA, and the local
evidence boundary. It must not state that local fixtures prove live compatibility,
consent, approval, signing, publication, or legal sufficiency.

`.planning/STATE.md` is a snapshot. It must move its observed `main` to
`f2ea7627c006907b5026079d62b861d8cda52dfe` and project the canonical `MERGED`
state without becoming a second ledger.

`.planning/ROADMAP.md` is an outcome projection. Its Phase 6 package section must
show that local package gates are observed, while each remaining release authority
is still open. It must remove #32 from the remaining-gate list because the campaign
already closed that rate-limit gate.

## Remaining genuine gates

| Gate | Owner or authority | Why local evidence cannot close it |
| --- | --- | --- |
| #4/T6-003 first-tool-request cancellation | MCP SDK vendor or a separately reviewed local runtime correction | MCP SDK 2.0.0 remains the current registry release and does not abort handler request ID zero. |
| T5-003-G01 complete Analytics retrieval contract | Toast vendor documentation or written vendor confirmation | The current official sources conflict on the completed retrieval response shape. |
| #28 live Standard compatibility | Owner-authorized Standard credential and Toast service | Synthetic discovery responses cannot show the configured credential location set or live response scopes. |
| Live Analytics compatibility | Authorized Analytics access plus documented Merchant consent | The body-free local boundary cannot prove live Analytics behavior. |
| Signing and publication | Authorized human with registry and signing authority | Local tarballs do not supply release credentials or signature authority. |
| Brand, Terms, consent, provider, logging, retention, and legal sufficiency | Merchant, operator, Toast, provider, or legal human authority | Repository documentation states duties but cannot grant external approval. |

## Scope boundaries

- Keep T5-003-G01 owned by the Analytics contract work.
- Keep issue #28 owned by the live Standard compatibility probe.
- Do not add or upgrade dependencies. The registry fact is evidence, not authorization
  for a package change.
- Do not publish, sign, call Toast, use credentials, process Merchant Data, or run a
  release command.
- Do not change source code, package metadata, the package lock, tests, or durable
  public product documentation in this control-plane slice.

## Sources

- [GitHub PR #53](https://github.com/ssmanji89/toast-pos-mcp/pull/53) — merge, CLEAN review, and post-merge evidence comments.
- [GitHub issue #4](https://github.com/ssmanji89/toast-pos-mcp/issues/4) — first-request cancellation gate.
- [GitHub issue #22](https://github.com/ssmanji89/toast-pos-mcp/issues/22) — package evidence and human-gated release actions.
- [GitHub issue #28](https://github.com/ssmanji89/toast-pos-mcp/issues/28) — live Standard compatibility gate.
- npm registry query on 2026-08-27: `npm view @modelcontextprotocol/server version dist-tags --json` and `npm view @modelcontextprotocol/client version dist-tags --json`.
- `AGENTS.md`, `LOOP.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, and `06-VALIDATION.md` — repository rules and local evidence.
