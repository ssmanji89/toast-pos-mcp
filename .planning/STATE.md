# GSD execution state snapshot

milestone: v1.0
milestone_name: Public local Toast reporting MCP

**Generated:** 2026-08-27
**Authority:** snapshot only; reconcile against GitHub and `LOOP.md` before acting  
**Observed `main`:** `b63b6e2`

## Canonical campaign position

`LOOP.md` shows:

- T0-001 CLOSED;
- T1-001 through T1-006 CLOSED;
- T2-001 production location-source repair is CLOSED after PR #27 merged and passed its Node 20/22 and mutation gates;
- T2-002 capability preflight is CLOSED after PR #12 merged and passed its Node 20/22 gates;
- T3-001, T3-002, and T3-003 are CLOSED on `main`;
- T4/T5 remain open;
- T6-001 is closed out of sequence; T6-002/T6-003 remain open.

## Campaign work observed

| Work | PR / issue | Exact observed head | State at snapshot |
|---|---|---|---|
| T2-001 production location-source regression repair | #16 / PR #27 | merged as `bde1546c89825e9435b274f3f49ef02f266cb65c` | CLOSED; Node 20/22 gates passed, 35/35 required mutations caught, independent review CLEAN; issue #28 remains the live Standard credential gate |
| T2-002 capability preflight | PR #12 | merged as `0a72aeae2ab22c06626cf40d19d6f7756d7192ed` | CLOSED; Node 20/22 gates passed, independent review CLEAN; internal preflight only, not MCP report-tool wiring |
| successful transport provenance | #15 / PR #29 | merged as `afdffee57a43207bc045b08e2be1eae2e6d4bd23` | CLOSED; Node 20/22 gates passed, independent review CLEAN; detailed results retain immutable API family and request scope |
| Standard location live compatibility | #28 | n/a | release gate; owner-authorized live Standard credential required |
| MCP SDK v2 migration | #17 / PR #24 | merged as `4bcb2a5ada264beffde97804f43daa69893f93cd` | CLOSED; authentic Node 20/22 package and stdio runtime gates passed; independent review CLEAN |
| stateless/reconnect/cancellation compatibility | #4 / PR #45 | merged as `4a069937`; reviewed CLEAN at `a406b479` | local stdio lifecycle, reconnect, and nonzero-ID cancellation evidence is merged; first-tool-request cancellation remains the owned T6-003 release gate |
| ordersBulk bounded-memory/page-fold prerequisite | #31 / PR #35 | merged as `ca02850f6a052ffe0ec68bf3ce7679176b08bd85` | CLOSED; Node 20/22 gates passed, independent review CLEAN, issue #31 closed |
| Toast rate-limit reset semantics and hierarchy | #32 / #36 / PR #37 | merged as `793784e69bb538624ef5b0281abd9ab25481a25e` | CLOSED; Node 20/22 gates passed, 13/13 mutations caught, independent review CLEAN, issue #32 closed |
| Standard request cancellation | PR #39 | merged as `5714eac747375d2410adab6ff62bb34a230e4c04` | CLOSED; Node 20/22 gates passed, 11/11 cancellation mutations caught, independent review CLEAN; internal pre-T3 boundary only |
| T3 normalization | #18 / PR #34 | merged as `1ab7cb7` | CLOSED; normalized Orders is consumed by the production report paths |
| Standard sales/payment MCP tools | #19 / PR #40 | merged as `291cda2` | CLOSED; production stdio tools, structured denials, cancellation, provenance, and Node 20/22/package evidence merged |
| item/dimension sales MCP tools | PR #41 | merged as `e0effdb` | CLOSED; item/dimension stdio reporting, menu/config context, selected-group tags, and final structured-denial repairs merged |

## Current executor capability

This executor can complete authentic registry-backed `npm ci` and package validation on Node 20.20.2 and Node 22.22.2. It does not have authorized live Toast credentials. The campaign must continue to reject validation doubles, copied package caches, hand-built lockfiles, and reconstructed results.

## Dependency frontier

### Executable now

- start T4-001 and T4-002 independently with T3-002's merged production tool
  chain as their prerequisite; GitHub issue #20 records this dependency
  correction;
- retain the external release gates without converting synthetic evidence into live proof.

### Human/external gates

- #28 requires owner-authorized live Standard Toast credentials;
- any production Toast access beyond synthetic fixtures requires authorization/consent constraints from `AGENTS.md`;
- T6 publication/signing remains external/human when package credentials or signing are required.

## Immediate autonomous order

1. Start T4-001 and T4-002 with separate source ownership after confirming
   their source and capability boundaries.
2. Keep #4/T6-003, #28, and T6 publication/signing as owned external gates.

## Refresh rule

This file is expected to become stale as soon as GitHub moves. At the start of every autonomous run:

1. read `AGENTS.md` and `LOOP.md`;
2. fetch current `main`, open PRs/issues, and exact heads;
3. compare that state with this snapshot;
4. update STATE only when the snapshot itself is part of an explicit documentation/control-plane slice;
5. never use stale STATE to override GitHub or `LOOP.md`.
