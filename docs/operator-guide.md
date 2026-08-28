# Operator Guide

This guide describes the local, read-only MCP server at the current source
head. It does not grant access, approval, or release authority.

## Operator safety checklist

Complete these checks before you configure or use the server with Toast Merchant
Data.

1. Use only authorized restaurant credentials that the operator is permitted to
   use for the selected restaurant.
2. Hold documented Merchant consent before an AI tool or service processes
   Toast Merchant Data.
3. Review the MCP host, model provider, prompts, tool logs, traces, human
   review, retention, and subprocessors before data reaches them.
4. Apply a no training rule. Do not permit training, fine-tuning, evaluation
   for model improvement, or other model improvement without Toast prior
   written approval.
5. Do not request or expose guest-linked data, Analytics guest-payment data,
   delivery addresses, or payment identifiers.

`TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` is an operator acknowledgment.
It is not proof that consent or any legal, provider, or Toast requirement is
sufficient.

The observed Toast API Terms date is 2026-06-23. Read the current [Toast API
Terms](https://pos.toasttab.com/api-terms-of-use) directly. This project is not
endorsed by Toast. Public brand-feature use, name use, and public distribution
approval remain human or Toast gates.

## Evidence state

### Implemented

The source registers five Standard API tools and one Analytics API lifecycle
tool. The catalog defines their inputs, bounded output states, provenance, and
exclusions: [report contract](architecture/report-contract.md).

### Synthetic validation

Repository tests use independently invented fixtures. They validate local code
paths and documentation wording. They do not demonstrate live Toast behavior,
Merchant consent, provider controls, or release authorization.

### External gates

T5-003-G01, #4/T6-003, #28, live Standard compatibility, live Analytics
compatibility, installed-artifact smoke, signing, publication, and human brand
and Terms approvals remain open.

## Configuration

Use environment variables only. Do not put credentials in repository files,
tool arguments, logs, or prompts. The process checks its required consent
acknowledgment before it opens the stdio transport. See the [public-use
boundary](architecture/public-use-boundary.md) for the complete configuration
and custody contract.

## Using the report tools

Send one valid `businessDate` in `yyyyMMdd` form. You can send an optional
restaurant GUID for the Standard API tools. The runtime validates access and
fails closed when a scope, selected location, source page set, or upstream
response cannot support the request.

Read `status`, `source`, `warnings`, freshness, provenance, exclusions, and
completeness before you use an output. A `denied` result is not zero data. An
`incomplete` result is not a completed result.

`toast_analytics_metrics_day` is body-free. It returns only `denied` or
`incomplete` lifecycle envelopes while `analytics_result_schema_unverified`
remains open. It does not expose a completed Analytics body, formula, or
report.

## Limits

This server is read-only. It does not submit orders, authorize payments, alter
inventory, or change labor data. Its reports are informational and non-GAAP.
They are not accounting, tax, payroll filing, or legal advice.

Do not use local stdio as a reason to bypass Merchant consent, third-party
provider review, data retention review, or Toast requirements.
