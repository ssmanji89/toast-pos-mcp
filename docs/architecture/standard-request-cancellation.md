# Standard Request Cancellation Contract

**Status:** pre-T3 production transport contract  
**Last reviewed:** 2026-08-26
**Applies to:** process-owned `RateLimitAwareToastHttpClient`

MCP v2 tool handlers receive a request-scoped `AbortSignal` at `ctx.mcpReq.signal`. Production report cancellation therefore reaches the rate-limit-aware Standard execution path rather than merely stopping aggregation after an upstream request finishes.

`ToastHttpClient` forwards an optional request signal to each owned fetch and fails closed when it observes an abort. Request-local cancellation belongs to `RateLimitAwareToastHttpClient`, which owns the injected fetch seam and process-wide rate-limit queue. `AsyncLocalStorage` carries only one request's AbortSignal, never credentials or Toast/report data.

Cancellable entry points cover single restaurant reads, credential-scoped Partners reads, configuration pages, and `/ordersBulk` fold. Cancellation can leave a queued turn without poisoning the tail, can interrupt hierarchy and retry sleeps, and is supplied to the actual Standard-data fetch.

A private cancellation preflight marker inherits from PR #37's one trusted injected-fetch preflight class so the accepted base transport preserves it without wrapping it as a network error. The outer permanently-aborted request context immediately translates it to static non-retryable `request_cancelled`; no synthetic HTTP response is created and no rate-limit response snapshot is mutated.

OAuth exchange cancellation is deliberately outside this contract. Shared process-owned location discovery is also not aborted by one report request: a cancelled report stops waiting, while the shared bootstrap may continue for another concurrent request. Request-owned Orders/payment reads are physically cancelled.

AbortSignal reasons are untrusted and never enter logs, errors, MCP results, or upstream requests.

Required lower-layer proof includes pre-abort, queued cancellation plus recovery, hierarchy sleep, in-flight fetch, retry backoff, Orders page fetch, Partners header boundary, static reason sanitization, later uncancelled progress, the full PR #37 hierarchy suite, and byte-equivalent accepted base-transport behavior.


DOX: this is the owning production cancellation record.
