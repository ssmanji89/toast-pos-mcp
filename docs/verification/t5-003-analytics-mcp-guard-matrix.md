# T5-003 Analytics MCP Guard Matrix

This matrix records local synthetic proof for `toast_analytics_metrics_day`.
It does not prove live Toast Analytics compatibility.

| Guard | Exact behavioral test | Compiling semantic mutation | Expected result |
|---|---|---|---|
| Tool registration | `Analytics tool registration exposes one fixed metrics-day tool` | Remove Analytics registration from the supplied runtime path. | Discovery does not find the tool. |
| One GUID and date | `Analytics tool requires one UUID restaurant and one real numeric business date` | Remove the UUID validator. | Invalid input reaches the fixture. |
| Runtime-only authority | `Analytics tool denies absent capability or inaccessible selection before Metrics job access` | Change the absent-runtime denial reason. | The typed denial differs. |
| Scope preflight | `Analytics tool denies absent capability or inaccessible selection before Metrics job access` | Skip the management-group refresh. | Scope denial does not occur first. |
| Selection membership | `Analytics tool uses only the closed Metrics/day lifecycle input` | Send a duplicate selected GUID. | Selection denies the source call. |
| Fixed Metrics/day input | `Analytics tool uses only the closed Metrics/day lifecycle input` | Change Metrics to Menu. | The closed fixture rejects the route. |
| Equal dates | `Analytics tool uses only the closed Metrics/day lifecycle input` | Change the end date. | The fixture rejects the request body. |
| Route and method catalog | `Analytics tool uses only the closed Metrics/day lifecycle input` | Change the accepted POST route. | The source request fails. |
| No Standard header | `Analytics tool uses only the closed Metrics/day lifecycle input` | Record a Standard header in the fixture turn. | The child-process proof rejects it. |
| No grouping/inactive/name settings | `Analytics tool preserves public lifecycle provenance and informational non-GAAP scope` | Remove the grouping exclusion. | The fixed public policy differs. |
| Analytics source label | `Analytics tool uses only the closed Metrics/day lifecycle input` | Change `analytics_api`. | The source label assertion fails. |
| Informational non-GAAP text | `Analytics tool preserves public lifecycle provenance and informational non-GAAP scope` | Remove `non-GAAP`. | The formula note assertion fails. |
| Body-free provenance | `Analytics terminal states publish only body-free denied or incomplete envelopes` | Add a raw body field. | The forbidden field assertion fails. |
| 200 schema gate | `Analytics terminal states publish only body-free denied or incomplete envelopes` | Change the schema-gate reason. | The HTTP 200 assertion fails. |
| No complete branch | `Analytics terminal states publish only body-free denied or incomplete envelopes` | Publish `complete`. | The terminal status assertion fails. |
| Guest and payment exclusion | `Analytics tool preserves public lifecycle provenance and informational non-GAAP scope` | Remove the guest exclusion. | The fixed public policy differs. |
| Report GUID exclusion | `Analytics terminal states publish only body-free denied or incomplete envelopes` | Add a report request identifier. | The forbidden field assertion fails. |
| Cancellation propagation | `Analytics tool propagates nonzero MCP cancellation without publishing an envelope` | Omit the MCP request signal. | The synthetic source does not abort. |

## Public contract and G01 boundary

The tool accepts one Analytics-selected restaurant GUID and one numeric calendar business date.
It uses only the process-owned Analytics authority and the closed Metrics/day lifecycle.
Every result is a body-free `denied` or `incomplete` envelope.
`source` is `analytics_api` and `report` is `analytics_metrics_day`.
The output is informational and non-GAAP.

T5-003-G01 remains open.
The implementation does not parse a successful retrieval body.
It does not expose a row, amount, raw body, token, report request GUID, guest data, payment data, restaurant name, grouping, or inactive-only setting.

## Commands

```sh
npm run build:test
node --test dist-test/test/analytics-report-tools-stdio.test.js
node scripts/verify-t5-003-analytics-mcp-guard-mutations.mjs
```

## External gates

- T5-003-G01 requires a current corrected Toast OpenAPI document or written confirmation of retrieval top-level shape and cardinality.
- T5-002-G01 through G04 remain vendor contracts that this tool avoids.
- Owner-authorized live Analytics compatibility requires documented Merchant consent and separate review.
- T6-003 first-tool-request cancellation remains a release gate.
- Issue #28 and T6 signing and publication remain release gates.

Synthetic proof does not close any external gate.

DOX: updated
