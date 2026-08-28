# Toast POS MCP outcome ROADMAP

**Method:** GSD-style outcome planning over the binding `LOOP.md` slice ledger  
**Authority:** `LOOP.md` + GitHub are canonical for atomic state; this ROADMAP is the outcome/verification projection  
**Updated:** 2026-08-28

## v1.0 — Public local Toast reporting MCP

- [x] **Phase 0: Product and safety foundation**
- [ ] **Phase 1: Local runtime and Standard transport foundation**
- [ ] **Phase 2: Production authority, location isolation, capability integrity, and provenance**
- [x] **Phase 3: Core Standard reporting and real MCP tool wiring**
- [x] **Phase 4: Cash and labor reporting**
- [ ] **Phase 5: Source-distinct Analytics adapter and tools**
- [ ] **Phase 6: Release hardening and public compatibility proof**

## How to read this file

A phase is not complete merely because code exists or tests pass. Each phase distinguishes five progressively stronger claims:

1. **Implemented** — source/tests/docs for the bounded behavior exist.
2. **Validated** — the exact head restores authentic locked dependencies and passes the required build/test/package gates on supported runtime floors.
3. **Reviewed** — independent review of the exact artifact reports no required finding.
4. **Wired** — the behavior is reachable through the intended runtime dependency chain; no duplicate stand-in implementation or test-only path substitutes for production wiring.
5. **Empirically proven** — observable behavior is demonstrated at the strongest authorization level currently available, with external/human gates explicitly recorded when live proof is not permissible yet.

`LOOP.md` remains the canonical state machine for `OPEN`, `CLAIMED`, `BUILT`, `FINDINGS`, `FIXED`, `CLEAN`, `MERGED`, and `CLOSED`. This file must not duplicate those mutable states as a second ledger.

## Phase 0: Product and safety foundation

**Goal:** Establish the reviewed public-use, security, data-processing, and deterministic-report contract.

### Outcome

A public, local, structurally read-only Toast reporting MCP has a reviewed product boundary, source map, architecture, privacy/AI-processing constraints, and deterministic-report contract.

### Owning slices

- T0-001 — closed in `LOOP.md`
- T6-001 — threat model built/closed out of sequence

### Production evidence

- read-only/write exclusions are structural repository rules, not UI policy;
- guest-linked data is excluded;
- Merchant consent and no-training requirements are explicit;
- Standard and Analytics sources remain separate;
- business-date/timezone/completeness rules are durable architecture requirements.

### Residual gates carried forward

- current Toast terms/branding checkpoint remains T6-002;
- live access compatibility cannot be inferred from synthetic fixtures.

---

## Phase 1: Local runtime and Standard transport foundation

**Goal:** Prove the local MCP v2 stdio runtime and read-only Standard transport across supported Node versions and unresolved external semantics.

### Outcome

One local `stdio` process can load non-persistent configuration, fail closed on missing consent/configuration, acquire OAuth tokens in memory, issue structurally read-only Standard API requests, honor bounded retry/rate-limit behavior, and traverse both Standard pagination families.

### Owning slices

- T1-001 through T1-006 — closed in `LOOP.md`
- #32 / PR #37 — closed with exact-head rate-limit evidence
- #4 / PR #45 — merged as `4a069937` after CLEAN review at `a406b479`; local stdio lifecycle, reconnect, and nonzero-ID cancellation evidence is complete. Issue #60 owns the separate first-tool-request T6-003 release gate.

### Implemented/wired evidence

- process startup → `RuntimeConfig` → OAuth token manager → shared `ToastHttpClient` → local MCP server;
- #17 / PR #24 migrated the runtime to stable MCP v2 and proved legacy 2025 plus 2026-07-28 stdio clients on Node 20 and Node 22;
- configuration page-token traversal owns duplicate-token and scoped-409 restart behavior;
- `/ordersBulk` owns Link traversal, bounded query/pageSize/path/+1 integrity checks;
- official legacy and modern clients prove sequential and concurrent requests on one retained process and clean process restart;
- an official modern client proves handler-observed cancellation and same-process reuse through a synthetic test-only handler after a nonzero request ID;
- a first-tool-request fixture records that MCP SDK 2.0.0 does not abort handler request ID `0`;
- PR #40 and PR #41 register and prove the Standard reporting tools through the production stdio boundary; Phase 3 cancellation evidence covers report handlers and page-fold paths.

### Production proof still required

- #60/T6-003 — resolve first-tool-request handler cancellation through an SDK correction or separately reviewed local runtime correction before release claims;
- Phase 3 cancellation — merged report handlers and Toast page-fold paths now have production-chain cancellation evidence; retain the distinct #60 first-tool-request handler gate;
- #28 and Phase 6 — retain owner-authorized live Standard compatibility, terms, packaging, signing, and publication gates.

---

## Phase 2: Production authority, location isolation, capability integrity, and provenance

**Goal:** Complete one location-bound authority, capability, cancellation, page-fold, rate-limit, and provenance chain before report registration.

### Outcome

Before a report tool can attempt Toast data retrieval, the runtime has one coherent credential/location authority, one capability decision model, and provenance-preserving transport primitives. No JWT claim, management-group membership, fixture convenience, or cached state is mistaken for production authorization.

### Workstreams

#### 2A — Production-shaped location authority

Owners:

- #16 / PR #27 — rebuild T2-001 location discovery against credential-wide connection discovery plus restaurant-scoped detail hydration;
- #28 — live Standard-credential compatibility gate for the credential-wide discovery source.

Exit behavior:

- `RuntimeConfig` identity owns the location registry;
- retained location context is immutable and minimized to report-critical fields;
- per-restaurant connection scopes travel with the selected location;
- no management-group-wide fallback invents access to restaurants not selected for the credential;
- partial hydration never replaces a previously complete registry;
- unsupported credential-wide discovery fails explicitly.

Validation:

- exact-head Node 20/22 gates;
- 30/30 enumerated location-source guards mutated and caught;
- credential-scoped transport mutations caught;
- #28 remains an explicit T6 release gate until real Standard credential evidence resolves Toast's contradictory documentation.

#### 2B — Capability authority

Owner:

- T2-002 / PR #12.

Required final model:

`eligible scopes = current token provisioned scopes ∩ selected ToastLocation.connectionScopes`

then apply product exclusions and explicit source/capability denials.

Exit behavior:

- token/JWT display metadata is never treated as sufficient restaurant authorization;
- no duplicate restaurant-scope cache exists in capability code;
- unknown/open scope strings survive safely;
- guest-linked excluded scopes remain structurally denied;
- same `RuntimeConfig`/restaurant identity is used by location and capability paths.

#### 2C — Successful transport provenance

Owner:

- #15 / PR #29 — merged and closed on `main` as `afdffee57a43207bc045b08e2be1eae2e6d4bd23`.

Exit behavior:

- retained successful pages expose local retrieval timestamp and successful Toast request ID when supplied;
- failed retry IDs never contaminate later success metadata;
- configuration 409 restart discards stale body and stale metadata together;
- legacy body-only callers remain compatibility projections over one request path;
- transport does not invent report record counts or completeness semantics.

#### 2D — Bounded raw-page memory

Owner:

- #31.

Exit behavior before T3 report tools:

- report-oriented `/ordersBulk` consumption validates/normalizes/folds pages sequentially;
- raw page retention is bounded independently of total historical page count;
- existing Link/retry/rate-limit/provenance invariants are reused, not copied;
- consumer failure/cancellation stops further fetches;
- no incomplete fold is labelled complete.

### Phase 2 exit gate

Phase 2 is ready for user-facing T3 tool registration only when:

- #16 is CLEAN/merged and T2-002 is rebased onto the corrected location authority;
- #15 provenance is merged; #31 page-fold primitives remain required on the same production transport;
- #17 SDK v2 migration is exact-head validated, independently reviewed, merged, and closed;
- #4's protocol compatibility work is closed; #60 owns the explicit bounded first-tool-request cancellation release follow-up;
- all paths use the same runtime identities rather than reconstructed lookalikes.

---

## Phase 3: Core Standard reporting and real MCP tool wiring

**Goal:** Deliver deterministic Standard sales, payment, item, and dimension reports through the real stdio MCP boundary.

**Status:** CLOSED on `main`. T3-001 merged as `1ab7cb7`, T3-002 as
`291cda2`, and T3-003 as `e0effdb`. The merged evidence proves the local
production chain against synthetic fixtures. It does not satisfy live Toast,
first-tool-request cancellation (#60/T6-003), signing, or publication gates.

### Outcome

An MCP client can call real read-only Standard API reporting tools through the production process and receive deterministic, source-attributed, business-date-correct results with explicit completeness/freshness/provenance.

### 3A — Orders normalization

Owner:

- T3-001 / issue #18.

Required behavior:

- validated normalization of orders, checks, selections, payments, taxes, discounts, service charges, refunds/void lifecycle, and unresolved references;
- money stored/calculated in integer minor units using selected location currency context;
- quantities remain decimal quantities rather than being conflated with money;
- recursive modifiers handled without arbitrary fixed nesting depth;
- evolving Toast enum values preserved as open strings;
- business-date semantics remain restaurant-local and source-provided where authoritative;
- raw guest-linked/unneeded fields do not enter normalized report state.

Verification beyond unit tests:

- page-fold input → normalized records → deterministic aggregate fixtures;
- lifecycle adversarial fixtures including deleted/voided/refunded/revised records;
- unresolved configuration references surface explicitly rather than disappearing.

### 3B — Sales and payment report tools

Owner:

- T3-002 / issue #19.

Required production chain:

`stdio MCP request`
→ tool input validation
→ same startup `RuntimeConfig`
→ selected/discovered `ToastLocation`
→ capability preflight
→ same shared `ToastHttpClient`
→ bounded/page-folded `/ordersBulk`
→ normalization
→ deterministic report calculation
→ provenance/completeness envelope
→ MCP response

No handler may recreate auth, HTTP, pagination, location state, or capability state as a private shortcut.

Empirical wiring proof:

- child-process stdio client discovers the registered tools;
- a synthetic transport-backed end-to-end invocation traverses the production handler chain, not a direct report-function test;
- capability denial, source-unavailable, pagination failure, malformed source data, and cancellation each fail closed through the MCP boundary;
- success output includes source, restaurant GUID, business date/timezone/closeout context, retrieval provenance, page/record counts, exclusions/warnings, and completeness.

### 3C — Item/category/revenue-center reports

Owner:

- T3-003.

Required behavior:

- item/category/revenue-center aggregation over normalized orders;
- configuration/menu cache explicitly restaurant-scoped and freshness-labelled;
- missing/old configuration references remain unresolved identifiers rather than dropped records;
- no raw-record dump becomes the default MCP interface.

### Phase 3 exit gate

A real MCP host can invoke the Standard reporting surface over stdio using the production dependency graph, and the output's completeness/provenance can be traced back to actual retained source pages. Tests alone do not satisfy this gate.

---

## Phase 4: Cash and labor reporting

**Goal:** Deliver deterministic cash and labor reports with business-date, revision, deletion, wage, tip, break, and completeness handling.

### Outcome

Cash and labor tools produce deterministic, location/business-date-aware summaries with the same authority/provenance/fail-closed contracts as T3.

### 4A — Cash

Owner: T4-001.

Required source behavior:

- cash entries/deposits by business date;
- reversals, no-sales, deposits, payouts/reasons, drawer context;
- partial or inaccessible source data never collapses to zero.

### 4B — Labor

Owner: T4-002.

Required source behavior:

- time entries, breaks, jobs, wages, orders-derived sales/tips;
- null hourly wage/salaried semantics preserved;
- no invented overtime multiplier/wage calculation where Toast does not provide enough information;
- employee-identifying data minimized; aggregate outputs default.

### Wiring proof

Cash/labor MCP calls use the same location/capability/transport/provenance primitives and are invoked through stdio child-process integration tests, not direct calculators only.

---

## Phase 5: Source-distinct Analytics adapter and tools

**Goal:** Deliver capability-gated Analytics job transport and source-distinct reporting without guest-payment data or accounting claims.

### Outcome

Analytics access is capability-gated, management-group/location-set isolated, rate-limited by its own endpoint/method/time-range rules, and never silently substituted for Standard API calculations.

### 5A — Capability/location adapter

Owner: T5-001.

### 5B — Report-job lifecycle

Owner: T5-002.

Required behavior:

- POST creates `reportRequestGuid`;
- GET retrieves;
- 202 pending bounded polling;
- seven-day expiry/404 handling;
- 409 creates a new request within a bounded replacement budget;
- limiter key includes method/dataset/time range/credential/location-set identity;
- pending/expired/exhausted jobs cannot become empty successful reports.

### 5C — Analytics reporting tools

Owner: T5-003.

Required behavior:

- distinct `toast_analytics_*` namespace;
- source marked `analytics_api`;
- informational/non-GAAP labeling;
- guest-payment datasets and `cardFingerprint` excluded at the request layer, not fetched-then-filtered.

### Wiring proof

MCP invocation exercises real Analytics adapter/job state/provenance through stdio with synthetic upstream fixtures; source-distinctness is visible to the caller.

### Current evidence and blocking gate

PR #51 merged the one fixed `toast_analytics_metrics_day` MCP path. The path
uses the production stdio runtime, separate Analytics identity, capability,
selection, fixed Metrics/day lifecycle, and structured MCP response. It is
body-free and incomplete-only. It does not parse or publish a completed
Analytics response.

T5-003-G01 remains open. The current official OpenAPI and retrieval guide
conflict about the retrieval response top-level shape. A corrected current
OpenAPI or written vendor confirmation is required before a complete result
contract can be designed, implemented, or claimed. Synthetic evidence does not
close live Analytics compatibility.

---

## Phase 6: Release hardening and public compatibility proof

**Goal:** Produce a publishable artifact only after legal, operator, live-compatibility, packaging, security, and end-to-end evidence gates pass.

### Outcome

An installable package can be published with exact-head evidence, current legal/operator documentation, and no unresolved production-compatibility claim masquerading as a test pass.

### 6A — Threat model

Owner: T6-001 — existing, refreshed whenever merged behavior changes trust boundaries.

### 6B — Terms, branding, operator docs

Owner: T6-002.

Status: closed on `main` by PR #52. The current public documentation names the
six registered tools, records the observed Terms date and direct link, and
separates implemented behavior, synthetic validation, and external gates. It
does not grant or claim Toast, legal, Merchant, provider, or publication
approval.

Required:

- current Toast terms/branding checkpoint;
- clear operator responsibility for authorized credentials/Merchant consent/provider/logging/retention;
- no Toast endorsement/certification implication;
- install/configuration/failure-mode docs match shipped behavior.

### 6C — Package/release

Owner: T6-003.

**Observed local package evidence:** T6-003 is MERGED through PR #53 at
`f2ea7627c006907b5026079d62b861d8cda52dfe`. Candidate
`d5c47f39321f13c991d2abe6fcf3c035a020c9d2` restored the committed lockfile
and passed `npm run check` on Node 20.20.2 and Node 22.22.2. The candidate's
real tarballs had 151 paths and SHA-256
`2e319e3e13be48907508dc0e3d46b673e6b5721b1021906b3ae4e9d1374f2be0`. An
empty consumer used the installed package bin for MCP 2026-07-28 negotiation,
tool discovery, an invented Standard schema-version-1 `complete` envelope,
and the constrained body-free Analytics `denied` envelope. Independent review
was CLEAN at `ab1180d76dae139b813b7a8c4aa5bfa903eb02b2`. Post-merge Node
22.22.2 passed committed restore, full check, and package dry-run with 43
discovered files, 411 normal tests, one installed-artifact test, and 151 paths.

**Observed public-runtime repair evidence:** PR #55 is MERGED on `main` at
`bcd819fb7c423d4e19274448417829b9821173ee`. It proves the compiled 2025
legacy and pinned 2026 stdio processes use one `ApplicationRuntime`, and it
proves Standard output schemas cover complete, denied, and labor-incomplete
results. Node 20.20.2 and 22.22.2 candidate gates each passed committed
restore, `npm run check` (414 normal tests plus one installed-artifact test),
35 focused compiled tests, and 14 caught mutations. GitHub has no independent
final exact-head review for metadata head
`db1270e963850aef3fb5bbb5c6fad402fdb212e2`; that review is
unverified/pending. Post-merge Node 22.22.2 passed
`source /Users/sully/.nvm/nvm.sh && nvm use 22.22.2 && npm ci --no-audit
--no-fund && npm run check`: 43 discovered test files, 414 normal tests, and
one installed-artifact test. Reviewer-pending disposition: pending. Current
GitHub evidence cannot satisfy the `AGENTS.md` independent exact-head review
requirement for this merged PR. This is synthetic code and local validation
evidence only. It does not update package-release evidence or external
authority.

**Observed validation and nested-schema evidence:** Plan 06-05 / PR #58 is
MERGED on `main` at `69f4052302dd27c1dd6ed92ff406c78d3c5f5a3c` from candidate
`9403bff75b677a97bcceae244efa755bee91778b`. Node 20.20.2 and Node 22.22.2
candidate gates each restored the committed lockfile and passed 43 discovered
test files, 415 normal tests, one installed-artifact test, package dry-run, 41
focused documentation/runtime/schema tests, and all 25 isolated compiling
behavioral mutations. The candidate retained open Toast-derived strings and
the intentionally extensible `dimensionContext` while making fixture-proved
fixed nested records strict. An independent agent recorded CLEAN for that
candidate. GitHub currently records no PR #58 review, so the
GitHub-attributable exact-head review remains reviewer-pending. Post-merge
Node 22.22.2 passed committed restore and `npm run check` at the merge SHA:
43 discovered test files, 415 normal tests, and one installed-artifact test.
This is local synthetic validation evidence. It does not close formal
requirements coverage, PR #55 GitHub-attributable review, or any release gate.

**Observed requirements-control evidence:** Plan 06-06 / PR #63 is MERGED on
`main` at `b61d6ee5f479861e40f6ebe4eb0b4a7caa533d61` from candidate
`9fb060b24819a0373465675fc63c1e4c15ee130d`. The independent findings-only
review comment recorded CLEAN for that exact candidate. GitHub reports
`reviews: []` for PR #63. This means GitHub records no attributable approval;
the comment is independent findings-only review evidence, not approval.
Post-merge Node 22 passed `npm run check` with 431 normal tests and one
installed-artifact test. The structural audit passed. This is merged local
control-plane evidence only.

This is MERGED local synthetic package evidence. It is not publication
readiness, live compatibility, consent, approval, signing, or legal
sufficiency.

**Remaining external, vendor, and human gates:**

- #60/T6-003 first-tool-request cancellation remains open. The npm registry
  reports `@modelcontextprotocol/server@2.0.0` and
  `@modelcontextprotocol/client@2.0.0` as current latest releases, so no local
  MCP dependency-upgrade path exists. Actual compiled stdio evidence records
  legacy `initialize` ID 0 then first `tools/call` ID 1, while pinned modern
  `2026-07-28` records first `tools/call` ID 0. Plan 06-07 uses the corrected
  contract: modern ID 0 is the defect proof; legacy ID 1 is regression proof.
  Plan 06-08 retains cleanup, registration, mutation, Node 20/22, and
  independent exact-head review gates. Candidate `3818c36dc2a9eb67d45fb25d88393c77af6d621c`
  completed both Node 20 and Node 22 gates, including 12 isolated mutations per
  runtime. The independent exact-head review remains pending.
- T5-003-G01 requires a corrected Toast retrieval contract or written vendor
  confirmation before a complete Analytics result contract can be claimed.
- #28 requires owner-authorized live Standard evidence for credential-wide
  location discovery.
- Live Analytics compatibility requires authorized access and documented
  Merchant consent under `AGENTS.md`.
- Formal Phase 06 requirements inventory, evidence matrix, required-leaf
  manifest, and deterministic structural audit are merged local evidence.
  PR #63 has an independent findings-only CLEAN comment for its exact candidate,
  but GitHub `reviews: []` means no GitHub-attributable approval exists. This
  does not close any external gate.
- GitHub-attributable independent review remains pending for PR #55 and PR #58.
- Signing and publication require authorized human credentials.
- Terms, brand, consent, provider, logging, retention, and legal sufficiency
  require the applicable external or human authority.

DOX: updated.

---

## Cross-phase decision register

These assertions may not silently become facts:

| Decision / assumption | Required empirical owner |
|---|---|
| Standard credentials can use credential-wide Partners location discovery and receive exactly their selected location set | #28 |
| `Toast-RateLimit-Reset` is an absolute epoch rather than a relative delta | #32 |
| Large `/ordersBulk` histories are safe to process without retaining all raw pages | #31 |
| MCP SDK v2 local stdio lifecycle/cancellation/reconnect behavior matches the intended product runtime | #17 + #4 |
| Token provisioned scopes are restaurant-authoritative | **Rejected**; T2-002 must intersect with location connection scopes |
| Management-group membership proves Standard credential access to every restaurant | **Rejected**; no group-wide fallback |
| A passing aggregate test count proves every security/integrity guard ran | **Rejected**; enumerate/mutate guards explicitly |
| Transport success implies report completeness | **Rejected**; adapters/report layer own source validation, record count, and completeness status |
| Local stdio makes AI processing automatically permitted | **Rejected**; Merchant consent/provider requirements remain external obligations |

## Autonomous EXECUTE/VERIFY rule

When a slice is blocked by a genuinely external gate, autonomous execution moves to another dependency-ready workstream **only if** doing so does not create a hidden dependency or merge hazard. Shared-file work may be stacked explicitly on the exact owning branch. Blocked evidence is recorded; it is never replaced with simulated dependency/runtime proof.
