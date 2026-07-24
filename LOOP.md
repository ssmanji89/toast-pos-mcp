# LOOP.md

## Objective

Deliver a public, locally run, read-only Toast POS Reporting MCP server that produces deterministic, source-attributed reports without exposing credentials, merchant data, guest PII, or write capabilities.

The server must support operators using their own authorized Toast credentials and must distinguish Standard API reports from Analytics API reports rather than blending unlike metrics.

## Product boundary

### In scope

- Location discovery and capability inspection
- Sales, payments, items, cash, and labor reporting
- Standard API adapters for orders, restaurants, configuration, menus, cash management, and labor
- Analytics API adapters for aggregated sales, checks, labor, menus, payouts, guests only where a non-PII result can be produced, and restaurant information
- Business-date, timezone, closeout-hour, pagination, rate-limit, freshness, and partial-data handling
- Local `stdio` MCP distribution using operator-owned Toast credentials
- Synthetic fixture validation and deterministic report formulas

### Out of scope until separately approved

- Any Toast write operation
- Order placement, payment authorization, inventory updates, or labor updates
- Guest PII and delivery addresses
- A hosted multi-tenant credential-processing service
- Shared project credentials or credential brokerage
- Accounting, tax, payroll filing, or GAAP claims
- Scraping Toast interfaces or redistributing Toast documentation/OpenAPI content

## Phase map

| Phase | Goal | Exit condition |
|---|---|---|
| T0 | Foundation and API research | Product boundary, risks, source map, architecture, and atomic backlog are committed and reviewed |
| T1 | Runtime and Toast transport | Package runs over stdio; credentials, token lifecycle, errors, pagination, and rate limits are fixture-tested |
| T2 | Location and capability model | Accessible locations and scopes are represented explicitly and isolation is proven |
| T3 | Core sales reporting | Deterministic business-date sales, payment, item, and discount reports pass synthetic parity fixtures |
| T4 | Cash and labor reporting | Cash and labor summaries handle closeout, revisions, deletions, tips, breaks, and incomplete data |
| T5 | Analytics API adapter | Analytics reports remain source-distinct, capability-gated, and marked informational/non-GAAP |
| T6 | Public release hardening | Package, documentation, security review, legal/terms checkpoint, install smoke, and release evidence are complete |

## Slice ledger

| Slice | Phase | Description | Depends on | State |
|---|---|---|---|---|
| T0-001 | T0 | Research Toast reporting surface and establish public-use boundary | none | BUILT |
| T1-001 | T1 | Scaffold TypeScript stdio MCP package with synthetic fixture harness | T0-001 CLEAN | OPEN |
| T1-002 | T1 | Load and validate non-persistent runtime configuration | T1-001 | OPEN |
| T1-003 | T1 | Implement OAuth client-credentials token lifecycle | T1-002 | OPEN |
| T1-004 | T1 | Implement HTTP transport, structured errors, rate-limit state, and bounded retries | T1-003 | OPEN |
| T1-005 | T1 | Implement page-token iteration and 409 restart behavior | T1-004 | OPEN |
| T2-001 | T2 | Discover locations and bind all state to restaurant GUID | T1-005 | OPEN |
| T2-002 | T2 | Decode scopes and expose deterministic capability denials | T2-001 | OPEN |
| T3-001 | T3 | Normalize orders, checks, selections, payments, taxes, discounts, and service charges | T2-002 | OPEN |
| T3-002 | T3 | Implement business-date sales and payment summary tools | T3-001 | OPEN |
| T3-003 | T3 | Implement item/category/revenue-center reporting with menu/config cache | T3-002 | OPEN |
| T4-001 | T4 | Implement cash-entry and deposit summaries | T3-003 | OPEN |
| T4-002 | T4 | Implement labor hours, breaks, wages, sales, and tips summaries | T4-001 | OPEN |
| T5-001 | T5 | Implement Analytics API capability and location adapter | T4-002 | OPEN |
| T5-002 | T5 | Implement source-distinct Analytics reporting tools | T5-001 | OPEN |
| T6-001 | T6 | Threat model local distribution and future remote transport | T5-002 | OPEN |
| T6-002 | T6 | Complete Toast terms/branding checkpoint and public documentation | T6-001 | OPEN |
| T6-003 | T6 | Publish installable package with exact-head local validation evidence | T6-002 | OPEN |

## Current slice

### T0-001: Research and public-use foundation

**Acceptance criteria**

- Official Toast sources identify access types, scopes, authentication, rate limits, date semantics, pagination, error behavior, deployment guidance, report recipes, API changes, and terms constraints.
- The initial product is structurally read-only and locally run.
- Standard API and Analytics API remain distinct reporting sources.
- Guest PII, delivery addresses, hosted credential processing, and write operations are explicitly excluded.
- The backlog is sliced so the next builder can implement one complete runtime foundation without inventing product policy.
- DOX check is recorded.

**Evidence**

- Repository root contract: `AGENTS.md`
- API research: `docs/research/toast-api-reporting-landscape.md`
- Architecture decision: `docs/architecture/public-use-boundary.md`
- Operator orientation: `README.md`
- DOX: updated; this slice establishes durable product, safety, architecture, and workflow contracts.

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
- **Artifact:** pull request created from `docs/t0-toast-reporting-foundation`
- **Review lens:** source fidelity, terms boundary, report semantics, scope completeness, and whether T1-001 is genuinely implementable without policy invention
