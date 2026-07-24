# LOOP.md

## Objective

Deliver a public, locally run, read-only Toast POS Reporting MCP server that produces deterministic, source-attributed reports without exposing credentials, guest-linked data, or write capabilities.

The server must support operators using their own authorized Toast credentials, must distinguish Standard API reports from Analytics API reports, and must not imply that local transport authorizes AI or third-party processing of Toast Merchant Data.

## Product boundary

### In scope

- Location discovery and capability inspection
- Sales, payments, items, cash, and labor reporting
- Standard API adapters for orders, restaurants, configuration, menus, cash management, and labor
- Analytics API adapters for aggregated sales, checks, labor, menus, payouts, and restaurant information
- Business-date, timezone, closeout-hour, both Toast pagination families, rate-limit, freshness, Analytics report-job, and partial-data handling
- Local `stdio` MCP distribution using operator-owned Toast credentials
- An explicit operator acknowledgment that documented Merchant consent exists before AI processing is enabled
- Independently invented synthetic fixture validation and deterministic report formulas

### Out of scope until separately approved

- Any Toast write operation
- Order placement, payment authorization, inventory updates, or labor updates
- Guest PII, delivery addresses, Analytics guest-payment data, `cardFingerprint`, and other guest-linked payment identifiers
- AI processing of Toast Merchant Data without documented Merchant consent
- Training, fine-tuning, model improvement, evaluation for model improvement, or API-derived synthetic training data without Toast's prior written approval
- A hosted multi-tenant credential-processing service
- Shared project credentials or credential brokerage
- Accounting, tax, payroll filing, or GAAP claims
- Scraping Toast interfaces or redistributing Toast documentation/OpenAPI content

## Phase map

| Phase | Goal | Exit condition |
|---|---|---|
| T0 | Foundation and API research | Product boundary, risks, source map, architecture, and atomic backlog are committed and reviewed |
| T1 | Runtime and Toast transport | Package runs over stdio; consent acknowledgment, credentials, token lifecycle, errors, both pagination families, and rate limits are fixture-tested |
| T2 | Location and capability model | Accessible locations and scopes are represented explicitly and isolation is proven |
| T3 | Core sales reporting | Deterministic business-date sales, payment, item, and discount reports pass synthetic parity fixtures |
| T4 | Cash and labor reporting | Cash and labor summaries handle closeout, revisions, deletions, tips, breaks, and incomplete data |
| T5 | Analytics API adapter | Analytics job transport and source-distinct reports are capability-gated, rate-limited, and marked informational/non-GAAP |
| T6 | Public release hardening | Package, documentation, security review, legal/terms checkpoint, install smoke, and release evidence are complete |

## Slice ledger

| Slice | Phase | Description | Depends on | State |
|---|---|---|---|---|
| T0-001 | T0 | Research Toast reporting surface and establish public-use boundary | none | CLOSED |
| T1-001 | T1 | Scaffold TypeScript stdio MCP package with synthetic fixture harness | T0-001 CLOSED | CLAIMED |
| T1-002 | T1 | Load and validate non-persistent runtime configuration and explicit Merchant-AI-consent acknowledgment | T1-001 | OPEN |
| T1-003 | T1 | Implement OAuth client-credentials token lifecycle | T1-002 | OPEN |
| T1-004 | T1 | Implement HTTP transport, structured errors, rate-limit state, and bounded retries | T1-003 | OPEN |
| T1-005 | T1 | Implement configuration page-token iteration, duplicate-token guards, and scoped 409 restart behavior | T1-004 | OPEN |
| T1-006 | T1 | Implement `/ordersBulk` fixed `page`/`pageSize` and Link-header traversal with termination and duplicate-page guards | T1-005 | OPEN |
| T2-001 | T2 | Discover locations and bind all state to restaurant GUID | T1-006 | OPEN |
| T2-002 | T2 | Decode scopes and expose deterministic capability denials | T2-001 | OPEN |
| T3-001 | T3 | Normalize orders, checks, selections, payments, taxes, discounts, and service charges | T2-002 | OPEN |
| T3-002 | T3 | Implement business-date sales and payment summary tools | T3-001 | OPEN |
| T3-003 | T3 | Implement item/category/revenue-center reporting with menu/config cache | T3-002 | OPEN |
| T4-001 | T4 | Implement cash-entry and deposit summaries | T3-003 | OPEN |
| T4-002 | T4 | Implement labor hours, breaks, wages, sales, and tips summaries | T4-001 | OPEN |
| T5-001 | T5 | Implement Analytics API capability and management-group location adapter | T4-002 | OPEN |
| T5-002 | T5 | Implement Analytics report-job creation/retrieval lifecycle, 202 polling, expiry, 409 replacement, and endpoint/time-range limiters | T5-001 | OPEN |
| T5-003 | T5 | Implement source-distinct Analytics reporting tools excluding guest-payment datasets | T5-002 | OPEN |
| T6-001 | T6 | Threat model local distribution, AI-provider data flow, and future remote transport | T5-003 | OPEN |
| T6-002 | T6 | Complete Toast terms/branding checkpoint and public operator documentation | T6-001 | OPEN |
| T6-003 | T6 | Publish installable package with exact-head local validation evidence | T6-002 | OPEN |

## Completed slice

### T0-001: Research and public-use foundation

- Review rounds: T0-001-R1 through T0-001-R3
- Clean head: `ba3f75efdaf907d61add43550cc3227e83370102`
- Squash merge: `13d0b73d1ecb0aa1abff308b3d558bee7d67b059`
- Owning issue #1 reconciled and remains open as the project umbrella.
- DOX: updated during T0; post-merge closure changes workflow state only.

## Current slice

### T1-001: TypeScript stdio runtime and synthetic fixture harness

**Acceptance criteria**

- An npm package targets Node.js 20 or later and uses ESM TypeScript with strict type checking.
- Runtime dependencies are pinned to the stable MCP TypeScript SDK v1 line and Zod; no v2 SDK or remote transport is introduced.
- The executable starts an MCP server over `stdio`, emits no ordinary output on stdout outside MCP framing, and exposes no Toast data tools before later slices authorize them.
- Server construction is separated from process startup so it can be tested without importing an auto-running entry point.
- A synthetic fixture harness loads only repository-owned files beneath a dedicated synthetic fixture directory and rejects traversal outside that directory.
- At least one clearly synthetic fixture proves the harness without containing Toast credentials, tokens, real merchant data, guest-linked data, or copied Toast payloads.
- Local scripts cover clean build, strict type check, tests, and package dry-run; a single `npm run check` command executes the complete gate.
- Package metadata, ignore rules, source maps, declaration output, and published-file boundaries are explicit; publication remains disabled until T6.
- The README documents local development commands and states that the scaffold does not yet call Toast APIs.
- No GitHub Actions workflow is added.
- Exact commands and results are attached to the PR.
- DOX check is recorded.

**Non-goals**

- Runtime credential configuration or Merchant-consent acknowledgment behavior; T1-002 owns it.
- OAuth or Toast HTTP requests; T1-003 and T1-004 own them.
- Pagination, location discovery, capabilities, report schemas, or report tools.
- Publishing an npm release.

## Handoff rules

1. Derive state from this repository and GitHub, not chat memory.
2. Read `AGENTS.md` and the governing chain before touching a path.
3. One branch and pull request may contain only one atomic slice.
4. Allowed states are `OPEN`, `CLAIMED`, `BUILT`, `FINDINGS`, `FIXED`, `CLEAN`, `MERGED`, `CLOSED`, and `BLOCKED`.
5. A builder moves a claimed slice to `BUILT` only with exact commands and local results. A builder does not self-approve.
6. A reviewer reports stable finding IDs in the form `<slice>-R<round>-F<number>`, with severity, file and line, evidence, impact, and required fix. Reviewers do not modify implementation.
7. A fixer changes only what is necessary to close named findings and records proof for each finding.
8. `CLEAN` applies only to the reviewed exact head. Any head change invalidates `CLEAN` and requires another review round.
9. After three unsuccessful review/fix rounds, return to the coordinator for reslicing or redesign rather than polishing the same mistake indefinitely.
10. Merge only a `CLEAN` exact head. After merge, mark the slice `MERGED`, then `CLOSED` when its acceptance evidence is present on the default branch.
11. Emit a fenced `LOOP.md DELTA` only when a real state transition occurs.
12. Run the DOX check for every slice. Update documentation only for durable changes.

## Next assignment

- **Next role:** BUILDER
- **Slice:** T1-001
- **Base:** current `main`
- **Branch:** `build/t1-001-runtime-foundation`
- **Scope:** implement only the TypeScript stdio runtime and synthetic fixture harness acceptance criteria above
