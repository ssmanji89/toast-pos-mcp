# T5-002 Analytics Job Guard Matrix

This matrix defines local synthetic behavioral proof. It does not prove live Toast Analytics compatibility.

| Guard | Exact behavioral test | Compiling semantic mutation | Expected result |
|---|---|---|---|
| Closed six-operation catalog and G01 | `Analytics report jobs use exactly the six reviewed create and retrieval routes` | Change the payout sales retrieval route to payout payments. | The named route assertion fails. |
| Opaque create identifier and G03 | `Analytics report jobs reject malformed create identifiers without publishing a descriptor` | Reduce the accepted opaque identifier bound to one byte. | A valid opaque identifier is rejected. |
| Body-free completed state and G05 | `Analytics report jobs retain only an opaque bounded create identifier and body-free statuses` | Classify 200 as failed instead of unavailable-result completion. | The completed-state assertion fails. |
| Pending bound | `Analytics report lifecycle exhausts its local pending budget and cancels without later turns` | Reduce the poll budget to one. | The recorded poll count fails. |
| 404 classifier | `Analytics report lifecycle returns invalid-or-expired and bounds conflict replacements` | Classify 404 as failed-or-incomplete. | The invalid-or-expired assertion fails. |
| Replacement bound | `Analytics report lifecycle returns invalid-or-expired and bounds conflict replacements` | Reduce the replacement budget to zero. | The replacement count fails. |
| Capability envelope | `Analytics lifecycle maps capability and source failures to immutable safe envelopes` | Map a denial to failed-or-incomplete. | The denied-envelope assertion fails. |
| Source failure envelope | `Analytics lifecycle maps capability and source failures to immutable safe envelopes` | Replace the synthetic source rejection with a malformed success. | The safe failed-envelope assertion fails. |
| Create minute/hour windows | `Analytics lifecycle enforces all documented endpoint windows atomically` | Reduce the 10/minute budget to one. | The controlled wait assertion fails. |
| Retrieval second/minute windows | `Analytics lifecycle enforces all documented endpoint windows atomically` | Reduce the 30/minute retrieval budget to one. | The controlled wait assertion fails. |
| 429 Retry-After | `Analytics lifecycle retries a bounded 429 create turn using Retry-After` | Ignore a valid Retry-After header. | The exact wait assertion fails. |
| 429 retry budget | `Analytics lifecycle retries a bounded 429 create turn using Retry-After` | Set the retry budget to zero. | The retry lifecycle assertion fails. |
| G02 inactive option | `Analytics report jobs use exactly the six reviewed create and retrieval routes` | Send a non-empty inactive exclusion list. | The closed request-body assertion fails. |
| Safe provenance | `Analytics lifecycle maps poll and replacement failures without retaining source bodies` | Drop the safe request ID. | The safe provenance assertion fails. |
| Failed POST safe provenance | `Analytics lifecycle retains safe IDs from failed create and replacement turns` | Stop recording a safe create response ID. | The initial and replacement failure provenance assertion fails. |

## Open vendor-contract gates

- G01: The payout-by-payment family remains absent.
- G02: The inactive-status option remains absent.
- G03: Create identifiers have no UUID-only parser.
- G04: Disputed metrics count fields have no projection.
- G05: Completed-result top-level parsing remains absent.

Behavioral proof does not close any vendor gate. T5-003 alone owns MCP tools and stdio presentation.
