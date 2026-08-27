# T5-001 Analytics adapter guard matrix

**Slice:** T5-001 Analytics capability and management-group location adapter  
**Rule:** enumerate every guard before selecting a candidate  
**Evidence state:** static pre-candidate mapping only

This matrix maps T5-001 safety guards to focused compiled tests and source mutations. It contains no candidate SHA, command result, package result, or review result. A missing mutation identifier is a blocking proof gap. It is not equivalent to a passing aggregate test.

| ID | Guard / invariant | Focused compiled test | Mutation identifier | Static status |
|---|---|---|---|---|
| G01 | Analytics configuration is optional. Standard configuration remains unchanged when all Analytics values are absent. | `analytics-config.test.js`: optional Standard configuration | Missing: `analytics-config-optional-standard-compatibility` | BLOCKED |
| G02 | Analytics configuration requires all four `TOAST_ANALYTICS_*` values. | `analytics-config.test.js`: complete four-value set | Missing: `analytics-config-completeness` | BLOCKED |
| G03 | Analytics credentials and configuration do not serialize. | `analytics-config.test.js`: private and frozen Analytics credentials | Missing: `analytics-config-secret-serialization` | BLOCKED |
| G04 | Analytics token scope requires `enterprise-metrics:read`. | `analytics-capabilities.test.js`: accepts only required scope | `analytics-scope-preflight` | MAPPED |
| G05 | Analytics capability context cannot use Standard connection scopes or identity state. | `analytics-capabilities.test.js`: no Standard connection scopes; separate frozen scopes | Missing: `analytics-standard-scope-substitution`, `analytics-cross-identity-state` | BLOCKED |
| G06 | The sole Analytics request method is `GET`. | `analytics-access-adapter.test.js`: one exact GET | `analytics-method` | MAPPED |
| G07 | The sole Analytics request path is `/era/v1/restaurants-information`. | `analytics-access-adapter.test.js`: one exact GET | `analytics-path` | MAPPED |
| G08 | The Analytics discovery request omits `Toast-Restaurant-External-ID`. | `analytics-access-adapter.test.js`: no Standard restaurant header | `analytics-standard-header` | MAPPED |
| G09 | The closed operation cannot construct guest-payment paths or request guest-linked data. | `analytics-access-adapter.test.js`: minimized response projection | Missing: `analytics-guest-route` | BLOCKED |
| G10 | Restaurant records require the validated source schema. | `analytics-access-adapter.test.js`: malformed source rejection | `analytics-schema` | MAPPED |
| G11 | Duplicate restaurant GUIDs fail before publication. | `analytics-access-adapter.test.js`: duplicate identifiers and atomic validation | `analytics-duplicate-guid` | MAPPED |
| G12 | A failed refresh does not replace a complete registry. | `analytics-access-adapter.test.js`: validates atomically | Missing: `analytics-atomic-publication` | BLOCKED |
| G13 | Selected restaurant sets contain only valid UUIDs. | `analytics-access-adapter.test.js`: canonical non-empty UUID subset | Missing: `analytics-selection-uuid` | BLOCKED |
| G14 | Selected restaurant sets reject duplicates. | `analytics-access-adapter.test.js`: canonical non-empty UUID subset | `analytics-selection-duplicate` | MAPPED |
| G15 | Selected restaurant sets reject inaccessible members. | `analytics-access-adapter.test.js`: canonical non-empty UUID subset | `analytics-selection-membership` | MAPPED |
| G16 | Selected restaurant sets canonicalize normalized GUID order. | `analytics-access-adapter.test.js`: canonical non-empty UUID subset | Missing: `analytics-selection-canonicalization` | BLOCKED |
| G17 | A selected restaurant set stays bound to its Analytics credential identity. | `analytics-access-adapter.test.js`: identity isolation | Missing: `analytics-selection-identity` | BLOCKED |
| G18 | Cancellation reaches the literal Analytics GET. | `analytics-access-adapter.test.js`: sends cancellation to source GET | `analytics-cancellation` | MAPPED |
| G19 | The restaurant-information limiter remains endpoint-only at 5 requests per second. | `analytics-access-adapter.test.js`: documented endpoint limiter | `analytics-endpoint-limiter` | MAPPED |
| G20 | Analytics identities do not share registry or limiter state. | `analytics-access-adapter.test.js`: separate registry and limiter state | Missing: `analytics-limiter-isolation` | BLOCKED |
| G21 | Runtime composition is internal and does not wire Analytics into MCP tools or Standard location state. | `analytics-access-adapter.test.js`: internal runtime composition | Missing: `analytics-runtime-tool-boundary` | BLOCKED |

## Candidate-selection rule

Candidate selection is blocked until every `Missing:` identifier above is implemented in `scripts/verify-t5-001-analytics-guard-mutations.mjs` and its focused test fails for the corresponding mutation. The existing script lists only the ten `MAPPED` mutations. Running it before the missing identifiers exist cannot prove the blocked guards.

## Scope boundary

This matrix governs synthetic implementation evidence only. It does not claim authorized live Analytics compatibility, Merchant consent for AI processing, first-tool-request cancellation, signing, publication, or install smoke. T5-002 owns the Analytics report-job lifecycle and endpoint/time-range policy. T5-003 owns Analytics MCP tools and presentation.

DOX: updated. This document records the durable T5-001 safety-proof contract.
