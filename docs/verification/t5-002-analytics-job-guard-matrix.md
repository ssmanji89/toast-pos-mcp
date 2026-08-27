# T5-002 Analytics Job Guard Matrix

This matrix defines local synthetic proof before candidate selection.
It does not prove live Toast Analytics compatibility.

| Guard | Focused test | Source mutation identifier |
|---|---|---|
| Six-operation catalog remains closed | `analytics-report-jobs.test.ts`: six reviewed routes | `closed-catalog` |
| Private selection ownership precedes every turn | `reject forged authority` | `selection-ownership` |
| Create identifier remains opaque | `opaque bounded create identifier` | `opaque-create-id` |
| Completed body remains unread | `polls once` | `no-result-body` |
| 202 has local bounds | `exhausts local pending budget` | `pending-bounds` |
| 404 is invalid-or-expired | `invalid-or-expired` | `invalid-or-expired` |
| 409 has one replacement budget | `bounds conflict replacements` | `replacement-budget` |
| POST and GET have distinct limiter policy | `lifecycle polling` | `post-get-limiter` |
| Limiter key includes operation, method, range, identity, and set | `six reviewed routes` | `limiter-key` |
| Discovery and job limiters stay separate | `runtime composition` | `limiter-separation` |
| One signal reaches capability, limiter, sleep, and fetch | `polls once` | `signal-propagation` |
| Deferred token cancellation stops later turns | `cancellation stops deferred token` | `deferred-token-cancellation` |
| In-flight POST cancellation stops later turns | `cancellation stops deferred token` | `inflight-post-cancellation` |
| In-flight GET cancellation stops later turns | `cancellation stops deferred token` | `inflight-get-cancellation` |
| Cancellation errors stay sanitized | `cancellation stops deferred token` | `error-sanitization` |
| Provenance and completeness are explicit | `polls once` | `provenance-completeness` |
| Local policy labels stay explicit | `exhausts local pending budget` | `local-policy-label` |
| Runtime composes only an internal Analytics adapter | `runtime composes one private job adapter` | `runtime-internal-only` |

## Open vendor-contract gates

G01 remains open. The payout-by-payment family is absent.

G02 remains open. The inactive-status option is absent.

G03 remains open. Create identifiers have no UUID-only parser.

G04 remains open. Disputed metrics counts are absent.

G05 remains open. Completed-result parsing is absent.

Passing these tests does not close these gates.
