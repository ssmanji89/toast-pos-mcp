# Toast POS Reporting MCP

A public, read-only Model Context Protocol server for deterministic reporting over authorized Toast POS data.

> **Status:** research and architecture foundation. No installable server has been released yet.

## What this project is

`toast-pos-mcp` will let an MCP client request bounded reports such as:

- sales and net-sales summaries by Toast business date
- payment, tip, refund, and void summaries
- top items, sales categories, revenue centers, dining options, and order sources
- cash entries, deposits, payouts, no-sale activity, and drawer reconciliation inputs
- labor hours, overtime hours, breaks, wages, sales, and tips
- source-distinct Analytics API reports when the operator has Analytics API access

Reports will identify their source API, restaurant GUID, business date, restaurant timezone, freshness, exclusions, and completeness. A missing scope, incomplete page set, pending Analytics job, or upstream failure will produce an explicit denial or partial-data result, not an authoritative-looking zero.

## What this project is not

This server will not place orders, authorize payments, modify stock, update employees, or perform any other Toast write operation. It will not request guest PII, delivery addresses, Analytics guest-payment data, `cardFingerprint`, or other guest-linked payment identifiers in the initial product. It will not claim that derived reports are GAAP-compliant, tax advice, or payroll filing records.

The initial distribution will run locally over MCP `stdio`. Each operator must use Toast credentials they are authorized to use. This repository does not provide shared credentials and is not affiliated with or endorsed by Toast, Inc.

## AI processing and Merchant consent

Running the server locally keeps Toast credentials in the operator's environment, but it does not make downstream AI processing local or automatically permitted.

Before an MCP client, model provider, agent host, logging service, or other AI tool or service processes Toast Merchant Data, the operator must:

- hold documented consent from the applicable Merchant
- confirm that the intended provider, logging, retention, and subprocessors satisfy the operator's Toast agreement and any applicable Toast prior-written-consent requirement
- prevent prompts, tool calls, traces, report content, and retained logs from being used to train, fine-tune, evaluate for model improvement, or otherwise improve a model unless Toast has given prior written approval

Repository fixtures are independently invented. They must not be generated from or transformed from Toast API data or Merchant Data.

## Why the boundary is strict

Toast provides several materially different access models:

- **Standard API access:** self-managed, read-only credentials for selected locations; production only and no sandbox.
- **Analytics API access:** read-only reporting datasets available with qualifying Restaurant Management Suite subscriptions and permissions.
- **Partner or custom integrations:** separately reviewed access that can include broader read or write capabilities.

The server will expose capabilities based on the operator's actual scopes and access type. Standard API calculations and Analytics API metrics will remain visibly separate because they do not necessarily share the same accounting semantics.

Toast also uses more than one retrieval model:

- `/ordersBulk` uses fixed `page`/`pageSize` pagination and response Link headers.
- Configuration endpoints use `Toast-Next-Page-Token`; a configuration publish can invalidate that page set and require a bounded restart.
- Analytics reports use a two-step job flow: POST to create a `reportRequestGuid`, then GET to retrieve it. A 202 response means the report is still being prepared, and request GUIDs expire after seven days.

## Planned runtime

- TypeScript and Node.js 20+
- stable MCP TypeScript SDK v1
- local `stdio` transport first
- Zod validation at external boundaries
- independently invented synthetic fixtures only
- bounded retries, endpoint-aware Toast rate limits, and explicit partial-data states
- separate fixed-page, page-token, and Analytics report-job transports
- deterministic pure report calculations separated from HTTP and MCP presentation

## Repository orientation

- [`AGENTS.md`](AGENTS.md): binding product, safety, architecture, and delivery rules
- [`LOOP.md`](LOOP.md): phase map, atomic slice ledger, review handoffs, and current state
- [`docs/research/toast-api-reporting-landscape.md`](docs/research/toast-api-reporting-landscape.md): Toast API findings and report-source map
- [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md): initial distribution, AI-processing, and security decision

## Current work

The foundation slice documents the official Toast API surface, reporting semantics, operational constraints, 2026 compatibility changes, AI and third-party-processing boundary, and public-use terms constraints. The next implementation slice will create the TypeScript `stdio` package and synthetic fixture harness. It will not call production Toast APIs yet.

## Important legal and operational note

Toast API use is governed by Toast's current API Terms of Use and the access agreement attached to each operator's credentials. Operators remain responsible for approved API use, documented Merchant consent before AI processing, applicable third-party-provider approval, privacy and retention controls, and current Toast terms.

Local `stdio` is a credential-custody decision, not a waiver of those requirements. A hosted service, shared credential model, guest-payment analytics feature, or materially different third-party processing arrangement is outside the current architecture and requires separate Toast, legal, privacy, and security review.

This repository's interpretation is engineering guidance, not legal advice.

## Primary sources

- Toast API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Toast reporting integration checklist: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistTemplate.html
- Toast pagination: https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
- Toast `/ordersBulk` pagination: https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html
- Toast Analytics API overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html
- Toast Analytics process: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html
- Toast Analytics rate limits: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html
- Toast API terms: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
