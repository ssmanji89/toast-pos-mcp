# GSD execution state snapshot

milestone: v1.0
milestone_name: Public local Toast reporting MCP

**Generated:** 2026-08-26
**Authority:** snapshot only; reconcile against GitHub and `LOOP.md` before acting  
**Observed `main`:** `793784e69bb538624ef5b0281abd9ab25481a25e`

## Canonical campaign position

`LOOP.md` shows:

- T0-001 CLOSED;
- T1-001 through T1-006 CLOSED;
- T2-001 production location-source repair is CLOSED after PR #27 merged and passed its Node 20/22 and mutation gates;
- T2-002 capability preflight is CLOSED after PR #12 merged and passed its Node 20/22 gates;
- T3/T4/T5 remain open;
- T6-001 is closed out of sequence; T6-002/T6-003 remain open.

## Campaign work observed

| Work | PR / issue | Exact observed head | State at snapshot |
|---|---|---|---|
| T2-001 production location-source regression repair | #16 / PR #27 | merged as `bde1546c89825e9435b274f3f49ef02f266cb65c` | CLOSED; Node 20/22 gates passed, 35/35 required mutations caught, independent review CLEAN; issue #28 remains the live Standard credential gate |
| T2-002 capability preflight | PR #12 | merged as `0a72aeae2ab22c06626cf40d19d6f7756d7192ed` | CLOSED; Node 20/22 gates passed, independent review CLEAN; internal preflight only, not MCP report-tool wiring |
| successful transport provenance | #15 / PR #29 | merged as `afdffee57a43207bc045b08e2be1eae2e6d4bd23` | CLOSED; Node 20/22 gates passed, independent review CLEAN; detailed results retain immutable API family and request scope |
| Standard location live compatibility | #28 | n/a | release gate; owner-authorized live Standard credential required |
| MCP SDK v2 migration | #17 / PR #24 | merged as `4bcb2a5ada264beffde97804f43daa69893f93cd` | CLOSED; authentic Node 20/22 package and stdio runtime gates passed; independent review CLEAN |
| stateless/reconnect/cancellation compatibility | #4 | research intake | must be resliced/reconciled before user-facing tool lifecycle is considered production-proven |
| ordersBulk bounded-memory/page-fold prerequisite | #31 / PR #35 | merged as `ca02850f6a052ffe0ec68bf3ce7679176b08bd85` | CLOSED; Node 20/22 gates passed, independent review CLEAN, issue #31 closed |
| Toast rate-limit reset semantics and hierarchy | #32 / #36 / PR #37 | merged as `793784e69bb538624ef5b0281abd9ab25481a25e` | CLOSED; Node 20/22 gates passed, 13/13 mutations caught, independent review CLEAN, issue #32 closed |
| Standard request cancellation | PR #39 | `6d372c484a93b3f93430c7722884d782d83bc891` | open draft; stacked on PR #37 |
| T3 normalization | #18 / PR #34 | `08b892033d0534c7b0faa91669e4708c7be83931` | FINDINGS; applied-tax identity, fixed-hundredths naming, canonical decimal, and module-size repairs are active |
| Standard sales/payment MCP tools | #19 / PR #40 | `67239a7788418df3cd2e6a7db1c9c234352171da` | open draft; waits on PR #34 and the PR #35 → #37 → #39 chain |
| item/dimension sales MCP tools | PR #41 | `a48ed600aa0827de8a223b4e0f576fda0e386035` | open draft; reviewed findings remain; rebase only after PR #40 stabilizes |

## Current executor capability

This executor can complete authentic registry-backed `npm ci` and package validation on Node 20.20.2 and Node 22.22.2. It does not have authorized live Toast credentials. The campaign must continue to reject validation doubles, copied package caches, hand-built lockfiles, and reconstructed results.

## Dependency frontier

### Executable now

- flatten the transport/provenance and page-fold prerequisite stack in dependency order;
- rebase PR #40 after its prerequisites, then prove the complete stdio-to-report response path;
- review PR #41 in parallel without rebuilding it.

### Human/external gates

- #28 requires owner-authorized live Standard Toast credentials;
- any production Toast access beyond synthetic fixtures requires authorization/consent constraints from `AGENTS.md`;
- T6 publication/signing remains external/human when package credentials or signing are required.

## Immediate autonomous order

1. Rebase and finalize PR #39 on merged PR #37 behavior.
2. Repair and finalize PR #34 in parallel.
3. Rebase PR #40 after all prerequisites land, then run its complete production-chain validation and independent review.
4. Rebase, validate, and merge PR #41 only after PR #40 stabilizes.

## Refresh rule

This file is expected to become stale as soon as GitHub moves. At the start of every autonomous run:

1. read `AGENTS.md` and `LOOP.md`;
2. fetch current `main`, open PRs/issues, and exact heads;
3. compare that state with this snapshot;
4. update STATE only when the snapshot itself is part of an explicit documentation/control-plane slice;
5. never use stale STATE to override GitHub or `LOOP.md`.
