# T2-001 location-source guard matrix

**Slice:** regression repair #16 / PR #27  
**Rule:** enumerate first, then mutate every guard  
**Exact mutation execution:** pending an authentic dependency-backed executor

This matrix exists because the original T2-001 review proved that self-selected mutation samples systematically miss ordinary-looking schema guards. A green aggregate test count is not evidence that every guard is load-bearing.

| ID | Guard / invariant | Focused proof |
|---|---|---|
| G01 | Partners payload must be an array | `location-guard-matrix`: non-array Partners payload rejected |
| G02 | Partners restaurant GUID must be UUID | invalid Partners restaurant UUID rejected |
| G03 | Partners management-group GUID must be UUID/null/absent | invalid Partners management-group UUID rejected |
| G04 | Partners `deleted` must be boolean | non-boolean deleted flag rejected |
| G05 | Partners `scopes` must be an array | non-array scopes rejected |
| G06 | Connection scope cannot be empty | empty scope rejected |
| G07 | Connection scope cannot contain surrounding whitespace | whitespace scope rejected |
| G08 | Connection scope must match safe open-string syntax | unsafe syntax rejected |
| G09 | Connection scope maximum length is 128 | 129-character scope rejected |
| G10 | Duplicate connection scopes collapse in first-seen order | explicit duplicate/order proof |
| G11 | Restaurant-detail GUID must be UUID | invalid detail UUID rejected |
| G12 | Detail management-group GUID must be UUID/null/absent | invalid detail group UUID rejected |
| G13 | Restaurant name cannot be empty | empty name rejected |
| G14 | Restaurant name cannot be whitespace-only | blank name rejected |
| G15 | Restaurant detail requires `general` object | missing `general` rejected |
| G16 | `archived` must be boolean when present | non-boolean archived rejected |
| G17 | Timezone must be recognized by host ICU | unknown timezone rejected |
| G18 | Bare fixed-offset timezone is always rejected before Intl | `-05:00` rejected |
| G19 | `closeoutHour` must be integer | fractional closeout rejected |
| G20 | `closeoutHour` lower bound is 0 | -1 rejected |
| G21 | `closeoutHour` upper bound is 12 | 13 rejected |
| G22 | Both closeout boundaries are valid values, not truthiness sentinels | 0 and 12 accepted |
| G23 | Currency code uses uppercase three-letter ISO shape | lowercase/short/long/numeric forms rejected |
| G24 | Restaurant/group GUIDs normalize to lowercase | uppercase alphabetic UUIDs normalize and registry lookup works both cases |
| G25 | Valid but wrong detail GUID cannot hydrate another connection | mismatch denied |
| G26 | Valid but conflicting group identities cannot be silently chosen | disagreement denied |
| G27 | Explicitly archived detail is denied despite `includeArchived=false` | archived detail rejected |
| G28 | Null management-group identity remains absent; no value invented | null accepted and normalized to undefined |
| G29 | Bootstrap GUID must exist in active connection set | absent bootstrap denied |
| G30 | Deleted bootstrap is not an active operating context | deleted bootstrap denied |

## Additional cross-cutting proofs outside the matrix

`test/locations.test.ts` additionally proves:

- legitimate legacy/full-ICU identifiers `US/Central`, `Asia/Calcutta`, and `Etc/GMT+5` remain accepted;
- Partners contact/external metadata is not retained;
- active connection detail requests carry their own matching restaurant GUID header;
- a Partners 403 becomes the static `location_discovery_source_unavailable` error without leaking body/request ID/secrets;
- registry replacement is atomic across multi-location hydration;
- registry state is isolated by `RuntimeConfig` object identity;
- retained connection scopes and locations are frozen.

`test/partners-transport.test.ts` separately proves the allowlisted credential-scoped transport path:

- fixed endpoint and GET method;
- no restaurant header;
- OAuth/token acquisition ordering;
- bounded retry reuse;
- invalid-JSON sanitization;
- credential rate-limit namespace does not block restaurant-scoped state.

## Mutation execution contract

On a clean exact-head checkout with authentic locked dependencies:

1. run the complete Node 20 floor gate;
2. mutate **G01 through G30 one at a time**, restoring the exact head after each mutation;
3. require at least one focused test failure for every mutation;
4. separately mutate the Partners transport invariants above;
5. rerun the complete gate on the restored head on Node 20 and Node 22;
6. record discovered test-file count, total tests, mutation count, mutation survivors, and package dry-run contents.

Any surviving mutation is a review finding. The target is `30/30` location guards caught plus every separately enumerated Partners transport mutation caught. No sampled subset is accepted as equivalent evidence.

DOX: verification methodology only; no product behavior is changed by this document.