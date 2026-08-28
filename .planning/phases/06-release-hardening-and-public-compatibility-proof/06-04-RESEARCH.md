# Phase 6 Plan 04 — Public runtime wiring and Standard output schemas

**Researched:** 2026-08-28 America/Chicago
**Scope:** Two confirmed public-release wiring defects only
**Confidence:** HIGH for repository and PR facts

## Confirmed defects

| ID | Evidence | Required correction |
| --- | --- | --- |
| PW-01 | `src/index.ts` creates the process-owned `ApplicationRuntime`, but supplies it to `createServer()` only when `era === "modern"`. The legacy factory therefore creates a server with only `listChanged` capability metadata. Its `tools/list` result is empty and a Standard tool call is denied before the shared report chain can run. | Both retained protocol eras must capture the one startup runtime. Legacy metadata may remain, but it cannot select a tool-free server. |
| PW-02 | `src/report-tools.ts` advertises `baseCompleteOutputSchema` for sales, payment, item, and cash tools, although their handlers can return structurally valid `denied` envelopes. Labor additionally supports an `incomplete` envelope. | Each Standard tool must advertise the same status union that its handler can return, with report-specific literals and validated status-specific required fields. |

The GSD integration audit evidence supplied with this assignment confirms these
two defects. It does not identify an Analytics completion defect, a package
metadata defect, or a release-authority change.

## Production chain

```text
stdio request (legacy 2025 or pinned modern 2026)
  -> serveStdio(factory) in src/stdio.ts
  -> factory in src/index.ts
  -> createServer({ runtime, era metadata })
  -> registerStandardReportTools(server, same ApplicationRuntime)
  -> input validation and ctx.mcpReq.signal
  -> capability/location/Toast transport/page fold
  -> deterministic report or explicit denied/incomplete envelope
  -> declared tool output schema and MCP response
```

`ApplicationRuntime` owns the process configuration, OAuth token manager,
location registry, rate-limit state, transport, and report dependencies.
Creating or substituting a legacy-specific runtime would violate the runtime
identity and location/provenance rules in `AGENTS.md`.

## Existing evidence and useful seams

- `test/server.test.ts` already starts `dist/index.js` and performs raw legacy
  JSON-RPC initialization. Its current assertion accepts a tool-free legacy
  surface, so it must become a regression proof for the real executable.
- `test/fixtures/installed-artifact-fetch-preload.ts` already installs only
  invented fetch responses before `src/index.ts` constructs its runtime. Its
  default Standard path proves the credentials, location, restaurant header,
  business date, and Orders response chain without live Toast access.
- `test/report-tools-e2e.test.ts` and its support module already prove explicit
  denial and labor-incomplete behavior, report cancellation, and the absence
  of fabricated totals using synthetic fixture processes.
- `src/report-tools.ts` already passes `ctx.mcpReq.signal` to every Standard
  report builder. The repair must retain that exact signal path and the
  existing report provenance fields.

## Output-contract mapping

| Tool | Handler result statuses | Required output-schema branches |
| --- | --- | --- |
| `toast_sales_summary` | `complete`, `denied` | Sales complete and sales denied |
| `toast_payment_summary` | `complete`, `denied` | Payment complete and payment denied |
| `toast_item_sales_summary` | `complete`, `denied` | Item complete and item denied, including the requested dimension |
| `toast_cash_summary` | `complete`, `denied` | Cash complete and cash denied |
| `toast_labor_summary` | `complete`, `incomplete`, `denied` | Labor complete, labor incomplete, and labor denied |

Every branch must require the common Standard envelope facts: schema version,
source family, exact report literal, business-date fields, generation time,
formula notes, and warnings. Complete and incomplete branches must retain their
existing report facts and provenance. Denied branches must require the denial
object and scope arrays, while preserving optional location-context fields for
fail-closed errors that occur before a location is resolved. Unknown future
Toast enum values remain data, not an output-schema reason to reject a complete
report.

## Constraints and non-goals

- Retain `private: true`, current signing and publish metadata, and the exact
  package lock. This slice adds no dependency and changes no publication state.
- Keep #4/T6-003 first-tool-request cancellation open. The plan proves and
  preserves nonzero active-request cancellation only.
- Keep T5-003-G01 body-free. This work does not add a complete Analytics body,
  parser, report claim, or schema branch.
- Keep #28, live Standard compatibility, live Analytics compatibility, signing,
  publication, consent, Terms, and brand approvals as external gates.
- Use invented test data only. Do not load credentials, Merchant Data, or live
  Toast endpoints.

## Package legitimacy audit

No package is installed, added, upgraded, removed, or published by this slice.
The existing committed lockfile is restored only for validation. No package
legitimacy checkpoint is required.

## Validation requirements

1. Start the compiled production executable under both retained MCP eras with
   an external invented-fetch preload. Prove list and Standard call behavior
   through the real `serveStdio(factory)` path.
2. Prove a complete response includes Standard source and provenance facts.
   Prove an inaccessible selected location returns the existing denied envelope
   and no report total.
3. Prove the published JSON-schema unions accept each real handler status and
   reject a mismatched report/status/required-field combination.
4. Run a fresh isolated mutation harness. It must catch legacy runtime removal,
   runtime recreation or omission, dropped request-signal propagation, dropped
   provenance, and each removed or widened Standard output-schema branch.
5. Validate the unchanged candidate under Node 20.20.2 and Node 22.22.2 using
   authenticated registry-backed `npm ci --no-audit --no-fund`, then `npm run
   check`, the focused public-wiring suite, and the mutation harness.
6. Create a PR for one exact candidate SHA. Record commands, runtime versions,
   discovered test counts, mutation results, changed paths, `DOX: updated`, and
   retained gates. Obtain a fresh independent exact-head review before merge.
