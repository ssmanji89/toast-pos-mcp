# Phase 5: Source-distinct Analytics adapter and tools - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning
**Mode:** Autonomous decisions from the approved public product contract

<domain>
## Phase Boundary

Phase 5 adds a capability-gated Analytics adapter and source-distinct reporting.
The first slice, T5-001, adds separate Analytics authority and management-group
restaurant discovery only. It does not add Analytics report jobs or MCP tools.

</domain>

<decisions>
## Implementation Decisions

### Authority and isolation

- **D-01:** Use separate optional Analytics credentials and a separate token
  manager. Never use Standard credentials as an Analytics fallback.
- **D-02:** Require `enterprise-metrics:read` before every Analytics request.
  A denied preflight must make zero Analytics business-data requests.
- **D-03:** Keep Analytics management-group restaurant authority separate from
  `ToastLocation`, `connectionScopes`, and the Standard location registry.

### Request safety and privacy

- **D-04:** T5-001 allows only the literal `GET /era/v1/restaurants-information`
  operation. It sends no Standard restaurant header.
- **D-05:** Do not represent, construct, fixture, or fetch guest-payment paths
  or guest-linked fields, including `cardFingerprint`.
- **D-06:** Keep a closed Analytics operation type. Do not create a generic
  no-header or arbitrary-path transport primitive.

### Slice and evidence boundary

- **D-07:** T5-001 creates a validated immutable management-group restaurant
  registry and canonical selected-set validation for later job callers.
- **D-08:** T5-002 owns report POST/GET lifecycle, polling, expiry, 409
  replacement, and endpoint/time-range limiter policy.
- **D-09:** T5-003 owns MCP tools, Analytics reports, and stdio wiring.
  T5-001 must not register a tool or claim live compatibility.

### the agent's Discretion

Use existing TypeScript, Zod, immutable publication, cancellation, and
secret-safe error patterns. Select local environment variable names that do
not conflict with the Standard contract, then document the new local contract.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and release boundaries

- `AGENTS.md` — binding read-only, privacy, location isolation, capability,
  source separation, and evidence rules.
- `LOOP.md` — authoritative slice order and external release gates.
- `.planning/ROADMAP.md` §Phase 5 — outcome, ownership, and wiring proof.
- `.planning/STATE.md` — snapshot of closed work and external gates.

### Analytics contract and research

- `.planning/phases/05-source-distinct-analytics-adapter-and-tools/05-RESEARCH.md`
  — verified T5-001 scope, endpoint, risks, and test seams.
- `docs/research/toast-api-reporting-landscape.md` §Analytics API reporting —
  product source boundary and lifecycle ownership.
- `docs/architecture/public-use-boundary.md` §Analytics report jobs —
  privacy, isolation, and source-label contract.
- `docs/architecture/threat-model.md` §Analytics adapter risks — rate-limit
  and read-only structural constraints.

### Existing implementation patterns

- `src/config.ts`, `src/auth.ts`, `src/runtime.ts` — secret-safe configuration,
  token ownership, runtime freshness, and cancellation composition.
- `src/capabilities.ts`, `src/locations.ts`, `src/transport.ts` — capability,
  atomic validated registry, and closed request primitives.
- `test/capabilities.test.ts`, `test/locations.test.ts` — guard and registry
  test patterns.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- The Standard config and token-manager patterns provide secret-safe ownership.
- Location discovery provides strict Zod validation and atomic immutable publication.
- Capability tests prove denial and location-isolation behavior.

### Established Patterns

- Standard and Analytics sources must remain separate.
- Every retained authority object includes bounded provenance and freshness.
- Cancellation must reach deferred identity and source calls.

### Integration Points

- T5-001 may compose optional Analytics authority into the runtime.
- It must not alter Standard report-tool registration or report calculation.

</code_context>

<specifics>
## Specific Ideas

The Analytics account location universe is credential-scoped. Do not invent a
management-group GUID when the source does not provide one. Bind later state to
private Analytics credential identity and the canonical validated restaurant set.

</specifics>

<deferred>
## Deferred Ideas

- Analytics job creation, polling, expiry, and replacement belong to T5-002.
- Analytics MCP tools and informational/non-GAAP presentation belong to T5-003.
- Live Analytics compatibility remains an owner-authorized external release gate.

</deferred>

---

*Phase: 05-source-distinct-analytics-adapter-and-tools*
*Context gathered: 2026-08-27*
