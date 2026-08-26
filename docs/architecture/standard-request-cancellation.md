# Standard Request Cancellation Contract

**Status:** pre-T3 production transport contract
**Last reviewed:** 2026-08-16
**Applies to:** process-owned `RateLimitAwareToastHttpClient`

## Purpose

MCP v2 tool handlers receive a request-scoped `AbortSignal` at `ctx.mcpReq.signal`. A production reporting call may spend meaningful time waiting for Toast rate limits, `/ordersBulk` pages, or payment detail reads. Cancellation must therefore reach the actual Standard-data execution path rather than merely stop report aggregation after an upstream request eventually finishes.

## Ownership boundary

The reviewed base `ToastHttpClient` remains unchanged. It continues to own OAuth acquisition, HTTP status classification, retries, pagination, JSON parsing, legacy rate-limit snapshots, and sanitized errors.

Request-local cancellation belongs to `RateLimitAwareToastHttpClient`, the production Standard client that already owns the injected fetch seam and process-wide rate-limit queue. This avoids rewriting the accepted base transport solely to add a production-wrapper concern.

`AsyncLocalStorage` carries exactly one value across the asynchronous Standard request: its `AbortSignal`. It never stores credentials, location data, report data, request bodies, URLs, or response bodies.

## Cancellable methods

The production wrapper exposes explicit cancellable entry points:

- `getJsonDetailedCancellable()`
- `getAccessibleRestaurantsJsonDetailedCancellable()`
- `getConfigurationPagesDetailedCancellable()`
- `foldOrdersBulkPagesCancellable()`

Existing non-cancellable inherited methods remain unchanged for compatibility and focused lower-layer tests. Production MCP report orchestration must use the cancellable methods whenever a request signal exists.

## Queue and wait semantics

Actual Standard-data fetches remain serialized through response observation, as established by the rate-limit hierarchy contract.

A request cancelled while waiting for a prior serialized fetch releases its own queued turn without entering upstream. Later requests remain able to acquire the queue after the real prior turn completes.

Positive hierarchy waits remain outside the serialized turn. The wait races the request signal; if cancellation wins, no upstream fetch is issued. The raw injected sleep promise remains rejection-handled after the race so cancellation cannot create an unhandled rejection.

The same request-local signal wraps the base transport's retry/backoff and stored-rate-limit sleep function. Cancellation during a retry sleep prevents the next retry.

## In-flight fetch semantics

The request signal is supplied to the underlying Standard-data `fetch`. If the signal aborts while fetch is in progress, the wrapper does not expose the caught fetch error or AbortSignal reason.

The wrapper uses a private `ToastRequestCancellationPreflightError` that inherits from PR #37's already-reviewed `ToastRateLimitPreflightError`. The base transport deliberately preserves that exact internal preflight class family through its injected-fetch catch. Once control returns to the request-local wrapper, a permanently aborted signal converts the private marker to the public static error:

- code: `request_cancelled`
- retryable: `false`
- no upstream status
- no upstream request id
- static message only

This avoids a synthetic HTTP response, avoids retry, and avoids mutating legacy rate-limit response snapshots during local cancellation.

A non-cancellation over-ceiling hierarchy wait still throws the original `ToastRateLimitPreflightError` and retains the public `rate_limit_wait_exceeded` contract.

## OAuth boundary

This slice does not cancel an already-running OAuth token exchange. Authentication is a separate endpoint/lifecycle with its own custody and retry contract. A signal that aborts while token acquisition is in flight is observed before the subsequent Standard-data fetch, so no cancelled data request is issued afterward.

A future auth-cancellation change requires a separate review because aborting credential exchange has different retry/caching semantics from aborting data retrieval.

## Security and privacy

AbortSignal reasons are untrusted caller values and are never interpolated into public errors, logs, MCP results, or upstream requests.

Cancellation does not relax restaurant header rules. The Partners accessible-restaurants read remains credential-scoped and headerless; restaurant data reads remain explicitly restaurant-scoped.

## Required proof

Focused proof must cover:

- pre-aborted request: no auth/data request begins;
- cancellation while queued behind another Standard fetch: no upstream request and no poisoned queue;
- cancellation during hierarchy sleep: no upstream request;
- cancellation during in-flight fetch: underlying signal aborts and later traffic recovers;
- cancellation during retry/backoff: no retry fetch;
- cancellation during `/ordersBulk` page fetch: no page is consumed and no later page starts;
- credential-scoped Partners cancellation preserves the no-restaurant-header boundary;
- static `request_cancelled` result never contains the AbortSignal reason marker;
- uncancelled traffic after cancellation continues normally;
- all PR #37 hierarchy/current-header/preflight behavior remains unchanged;
- `src/transport.ts` remains byte-identical to PR #37.

Authentic Node 20/22 execution and the complete T1 transport/pagination regression matrix remain mandatory before CLEAN.

## Non-goals

- OAuth exchange cancellation;
- Analytics request cancellation;
- write operations;
- cross-process cancellation coordination;
- MCP report formulas.

DOX: this document is the owning cancellation architecture record.
