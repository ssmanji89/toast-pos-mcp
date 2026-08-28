# Threat Model: Local Toast Reporting MCP

**Status:** current, reviewable
**Last reviewed:** 2026-08-27
**Scope:** current source through T5-003 safe MCP wiring

## Current system state

The local stdio server registers five Standard API report tools:

- `toast_sales_summary`
- `toast_payment_summary`
- `toast_item_sales_summary`
- `toast_cash_summary`
- `toast_labor_summary`

It also registers `toast_analytics_metrics_day`. This Analytics tool is a
separate, body-free lifecycle boundary. It returns only `denied` or
`incomplete` envelopes while `analytics_result_schema_unverified` remains
unresolved. It exposes no completed Analytics body, formula, or report.

The source is implemented and repository tests use independently invented
fixtures. This is not live Toast compatibility, Merchant consent, Terms
approval, brand approval, installed-artifact evidence, signing, or publication
evidence.

## Assets and trust boundaries

| Asset | Sensitivity | Boundary |
| --- | --- | --- |
| OAuth client credentials and bearer tokens | Secret | Operator environment to process memory to Toast over TLS. |
| Restaurant GUIDs and selected location sets | Isolation-critical | Runtime, cache, limiter, report input, and response provenance. |
| Standard API records and aggregates | Merchant operational data | Toast to local process to stdio MCP host. |
| Analytics lifecycle provenance | Merchant operational metadata | Analytics adapter to local process to stdio MCP host. |
| MCP host, model provider, logs, and subprocessors | External processing boundary | Host controls where returned Merchant Data may travel. |

The MCP host can read returned report content. A local stdio process does not
make host, model-provider, logging, retention, human-review, or subprocessor
processing permitted.

## Threat register

| ID | Threat | Current control | Remaining limit |
| --- | --- | --- | --- |
| T-01 | Credential disclosure | Runtime configuration avoids durable secret storage and errors are sanitized. | An operator-controlled process can expose memory or environment values. |
| T-02 | Cross-location data use | Standard requests, state, cache, rate limits, and report provenance bind restaurant identity. Analytics uses a separate credential identity and canonical selected set. | Live compatibility remains #28 and live Analytics compatibility remains open. |
| T-03 | Capability or source failure becomes invented zero data | Capability preflight, bounded pagination, transport errors, and report status fail closed. | Live Toast behavior is not proven by fixtures. |
| T-04 | Guest or payment-linked data exposure | The product excludes guest-linked data, guest-payment datasets, delivery addresses, and payment identifiers at the request boundary. | A future scope expansion needs a new reviewed decision. |
| T-05 | Analytics becomes a false complete report | The fixed Metrics/day tool uses only the separate Analytics runtime and maps every terminal result to body-free denied or incomplete output. | T5-003-G01 blocks result parsing and complete Analytics claims. |
| T-06 | AI or third-party processing without authority | The operator guide requires documented Merchant consent and review of the host, provider, logging, retention, human review, and subprocessors. | The acknowledgment environment variable is not legal proof. |
| T-07 | Public wording implies Toast approval | Public documentation uses neutral identification and links the current Terms. | Brand-feature use, name use, and public distribution approval remain human or Toast gates. |
| T-08 | Remote multi-tenant expansion | The server supports stdio only. Remote transport requires a separate threat model, authentication, tenant isolation, retention, and Toast review. | No remote transport exists or is approved. |

## Current controls

- The server is structurally read-only. It has no order submission, payment,
  inventory, or labor mutation operation.
- Standard API and Analytics API authority, transport, state, and output labels
  remain separate.
- Report tools use the process-owned runtime, explicit location or selection,
  capability preflight, bounded transport and pagination behavior, normalized
  records, deterministic calculations, provenance, and structured MCP output.
- The Analytics path is closed: stdio to runtime to Analytics capability and
  selection to Metrics/day lifecycle to a body-free MCP envelope.
- Outputs are informational and non-GAAP. They do not make accounting, tax, or
  payroll claims.
- Documentation examples use placeholders only. Tests use invented fixtures.

See the [report contract](report-contract.md) for each registered tool. See the
[public-use boundary](public-use-boundary.md) and [operator guide](../operator-guide.md)
for credential, consent, and processing duties.

## Release limits

The observed Toast API Terms date is 2026-06-23. Operators must read the
current [Toast API Terms](https://pos.toasttab.com/api-terms-of-use) directly.
This repository does not claim Toast approval, endorsement, certification,
partnership, or public-distribution authorization.

T5-003-G01, #4/T6-003 first-tool-request cancellation, #28 live Standard
compatibility, live Analytics compatibility, installed-artifact smoke, signing,
publication, and human brand and Terms approvals remain open. No synthetic
test closes these gates.

## Revisit triggers

Review this model before adding a network listener, hosted service, credential
storage, Merchant Data telemetry, guest-linked data, guest-payment Analytics,
Toast write operations, a new MCP tool, or any model-provider, logging,
retention, or subprocessor change.
