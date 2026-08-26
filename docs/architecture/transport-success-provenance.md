# Transport success provenance

**Status:** T3 prerequisite implementation on issue #15
**Depends on:** T2-001 regression repair #16 because both modify the shared Standard transport

## Problem

The original `ToastHttpClient` preserved useful metadata only on error paths. Successful requests returned JSON bodies, and pagination helpers returned arrays of bodies. Once report tools exist, that is insufficient to prove freshness/completeness or provide Toast request IDs for support: the report layer cannot reconstruct a successful response's headers or retrieval time after the transport has thrown them away.

## Detailed result contract

`ToastDetailedJsonResult` contains exactly:

- `body`: the parsed JSON body;
- `retrievedAtEpochMs`: a local clock sample taken after the successful body has been parsed;
- `upstreamRequestId`: the successful response's `Toast-Request-Id` when present, otherwise `undefined`.

The object is frozen. The body itself is not newly frozen or transformed; existing body semantics remain the responsibility of the source adapter/schema.

The public transport exposes detailed variants for:

- `getJsonDetailed`;
- `getAccessibleRestaurantsJsonDetailed`;
- `getConfigurationPagesDetailed`;
- `getOrdersBulkPagesDetailed`.

Existing body-only methods remain compatibility projections over the detailed implementation. They do not run a second HTTP request and do not manufacture metadata.

## Pagination provenance

Detailed pagination returns one immutable detailed entry per **retained, proven page** in traversal order.

For configuration page-token traversal, a scoped HTTP 409 restarts from page one. The partial attempt's body entries and their successful request metadata share the same attempt-local array and are discarded together. A stale page request ID must never survive into the final successful detailed result.

For `/ordersBulk`, each proven Link traversal page retains its own retrieval timestamp and successful request ID. The number of detailed entries therefore proves pages retained; it does not by itself prove the number of business records inside those pages.

## What transport provenance does not claim

The transport deliberately does **not** produce:

- report `complete` / `partial` / `denied` status;
- record counts;
- business dates;
- source-specific freshness policy;
- exclusions or unresolved-reference counts;
- report formulas;
- MCP response envelopes.

Those require source schemas and report semantics. T3/T4/T5 adapters aggregate detailed transport results into report-level provenance only after validating each retained body and counting source records.

A successful detailed transport call proves only that the transport completed its own bounded traversal/integrity contract and parsed the retained response bodies as JSON.

## Error separation

Failed attempts never appear in success provenance. A retryable 5xx response may carry its own request ID, but once a later retry succeeds only the successful response's request ID enters `ToastDetailedJsonResult`.

Error behavior remains unchanged: `ToastHttpError` continues to carry sanitized status/request-ID metadata when appropriate and never retains an upstream response body or caught `cause`.

The detailed success result does not expose:

- response headers;
- request URL;
- Authorization header;
- bearer token;
- credentials;
- raw `Response` objects.

## Clock semantics

`retrievedAtEpochMs` uses the same injectable local clock as rate-limit handling, but it is sampled separately after `response.json()` succeeds. It is a local retrieval timestamp, not an upstream event timestamp and not a claim about when Toast data last changed.

Report freshness must therefore distinguish:

- local retrieval time from this transport metadata;
- upstream modification/business timestamps from validated source records;
- cache age where a later adapter introduces caching.

## Backward compatibility

- `getJson()` returns only the body from `getJsonDetailed()`.
- `getConfigurationPagesJson()` returns the retained bodies from `getConfigurationPagesDetailed()` and preserves its historical frozen-array behavior.
- `getOrdersBulkPages()` returns bodies from `getOrdersBulkPagesDetailed()` and preserves its historical mutable top-level array behavior.
- `getAccessibleRestaurantsJson()` projects the body from its detailed counterpart.

No duplicate HTTP traversal exists between detailed and legacy methods.

## Verification obligations

Before CLEAN:

1. detailed single-request result includes body, local retrieval timestamp, and successful request ID when supplied;
2. missing success request ID remains `undefined`, never fabricated;
3. a retryable failed request ID cannot contaminate a later successful result;
4. configuration and orders pagination retain one metadata entry per final page;
5. configuration 409 restart discards stale body and metadata entries together;
6. legacy wrappers preserve their prior return shapes;
7. detailed objects/page arrays are immutable while body semantics remain unchanged;
8. full T1 retry/rate-limit/pagination regression probes remain green because the implementation reuses the same internal request path;
9. exact-head Node 20 and Node 22 gates discover the new success-metadata test file.

DOX: updated. This is a durable internal transport interface and provenance boundary required by future report tools.
