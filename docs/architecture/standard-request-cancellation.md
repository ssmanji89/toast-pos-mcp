# Standard Request Cancellation Contract

**Status:** pre-T3 production transport contract  
**Last reviewed:** 2026-08-16  
**Applies to:** process-owned `RateLimitAwareToastHttpClient`

MCP v2 tool handlers receive a request-scoped `AbortSignal` at `ctx.mcpReq.signal`. Production report cancellation therefore reaches the rate-limit-aware Standard execution path rather than merely stopping aggregation after an upstream request finishes.

The reviewed base `ToastHttpClient` remains unchanged. Request-local cancellation belongs to `RateLimitAwareToastHttpClient`, which already owns the injected fetch seam and process-wide rate-limit queue. `AsyncLocalStorage` carries only one request's AbortSignal, never credentials or Toast/report data.

Cancellable entry points cover single restaurant reads, credential-scoped Partners reads, configuration pages, and `/ordersBulk` fold. Cancellation can leave a queued turn without poisoning the tail, can interrupt hierarchy and retry sleeps, and is supplied to the actual Standard-data fetch.

A private cancellation preflight marker inherits from PR #37's one trusted injected-fetch preflight class so the accepted base transport preserves it without wrapping it as a network error. The outer permanently-aborted request context immediately translates it to static non-retryable `request_cancelled`; no synthetic HTTP response is created and no rate-limit response snapshot is mutated.

OAuth exchange cancellation is deliberately outside this contract. Shared process-owned location discovery is also not aborted by one report request: a cancelled report stops waiting, while the shared bootstrap may continue for another concurrent request. Request-owned Orders/payment reads are physically cancelled.

AbortSignal reasons are untrusted and never enter logs, errors, MCP results, or upstream requests.

Required lower-layer proof includes pre-abort, queued cancellation plus recovery, hierarchy sleep, in-flight fetch, retry backoff, Orders page fetch, Partners header boundary, static reason sanitization, later uncancelled progress, the full PR #37 hierarchy suite, and byte-equivalent accepted base-transport behavior.

## Local stdio active-cancellation limitation

The official `serveStdio(factory)` runtime does not provide active tool cancellation on the reviewed SDK v2 boundary. It queues inbound messages serially and awaits an active `tools/call` before it reads the later `notifications/cancelled` message. Therefore the active request signal does not abort, the in-flight Standard fetch continues, and no full-boundary `request_cancelled` tool result is available.

PR #40 reproduced this with an initialized child-process reporting server, an active `tools/call` request with nonzero JSON-RPC ID `41`, a blocking synthetic Standard `/ordersBulk` fetch, then `notifications/cancelled` with `requestId: 41`. The fetch started but did not receive an abort signal. The request could not complete until the test timeout. ID `0` is not assessed by this reproduction.

The report runtime continues to forward `ctx.mcpReq.signal` to request-owned transport work. That forwarding is not a claim that the official local stdio server can deliver active cancellation. A custom stdio replacement is prohibited because it would bypass the reviewed dual-era `serveStdio(factory)` boundary.

This is an owned incompatibility for GitHub issue #4 and PR #40. PR #40 is blocked from CLEAN and merge until an MCP SDK correction or a separately reviewed local-runtime boundary change supplies this behavior.

DOX: this is the owning production cancellation record.
