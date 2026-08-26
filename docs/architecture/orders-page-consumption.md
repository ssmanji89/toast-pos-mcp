# Bounded `/ordersBulk` Page Consumption

**Status:** pre-T3 production prerequisite
**Last reviewed:** 2026-08-16
**Owning gap:** issue #31

## Problem

The original `/ordersBulk` helper proved pagination integrity but returned an array containing every raw page body. That remains useful as a compatibility/debugging surface, but it is not an acceptable production contract for report tools whose page count can be large. A bounded `maxPages` limit prevents infinite traversal; it does not prevent peak memory from scaling with the total raw response size.

T3 report orchestration must be able to normalize/aggregate page N and release that raw page before page N+1 is fetched.

## One traversal implementation

`ToastHttpClient.foldOrdersBulkPages()` is the single production traversal implementation for `/ordersBulk`.

It preserves the already reviewed transport invariants rather than replacing them:

- explicit `pageSize` in the documented 1–100 range;
- bounded `maxPages` with the existing 100 default / 1000 ceiling;
- one-based contiguous page progression;
- same `/orders/v2/ordersBulk` endpoint;
- invariant bounded query and page size across `next` links;
- RFC 8288 Link parsing and fail-closed malformed-Link behavior;
- same OAuth, rate-limit, retry, server-wait, restaurant-header, JSON parsing, and sanitization path;
- per-page retrieval timestamp sampled after successful body parsing plus optional successful upstream request ID;
- unchanged credential-scoped Partners discovery surface and separate credential limiter from PR #27/#29.

The legacy `getOrdersBulkPagesDetailed()` method remains for callers that intentionally need all pages at once, but it is now only a compatibility projection over the fold. It accumulates pages in its reducer; it does not contain an independent pagination loop. `getOrdersBulkPages()` remains the historical mutable body-only projection.

## Consumer contract

The fold receives:

- the existing `ToastOrdersBulkPagesRequest`;
- an initial caller-owned state;
- a synchronous or asynchronous reducer `(state, page, pageNumber) -> nextState`;
- an optional `AbortSignal` checked between page requests.

For the streaming/fold path, the transport itself retains no array of raw page bodies. The reducer may retain normalized records, aggregate counters, identity guard sets, warnings, or other bounded state its owning report contract needs. A reducer that deliberately retains raw pages has opted back into raw-page residency and is not the intended T3 usage.

The next network page is not requested until the current reducer invocation resolves. This gives downstream code a deterministic handoff point at which the raw page can become unreachable.

## Failure semantics

A reducer exception stops traversal immediately and no later page is fetched. The transport does not reinterpret the reducer error or publish a partial traversal result.

Cancellation is checked before the first/next page fetch and after each reducer completes, before a `next` link is followed. An observed abort produces a static, non-retryable `ToastHttpError` with code `request_cancelled`. An already in-flight HTTP request is allowed to finish; the cancellation guarantee is that no subsequent page request is issued. T3 report orchestration must treat this as incomplete/denied rather than complete.

## Production-memory proof

The focused synthetic test uses 150 pages and verifies:

- reducer N completes before fetch N+1 starts;
- only one reducer is active at a time;
- final caller state contains counts/checksum rather than raw page bodies;
- consumer failure at page 3 results in exactly three page fetches;
- cancellation after page 2 results in exactly two page fetches;
- pre-aborted cancellation performs zero data fetches;
- the legacy detailed-array API still returns the same page sequence through the same traversal.

This is behavioral evidence of sequential consumption, not a claim about a particular garbage collector's timing. The structural source requirement is stronger: `foldOrdersBulkPages()` itself has no raw-page accumulator.

## Consequence for T3 normalization

A streaming transport alone does not make a report correct. T3-001 enforces batch-global duplicate identities. T3-002 must not defeat that invariant by calling a one-page batch normalizer independently for every page.

Before the first production report tool is CLEAN, one of these equivalent bounded designs must be used and reviewed:

- a stateful normalization consumer whose small cross-page state carries identity guards and feeds report aggregates; or
- a report-owned fold state that maintains the same cross-page uniqueness/integrity invariants while consuming normalized page output.

The report path may retain normalized/aggregate state required by its formula. It must not regain unbounded raw page residency merely to preserve cross-page checks.

## Compatibility contract

This change is additive to PR #29/#27. It does not rename or remove:

- `getAccessibleRestaurantsJsonDetailed()`;
- `ToastCredentialRateLimitSnapshot`;
- the accepted `partnersAccessibleRestaurants` limiter key;
- restaurant/credential limiter namespaces;
- existing configuration pagination behavior;
- legacy mutable `getOrdersBulkPages()` return behavior;
- reviewed T1/T2 rationale whose runtime behavior is unchanged.

## Non-goals

This slice does not:

- define sales/payment/item formulas;
- register an MCP tool;
- change Orders source schemas;
- add Analytics streaming;
- introduce live Toast data;
- change retry or pagination integrity semantics.

DOX: updated for the durable transport/report-orchestration boundary.
