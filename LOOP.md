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
| T1-005 | T1 | Implement configuration page-token iteration, duplicate-token guards, and scoped 409 restart behavior | T1-004 CLOSED | CLOSED |
| T1-006 | T1 | Implement `/ordersBulk` fixed `page`/`pageSize` and Link-header traversal with termination and duplicate-page guards | T1-005 CLOSED | CLOSED |
| T2-001 | T2 | Discover locations and bind all state to restaurant GUID | T1-006 CLOSED | CLOSED |
| T2-002 | T2 | Decode scopes and expose deterministic capability denials | T2-001 CLOSED | CLOSED |
| T3-001 | T3 | Normalize orders, checks, selections, payments, taxes, discounts, and service charges | T2-002 | OPEN |
| T3-002 | T3 | Implement business-date sales and payment summary tools | T3-001 | OPEN |
| T3-003 | T3 | Implement item/category/revenue-center reporting with menu/config cache | T3-002 | OPEN |
| T4-001 | T4 | Implement cash-entry and deposit summaries | T3-003 | OPEN |
| T4-002 | T4 | Implement labor hours, breaks, wages, sales, and tips summaries | T4-001 | OPEN |
| T5-001 | T5 | Implement Analytics API capability and management-group location adapter | T4-002 | OPEN |
| T5-002 | T5 | Implement Analytics report-job creation/retrieval lifecycle, 202 polling, expiry, 409 replacement, and endpoint/time-range limiters | T5-001 | OPEN |
| T5-003 | T5 | Implement source-distinct Analytics reporting tools excluding guest-payment datasets | T5-002 | OPEN |
| T6-001 | T6 | Threat model local distribution, AI-provider data flow, and future remote transport | T0-001 CLOSED (built out of order) | CLOSED |
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

PR #39 is the next dependency-safe pre-T3 slice. It must preserve the merged rate-limit hierarchy while adding request-local Standard cancellation. PR #34 normalization repair proceeds independently in its own worktree.

### Pre-T3 MCP SDK v2 gate — CLOSED

- Owning issue / PR: #17 / PR #24.
- Reviewed source head: `5b355dce83576b65e1f2ff43d51aa9d56ab0b10c`.
- Squash merge: `4bcb2a5ada264beffde97804f43daa69893f93cd`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 7 test files and 132 tests passed on each runtime. `npm pack --dry-run --json` passed with 31 package files.
- Independent exact-head review: CLEAN. The runtime uses stable MCP v2 server and stdio packages only. The test-only client remains outside production imports.
- DOX: updated.

### T2-001 production location-source repair — CLOSED

- Owning issue / PR: #16 / PR #27.
- Reviewed source head: `cc804083f8954e3bc30bc2dbf898a1ff8ceb8e3d`.
- Squash merge: `bde1546c89825e9435b274f3f49ef02f266cb65c`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 9 test files and 165 tests passed on each runtime. `npm pack --dry-run --json` passed with 31 package files.
- Negative verification: all 30 location-schema mutations and all 5 Partners transport mutations failed their focused test. No mutation survivor remained.
- Independent exact-head review: CLEAN. The live Standard-credential compatibility gate remains issue #28; no local fixture result closes it.
- DOX: updated.

### T2-002 capability preflight — CLOSED

- Owning PR: #12.
- Reviewed source head: `9b665757ac814878b7565c6154c983e02dbd198f`.
- Squash merge: `0a72aeae2ab22c06626cf40d19d6f7756d7192ed`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 11 test files and 176 tests passed on each runtime. `npm pack --dry-run --json` passed with 35 package files.
- Independent exact-head review: CLEAN. JWT scope decoding stays bounded and token-safe. Eligible capability scopes equal the selected location connection scopes intersected with token-provisioned scopes, less product-excluded guest scopes.
- Scope: internal capability preflight only. No reporting tool or user-facing MCP capability response is registered by this slice.
- DOX: updated.

### T3 transport success provenance prerequisite — CLOSED

- Owning issue / PR: #15 / PR #29.
- Reviewed source head: `346034f9ef19724f346b93ea7165dbd22a865d73`.
- Squash merge: `afdffee57a43207bc045b08e2be1eae2e6d4bd23`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 12 test files and 186 tests passed on each runtime. `npm pack --dry-run --json` passed with 35 package files.
- Independent exact-head review: CLEAN after immutable API-family and credential-or-restaurant request scope were added to every detailed success result.
- Scope: internal transport provenance only. No report tool is registered by this slice.
- DOX: updated.

### Bounded `/ordersBulk` page fold prerequisite — CLOSED

- Owning issue / PR: #31 / PR #35.
- Reviewed source head: `859535730cd3f8cc06778e685ffacce44fe07629`.
- Squash merge: `ca02850f6a052ffe0ec68bf3ce7679176b08bd85`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 14 test files and 195 tests passed on each runtime.
- Independent exact-head review: CLEAN. The page consumer remains sequential, bounded, cancellation-aware, and additive to the accepted transport.
- Owning issue #31 is closed with exact-head and post-merge evidence.
- Scope: internal bounded page consumption only. No report tool is registered by this slice.
- DOX: updated.

### Current Toast rate-limit hierarchy prerequisite — CLOSED

- Owning issue / PR: #36 and verification issue #32 / PR #37.
- Reviewed source head: `7053df064d491e38b75e9a9cb4f6dd488f215860`.
- Squash merge: `793784e69bb538624ef5b0281abd9ab25481a25e`.
- Authentic post-merge verification: Node 20.20.2 and Node 22.22.2 both passed `npm ci --no-audit --no-fund && npm run check`; 18 test files and 217 tests passed on each runtime. Package dry-run contained 47 files.
- Mutation verification: all 13 named hierarchy, header, isolation, wait, abort, queue, runtime-wiring, and open-token mutations were caught. No survivor remained.
- Independent exact-head review: CLEAN. The shipped runtime now uses the rate-limit-aware client. Current `X-Toast-*` observations remain separate from legacy endpoint-local compatibility waits.
- Structured PR evidence: https://github.com/ssmanji89/toast-pos-mcp/pull/37#issuecomment-5431345857. Issues #32 and #36 are closed; issue #32 carries the identical gate object.
- Scope: Standard transport coordination only. Live Toast compatibility and cross-process coordination remain external release gates.
- DOX: updated.

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

### T1-005: Configuration page-token iteration — CLOSED

- Review rounds: `T1-005-R1` (two lenses) and `T1-005-R2`
- Clean head: `1b5a33d13c99efb8c7667fa6ec92376164ed7dfc`
- Merged with a merge commit to preserve the T1-006 stack
- Acceptance evidence on `main` at the declared Node floor: 5 test files discovered, 73 of 73 passing on Node 20.20.2 and 22.22.2
- The safety lens returned CLEAN with zero findings, having re-probed and mutation-tested all five T1-004 regression points through the refactored `#requestJson`.

**Findings closed**

- `F1`: the loop guard compares tokens by exact string, so tokens differing only by case were treated as progress. Resolved by DOCUMENTING rather than normalizing — folding case on an opaque base64 or base64url cursor risks silently merging two genuinely distinct cursors and dropping pages with no error, which is worse than the degraded-but-fail-closed alternative. A case-varying loop now fails via `configuration_page_bound_exceeded` instead of `configuration_page_token_repeated`; both fail closed.
- `F2`: `nextToken === pageToken` was dead code, always implied by the set membership check. Removed; cycle detection verified intact.
- `F4`: `maxRestarts` had a floor but no ceiling. `MAX_ALLOWED_CONFIGURATION_RESTARTS = 10` now enforced at both the constructor and the per-call override, throwing before any fetch rather than clamping.
- `F5`: the composed worst case is now documented in code — `maxPages × maxAttempts × (maxRestarts + 1)` = 600 raw fetch calls with defaults.

**Carried forward — F3 materialization**

`getConfigurationPagesJson` materializes up to 100 page bodies before returning. Judged acceptable at the transport layer, since this slice registers no MCP tool and the accumulation is bounded rather than unbounded. But it moves the "prefer aggregate tools over raw-record dumping" obligation one layer up. **The constraint must land on whichever T2 or T3 slice first wraps this in an MCP tool response.**

### T6-001: Threat model — BUILT OUT OF ORDER, in review

Built ahead of its declared T5-003 dependency. That dependency is a delivery convention: a threat model depends on the architecture and product boundary, both committed and reviewed in T0, and it touches no source file so it cannot conflict with code slices building in parallel.

The build corrected two claims that had been asserted about this codebase:

1. "Rate-limit **and configuration page state** bound to restaurant GUID" was half wrong at the time — rate-limit state is GUID-bound, but no configuration page-token code existed on `main` while T1-005 was unmerged. Documentation must reflect what is merged, not what is in flight.
2. "Structurally GET-only" is scoped to `transport.ts`. `auth.ts` issues its own POST to the auth endpoint, correct layer separation, and **T5-002's Analytics adapter will require POST**. GET-only is a property of the data transport, not a permanent shape of the system.

**Design gap recorded, deliberately not fixed**

The Merchant-AI-consent acknowledgment is validated at startup in `index.ts` but is **not threaded into `server.ts`'s tool-registration surface**. Nothing depends on it today because zero tools are registered. The first slice to register a tool must deliberately re-derive consent rather than inheriting it from existing plumbing. Whichever T3 slice registers the first tool owns closing this.

### T6-001: Threat model — CLOSED, built out of ledger order

- Review rounds: `T6-001-R1` and `T6-001-R2`
- Clean head: `115a7be`; deliverable is `docs/architecture/threat-model.md`
- Built ahead of its declared T5-003 dependency. That dependency was a delivery convention: a threat model depends on the architecture and product boundary, both closed in T0, and it touches no source file so it cannot conflict with code slices building in parallel.

**Two corrections it produced about this codebase**

1. A control was asserted that did not exist — configuration page state bound to restaurant GUID — because the asserting party was reasoning about an unmerged branch as if it were `main`. Documentation must reflect what is merged.
2. "Structurally GET-only" is scoped to the data transport in `transport.ts`. `auth.ts` issues its own POST to the auth endpoint, correct layer separation, and **T5-002's Analytics adapter will require POST**. GET-only is not a permanent shape of the system.

Then, during its own review, `main` moved and the document's accurate claim that configuration pagination did not exist became false. The fix round re-verified against the rebased head. **A threat model describing a control as absent when it exists is as misleading as one claiming a control that does not** — both directions require re-verification after any rebase.

**Findings closed**

- `F1`: the supply-chain section omitted the current audit result. Now records 2 moderate advisories, both `GHSA-frvp-7c67-39w9` in `@hono/node-server` reached transitively through the MCP SDK, **with a traced reachability determination** — `src/` imports only `server/stdio.js` and `server/mcp.js`, neither imports `hono`, and `@hono/node-server` is reached only from `server/streamableHttp.js`. Not reachable today, recorded with a tracking plan. Severity alone would have been noise.
- `F2`: missing threat class — credential and consent revocation. `auth.ts` caches a bearer token for up to 24 hours with no revocation re-check, so a revoked credential leaves a usable token for that window; an eventual 401 lands on `request_failed`, not `token_acquisition_failed`. **Consent withdrawal is worse and is recorded separately: the consent gate is a startup check, so a mid-session withdrawal is never observed at all.**
- `F3`: missing threat class — over-scoped operator credential. Scope is configured in Toast Web, outside this repository's control, and no scope-narrowing parameter exists at request time. GUID binding scopes requests and cache keys; it cannot narrow what the credential is authorized for.
- `F4`: an error-field enumeration was incomplete.

**Open items this document now carries**

The Analytics wait-ceiling note for T5, the `expiresIn: 86400` assertion gap from T1-003, the consent-threading gap that the first tool-registering slice must close, and the two unreachable-today advisories.

### T1-006: `/ordersBulk` Link-header traversal — CLOSED. **PHASE T1 COMPLETE.**

- Review rounds: `T1-006-R1` (two lenses, both independently finding the same blocker) and `T1-006-R2`
- Clean head: `42cf4b1`; 109 tests on `main` at the declared Node floor
- Merged with a merge commit

**BLOCKER — the Link `next` parser silently truncated orders reports**

The regex required the entire header segment to be exactly `<url>; rel="value"` — quoted, rel-only, rel-first. Everything else was silently dropped, and an absent `next` means "pagination complete." Six RFC 8288-legal forms truncated after page 1 with no signal: unquoted `rel=next`, `Rel="Next"`, `REL="NEXT"`, an extra parameter after `rel`, a parameter before `rel`, and both malformed shapes.

**Two of those are ordinary spec-compliant headers, not corrupted input.**

The deeper defect was that no code path distinguished "Link present but unparseable" from "Link absent." A better parser alone would have moved the silent-truncation boundary rather than removing it. The fix adds a real RFC 8288 parser AND fails closed with `pagination_integrity_failed` when a header is present but unparseable — the distinction the contract in `public-use-boundary.md` always required.

Verified post-fix across the full matrix, including cases beyond the original findings: commas and semicolons inside quoted values, escaped quotes, multiple separate `Link` headers, relative URLs, `rel="prev next"` multi-relation lists, and whitespace variations. All parse correctly; malformed shapes throw.

**Warnings closed**

`F2` four duplicate-detection guards were dead code — removed individually and together, all 70 tests still passed, because the `+1` increment invariant already covered them. `F3` path and pageSize preservation guards were real but entirely untested. `F4` `maxPages` had no ceiling; now defaults to 100 with a ceiling of 1000 that throws rather than clamping. `S2` and `S3` were coverage gaps where T1-004 regressions and the secret probe never routed through the new entry point. `T1-006-R2-F1` closed the same gap for `getConfigurationPagesJson`.

**The merge between two independent refactors was the real risk**

T1-005 and T1-006 each refactored the shared JSON GET internal for the same reason — pagination needing header access. The fix unified them into one `#requestJson` returning `{ body, headers, url }`. All five T1-004 regression probes were then re-run against the **merged** result on all three entry points, and T1-005's page-token traversal, duplicate-token guard, scoped 409 restart, and restart ceiling were all re-verified.

Both branches' reviewers had verified those fixes on their own branch. That is not the same claim as surviving the merge. **Record this as a standing rule: when two branches independently refactor the same function, re-run the affected regression probes against the merged result, not against either branch.**

**Note carried into T2 and T3:** 409 is not uniformly a one-fetch terminal status. On configuration page-token traversal it correctly takes a second fetch before `configuration_page_restart_exceeded`, because it is the scoped-restart trigger. Any test asserting uniform non-retryable behavior across entry points is wrong.

### T2-001: Location discovery and GUID binding — CLOSED

- Review rounds: `T2-001-R1` (two lenses) and `T2-001-R2`
- Clean head: `67d986a`; 128 tests on `main` at the declared Node floor
- Isolation, secret material, data minimization, and fail-closed ordering were all verified CLEAN with empirical proof in R1 and reverified in R2.

**BLOCKER — `timeZone` was carried but never validated**

The schema was `z.string().min(1)`. `"Not/AZone"`, `"-05:00"`, and free text were all silently accepted and stored. Rule 8 makes restaurant timezone the foundation of every business-date calculation from T3 onward, so a bad zone would have surfaced much later inside a report calculation rather than at the one point it could be checked cheaply.

**The fix uncovered a version-dependence worth recording permanently.** `Intl.DateTimeFormat` alone is NOT sufficient: Node 20 rejects `"-05:00"`, while Node 22, 24, and 25 all ACCEPT it via the TC39 offset-timezone extension. A bare `Intl` guard would therefore have passed this project's gate on its declared floor while silently accepting fixed offsets for every operator on a newer runtime. The shipped guard pairs an offset-designator regex with the `Intl` probe, and mutation proves the regex is load-bearing: removing it produces zero failures on Node 20 and one targeted failure on Node 22.

Verified accepting: deprecated aliases `US/Central` and `Asia/Calcutta`, which are real zones Toast could return for older records — an over-strict guard would have failed closed on legitimate restaurants. Also verified that `Etc/GMT+5` and similar are not falsely caught by the offset regex.

**The enumerated mutation requirement proved itself on first use**

The builder reported six mutations with six caught. That was accurate for the six it chose, and two reviewer-mandated mutations survived anyway. The fix round then enumerated **16 guards** and mutated each: 12 caught, **4 survived** — GUID format, non-empty name, `closeoutHour` integer check, and non-empty restaurants array — all closed with new tests.

Self-selected mutation sampling skews toward guards you were already thinking about. Enumerate first, then mutate every item.

**Also closed:** `closeoutHour` bounds were correct but untested, with `0` now asserted by strict value rather than truthiness; the `location_response_invalid` path had no sanitization test; and the threat model was updated for shipped location discovery.

**Documentation staleness, closed at merge**

The threat model went stale twice during this slice — once because `main` moved mid-review, and once again roughly thirty seconds after the fix head was committed, when T1-006 merged. Refreshed at merge time rather than mid-round. **When a document makes claims about what is merged, refresh it at merge, not when the fix is written.**

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

- **Next slice:** PR #39 — Standard request cancellation.
- **Required action:** replay only the three cancellation-owned commits onto `main` at `793784e69bb538624ef5b0281abd9ab25481a25e`, then run Node 20/22 exact-head validation, the complete cancellation mutation matrix, and an independent review.
- **Parallel slice:** PR #34 remains FINDINGS at `08b892033d0534c7b0faa91669e4708c7be83931`; applied-tax identity, fixed-hundredths naming, canonical decimal, and module-size findings must close before another exact-head review.
- **After the pre-T3 stack:** rebase PR #40 only after its prerequisite chain lands. Then run the full stdio-to-structured-response proof and a new exact-head review.
