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
| T1-002 | T1 | Load and validate non-persistent runtime configuration and explicit Merchant-AI-consent acknowledgment | T1-001 CLOSED | CLOSED |
| T1-003 | T1 | Implement OAuth client-credentials token lifecycle | T1-002 CLOSED | CLOSED |
| T1-004 | T1 | Implement HTTP transport, structured errors, rate-limit state, and bounded retries | T1-003 CLOSED | CLOSED |
| T1-005 | T1 | Implement configuration page-token iteration, duplicate-token guards, and scoped 409 restart behavior | T1-004 CLOSED | CLAIMED |
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

### T1-002: Non-persistent runtime configuration and Merchant-AI-consent acknowledgment — CLOSED

- Review rounds: `T1-002-R1` through `T1-002-R3`
- Clean head: `d360dad8b136d7045505c5502497be2a8eb5a7b3`
- Merge commit: `353a125` — merged with a merge commit, not a squash, to preserve the T1-003 stack
- Acceptance evidence verified on `main` at the declared Node floor: `npm ci` exit 0, `npm run check` exit 0, 3 test files discovered, 31 of 31 passing on Node 20.20.2 and 22.22.2.
- DOX: updated (README runtime-configuration section)

**Findings closed**

- `T1-002-R1-F1` (HIGH): `clientId` and `clientSecret` were ordinary enumerable properties with redaction attached only to `toJSON` and `util.inspect.custom`. An adversarial probe leaked the raw secret through seven idioms — `Object.entries`, `Object.values`, spread, `Object.assign`, `structuredClone`, `for...in`, and `inspect` with `customInspect: false`. Fixed by holding credentials in a module-private `WeakMap` keyed by the frozen config object's identity, reachable only through `getRuntimeConfigCredentials`. The redaction overrides were removed entirely — nothing remains on the object to redact. Mutation-tested: reintroducing enumerable credentials fails 2 of 31 tests.
- `T1-002-R2-F1` (HIGH): PR #3 was squash-merged, creating a `main` commit with no ancestry to the branch, which orphaned this stacked pull request. A real merge produced add/add conflicts on `src/index.ts` where a hand resolution could have silently dropped the `loadRuntimeConfig()` fail-closed gate. Fixed by rebasing the nine slice commits `--onto main` and retargeting the pull request base. Verified byte-identical across all owned files before and after.

**Constraint recorded for T1-003 and later**

`src/index.ts` discards `loadRuntimeConfig()`'s return value, and credential lookup is identity-keyed through a `WeakMap`. The config object validated at startup is therefore unreachable afterward and eligible for collection almost immediately. A later slice cannot recover it — it must call `loadRuntimeConfig()` itself, or `index.ts` must be restructured to thread one reference through. A clone or lookalike fails closed with a clear error rather than silently.

**Merge-strategy rule for the rest of the chain**

Squash-merging a base branch orphans any pull request stacked on it. While slices remain stacked, merge with a merge commit, or rebase and retarget every stacked pull request immediately after each squash.

### T1-003: OAuth client-credentials token lifecycle — CLOSED

- Review rounds: `T1-003-R1` (two lenses: secret material, correctness) and `T1-003-R2`
- Clean head: `eba703e5e39ae562ef962d7008109ec01744b208`
- Merged with a merge commit, not a squash, to preserve the T1-004 stack
- Acceptance evidence on `main` at the declared Node floor: `npm ci` exit 0, `npm run check` exit 0, 4 test files discovered, 42 of 42 passing on Node 20.20.2 and 22.22.2
- DOX: updated (README, plus an original implementation note in the research doc)

**Findings closed**

- `T1-003-R1-S1` (MEDIUM): the fetch call was not wrapped, so a rejecting transport propagated its raw error verbatim — a stubbed rejection carrying a marker reached the caller's `message`. Fixed by normalizing into `ToastAuthError` with a `token_request_network_error` code and no interpolation of the caught value. Verified no marker reaches `message`, `code`, `stack`, `cause`, or any inspected surface; `cause` is never attached.
- `T1-003-R1-F1` (WARNING): `expiresIn` had no ceiling, so `Number.MAX_SAFE_INTEGER` cached a token as permanently valid and silently defeated the refresh contract. Fixed with an inclusive 86,400-second ceiling. Rejection rather than clamping was chosen deliberately: Toast documents no maximum, and rule 11 favors surfacing an implausible value loudly over silently clamping one the client cannot verify.
- `T1-003-R1-F2`, `F3` (WARNING): missing coverage for concurrent in-flight rejection and for expiry boundaries. Both added, using a real deferred promise rather than a synchronously-rejecting stub.
- `T1-003-R1-F4` (WARNING): the response shape had no documented basis. Recorded as an original implementation note, explicitly not sourced from Toast documentation.
- `T1-003-R1-F5`: commit granularity. Coordinator decision — the existing commit was not rewritten, because rewriting history for a style precedent is not worth the lineage risk on a stacked branch. Fix work landed as six atomic commits, restoring the pattern.

**Verified properties, mutation-confirmed**

Deduplication coalesces concurrent callers to a single fetch (50 concurrent calls produced one). A rejected in-flight promise is cleared in `finally`, so later calls retry rather than returning a permanently-rejected cached promise. Expiry is seconds times 1000 with an injectable clock. An HTTP error status carrying a token-shaped body is rejected before the body is parsed. The bearer token is unreachable across an eleven-pattern probe — native `#` private fields, structurally stronger than the WeakMap pattern used in `config.ts`.

Three mutations were applied and all were caught: removing the try/catch, raising the ceiling, and removing the in-flight clearing each failed tests.

**Follow-up carried forward**

No test asserts the accepted side of the expiry ceiling — that `expiresIn: 86400` succeeds. Confirmed working by direct probe. Add the assertion when `auth.ts` is next touched.

**Note for T1-004**

`auth.ts` is not wired into `index.ts` or `server.ts`. T1-004 owns that wiring along with the data-endpoint transport. Remember that `index.ts` discards `loadRuntimeConfig()`'s return and credential lookup is identity-keyed, so a consumer must load its own config.

### T1-004: HTTP transport, structured errors, rate-limit state, and bounded retries — CLOSED

- Review rounds: `T1-004-R1` (two lenses: retry/rate-limit correctness, transport safety) and `T1-004-R2`
- Clean head: `03ee8cb27d30d3e7750e580a43c600a394008477`
- Merged with a merge commit to preserve the T1-005 stack
- Acceptance evidence on `main` at the declared Node floor: 5 test files discovered, 64 of 64 passing on Node 20.20.2 and 22.22.2
- DOX: updated (README and the research doc)

This was the most defect-dense slice so far — two blockers and six warnings, all reproduced empirically rather than inferred.

**Blockers closed**

- `T1-004-R1-F1`: the authorization header was acquired inside the `headers` literal within the fetch `try`, so a throwing token manager produced a `retryable: true` network error with zero fetch calls. Permanent credential failures were retried to the ceiling under a message claiming the request failed before a response — the exact class rule-based retry policy forbids retrying. Fixed by acquiring the header before the try and failing closed with a non-retryable `token_acquisition_failed`.
- `T1-004-R1-F2`: server-derived delays were never clamped. `Retry-After: 86400` produced two 24-hour sleeps, and a stored far-future reset blocked the next unrelated call for a day — an indefinite hang in a local stdio process. Fixed with a `maxRateLimitWaitMs` ceiling applied in both the retry sleep and the pre-flight wait, failing closed with `rate_limit_wait_exceeded` past it.
- `T1-004-R1-S1`, also reported as `F7`: rate-limit state was keyed by API family and limiter key only, never by restaurant GUID — a rule 6 violation. Reproduced live: location A's exhausted quota blocked a different restaurant for 30 seconds. The research documents these Standard API limits as per client per location, so account-wide treatment was unsupported. Fixed by binding the state key to the GUID structurally.

**Warnings closed**

`F3` HTTP-date `Retry-After` was silently ignored, causing immediate retries against a still-limited endpoint. `F4` the rate-limit-reset epoch-versus-delta assumption was undocumented; now recorded as an original implementation note. `F5` and `F6` were coverage gaps proven vacuous by mutation — adding `401` to the retryable set left all 50 tests passing, and removing the retry-ceiling check also passed.

**Verification standard established by this slice**

Test-reading failed twice here. Every fix round from now on must self-mutation-check each new test — break the implementation, confirm the test fails — and report each result. R2 independently re-applied all five mutations and confirmed every one is now caught.

**Bounded worst case**

A single `getJson` call incurs at most one pre-flight wait plus two retry sleeps, each clamped, for a bounded worst case of roughly 45 minutes. In practice any single oversized value trips `rate_limit_wait_exceeded` immediately.

**Carried forward to T5**

The 15-minute wait ceiling is scoped to the Standard API, whose longest documented window is the global 10,000-request-per-15-minute bucket. Analytics limits can legitimately require longer waits — metrics jobs are documented around 10 requests per hour. The Analytics adapter must not reuse this constant unmodified.

**Also carried forward**

The expiry-ceiling assertion noted at T1-003 remains open: no test asserts that `expiresIn: 86400` is accepted. Add it when `auth.ts` is next touched.

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
- **Slice:** T1-005 — Implement configuration page-token iteration, duplicate-token guards, and scoped 409 restart behavior
- **Base:** `main`
- **Scope:** `Toast-Next-Page-Token` traversal for configuration endpoints, guards against a repeated or looping page token, and 409 restart behavior scoped specifically to page-token configuration reads. Build on the `ToastHttpClient` delivered by T1-004 rather than issuing requests directly.
- **Non-goals:** `/ordersBulk` fixed-page and Link-header traversal (T1-006); location discovery and capabilities (T2); normalization and report tooling (T3 onward); the Analytics job lifecycle (T5). Register no Toast data tool.
- **Must honor:** rule 6 — page state is location-scoped and must be bound to restaurant GUID, exactly as rate-limit state now is. Reuse the established error-sanitization discipline: no interpolation of caught values, no `cause` attachment, no upstream body in any error.
