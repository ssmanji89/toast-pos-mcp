# Toast POS Reporting MCP

A local, read-only Model Context Protocol server for deterministic reporting over operator-authorized Toast POS data.

## Claude Code public preview

**Preview version:** `0.1.0-preview.1`

The MCP is now wrapped as a repository-hosted Claude Code public-preview plugin. It installs disabled, prompts for operator-owned Standard API configuration through Claude Code's plugin configuration UI, and starts the same reviewed local stdio runtime. It does not publish the runtime to npm and does not imply Toast approval or general production compatibility.

In Claude Code:

```text
/plugin marketplace add ssmanji89/toast-pos-mcp
/plugin install toast-pos-mcp@toast-pos-mcp-preview
/plugin enable toast-pos-mcp@toast-pos-mcp-preview
/reload-plugins
```

See the [Claude Code preview guide](docs/claude-code-preview.md) for prerequisites, verification, updates, troubleshooting, and safe feedback. The final real-Claude marketplace/install smoke for this exact preview candidate is tracked by issue #74 and must pass before the preview is declared operationally CLEAN.

## Current status

### Implemented

The current source registers five Standard API tools:
`toast_sales_summary`, `toast_payment_summary`,
`toast_item_sales_summary`, `toast_cash_summary`, and
`toast_labor_summary`. It also registers the separate Analytics API lifecycle
tool `toast_analytics_metrics_day`.

See the source-derived [public report contract](docs/architecture/report-contract.md)
and the [operator guide](docs/operator-guide.md).

### Local validation

Repository tests use independently invented fixtures. The local installed-artifact test creates a real npm tarball, installs it in an empty temporary consumer, and calls only its installed stdio bin. The current merged runtime also has supported Node-version, package, cancellation, mutation, output-schema, requirements-traceability, and installed-artifact evidence.

This remains local synthetic evidence. It does not prove live Toast compatibility, Merchant consent, legal sufficiency, Toast approval, signing, public package publication, or a released artifact.

### External gates

- T5-003-G01 still blocks a completed Analytics result parser because Toast's published retrieval contract is ambiguous.
- Owner-authorized live Standard and Analytics compatibility evidence remains external.
- Merchant consent, provider/logging/retention review, current Toast Terms and brand authority, signing, npm publication, and GitHub Release authority remain human or external gates.
- Issue #74 owns the final real-Claude plugin validation and installed-preview smoke.

## Tool catalog

| Tool | Source family | Current result boundary |
| --- | --- | --- |
| `toast_sales_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_payment_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_item_sales_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_cash_summary` | Standard API | Complete only after validated bounded source reads, otherwise denied. |
| `toast_labor_summary` | Standard API | Active or unresolved facts produce incomplete; failed preconditions produce denied. |
| `toast_analytics_metrics_day` | Analytics API | Body-free lifecycle envelope; only denied or incomplete while `analytics_result_schema_unverified` remains open. |

Standard API and Analytics API data stay separate. All outputs are informational and non-GAAP. Read source, business-date context, freshness, provenance, warnings, exclusions, and completeness before use.

## Safety before configuration

Use only authorized restaurant credentials. Hold documented Merchant consent before AI processing. Review the MCP host, model provider, prompts, tool logs, traces, human review, retention, and subprocessors before Merchant Data enters an AI service. Do not train, fine-tune, evaluate for model improvement, otherwise improve a model, or create API-derived synthetic training data with Toast API data without Toast prior written approval.

The initial product excludes guest-linked data, Analytics guest-payment data, delivery addresses, and payment identifiers. Local stdio and Claude Code sensitive storage do not grant credential, Merchant, provider, legal, or Toast approval.

`TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an acknowledgment. It is not proof that consent or an approval is sufficient. The [operator guide](docs/operator-guide.md) provides the full safety checklist before configuration details.

## Public boundary

This project is not endorsed by Toast. It does not claim Toast approval, certification, partnership, or official status. The repository's last documented observation of the Toast API Terms was June 23, 2026; read the current [Toast API Terms](https://pos.toasttab.com/api-terms-of-use) directly before use or distribution. Public brand-feature use, name use, and distribution approval remain human or Toast gates.

The repository has coherent Apache-2.0 license metadata: `LICENSE` begins with the Apache License title, `package.json` and the root `package-lock.json` declare `Apache-2.0`, and no `NOTICE` file currently exists. This is a read-only repository fact. It does not establish notice requirements, signing, installation, or publication proof.

## Local development

Use Node.js 20 or later and npm 10 or later.

```sh
npm ci --no-audit --no-fund
npm run check
```

Validate the Claude preview contract separately:

```sh
node scripts/validate-claude-preview-plugin.mjs
```

These commands validate this checkout. They do not publish, sign, contact Toast, use live credentials, or prove a Claude marketplace installation.

## Repository contracts

- [Claude Code preview guide](docs/claude-code-preview.md)
- [Operator guide](docs/operator-guide.md)
- [Public report contract](docs/architecture/report-contract.md)
- [Public-use boundary](docs/architecture/public-use-boundary.md)
- [Threat model](docs/architecture/threat-model.md)
- [Campaign ledger](LOOP.md)

`LOOP.md` and GitHub remain authoritative for atomic campaign state. `.planning/ROADMAP.md` is the GSD outcome projection; `.planning/STATE.md` is a refreshable snapshot only.
