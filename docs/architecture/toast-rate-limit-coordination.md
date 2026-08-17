# Toast Rate-Limit Coordination Contract

**Status:** pre-T3 production transport contract  
**Last reviewed:** 2026-08-16  
**Source authority:** current Toast rate-limiting developer guide

## Why this supersedes the old model

The original transport was reviewed against synthetic unprefixed `Toast-RateLimit-*` headers and stored wait state under a caller-supplied endpoint key. Current Toast documentation defines a richer contract:

- `X-Toast-RateLimit-By` reports the limit type currently closest to exhaustion: `GLOBAL`, `API`, or `ENDPOINT`, optionally qualified by `ACCOUNT`;
- `X-Toast-RateLimit-Remaining` reports remaining requests in that specific fixed time slice;
- `X-Toast-RateLimit-Reset` is an **absolute UNIX epoch** for the next slice;
- a 429 additionally supplies `Retry-After`;
- GLOBAL has higher priority than API, which has higher priority than ENDPOINT;
- requests carrying `Toast-Restaurant-External-ID` are normally rate-limited per restaurant, while headerless requests such as Partners access are rate-limited by IP context;
- some large accounts may receive API- or endpoint-level ACCOUNT limits that span restaurant locations.

A rate-limit cache keyed only to the local endpoint name cannot represent these relationships. In particular, an observed exhausted GLOBAL limit on one endpoint must suppress another endpoint for the same restaurant context, and an ACCOUNT API limit must coordinate the same API across restaurants.

## Runtime design

Production `ToastHttpClient` instances are created through `createRateLimitAwareToastHttpClient()`.

The underlying reviewed `ToastHttpClient` remains responsible for:

- OAuth authorization-header acquisition;
- restaurant-header attachment;
- retries and retry classification;
- bounded server waits;
- JSON parsing;
- pagination;
- error sanitization;
- existing public rate-limit snapshots.

The production factory wraps only the injected Standard-data `fetch` seam with one process-owned `ToastRateLimitCoordinator`.

For every request the wrapper derives, from the request itself:

- restaurant scope from `Toast-Restaurant-External-ID`, or credential/IP scope when absent;
- API identity from the first path segment;
- endpoint identity from the normalized path, replacing UUID entity identifiers with `:id`.

Before fetch it checks every known applicable constraint:

1. scoped GLOBAL;
2. scoped API;
3. scoped ENDPOINT;
4. ACCOUNT API;
5. ACCOUNT ENDPOINT.

The longest unexpired wait wins because every applicable exhausted constraint must have reset before the request is safe.

After fetch, the wrapper records only the specific constraint Toast actually reported as closest to exhaustion. It does **not** decrement counters locally or infer unreported constraints. Toast reports one closest limit at a time; manufacturing a complete local token-bucket model from that observation would be false precision.

## Current versus legacy headers

Hierarchical coordination uses one current-header generation only: `X-Toast-RateLimit-By`, current Remaining, and current Reset. A current `By` value never borrows a missing numeric companion from a historical alias. If a current companion is absent or malformed, that portion of the hierarchy observation is unknown.

The repository still accepts historical unprefixed numeric aliases for the already-reviewed public snapshot compatibility surface. If a current numeric header is present, its parsed value wins, including `0`. A malformed current value suppresses the legacy alias rather than being reinterpreted by the historical parser.

The wrapper mirrors successfully parsed current remaining/reset/limit values into the legacy aliases on the `Response` handed to the existing transport. This keeps `getRateLimitSnapshot()` / `getCredentialRateLimitSnapshot()` coherent while ensuring legacy fields cannot create production hierarchy state.

`X-Toast-RateLimit-By` has no legacy substitute. When it is absent, no hierarchical constraint is invented. Existing endpoint-local retry/Retry-After behavior remains the fallback.

## Reset and wait semantics

`X-Toast-RateLimit-Reset` is interpreted as an absolute epoch, never as a relative delay. Epoch seconds are the normal documented form; epoch milliseconds are tolerated defensively without changing the absolute-time interpretation.

`Retry-After` accepts strict non-negative integer seconds, plus the historical HTTP-date compatibility already supported by the transport. Strings such as `10junk` are not accepted as ten seconds.

If a known hierarchical wait exceeds the same configured wait ceiling used by `ToastHttpClient`, the wrapper does not sleep beyond the ceiling and does not send the request early. It feeds a static synthetic 429 through the existing transport path so the established `rate_limit_wait_exceeded` fail-closed behavior remains the sole public error contract.

## Concurrency and process boundary

All Standard-data fetches made by one production client instance are serialized at the wrapper seam. This is intentionally conservative: request N+1 performs its hierarchy preflight only after request N's response has been observed and recorded. A response that consumes the last request in a time slice can therefore establish the reset wait before another concurrent MCP handler reaches upstream.

This serialization is not a fabricated token bucket. The client still sends requests while Toast reports capacity and stops only on observed exhausted constraints or Retry-After. It trades unused theoretical concurrency for deterministic correctness and can be optimized later only with a separately reviewed reservation model.

OAuth authentication exchange is outside this queue because Toast documents authentication rate limiting separately and does not include normal rate-limit headers on authentication responses.

Headerless/IP scope is process-local. Two separate local server processes behind the same public IP cannot coordinate in memory; that residual risk is inherent to the local-process distribution and should be revisited only if a multi-process/hosted runtime is approved.

## Verification requirements

Focused synthetic proof covers:

- GLOBAL cross-endpoint coordination;
- API same-service coordination without unrelated-API blocking;
- ENDPOINT-only blocking;
- per-restaurant isolation;
- ACCOUNT coordination across restaurants;
- credential/IP versus restaurant isolation;
- current-header precedence and legacy snapshot mirroring;
- malformed-current-header behavior;
- current `By` never borrowing legacy Remaining/Reset;
- concurrent calls serialized through the first response observation;
- absolute reset semantics;
- over-ceiling fail-closed behavior with no second upstream request.

Before CLEAN, the complete existing T1 transport and pagination matrix must also pass under Node 20 and Node 22 with authentic locked dependencies.

## Non-goals

This contract does not implement:

- Analytics-specific method/dataset/time-range limiting;
- cross-process IP coordination;
- speculative local quota decrementing;
- write operations;
- report formulas or MCP tools.

DOX: this document is the current rate-limit architecture record. The older research note that described reset semantics as unsourced is historical and superseded by current Toast documentation.
