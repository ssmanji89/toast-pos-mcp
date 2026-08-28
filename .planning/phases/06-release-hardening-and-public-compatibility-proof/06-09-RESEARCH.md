# Phase 06: Gate 60 protocol-ID correction — Research

**Researched:** 2026-08-28 America/Chicago  
**Scope:** Correct the protocol-ID assertion in merged plans 06-07 and 06-08.  
**Authoritative evidence:** GitHub issue #60 comment `5450674905`, from actual
compiled `dist/index.js` executions with installed
`@modelcontextprotocol/client@2.0.0` and `@modelcontextprotocol/server@2.0.0`.

## Confirmed protocol facts

The legacy official client sends numeric ID `0` for `initialize`.
`notifications/initialized` has no ID. Its first post-connect `tools/call`
uses numeric ID `1`. The cancellation notification therefore names ID `1`.

The official client pinned to `2026-07-28` sends `server/discover` with the
string ID `server-discover-probe-1`. Its first post-connect `tools/call` uses
numeric ID `0`. The cancellation notification therefore names ID `0`.

The installed server SDK has a truthiness guard in its cancellation handler.
It drops numeric ID `0`. This is the modern defect path. Legacy ID `1` is
required regression proof for the same actual executable boundary. It is not
evidence of the numeric-zero defect.

## Correction contract

1. The modern `2026-07-28` official `Client` and `StdioClientTransport` path
   must cancel its actual first `tools/call`, numeric ID `0`, through compiled
   `dist/index.js`, the public local bridge, runtime, and invented abortable
   Standard source.
2. The legacy official client path must cancel its actual first `tools/call`,
   numeric ID `1`, through that same compiled production chain. This is a
   legacy regression guard.
3. Both paths must observe the official cancellation notification with the
   request ID used by the corresponding tool call. The test may passively
   observe transport messages. It must not emit frames, allocate IDs, replace
   the official transport, or replace the server or runtime.
4. The local bridge may proceed unchanged when it uses public SDK APIs, keys
   active callbacks by their actual request ID, accepts numeric zero, combines
   the SDK and bridge signals, and removes active controllers and relays after
   each terminal state.
5. The correction retains the registration matrix, mutation proof, Node
   20.20.2 and 22.22.2 clean-worktree gates, cleanup proof, and independent
   exact-head findings-only review.

## Boundaries

This correction does not install, upgrade, or modify an SDK or lockfile. It
does not change the stdio transport or JSON-RPC protocol. It does not use a
server/runtime test double as delivery proof. The existing invented HTTP
preload may isolate the upstream source only. It may not contain credentials,
Merchant Data, or copied Toast material.

Issue #60 remains open until the corrected candidate passes the retained
evidence gates and receives independent exact-head review. This correction
does not resolve #28, T5-003-G01, live compatibility, Merchant consent, Terms
or brand approval, signing, publication, or the pending GitHub-attributable
reviews for PR #55 and PR #58.

## Source audit

SOURCE | ID | Required fact or decision | Plan | Status
--- | --- | --- | --- | ---
GOAL | Phase 06 | Production compatibility needs actual executable evidence without an unresolved claim. | 06-09, 06-08 | COVERED
REQ | T6-003 | Package-facing stdio behavior needs exact-head production-chain evidence. | 06-09, 06-08 | COVERED
REQ | #60 | Modern first-tool numeric-zero cancellation requires a reviewed local correction or SDK correction. | 06-09 Task 1, 06-08 | COVERED
RESEARCH | Actual legacy trace | `initialize` consumes ID 0 and first `tools/call` is ID 1. | 06-09 Tasks 1-2 | COVERED
RESEARCH | Actual modern trace | `server/discover` precedes first `tools/call` ID 0. | 06-09 Tasks 1-2 | COVERED
RESEARCH | Public bridge | The local bridge can observe and abort modern numeric-zero cancellation without SDK changes. | 06-09 Task 1 | COVERED
RESEARCH | Existing gates | Registration, mutations, cleanup, Node 20/22, and exact review remain required. | 06-08 | COVERED
CONTEXT | D-01 | Separate implementation, local evidence, and external gates. | 06-09 Task 2, 06-08 Task 2 | COVERED
CONTEXT | D-02, D-03 | Do not claim approval, publication, consent, or legal sufficiency. | 06-09 Task 2, 06-08 Task 2 | COVERED
CONTEXT | D-04, D-05, D-06 | Retain consent, credential, no-training, and excluded-data limits. | 06-09 Task 1 | COVERED
CONTEXT | D-07, D-08 | Preserve Standard registrations and body-free Analytics behavior. | 06-08 Task 1 | COVERED
CONTEXT | D-09 | Keep all named release gates open until owned proof exists. | 06-09 Task 2, 06-08 Tasks 2-3 | COVERED
