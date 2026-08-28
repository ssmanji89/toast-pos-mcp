# Phase 06: First stdio tool-request cancellation gate — Research

**Researched:** 2026-08-28 America/Chicago  
**Scope:** GitHub issue #60 only  
**Confidence:** HIGH for the installed SDK and repository paths; MEDIUM for the proposed local bridge until its production-process test passes

## Decision

Use a local, public-API cancellation bridge. Do not modify the installed MCP SDK.
Do not change its version or lockfile in this slice.

The committed lockfile installs `@modelcontextprotocol/server@2.0.0` and
`@modelcontextprotocol/client@2.0.0`. The installed server package contains a
truthiness guard in its cancellation handler. That guard returns before lookup
when `notification.params.requestId` is numeric zero. The repository's current
fixture reproduces this behavior.

The current SDK exposes the two public seams needed for a local correction:

- tool handlers receive `ctx.mcpReq.id` and `ctx.mcpReq.signal`;
- the underlying official server accepts a replacement
  `notifications/cancelled` handler.

The bridge must track only active registered report-tool requests. It must use
the exact JSON-RPC request ID as the map key. It must recognize zero as a valid
key. It must compose its local signal with the SDK signal and remove all map
and event-listener state after resolve, source rejection, and cancellation.

The correction needs a typed optional observer for deterministic lifecycle
proof. It reports count-only snapshots of active controllers and bridge-created
abort relays. Normal package execution has no observer. The compiled
executable test enables it only with invented test configuration. This observes
the real bridge. It does not replace the server, runtime, transport, or source.

## Required production path

```text
official Client + StdioClientTransport
  -> compiled or consumer-installed dist/index.js
  -> official serveStdio(factory)
  -> official McpServer
  -> local request-ID cancellation bridge
  -> ctx.mcpReq.signal-derived report signal
  -> ApplicationRuntime
  -> RateLimitAwareToastHttpClient
  -> active invented upstream fetch
```

The executable test must run both retained protocol eras. It uses the official
client legacy negotiation mode for the 2025 legacy era. Legacy initialize uses
numeric ID `0`, and its first `tools/call` uses numeric ID `1`. It uses the
official client pinned `2026-07-28` mode for the modern era. Modern discovery
precedes the first `tools/call`, which uses numeric ID `0`. Each era must call
a Standard tool immediately after connection. A passive subclass of the
installed official client transport may observe the outbound JSON-RPC message.
It must prove the actual per-era ID allocation and matching cancellation
notification. Modern ID zero is the defect proof. Legacy ID one is regression
proof. It must then cancel a later nonzero request. It must not write JSON-RPC
frames, replace the SDK transport, or run a fixture server in place of
`dist/index.js` or the installed package bin.

The synthetic preload may provide invented HTTP responses and an abortable
Orders response. It is an upstream isolation fixture only. It cannot replace
the production executable, the official client, the official server, or the
runtime and transport chain.

## Existing evidence and gap

`test/protocol-cancellation.test.ts` confirms that the current first call does
not abort its handler. Its succeeding test primes the process so cancellation
uses a nonzero request ID. `test/report-tools-e2e.test.ts` also proves only
nonzero-ID report cancellation.

`src/report-tools.ts` forwards `ctx.mcpReq.signal` into each Standard builder.
`ApplicationRuntime` forwards the request signal to location waits. The
rate-limit-aware transport forwards it to queue waits, sleeps, and fetches.
The missing link is the SDK's request-zero cancellation dispatch.

## Local correction contract

The new bridge must meet all of these rules.

1. Register its cancellation notification handler through the public official
   server API.
2. Use `requestId !== undefined` to accept numeric zero and string IDs.
3. Maintain an explicit registration matrix for exactly these callbacks:
   `toast_sales_summary`, `toast_payment_summary`,
   `toast_item_sales_summary`, `toast_cash_summary`, `toast_labor_summary`,
   and `toast_analytics_metrics_day`.
4. Use one per-request bridge controller and a combined signal for each
   callback. Keep the existing SDK signal in that combination.
5. Remove the active controller and all bridge-created abort relays after the
   callback resolves, rejects, or is cancelled. An injected count-only observer
   must show zero controllers and zero relays for each terminal state.
6. Ignore a late cancellation notification that has no active matching map
   entry. Do not abort an unrelated active request.
7. Preserve the process-owned runtime, location isolation, capability checks,
   rate limiting, complete/incomplete/denied report contracts, and body-free
   Analytics boundary.

## Forbidden alternatives

- No edit to `node_modules`, package tarballs, `package.json`, or
  `package-lock.json`.
- No SDK deep import, private-field access, `any` cast around SDK internals,
  prototype patch, subclass override of a private method, or copied protocol
  implementation.
- No new transport, JSON-RPC parser, request-ID allocator, or SDK generation.
- No direct report-builder test as the gate proof.
- No fixture server as a substitute for `src/index.ts` or the installed bin.
- No Toast credential, Merchant Data, live endpoint, signing, publication, or
  release-ready claim.

## Validation design

The process test must use the actual installed SDK client and server stdio
packages. It must start the compiled production executable or a clean
consumer-installed package bin. It must use the existing test-only preload
with invented data. The test must observe all of these facts:

1. The modern retained era has first `tools/call` JSON-RPC ID `0`, while legacy
   initialize has ID `0` and its first `tools/call` has ID `1`.
2. The first Standard handler reaches the configured abortable Orders fetch.
3. Client abort sends the official cancellation notification with the matching
   actual per-era request ID.
4. The matching modern request-zero bridge controller aborts the runtime
   signal, and legacy request-one cancellation remains a regression check.
5. A later nonzero Standard request also reaches the source and aborts through
   the same bridge in each era.
6. The upstream fetch sees its signal abort and no later page or retry begins.
7. The cancelled handler produces the existing fail-closed denial behavior.
8. Resolve, source rejection, and both cancellation cases each report zero
   active controllers and zero bridge-created relay listeners.
9. The registration matrix proves every named Standard and Analytics callback
   uses the bridge. A separate compiling mutation for each matrix entry fails.
10. The same process serves a later report and then closes without an orphan
    handler, retained map entry, relay listener, hanging stream, or
    secret-bearing output.

The Node 20.20.2 and Node 22.22.2 detached-clean-worktree gates must run the
same immutable candidate. Both gates must restore only the committed lockfile,
run the full repository check, run the focused process test, run the mutation
harness, and end with clean tracked and index diffs.

## Source audit

SOURCE | ID | Required fact | Plan | Status
--- | --- | --- | --- | ---
GOAL | Phase 06 | No production-compatibility claim may rely on a stand-in path. | 06-07, 06-08 | COVERED
REQ | T6-003 | Package-facing stdio behavior has exact-head production-chain evidence. | 06-07, 06-08 | COVERED
REQ | #60 | Corrected SDK or reviewed local correction proves request-zero cancellation through real stdio. | 06-07, 06-08 | COVERED
RESEARCH | SDK 2.0.0 | The installed truthiness guard drops numeric zero. | 06-07 Task 1 | COVERED
RESEARCH | Public SDK API | The context ID and notification handler support a local bridge without SDK internals. | 06-07 Task 2 | COVERED
RESEARCH | Existing report chain | Runtime, queue, fetch, and report paths already carry an abort signal. | 06-07 Tasks 1-2 | COVERED
RESEARCH | Retained eras | Both official legacy and modern stdio paths require executable cancellation evidence. | 06-07 Task 1, 06-08 Tasks 1-2 | COVERED
RESEARCH | Lifecycle cleanup | Zero active controllers and relays require observer-backed terminal-state evidence. | 06-07 Tasks 1-2, 06-08 Tasks 1-2 | COVERED
CONTEXT | D-01 | State implementation, synthetic evidence, and external gates separately. | 06-08 Task 2 | COVERED
CONTEXT | D-02, D-03 | Do not claim approval, publication, consent, or legal sufficiency. | 06-08 Task 2 | COVERED
CONTEXT | D-04, D-05, D-06 | Preserve consent, credential, no-training, and excluded-data limits. | 06-07 Tasks 1-2 | COVERED
CONTEXT | D-07, D-08 | Preserve Standard tools and body-free Analytics behavior. | 06-07 Task 2 | COVERED
CONTEXT | D-09 | Keep #60, G01, live compatibility, signing, and publication explicit until proof exists. | 06-08 Tasks 2-3 | COVERED

## Pre-mortem

| Failure | Early control |
| --- | --- |
| A fixture path replaces production wiring. | Focused test starts `dist/index.js` or the consumer-installed bin through the official stdio transport. |
| The bridge fixes modern ID zero but regresses legacy or later nonzero IDs, or one callback. | Modern first ID zero and legacy first ID one cancel through the executable, both eras cover later nonzero requests, the matrix names all six callbacks, and each registration has a separate bypass mutation. |
| Cancellation leaks an active controller or relay listener. | Terminal-state observer snapshots must show zero counts after resolve, rejection, and cancellation, and cleanup mutations must fail. |

## Gate status

Issue #60 remains open until an immutable candidate passes both supported Node
runtime gates and receives independent exact-head review. This research does
not resolve #28, T5-003-G01, consent, live compatibility, Terms or brand,
signing, publication, or the pending GitHub-attributable reviews for PR #55
and PR #58.
