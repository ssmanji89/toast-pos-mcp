# Toast POS MCP outcome ROADMAP

**Method:** GSD-style outcome planning over the binding `LOOP.md` slice ledger  
**Authority:** `LOOP.md` + GitHub are canonical for atomic state; this ROADMAP is the outcome/verification projection  
**Updated:** 2026-08-16

## How to read this file

A phase is not complete merely because code exists or tests pass. Each phase distinguishes five progressively stronger claims:

1. **Implemented** — source/tests/docs for the bounded behavior exist.
2. **Validated** — the exact head restores authentic locked dependencies and passes the required build/test/package gates on supported runtime floors.
3. **Reviewed** — independent review of the exact artifact reports no required finding.
4. **Wired** — the behavior is reachable through the intended runtime dependency chain; no duplicate stand-in implementation or test-only path substitutes for production wiring.
5. **Empirically proven** — observable behavior is demonstrated at the strongest authorization level currently available, with external/human gates explicitly recorded when live proof is not permissible yet.

`LOOP.md` remains the canonical state machine for `OPEN`, `CLAIMED`, `BUILT`, `FINDINGS`, `FIXED`, `CLEAN`, `MERGED`, and `CLOSED`. This file must not duplicate those mutable states as a second ledger.

## Phase 0 — Product and safety foundation

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

## Phase 1 — Local runtime and Standard transport foundation

### Outcome

One local `stdio` process can load non-persistent configuration, fail closed on missing consent/configuration, acquire OAuth tokens in memory, issue structurally read-only Standard API requests, honor bounded retry/rate-limit behavior, and traverse both Standard pagination families.

### Owning slices

- T1-001 through T1-006 — closed in `LOOP.md`

### Implemented/wired evidence

- process startup → `RuntimeConfig` → OAuth token manager → shared `ToastHttpClient` → local MCP server;
- configuration page-token traversal owns duplicate-token and scoped-409 restart behavior;
- `/ordersBulk` owns Link traversal, bounded query/pageSize/path/+1 integrity checks;
- no Toast reporting tool is yet registered, so transport reachability is internal rather than user-visible.

### Production proof still required

- #32 — verify real Toast `Toast-RateLimit-Reset` semantics before release claims;
- #4 — bounded MCP protocol/stateless/reconnect/cancellation compatibility assessment;
- #17 — migrate the local runtime to stable MCP TypeScript SDK v2 before user-facing T3 tool registration, then re-prove stdio behavior.

---

## Phase 2 — Production authority, location isolation, capability integrity, and provenance

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

- #15 / PR #29, intentionally stacked on #27 while the shared transport repair is open.

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
- #15 provenance and #31 page-fold primitives are available on the same production transport;
- #17 SDK v2 migration is exact-head validated/reviewed;
- #4's protocol compatibility concerns that affect local stdio tool lifecycle/cancellation are either closed or owned by an explicit bounded follow-up;
- all paths use the same runtime identities rather than reconstructed lookalikes.

---

## Phase 3 — Core Standard reporting and real MCP tool wiring

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

## Phase 4 — Cash and labor reporting

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

## Phase 5 — Source-distinct Analytics adapter and tools

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

---

## Phase 6 — Release hardening and public compatibility proof

### Outcome

An installable package can be published with exact-head evidence, current legal/operator documentation, and no unresolved production-compatibility claim masquerading as a test pass.

### 6A — Threat model

Owner: T6-001 — existing, refreshed whenever merged behavior changes trust boundaries.

### 6B — Terms, branding, operator docs

Owner: T6-002.

Required:

- current Toast terms/branding checkpoint;
- clear operator responsibility for authorized credentials/Merchant consent/provider/logging/retention;
- no Toast endorsement/certification implication;
- install/configuration/failure-mode docs match shipped behavior.

### 6C — Package/release

Owner: T6-003.

Required release gates:

- exact-head clean install on supported Node floor and compatibility runtime;
- package dry-run/install smoke from the actual artifact;
- stdio host smoke using the packaged executable;
- #28 Standard location-source live compatibility resolved;
- #32 rate-limit reset-header semantics resolved;
- no unresolved HIGH/BLOCKER review finding;
- package contents contain intended runtime/docs only;
- publication/signing remains a human/external gate when credentials/signing are required.

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
