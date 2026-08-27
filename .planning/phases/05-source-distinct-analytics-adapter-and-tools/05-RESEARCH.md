# Phase 5: Source-distinct Analytics Adapter and Tools - Research

**Researched:** 2026-08-27  
**Domain:** Read-only Toast Analytics API authority, management-group restaurant discovery, and capability preflight  
**Confidence:** MEDIUM

## Summary

T5-001 must create a separate Analytics authority boundary. Toast documents that Analytics uses separate credentials, requires `enterprise-metrics:read`, and returns restaurant information for the management group associated with the Analytics account. The Standard runtime's token, Partners location registry, and `connectionScopes` do not prove Analytics authority. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] [VERIFIED: src/capabilities.ts]

The safe T5-001 output is an internal, capability-gated adapter that can authenticate with an explicitly separate Analytics credential pair and read only `/era/v1/restaurants-information`. It validates and retains a minimal immutable management-group restaurant set. It does not create Analytics jobs, poll them, retrieve datasets, normalize metrics, register MCP tools, or expose a report result. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] [VERIFIED: LOOP.md]

The adapter must structurally prohibit the Analytics guest-payment route family before any request is possible. Guest payment data is linked to a payment card and can include `cardFingerprint`; filtering a response is too late. The adapter must also keep its credential, token, rate-limit, location-set, and future job state separate from the Standard path. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html] [VERIFIED: AGENTS.md]

**Primary recommendation:** Implement a narrow `AnalyticsAccessAdapter` for T5-001. It performs only Analytics scope preflight and the allowlisted management-group restaurant-information GET. It returns a capability decision plus a normalized selected restaurant set for future T5 slices.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Analytics credential and token ownership | API / Backend | — | Analytics credentials are separate from other Toast credentials. The local server owns only in-memory authentication state. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [VERIFIED: AGENTS.md] |
| Analytics capability decision | API / Backend | — | The server checks `enterprise-metrics:read` before the allowlisted Analytics read. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] |
| Management-group restaurant registry | API / Backend | Database / Storage — | Toast returns restaurant GUID, name, and status for the management group associated with the Analytics account. T5-001 retains this process-local authority set. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] |
| Future Analytics job creation and retrieval | API / Backend | — | The Analytics API uses POST to create a request and GET to retrieve it. T5-002 owns that lifecycle. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [VERIFIED: ROADMAP.md] |
| MCP report presentation | API / Backend | Browser / Client — | T5-003 owns the source-labelled, informational report tools. T5-001 must not register one. [VERIFIED: ROADMAP.md] |

## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| T5-001 | Implement Analytics API capability and management-group location adapter. | Separate Analytics credential authority, `enterprise-metrics:read` preflight, minimal validated `/era/v1/restaurants-information` registry, and request-layer guest-route deny list. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] |

## Project Constraints (from AGENTS.md)

- Keep the server read-only. Analytics POST creates a report request, but T5-001 makes no POST. [VERIFIED: AGENTS.md] [CITED: https://doc.toasttab.com/doc/devguide/apiOverview.html]
- Keep all credentials, tokens, raw request bodies, and real Merchant Data out of logs, fixtures, snapshots, outputs, and repository history. Use invented fixture data only. [VERIFIED: AGENTS.md]
- Exclude Analytics guest-payment data, `cardFingerprint`, guest PII, delivery addresses, and any guest-linked payment identifier at the request layer. [VERIFIED: AGENTS.md]
- Keep Standard and Analytics adapters, source labels, rate-limit state, and report semantics separate. Do not use a management-group list as Standard location authority. [VERIFIED: AGENTS.md] [VERIFIED: docs/architecture/standard-location-discovery-compatibility.md]
- Fail closed for absent scope, inaccessible location, malformed source, stale authority, cancellation, or upstream failure. Do not create fabricated empty data. [VERIFIED: AGENTS.md]

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|---|---:|---|---|
| TypeScript | 6.0.3 | Typed adapter, capability contract, and synthetic tests | The repository already uses strict TypeScript for source and tests. [VERIFIED: package.json] |
| Node.js | >=20 | Local runtime and built-in test runner | This is the declared package floor. [VERIFIED: package.json] |
| Zod | 4.4.3 | Validate and minimize Analytics restaurant-information responses | Existing adapters validate source payloads before retaining facts. [VERIFIED: package.json] [VERIFIED: src/locations.ts] |
| Existing OAuth manager pattern | repository implementation | In-memory token lifecycle for a separately configured Analytics credential | The existing OAuth implementation protects credentials from serialization and is the required analogue, not a new package. [VERIFIED: src/auth.ts] [VERIFIED: src/config.ts] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| Separate Analytics capability context | Prove `enterprise-metrics:read` for an Analytics token | Before the sole T5-001 Analytics request and all later Analytics requests. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] |
| `AnalyticsAccessAdapter` | Narrow source-distinct allowlist and normalized management-group location registry | T5-001 only. It must not be a generic no-header transport. [VERIFIED: AGENTS.md] [VERIFIED: src/transport.ts] |
| Separate Analytics rate-limit coordinator | Isolate Analytics endpoint/method/time-range limits from Standard state | T5-001 restaurant-information GET and later T5-002 job traffic. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [VERIFIED: LOOP.md] |
| Node test runner and synthetic fetch harness | Unit and controlled integration evidence | All T5-001 behavior. [VERIFIED: scripts/run-tests.mjs] [VERIFIED: test/fixtures/stdio-report-server.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Separate Analytics authority | Reuse Standard token, capability, Partners registry, or `connectionScopes` | Do not use it. Toast requires separate Analytics credentials, and those Standard sources do not prove Analytics access. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [VERIFIED: src/capabilities.ts] |
| Literal allowlisted Analytics adapter | Extend the public Standard GET request type with an optional restaurant GUID | Do not use it. The current no-header exception is deliberately private and literal. A generic omission path breaks the location-isolation rule. [VERIFIED: src/transport.ts] [VERIFIED: AGENTS.md] |
| Request-layer deny list | Fetch guest payment data and remove fields later | Do not use it. The guest source itself processes card-linked data. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html] [VERIFIED: AGENTS.md] |

**Installation:** No external package is required. [VERIFIED: package.json]

## Package Legitimacy Audit

Not required. T5-001 must use locked dependencies and install no package. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```text
Analytics credentials (separate configuration)
        |
        v
Analytics OAuth token manager
        |
        v
Analytics capability preflight: enterprise-metrics:read
        |
        +-- denied -> no Analytics network request
        |
        v
Literal allowlist: GET /era/v1/restaurants-information
        |                   no Toast-Restaurant-External-ID header
        v
Strict validation and minimization
        |
        v
Immutable Analytics management-group registry
        |
        +-- selected set must be a non-empty subset of this registry
        |
        +-- T5-002: typed job lifecycle only
        |
        +-- T5-003: source-labelled MCP tool only
```

The Analytics restaurant-information endpoint returns a management-group list with GUID, name, and active, test-mode, and archived status. It is credential-scoped by the Analytics account, not restaurant-header scoped. Retain no unvalidated or raw body. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html]

### Recommended Project Structure

```text
src/
├── analytics-config.ts             # separate, non-serializable Analytics credentials
├── analytics-capabilities.ts       # Analytics-only scope and selected-set decision
├── analytics-location-source.ts    # strict transient restaurant-information schema
├── analytics-access-adapter.ts     # literal GET allowlist and immutable registry
└── runtime.ts                      # composes optional Analytics authority; no tool registration
test/
├── analytics-config.test.ts
├── analytics-capabilities.test.ts
└── analytics-access-adapter.test.ts
```

T5-001 may make the smallest composition changes to `src/config.ts`, `src/auth.ts`, `src/runtime.ts`, and transport/rate-limit seams that are necessary for independent Analytics identity and cancellation. It must not modify `src/report-tools.ts`, create an Analytics report module, or alter existing Standard semantics. [VERIFIED: src/config.ts] [VERIFIED: src/runtime.ts] [VERIFIED: src/report-tools.ts]

### Pattern 1: Source-distinct capability authority

**What:** Build a new Analytics capability context from the separately authenticated Analytics token. Require `enterprise-metrics:read`. Do not call `createCapabilityContext()` because that function binds a Standard token to a selected Standard `ToastLocation.connectionScopes` list. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] [VERIFIED: src/capabilities.ts]

**When to use:** Before the management-group restaurant-information read and every future Analytics request. A denied decision must make zero Analytics business-data requests. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] [VERIFIED: AGENTS.md]

```typescript
// New T5-001 contract. Source: Analytics scope and existing capability pattern.
// [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html]
const decision = await decideAnalyticsCapability(analyticsTokenManager, {
  requiredScopes: ["enterprise-metrics:read"],
});
if (decision.status === "denied") return decision;
return adapter.listManagementGroupRestaurants({ signal });
```

### Pattern 2: Minimal management-group location authority

**What:** Allow only `GET /era/v1/restaurants-information` in T5-001. Validate every entry. Retain `restaurantGuid`, `restaurantName`, `active`, `testMode`, and `archived` only. Freeze the normalized list after rejecting duplicate GUIDs and malformed fields. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] [VERIFIED: src/locations.ts]

**When to use:** To establish the Analytics account's authoritative location universe. Future job input is valid only when it chooses a non-empty, canonicalized subset of this registry. Canonicalization must sort normalized GUIDs, remove no duplicate silently, and never infer an omitted restaurant set. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: AGENTS.md]

### Pattern 3: Privacy-first literal route policy

**What:** Represent allowed Analytics operation names as a closed type. T5-001 contains only `analytics_restaurant_information`. Reject guest payment operations before URL construction. Do not accept arbitrary path fragments or caller-provided route names. [VERIFIED: AGENTS.md] [VERIFIED: src/transport.ts]

**When to use:** In the new Analytics adapter and all T5-002 request builders. The only later allowed dataset names need explicit review. [VERIFIED: AGENTS.md]

### Anti-Patterns to Avoid

- **Header fallback:** Do not send the Standard `Toast-Restaurant-External-ID` header to Analytics restaurant-information. The documented Analytics request has bearer authorization only. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html]
- **Standard location mutation:** Do not merge the Analytics registry into `ApplicationRuntime.locationRegistry`. This would convert separate source authority into a Standard capability claim. [VERIFIED: src/runtime.ts] [VERIFIED: src/capabilities.ts]
- **Generic credential-scoped transport:** Do not widen the Partners-only Standard exception into a generic no-header request helper. [VERIFIED: src/transport.ts]
- **Guest path coverage fixture:** Do not create a fixture route for `/era/v1/guest/payments/*`. The test must prove it is unreachable, not simulate its payload. [VERIFIED: AGENTS.md]
- **Status-policy guess:** Do not implement 202 polling or 409 replacement in T5-001. T5-002 owns those policies. [VERIFIED: ROADMAP.md]

## Don't Hand-Roll

| Problem | Do Not Build | Use Instead | Why |
|---|---|---|---|
| Credential secrecy | Serializable config object or local secret file | Existing non-serializable credential pattern and environment-only loading | The current contract prevents generic object serialization from exposing credentials. [VERIFIED: src/config.ts] |
| Token lifecycle | Manual bearer-token string cache | Existing OAuth token-manager pattern, instantiated for Analytics identity | It owns expiry, authorization-header construction, and token-safe errors. [VERIFIED: src/auth.ts] |
| Input and source validation | Ad-hoc property access | Zod schemas and existing normalized immutable object pattern | It rejects malformed upstream source before it becomes authority state. [VERIFIED: src/locations.ts] |
| Cancellation and error projection | Adapter-local signal or error protocol | Existing runtime cancellation and stable denial conventions | The product must stop work and fail closed on cancellation or upstream failure. [VERIFIED: src/runtime.ts] [VERIFIED: AGENTS.md] |
| Rate-limit sharing | Fixed short Standard wait ceiling | Separate Analytics limiter with limits derived from the endpoint/method/time-range table | Analytics request limits differ materially from Standard limits. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [VERIFIED: LOOP.md] |

**Key insight:** The location-list GET is the only T5-001 network source. Its special management-group scope requires a closed exception, not a reusable escape from restaurant isolation. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] [VERIFIED: AGENTS.md]

## Exact Safe Scope: T5-001

| Include | Exclude |
|---|---|
| Optional, separate Analytics configuration and in-memory credential identity. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] | Standard credential replacement, Standard location discovery change, or Standard capability semantics change. [VERIFIED: src/config.ts] [VERIFIED: src/capabilities.ts] |
| Analytics-token scope preflight for `enterprise-metrics:read`. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] | Inference from Standard `connectionScopes`, group membership, or a 403 result. [VERIFIED: src/capabilities.ts] [VERIFIED: docs/architecture/standard-location-discovery-compatibility.md] |
| Allowlisted `GET /era/v1/restaurants-information` with no restaurant header, strict validation, and minimized registry. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Any `/era/v1/guest/payments/*` request, `cardFingerprint` field, or guest fixture. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html] [VERIFIED: AGENTS.md] |
| Separate Analytics family/rate-limit/credential/location-set identity seams and cancellation propagation. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [VERIFIED: AGENTS.md] | Analytics report POST, report GUID storage, 202 polling, 404 expiry, 409 replacement, metric schema, aggregation, or MCP registration. [VERIFIED: ROADMAP.md] |
| Direct synthetic tests for the adapter and its authority guards. [VERIFIED: scripts/run-tests.mjs] | A production stdio Analytics tool or a live Toast compatibility claim. [VERIFIED: ROADMAP.md] [VERIFIED: STATE.md] |

## First Implementation Slice Boundary

**Slice:** T5-001 — Analytics API capability and management-group location adapter.

1. Add separate, optional Analytics credential configuration. Preserve the current Standard configuration contract when Analytics configuration is absent. The application must surface an Analytics-specific denial, not load Standard credentials as a substitute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [VERIFIED: src/config.ts]
2. Add `AnalyticsCapabilityContext` and `decideAnalyticsCapability()`. The accepted decision needs a valid Analytics token scope `enterprise-metrics:read`; it also needs no Standard restaurant connection scope. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] [VERIFIED: src/capabilities.ts]
3. Add a narrow adapter operation for `GET /era/v1/restaurants-information`. It carries the Analytics token, separate rate-limit state, cancellation signal, and no restaurant header. It validates a closed minimal schema and publishes the registry atomically. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] [VERIFIED: src/runtime.ts] [VERIFIED: src/locations.ts]
4. Add selected-set validation for later job callers: normal UUIDs only, one or more entries, no duplicates, all entries found in the Analytics registry. Bind its immutable result to the Analytics credential identity and canonical restaurant GUID set. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: AGENTS.md]
5. Add direct synthetic tests. Do not register an MCP tool or add a report fixture route in this slice. [VERIFIED: src/report-tools.ts] [VERIFIED: LOOP.md]

## Request-Layer Privacy Prohibitions

| Prohibition | Enforcement point | Required test |
|---|---|---|
| Do not build a guest-payment path. | Closed Analytics operation type and literal route allowlist. [VERIFIED: AGENTS.md] | Attempting `guest_payments` or a guest route fails before fetch. |
| Do not request `cardFingerprint` or guest-linked fields. | No guest dataset operation, schema, fixture, or response projection exists. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html] [VERIFIED: AGENTS.md] | Serialized registry/denial values contain no distinct synthetic card or guest marker. |
| Do not send a Standard restaurant header on the management-group GET. | Analytics client request builder. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Synthetic fetch records an absent `Toast-Restaurant-External-ID`. |
| Do not retain raw source bodies or credentials. | Validate/minimize boundary and non-serializable credential storage. [VERIFIED: src/locations.ts] [VERIFIED: src/config.ts] | Object serialization cannot contain synthetic credential, token, contact, or raw-body markers. |
| Do not let one Analytics account's state enter another account's state key. | Credential-identity plus canonical location-set key. [VERIFIED: AGENTS.md] | Two synthetic Analytics configurations maintain distinct scope, registry, and limiter state. |

## Known API Facts

| Fact | Planning consequence |
|---|---|
| Analytics credentials are separate from other Toast API credentials. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] | T5-001 loads and owns a separate credential identity. |
| All Analytics endpoints require `enterprise-metrics:read`. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] | Preflight must run before the location-list GET and future jobs. |
| `GET /era/v1/restaurants-information` returns restaurant GUID, name, and active, test-mode, and archived status for the Analytics account's management group. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | This is the T5-001 source of Analytics location authority. |
| Analytics metrics are informational and do not follow GAAP or provide tax advice. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] | T5-003 tool labels must carry `analytics_api` and informational/non-GAAP text. |
| Analytics rate limits vary by endpoint, method, and time range. The restaurant-information GET is limited to 5 requests/second and 30 requests/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Use an Analytics-specific limiter. Do not reuse the Standard 15-minute policy unchanged. |
| Analytics creates a `reportRequestGuid` by POST and retrieves it by GET. A GUID expires after seven days and invalid or expired GUIDs return 404. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] | T5-002 owns typed job creation, storage, retrieval, and expiry handling. |

## No-Assumption Items

| Item | What is verified | Required action before or during implementation |
|---|---|---|
| Analytics environment variable names | Toast documents separate credentials, but not this package's names. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] | Select names consistent with the non-serializable config pattern. Treat the names as a local contract and document them. [ASSUMED] |
| Management-group GUID availability | The restaurant-information response documents restaurant fields, not a returned management-group GUID. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Do not fabricate a group GUID. Key state by private Analytics credential identity plus canonical validated restaurant set. [ASSUMED] |
| Active/test/archived selection policy | Toast documents status fields but does not state which states every Analytics dataset accepts. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Retain statuses. Let T5-002 select only after the target endpoint contract is verified. [ASSUMED] |
| 202 and 409 job semantics | The phase roadmap requires pending polling and replacement, but the currently consulted public lifecycle pages confirm POST/GET/404 only. [VERIFIED: ROADMAP.md] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] | Keep all 202/409 implementation out of T5-001. T5-002 must cite the exact endpoint response contract before implementation. |
| Live Analytics compatibility | This workspace has no authorized live Toast credentials. [VERIFIED: STATE.md] | Use synthetic evidence only. Keep live capability as an external release gate. |

## Common Pitfalls

### Pitfall 1: Treating Standard authority as Analytics authority

**What goes wrong:** A Standard token or Partners connection grants apparent Analytics access.  
**Why it happens:** Both sources identify restaurants, but Toast documents separate Analytics credentials and scope.  
**How to avoid:** Use a separate Analytics token manager and a distinct capability context.  
**Warning signs:** An Analytics request succeeds in a test without an `enterprise-metrics:read` synthetic token. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html]

### Pitfall 2: Generalizing no-header access

**What goes wrong:** Any caller can omit a restaurant GUID.  
**Why it happens:** The Analytics management-group GET and Standard Partners discovery are special cases.  
**How to avoid:** Keep the Analytics operation literal and private.  
**Warning signs:** A public request object accepts an optional `restaurantGuid` or arbitrary `/era` path. [VERIFIED: src/transport.ts] [VERIFIED: AGENTS.md]

### Pitfall 3: Sending or modelling guest payment data

**What goes wrong:** A report excludes `cardFingerprint` only after fetching a guest payment payload.  
**Why it happens:** A downstream aggregate seems harmless.  
**How to avoid:** Make the route unavailable in the request type and fixture harness.  
**Warning signs:** Source code contains `/era/v1/guest/payments` or a guest-payment schema. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html] [VERIFIED: AGENTS.md]

### Pitfall 4: Reusing Standard wait limits

**What goes wrong:** A metrics job fails because the Standard wait ceiling rejects a valid Analytics cadence.  
**Why it happens:** Analytics POST limits can be ten per hour, unlike the Standard global window.  
**How to avoid:** Create a distinct Analytics limiter policy. T5-002 sets typed dataset/time-range limits.  
**Warning signs:** Analytics code imports or uses the Standard 15-minute constant unchanged. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [VERIFIED: LOOP.md]

## Code Examples

### Closed management-group discovery seam

```typescript
// New T5-001 design. The route literal is a privacy and isolation control.
// Source: Toast Analytics restaurant-information documentation.
// [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html]
export async function listManagementGroupRestaurants(
  client: AnalyticsClient,
  options: { readonly signal?: AbortSignal },
): Promise<readonly AnalyticsRestaurant[]> {
  const result = await client.getRestaurantInformation({ signal: options.signal });
  return analyticsRestaurantInformationSchema.parse(result.body)
    .map(normalizeAnalyticsRestaurant);
}
```

### Fail-closed selected-set check

```typescript
// New T5-001 design. Source: Analytics request supports explicit restaurant IDs.
// [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]
if (requestedRestaurantGuids.length === 0 || hasDuplicates(requestedRestaurantGuids)) {
  return denied("analytics_location_set_invalid");
}
if (!requestedRestaurantGuids.every((guid) => registry.has(guid))) {
  return denied("analytics_location_inaccessible");
}
return Object.freeze([...requestedRestaurantGuids].sort());
```

## State of the Art

| Old approach | Current approach | Impact |
|---|---|---|
| One Standard API authority path for the completed T1–T4 reporting tools. [VERIFIED: src/runtime.ts] | A separate Analytics credential, scope, location-set, and limiter boundary. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] | Prevents source and authority substitution. |
| Standard restaurant header requests and one reviewed Partners exception. [VERIFIED: src/transport.ts] | One literal Analytics management-group GET without that header. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html] | Keeps the exception narrow and auditable. |

**Deprecated/outdated:** Do not use a shared Standard `connectionScopes` intersection for Analytics capability. It is the correct Standard rule, but it is not the documented Analytics scope contract. [VERIFIED: src/capabilities.ts] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Package-local Analytics configuration will use a new explicit environment-variable prefix. | No-Assumption Items | A naming conflict or broken operator configuration could block Analytics startup. |
| A2 | A private credential identity plus canonical validated restaurant set is the correct state key when Toast does not return a management-group GUID. | No-Assumption Items | Cache, limiter, or later job state could cross group boundaries. |
| A3 | T5-002 must decide the active/test/archived inclusion policy per endpoint. | No-Assumption Items | A future report could include an unsupported restaurant state. |

## Resolved Questions and Explicit T5-002 Deferrals

1. **Which Analytics credential variables form the public local configuration contract? — Resolved for T5-001.**
   - The optional, all-or-nothing Analytics configuration is `TOAST_ANALYTICS_API_HOSTNAME`, `TOAST_ANALYTICS_ACCESS_TYPE`, `TOAST_ANALYTICS_CLIENT_ID`, and `TOAST_ANALYTICS_CLIENT_SECRET`.
   - The hostname and access type come from the Analytics credential page's API access URL and API access type. The client ID and secret come from the same separate Analytics credential set. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsAccessCreatingCredentials.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html]
   - These package-local names are an explicit local contract. Toast does not prescribe package environment names. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html]
   - When all four variables are absent, Standard startup is unchanged. When any variable is absent or invalid, the Analytics authority is unavailable and fails closed. The adapter must never use Standard API host, access type, client ID, or client secret values as a substitute. [VERIFIED: src/config.ts] [VERIFIED: AGENTS.md]

2. **Which restaurant statuses can each future Analytics dataset include? — Deferred to T5-002 only.**
   - T5-001 retains `active`, `testMode`, and `archived` as validated source facts. It does not choose a status inclusion policy.
   - T5-002 must verify the target dataset contract before it constructs a job request or selects statuses. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html]

3. **Where do official endpoint documents define 202 and 409 behavior? — Deferred to T5-002 only.**
   - T5-001 makes no report-job request. It does not implement polling or replacement.
   - T5-002 must cite the endpoint-specific official response contract before it implements the roadmap-required 202 pending and 409 replacement behavior. [VERIFIED: ROADMAP.md] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html]

**Resolution status:** No open question blocks T5-001 planning. The two remaining questions are explicit T5-002-only research and implementation gates.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Build and test | Yes | v25.9.0 | Project also validates Node 20 and Node 22 at merge. [VERIFIED: package.json] |
| npm | Dependency restore and checks | Yes | 11.12.1 | — |
| Authorized Analytics credentials | Real Toast compatibility | No | — | Synthetic fixtures only; no live claim. [VERIFIED: STATE.md] |

**Missing dependencies with no fallback:**

- Authorized Analytics credentials block live compatibility proof. [VERIFIED: STATE.md]

**Missing dependencies with fallback:**

- None. Synthetic fixtures prove implementation wiring only, not live compatibility. [VERIFIED: AGENTS.md]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in test runner with TypeScript compiler output. [VERIFIED: package.json] |
| Config file | `tsconfig.test.json` and `scripts/run-tests.mjs`. [VERIFIED: package.json] [VERIFIED: scripts/run-tests.mjs] |
| Quick run command | `npm run build:test && node --test dist-test/test/analytics-config.test.js dist-test/test/analytics-capabilities.test.js dist-test/test/analytics-access-adapter.test.js` |
| Full suite command | `npm run check` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| T5-001 | Separate Analytics credential authority does not expose or substitute Standard credentials. | unit | quick run command | Wave 0 |
| T5-001 | Missing `enterprise-metrics:read` denies before the Analytics location read. | unit | quick run command | Wave 0 |
| T5-001 | Only the literal restaurant-information GET runs, without a restaurant header, and validates/minimizes the response. | unit/integration double | quick run command | Wave 0 |
| T5-001 | Guest route, raw source, credential, and cross-identity leakage are impossible. | negative/security | quick run command | Wave 0 |

### Sampling Rate

- **Per task commit:** focused compiled Analytics tests.
- **Per wave merge:** `npm run check` on Node 20.20.2 and Node 22.22.2.
- **Phase gate:** Exact-head independent review and production-chain evidence remain required before a phase claim. [VERIFIED: AGENTS.md] [VERIFIED: ROADMAP.md]

### Wave 0 Gaps

- [ ] `test/analytics-config.test.ts` — separate configuration, secret non-serialization, and Standard compatibility.
- [ ] `test/analytics-capabilities.test.ts` — Analytics scope and fail-closed decision cases.
- [ ] `test/analytics-access-adapter.test.ts` — allowlist, location source schema, header, cancellation, rate-limit identity, and privacy checks.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Yes | Separate Analytics credential configuration and in-memory OAuth token manager. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [VERIFIED: src/auth.ts] |
| V3 Session Management | Yes | Token expiry remains inside the OAuth manager; do not serialize a token or reuse Standard token state. [VERIFIED: src/auth.ts] |
| V4 Access Control | Yes | `enterprise-metrics:read` preflight plus registry-subset validation before any future job. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html] |
| V5 Input Validation | Yes | Zod validates credentials, UUIDs, selected sets, and minimized upstream restaurant records. [VERIFIED: src/config.ts] [VERIFIED: src/locations.ts] |
| V6 Cryptography | Yes | Use Toast OAuth and platform TLS. Do not create a credential hash, token cipher, or custom cryptography. [CITED: https://doc.toasttab.com/doc/devguide/authentication.html] [VERIFIED: AGENTS.md] |

### Known Threat Patterns for the Analytics Adapter

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Standard credential substitution | Elevation of privilege | Separate config, token manager, scope context, and state identity. |
| Management-group data used as Standard authority | Elevation of privilege | Separate immutable Analytics registry; never merge it into Standard location context. |
| Guest-payment request or card identifier capture | Information disclosure | Closed route allowlist and no guest data schemas or fixtures. |
| Cross-account limiter or job state | Information disclosure | Scope state by private Analytics credential identity plus canonical selected set. |
| Malformed location response treated as access | Tampering | Strict schema, duplicate rejection, atomic publication, and denial. |

## Sources

### Primary (official Toast documentation)

- [Analytics API overview](https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html) — separate credentials, management-group scope, informational/non-GAAP limitation.
- [Required scope for the Analytics API](https://doc.toasttab.com/doc/devguide/apiAnalyticsScope.html) — `enterprise-metrics:read` for all Analytics endpoints.
- [Analytics restaurant information](https://doc.toasttab.com/doc/devguide/apiAnalyticsRestaurantInfoGetRestaurantList.html) — endpoint, response fields, header form, and limits.
- [Analytics API rate limits](https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html) — endpoint/method/time-range limit table.
- [Analytics process](https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html) — POST/GET report-request lifecycle and seven-day 404 expiry.
- [Guest reporting data overview](https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html) — payment-card linkage and `cardFingerprint` risk.

### Secondary (repository evidence)

- `AGENTS.md` — binding read-only, privacy, isolation, source-separation, and fail-closed rules.
- `LOOP.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` — T5 slice boundary, deferred T5-002 lifecycle scope, and live-credential gate.
- `src/config.ts`, `src/auth.ts`, `src/capabilities.ts`, `src/locations.ts`, `src/runtime.ts`, and `src/transport.ts` — present Standard interfaces and extension seams.

### Tertiary (LOW confidence)

- No external community source is used. Package-local Analytics configuration names and state-key form remain explicit assumptions.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — locked package versions and existing repository patterns are direct evidence.
- Architecture: MEDIUM — Toast documents the external authority model; repository-specific seams require the listed local decisions.
- Pitfalls: HIGH — derived from binding product rules and official Analytics credential, scope, location, and guest-data documents.

**Research date:** 2026-08-27  
**Valid until:** 2026-09-03. Toast Analytics documentation and release notes can change.
