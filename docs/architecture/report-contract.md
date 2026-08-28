# Public Report Contract

**Scope:** current local source registration contract.
**Evidence:** implemented source and synthetic repository tests only.

## Evidence state

### Implemented

`src/report-tools.ts` registers the five Standard API tool names below.
`src/analytics-report-tools.ts` registers the separate Analytics API tool.
All tools are read-only.

### Synthetic validation

The documentation contract test compares the six registrations with this
catalog and the README. Synthetic fixtures validate bounded source and result
handling. This evidence does not establish live compatibility.

### External gates

T5-003-G01, #4/T6-003, #28, live Standard compatibility, live Analytics
compatibility, installed-artifact smoke, signing, publication, and human brand
and Terms approvals remain open.

## Standard API tools

Every Standard API tool accepts `businessDate` as a real `yyyyMMdd` Toast
business date and an optional selected `restaurantGuid`. The location timezone
and closeout hour define the business-date context. A tool returns `complete`
only after required source reads validate. Missing scope, inaccessible location,
source failure, malformed data, cancellation, or an unproven page set produces
`denied`, never zero totals. Output includes source, restaurant context,
freshness, bounded provenance, warnings, exclusions, and formula notes.

| Tool | Source family and source | Input and status behavior | Formula, completeness, and exclusion boundary |
| --- | --- | --- | --- |
| `toast_sales_summary` | Standard API; bounded `/ordersBulk` pages. | `businessDate`, optional `restaurantGuid`; complete or denied. | Uses validated order/check facts and integer minor units. It retains future orders separately and states exclusions in output. It is informational and non-GAAP. |
| `toast_payment_summary` | Standard API; paid, refund, and void payment retrievals with bounded detail hydration. | `businessDate`, optional `restaurantGuid`; complete or denied. | Keeps paid, refunded, and voided events distinct. It excludes guest, card, tender, and transaction identifiers from normalized output. It is informational and non-GAAP. |
| `toast_item_sales_summary` | Standard API; bounded `/ordersBulk` pages with current menu/configuration enrichment. | `businessDate`, optional `restaurantGuid`, and `dimension`; complete or denied. | Groups by item, category, revenue center, dining option, tag, order source, or service period. Unresolved historical references remain unresolved. It is informational and non-GAAP. |
| `toast_cash_summary` | Standard API; Cash Management entries/deposits plus bounded cash configuration sources. | `businessDate`, optional `restaurantGuid`; complete or denied. | Keeps entries, deposits, reversals, reasons, and drawer references distinct. It excludes guest payment facts, raw bodies, employee data, credentials, and tokens. It is informational and non-GAAP. |
| `toast_labor_summary` | Standard API; time entries, jobs, break types, tip withholding, and bounded Orders facts. | `businessDate`, optional `restaurantGuid`; complete, incomplete, or denied. | Active or unresolved labor facts return incomplete rather than a final aggregate. It uses aggregate-only output and excludes employee identity and raw source bodies. It is informational and non-GAAP. |

The Standard API tools share one process-owned runtime. They do not create
private OAuth, location, pagination, capability, or transport paths. Exact
source formulas and report fields remain in the [Standard report tools
contract](standard-report-tools.md).

## Analytics API lifecycle tool

`toast_analytics_metrics_day` is separate from the Standard API tools.

| Tool | Source family and source | Input and status behavior | Formula, completeness, and exclusion boundary |
| --- | --- | --- | --- |
| `toast_analytics_metrics_day` | Analytics API; a Metrics/day report-job lifecycle for one authorized restaurant. | `restaurantGuid` and `businessDate`; only `denied` or `incomplete` envelopes. | This is body-free while `analytics_result_schema_unverified` remains unresolved. It exposes no completed Analytics body, formula, or report. Its request policy excludes guest-linked data, payment data, restaurant name, grouping, and inactive-only data. It is informational and non-GAAP. |

The Analytics tool records lifecycle provenance only when it is available. It
does not convert a pending, expired, unavailable, or unverified result into a
complete value. T5-003-G01 blocks a verified completed result schema.

## Public limits

This catalog records implemented local behavior. It does not state Toast
approval, endorsement, certification, partnership, public distribution
authorization, package publication, installed-artifact proof, or live
compatibility. Operators must review the current [Toast API
Terms](https://pos.toasttab.com/api-terms-of-use), observed here as dated
2026-06-23, and obtain required approvals outside this repository.
