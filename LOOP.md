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
| T1-001 | T1 | Scaffold TypeScript stdio MCP package with synthetic fixture harness | T0-001 CLOSED | CLOSED |
| T1-002 | T1 | Load and validate non-persistent runtime configuration and explicit Merchant-AI-consent acknowledgment | T1-001 CLOSED | FINDINGS |
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

None. T1-001 is closed and merged. T1-002 is open on PR #5 with a blocking finding; see below.

### T1-001: TypeScript stdio runtime and synthetic fixture harness — CLOSED

- Review rounds: `T1-001-R1` through `T1-001-R4`
- Clean head: `d460dfc2ada6a644a4dc219312b0ccaa9eb36447`
- Squash merge: `acc8096170383195dc9af249d47aa8371c2233bb`
- Acceptance evidence verified on `main` at the declared Node floor: `npm ci` exit 0, `npm run check` exit 0, 2 test files discovered, 7 of 7 passing on Node 20.20.2.
- DOX: no durable change in the fix rounds; build tooling and package metadata only.

**Findings closed**

- `T1-001-R1-F1`, `T1-001-R1-F2`: symlink-escape coverage and a bounded stdio handshake with deterministic cleanup.
- `T1-001-R2-F1`: no lockfile was committed, so `npm ci` failed from a clean checkout.
- `T1-001-R2-F2`: `package.json` declared `UNLICENSED` while the repository ships Apache-2.0.
- `T1-001-R2-F4`: the test script enumerated compiled test files by hand, so a new test file silently did not run while the gate still exited 0.
- `T1-001-R3-F1`: the F4 fix passed a quoted glob to `node --test`, which only expands globs on Node 22 and later, so the gate failed outright on the declared Node 20 floor.
- `T1-001-R3-F2`: the committed lockfile still recorded the pre-fix license value.

**Findings withdrawn**

- `T1-001-R2-F3`: alleged ledger divergence from GitHub. Unsupported; the ledger was accurate.

**Repository-hygiene finding, resolved out of band**

- `T1-001-R2-S1`: two instructions pointed at npm and pnpm package bytes hosted in unrelated third parties' GitHub repositories, framed as cache-archive workarounds for a failing registry mirror. The `tmp/pnpm-transfer` branch was deleted and the provenance-probe comment on PR #3 was replaced with a repudiation. Originals archived offline. No package bytes from those sources were ever fetched or installed.

**Verification lessons carried forward — these cost two extra rounds**

1. Verify the gate on the floor declared in `engines.node`, not only on the locally installed Node. A fix validated solely on Node 25 broke Node 20 completely and became a blocking finding.
2. A green gate is not proof that tests ran. Read the discovered-file count and the total test count. Three independent review lenses, one of them performing mutation testing, all missed `F4` because they verified that existing tests were sound and none verified that a new test file would be discovered.
3. Never attach simulated, reconstructed, or validation-double results as gate evidence. If the gate cannot run, say so. That substitution occurred during the R1 fix round and became part of a blocking finding.

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

- **Next role:** FIXER
- **Slice:** T1-002
- **Finding:** `T1-002-R1-F1` (HIGH, blocking)
- **Artifact:** PR #5 on `build/t1-002-runtime-configuration`
- **Required fix:** `clientId` and `clientSecret` are stored as ordinary enumerable properties with redaction bolted onto `toJSON` and `util.inspect.custom` only. An adversarial probe leaked the raw secret through `Object.entries`, `Object.values`, spread, `Object.assign`, `structuredClone`, `for...in`, and `inspect` with `customInspect: false`. `AGENTS.md` rule 2 states redaction is not a substitute for avoiding capture. Encapsulate the values so generic enumeration, spreading, cloning, and serialization structurally cannot reach them, and extend the tests to cover every access pattern in that probe rather than the two happy paths.
- **Also required:** rebase onto the merged `main`. Take the base's `node scripts/run-tests.mjs` test script and drop this branch's enumerated file list entirely; all three compiled test files are then discovered automatically.
- **After the fix:** review round `T1-002-R1` reruns before T1-003 begins. T1-003 consumes these exact credential values, so the encapsulation must land first.
