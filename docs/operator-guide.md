# Operator Guide

This guide describes the local, read-only MCP server and its Claude Code public-preview wrapper. It does not grant access, approval, or release authority.

## Operator safety checklist

Complete these checks before you configure or use the server with Toast Merchant Data.

1. Use only authorized restaurant credentials that the operator is permitted to use for the selected restaurant.
2. Hold documented Merchant consent before an AI tool or service processes Toast Merchant Data.
3. Review the MCP host, model provider, prompts, tool logs, traces, human review, retention, and subprocessors before data reaches them.
4. Apply a no-training rule. Do not permit training, fine-tuning, evaluation for model improvement, other model improvement, or API-derived synthetic training data without Toast prior written approval.
5. Do not request or expose guest-linked data, Analytics guest-payment data, delivery addresses, or payment identifiers.

`TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an operator acknowledgment. It is not proof that consent or any legal, provider, or Toast requirement is sufficient.

The repository's last documented observation of the Toast API Terms was June 23, 2026. Read the current [Toast API Terms](https://pos.toasttab.com/api-terms-of-use) directly. This project is not endorsed by Toast. Public brand-feature use, name use, and public distribution approval remain human or Toast gates.

## Evidence state

### Implemented

The source registers five Standard API tools and one Analytics API lifecycle tool. The catalog defines their inputs, bounded output states, provenance, and exclusions: [report contract](architecture/report-contract.md).

The Claude Code preview adds a marketplace, secure opt-in configuration, one MCP server wrapper, and a reporting interpretation skill. The wrapper compiles and starts the existing runtime; it contains no report implementation.

### Local validation

Repository tests use independently invented fixtures. They validate local source, stdio, installed-artifact, and preview-wrapper paths. They do not demonstrate live Toast behavior, Merchant consent, provider controls, Toast approval, or release authorization.

### Remaining gates

T5-003-G01, live Standard compatibility, live Analytics compatibility, signing, npm publication, GitHub Release, and human brand and Terms approvals remain outside local source evidence. Issue #74 owns the final real-Claude marketplace/install/enable/MCP smoke for the preview wrapper.

## Claude Code preview configuration

Follow the [Claude Code preview guide](claude-code-preview.md). The plugin installs disabled and prompts for:

- bare Toast API hostname;
- client ID and client secret;
- default restaurant GUID;
- explicit Merchant AI-processing consent acknowledgment.

Claude Code sensitive storage is used for the credential-shaped values. Do not duplicate them into repository files, tool arguments, prompts, logs, screenshots, or issue reports.

The wrapper does not prompt for Analytics credentials in the first preview. The Analytics tool remains a body-free lifecycle boundary while its completed-result schema is unverified.

## Direct local configuration

Outside the plugin, use environment variables only. Do not put credentials in repository files, tool arguments, logs, or prompts. The process checks required configuration and the consent acknowledgment before opening stdio. See the [public-use boundary](architecture/public-use-boundary.md) for the complete configuration and custody contract.

## Using the report tools

Send one valid `businessDate` in `yyyyMMdd` form. You can send an optional restaurant GUID for the Standard API tools. The runtime validates access and fails closed when a scope, selected location, source page set, or upstream response cannot support the request.

Read `status`, `source`, `warnings`, freshness, provenance, exclusions, and completeness before using an output.

- A `denied` result is not zero data.
- An `incomplete` result is not a completed result.
- A `complete` result is locally validated source output, not Toast certification or an accounting opinion.

`toast_analytics_metrics_day` is body-free. It returns only `denied` or `incomplete` lifecycle envelopes while `analytics_result_schema_unverified` remains open. It does not expose a completed Analytics body, formula, or report.

## Feedback

Use the repository's Claude preview issue form. Do not include credentials, bearer tokens, Merchant Data, guest data, or raw API bodies. Include the plugin and Claude versions, Node/npm versions, tool name, structured status or sanitized denial code, and a plain expected-versus-observed description.

## Limits

This server is read-only. It does not submit orders, authorize payments, alter inventory, or change labor data. Its reports are informational and non-GAAP. They are not accounting, tax, payroll-filing, or legal advice.

Do not use local stdio or Claude Code sensitive storage as a reason to bypass Merchant consent, third-party provider review, data-retention review, or Toast requirements.
