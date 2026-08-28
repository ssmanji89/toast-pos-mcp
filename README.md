# Toast POS Reporting MCP

A local, read-only Model Context Protocol server for deterministic reporting
over operator-authorized Toast POS data.

## Current status

### Implemented

The current source registers five Standard API tools:
`toast_sales_summary`, `toast_payment_summary`,
`toast_item_sales_summary`, `toast_cash_summary`, and
`toast_labor_summary`. It also registers the separate Analytics API lifecycle
tool `toast_analytics_metrics_day`.

See the source-derived [public report contract](docs/architecture/report-contract.md)
and the [operator guide](docs/operator-guide.md).

### Synthetic validation

Repository tests use independently invented fixtures. They validate local
source and stdio paths. They do not prove live Toast compatibility, Merchant
consent, legal sufficiency, Toast approval, or a released artifact.

### External gates

T5-003-G01, #4/T6-003, #28, live Standard compatibility, live Analytics
compatibility, installed-artifact smoke, signing, publication, and human brand
and Terms approvals remain open.

## Tool catalog

| Tool | Source family | Current result boundary |
| --- | --- | --- |
| `toast_sales_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_payment_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_item_sales_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_cash_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_labor_summary` | Standard API | Active or unresolved facts produce incomplete; failed preconditions produce denied. |
| `toast_analytics_metrics_day` | Analytics API | Body-free lifecycle envelope; only denied or incomplete while `analytics_result_schema_unverified` remains open. |

Standard API and Analytics API data stay separate. All outputs are
informational and non-GAAP. Read source, business-date context, freshness,
provenance, warnings, exclusions, and completeness before use.

## Safety before configuration

Use only authorized restaurant credentials. Hold documented Merchant consent
before AI processing. Review the MCP host, model provider, prompts, tool logs,
traces, human review, retention, and subprocessors before Merchant Data enters
an AI service. Do not train, fine-tune, evaluate for model improvement, or
otherwise improve a model with Toast API data without Toast prior written
approval.

The initial product excludes guest-linked data, Analytics guest-payment data,
delivery addresses, and payment identifiers. Local stdio does not grant
credential, Merchant, provider, legal, or Toast approval.

`TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an acknowledgment. It is not
proof that consent or an approval is sufficient. The [operator guide](docs/operator-guide.md)
provides the full safety checklist before configuration details.

## Public boundary

This project is not endorsed by Toast. It does not claim Toast approval,
certification, partnership, or official status. The observed Toast API Terms
date is 2026-06-23. Read the current [Toast API Terms](https://pos.toasttab.com/api-terms-of-use)
directly. Public brand-feature use, name use, and distribution approval remain
human or Toast gates.

The repository has coherent Apache-2.0 license metadata: `LICENSE` begins with
the Apache License title, `package.json` and the root `package-lock.json`
declare `Apache-2.0`, and no `NOTICE` file currently exists. This is a
read-only repository fact. It does not establish notice requirements, signing,
installation, or publication proof.

## Local development

Use Node.js 20 or later and npm 10 or later.

```sh
npm ci --no-audit --no-fund
npm run check
```

These commands validate this checkout. They do not publish, sign, install an
artifact, contact Toast, or use live credentials.

## Repository contracts

- [Operator guide](docs/operator-guide.md)
- [Public report contract](docs/architecture/report-contract.md)
- [Public-use boundary](docs/architecture/public-use-boundary.md)
- [Threat model](docs/architecture/threat-model.md)
- [Campaign ledger](LOOP.md)

`LOOP.md` and GitHub remain authoritative for atomic campaign state.
