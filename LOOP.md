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
| T0-001 | T0 | Research Toast reporting surface and establish public-use boundary | none | FIXED |
| T1-001 | T1 | Scaffold TypeScript stdio MCP package with synthetic fixture harness | T0-001 CLEAN | OPEN |
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

## Current slice

### T0-001: Research and public-use foundation

**Acceptance criteria**

- Official Toast sources identify access types, scopes, authentication, Standard and Analytics rate limits, date semantics, both pagination families, Analytics report-job behavior, error behavior, deployment guidance, report recipes, API changes, and terms constraints.
- The initial product is structurally read-only and locally run.
- Locality is not represented as authorization for AI processing; documented Merchant consent and applicable Toast third-party review remain required.
- Training, fine-tuning, model improvement, and API-derived synthetic training data are prohibited without Toast's prior written approval.
- Standard API and Analytics API remain distinct reporting sources.
- Guest PII, delivery addresses, Analytics guest-payment data, hosted credential processing, and write operations are explicitly excluded.
- The backlog is sliced so the next builder can implement one complete runtime foundation without inventing product policy.
- DOX check is recorded.

**Finding closure evidence**

- `T0-001-R1-F1`: AI and third-party processing are now transport-independent contracts in `AGENTS.md`, the architecture decision, research summary, README operator notice, and this ledger.
- `T0-001-R1-F2`: `/ordersBulk` fixed pagination and configuration page-token pagination are documented separately; T1-006 fixture-proves order traversal before T3.
- `T0-001-R1-F3`: Analytics POST/GET job lifecycle, 202 pending behavior, seven-day GUID expiry, 409 replacement, endpoint/time-range limiter keys, and completeness behavior are documented and isolated in T5-002.
- `T0-001-R1-F4`: Analytics guest-payment data and guest-linked identifiers are removed from the initial scope and remain blocked pending a separately reviewed privacy and terms decision.
- `T0-001-R2-F1`: issue #1 now carries the same transport-independent Merchant-consent, no-training, independently invented fixture, pagination-family, Analytics job/limit, and guest-linked-data contracts as the exact-head repository documents.
- DOX: updated; R2 reconciliation changes the durable GitHub project orientation and workflow record without changing the accepted product boundary.

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

- **Next role:** REVIEWER
- **Slice:** T0-001
- **Review round:** T0-001-R3
- **Artifact:** PR #2 on `docs/t0-toast-reporting-foundation` plus reconciled issue #1
- **Review lens:** verify closure of T0-001-R2-F1 and revalidate exact-head source fidelity, AI/third-party terms boundary, pagination families, Analytics job semantics, guest-data exclusion, and cross-document consistency
