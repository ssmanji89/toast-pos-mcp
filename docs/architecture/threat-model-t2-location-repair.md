# Threat-model addendum: T2 location-discovery regression repair

**Status:** current for PR #27 / issue #16  
**Last reviewed:** 2026-08-16  
**Supersedes:** the location-discovery and location-source statements in [`threat-model.md`](threat-model.md) until that historical baseline is fully regenerated after merge  
**Release gate:** issue #28

## Why this addendum exists

The original T2-001 threat-model text describes an implementation that is now known to be wrong: one restaurant-scoped `GET /restaurants/v1/restaurants` was assumed to return a credential-wide aggregate of accessible restaurants. PR #27 replaces that source model and changes one transport trust boundary. Leaving the old prose as the current security model would make later T2/T3 review reason from an API shape that the repository no longer intends to ship.

This addendum is authoritative for the T2 location source and transport boundary. Statements in the older threat model that say T2-001 is unmerged, that location discovery is a single restaurant-scoped aggregate read, or that every Standard-family data read is restaurant-scoped are historical and superseded here.

## Current source and trust boundaries

### Credential-scoped discovery boundary

The runtime adds exactly one allowlisted credential-scoped Standard-family read:

`GET /partners/v1/restaurants`

The request:

- uses the config-bound OAuth token manager;
- sends Authorization and Accept headers;
- deliberately sends no fabricated `Toast-Restaurant-External-ID` header;
- uses the existing bounded retry, server-wait ceiling, status classification, JSON parsing, and error-sanitization path;
- owns a separate credential-scoped rate-limit namespace inside the same `ToastHttpClient` instance;
- is not exposed as a generic public headerless request helper.

Every other Standard-family data request remains restaurant-scoped and continues to include restaurant GUID in its rate-limit key.

### Restaurant-detail boundary

For each active accessible connection, the runtime then calls:

`GET /restaurants/v1/restaurants/{restaurantGUID}?includeArchived=false`

with `Toast-Restaurant-External-ID` equal to the requested GUID.

The detail response is used only to hydrate report-context fields required downstream: restaurant GUID, name, IANA time zone, closeout hour, currency code, and management-group identity when present.

## Data classes and minimization

The credential-wide Partners response can contain substantially more information than reporting requires, including partner-contact email, external references, names, timestamps, and other connection metadata. Those fields may be present transiently in the HTTP response object and JavaScript value returned by `response.json()` because the server cannot validate a JSON response without receiving it.

The application boundary minimizes immediately after receipt:

- the source schema recognizes only restaurant GUID, management-group GUID, deleted/active state, and connection scope strings;
- unknown source fields are stripped from the parsed validation result rather than passed through;
- only normalized GUID/group identifiers and a frozen de-duplicated connection-scope list survive into the connection model;
- no raw source object, partner email, external reference, or request body is retained in the registry;
- the raw Partners response is not logged, returned through MCP, persisted, snapshotted, or attached to an error.

Restaurant-detail parsing follows the same rule: unknown fields are stripped from the parsed object and only report-context fields survive.

The upstream data is still Merchant-related data while transiently held in process memory. “Not retained” is a data-minimization claim, not a claim that the bytes were never processed.

## Authorization ambiguity and fail-closed behavior

Toast's current official documentation conflicts on whether Standard API credentials can use the Partners accessible-restaurants endpoint. The runtime therefore does not treat the source as universally production-proven.

If the allowlisted credential-wide request returns HTTP 403:

- `discoverStandardLocations()` converts it to `ToastLocationError` code `location_discovery_source_unavailable`;
- the new error has a static message and no upstream body, request ID, caught error, token, or credential attached;
- the runtime does not interpret the 403 as a particular missing scope or inaccessible restaurant;
- it does not fall back to every restaurant in the management group;
- no location registry replacement occurs.

Why no group fallback: Standard credentials can be configured for a proper subset of restaurants in one management group. Group membership therefore cannot prove that the credential may read every group restaurant.

Issue #28 is the release-blocking live Standard-credential proof that decides whether this credential-wide source is actually compatible with the project's primary Standard credential model.

## Location registry authority

`ToastLocationRegistry` remains keyed first by `RuntimeConfig` object identity and then by normalized restaurant GUID. The repair extends each immutable location value with:

- `currencyCode`;
- normalized `managementGroupGuid` when supplied;
- frozen `connectionScopes`.

The registry is replaced only after the complete active connection set has been parsed and every restaurant detail has hydrated and validated successfully. A failure on restaurant N therefore cannot publish restaurants 1..N-1 as an apparently complete new set or overwrite a previously complete registry with partial state.

The bootstrap restaurant remains a fail-closed assertion that the configured operating context is part of the active discovered set. A missing or deleted bootstrap connection denies discovery.

## New downstream authority: connection scopes

`ToastLocation.connectionScopes` becomes one half of T2-002's preflight authority. It is not sufficient by itself.

The eligible Standard scope set for a selected restaurant is:

`current token provisioned scopes ∩ selected restaurant connection scopes`

followed by product-policy exclusions.

This prevents a token-level scope from being mistaken for restaurant-level authorization. T2-002 must consume the selected immutable location context; it must not build a duplicate restaurant-scope registry with a separate lifetime or identity key.

## Rate-limit isolation

The existing reviewed restaurant bucket remains structurally keyed by:

`api family + restaurant GUID + limiter key`

The repair adds an instance-local credential bucket keyed by:

`api family + credential namespace + limiter key`

These namespaces cannot collide. A credential-wide Partners response cannot cause an unrelated restaurant-scoped request to inherit its exhausted quota or wait state.

The credential bucket relies on one important instance invariant: each `ToastHttpClient` is permanently constructed from one `RuntimeConfig` and token-manager identity. If a future architecture centralizes rate-limit state across clients or tenants, an explicit credential identity must enter the key rather than reusing this instance-local assumption.

## Errors and secret handling

The repair adds no error path that captures upstream response bodies or caught causes. Location errors are static and carry only their stable local code/retryable classification. Existing `ToastHttpError` continues to expose sanitized status/request-ID metadata where appropriate at the transport boundary, but the source-unavailable location error intentionally does not preserve even the request ID because it is a source-capability decision rather than a transport-support result.

No credential, bearer token, partner contact field, restaurant payload, or raw source object is placed in:

- `ToastLocationError`;
- `ToastLocationRegistry` beyond the explicitly minimized context;
- tests/fixtures using real data;
- logs or stdout;
- MCP output.

## MCP reachability today

The repaired location path is still not reachable from a registered MCP reporting tool because no Toast data/report tools exist yet. That absence does **not** make the path production-complete. T3 tool wiring will make this source part of an externally observable runtime chain, so T3 acceptance must reverify:

- same `RuntimeConfig` identity through config, token manager, HTTP client, location registry, capability preflight, and tool handler;
- explicit denial when location discovery is unavailable;
- no bypass around location/capability state;
- no tool-time reconstruction of credentials, transport, or location authority.

## Verification requirements

Before this repair may be CLEAN:

1. exact-head Node 20 and Node 22 dependency-backed `npm ci && npm run check`;
2. test discovery must include `location-guard-matrix.test`, `locations.test`, and `partners-transport.test`;
3. every enumerated location-source guard must be mutated once, not sampled;
4. the credential-scoped Partners path must be mutation-tested for header omission, limiter separation, retries, status sanitization, and token-acquisition failure;
5. prior T1 transport pagination/retry probes must remain green because this repair modifies the shared transport internals.

Before public Standard production compatibility can be claimed, issue #28's live credential proof must also pass. That live proof is a release gate, not a substitute for the synthetic/local exact-head gate above.

## Non-goals

This repair does not authorize or implement:

- a generic credential-scoped Toast transport;
- group-wide access inference;
- Toast writes;
- guest-linked endpoints or fields;
- report normalization or calculations;
- MCP reporting tools;
- Analytics source behavior;
- remote MCP transport.

DOX: updated. This addendum is the current security record for the repaired T2 location boundary.