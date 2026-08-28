# GSD execution state snapshot

milestone: v1.0
milestone_name: Public local Toast reporting MCP

**Generated:** 2026-08-28
**Authority:** snapshot only; reconcile against GitHub and `LOOP.md` before acting  
**Observed `main`:** `f2ea7627c006907b5026079d62b861d8cda52dfe`

## Canonical campaign position

`LOOP.md` shows:

- T0-001 CLOSED;
- T1-001 through T1-006 CLOSED;
- T2-001 production location-source repair is CLOSED after PR #27 merged and passed its Node 20/22 and mutation gates;
- T2-002 capability preflight is CLOSED after PR #12 merged and passed its Node 20/22 gates;
- T3-001, T3-002, and T3-003 are CLOSED on `main`;
- T4 is CLOSED after PR #48 merged with production stdio evidence;
- T5-001 and T5-002 are CLOSED; T5-003 safe MCP wiring is merged, but its
  complete result contract remains open behind G01;
- T6-001 and T6-002 are CLOSED; T6-003 is MERGED as local synthetic package
  evidence and remains subject to external release gates.

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
| T4 cash source/report | PR #46 | merged as `b52f3949d585435d19bab1fcc2c452fc1326d3ac` | CLOSED source slice after CLEAN review; rebuilt main suite passed 342 tests |
| T4 labor source/report | PR #47 | merged as `428cca196aba6497d72e942f7dd7cb021ae49e77` | CLOSED source slice after CLEAN review; rebuilt main suite passed 319 tests |
| T4 shared MCP integration | PR #48 | merged as `9f145c287bafc3817ba79767e59c965353e544ce` | CLOSED; independent review CLEAN at `3909f10732cf7b1a8f42109b1b9c79d4c6362f3c`; rebuilt Node 22 `npm run check` passed 364 tests and child-process report-tool stdio tests passed 43/43 |
| T5-002 Analytics job lifecycle | PR #50 | merged as `0c6de53760b64b38b5cae30717117c551aca7e1d`; reviewed at `e3d07868ed0c5fa18f5bbcfdc2aa52bc912661ee` | CLOSED; Node 20/22 candidate evidence passed 399 tests, 15 focused lifecycle tests, 16/16 mutations, and package validation; rebuilt Node 22 main passed; synthetic internal lifecycle only, with G01-G05 and T5-003 MCP wiring open |
| T5-003 Analytics MCP boundary | PR #51 | merged as `ff39d1d79dd4b7532d0314279ec62df1727f21ff`; reviewed CLEAN at `55ab1e2d35c80c0de596bc390f292b39fff1d143` | SAFE MCP WIRING MERGED; Node 20/22 candidate evidence passed 406 tests, focused stdio 7/7, 18/18 isolated mutations, and package validation; rebuilt Node 22 main passed. The one tool is denied/incomplete only. G01 blocks any complete result parser or report claim. |
| T6-002 operator documentation | #22 / PR #52 | merged as `bfda1c905c58b7821658cb400a95053d58cdc805`; reviewed CLEAN at `5a1b4ddbe8616284ce7755d2b53ecccb110ebecc` | CLOSED; Node 22 rebuilt main passed public documentation 5/5, 42 files / 411 tests, and package validation. This is documentation and synthetic evidence only. |
| T6-003 installed package evidence | #22 / PR #53 | merged as `f2ea7627c006907b5026079d62b861d8cda52dfe`; reviewed CLEAN at `ab1180d76dae139b813b7a8c4aa5bfa903eb02b2` | MERGED local synthetic package evidence. Candidate `d5c47f39321f13c991d2abe6fcf3c035a020c9d2` passed Node 20.20.2 and 22.22.2 committed restores and checks. Post-merge Node 22.22.2 passed committed restore, full check, and package dry-run: 43 files, 411 normal tests, one installed-artifact test, and 151 paths. This does not make the package release-ready. |

## Current executor capability

This executor can complete authentic registry-backed `npm ci` and package validation on Node 20.20.2 and Node 22.22.2. It does not have authorized live Toast credentials. The campaign must continue to reject validation doubles, copied package caches, hand-built lockfiles, and reconstructed results.

## Dependency frontier

### Executable now

- no further local T6-003 package-evidence work is implied by its MERGED state;
- retain T5-003-G01 and all external release gates without converting synthetic
  evidence into live proof.

### Human/external gates

- #28 requires owner-authorized live Standard Toast credentials;
- #4/T6-003 first-tool-request cancellation has no local dependency-upgrade
  action: the npm registry reports `@modelcontextprotocol/server@2.0.0` and
  `@modelcontextprotocol/client@2.0.0` as the current latest releases;
- T5-003-G01 requires a corrected current Toast retrieval response contract;
- live Analytics compatibility requires authorized access and documented
  Merchant consent;
- any production Toast access beyond synthetic fixtures requires authorization/consent constraints from `AGENTS.md`;
- T6 signing, publication, and human or Toast Terms and brand approval remain
  external gates.

## Immediate autonomous order

1. Do not create further local T6-003 package-evidence work from its MERGED
   state.
2. Keep #4/T6-003, T5-003-G01, #28, live Standard compatibility, live
   Analytics compatibility, signing, publication, and human or Toast Terms and
   brand approval as owned external gates.

## Refresh rule

This file is expected to become stale as soon as GitHub moves. At the start of every autonomous run:

1. read `AGENTS.md` and `LOOP.md`;
2. fetch current `main`, open PRs/issues, and exact heads;
3. compare that state with this snapshot;
4. update STATE only when the snapshot itself is part of an explicit documentation/control-plane slice;
5. never use stale STATE to override GitHub or `LOOP.md`.
