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

Reports will identify their source API, restaurant GUID, business date, restaurant timezone, freshness, exclusions, and completeness. A missing scope or incomplete upstream response will produce an explicit denial or partial-data result, not an authoritative-looking zero.

## What this project is not

This server will not place orders, authorize payments, modify stock, update employees, or perform any other Toast write operation. It will not request guest PII or delivery addresses in the initial product. It will not claim that derived reports are GAAP-compliant, tax advice, or payroll filing records.

The initial distribution will run locally over MCP `stdio`. Each operator must use Toast credentials they are authorized to use. This repository does not provide shared credentials and is not affiliated with or endorsed by Toast, Inc.

## Why the boundary is strict

Toast provides several materially different access models:

- **Standard API access:** self-managed, read-only credentials for selected locations; production only and no sandbox.
- **Analytics API access:** read-only reporting datasets available with qualifying Restaurant Management Suite subscriptions and permissions.
- **Partner or custom integrations:** separately reviewed access that can include broader read or write capabilities.

The server will expose capabilities based on the operator's actual scopes and access type. Standard API calculations and Analytics API metrics will remain visibly separate because they do not necessarily share the same accounting semantics.

## Planned runtime

- TypeScript and Node.js 20+
- stable MCP TypeScript SDK v1
- local `stdio` transport first
- Zod validation at external boundaries
- synthetic fixtures only
- bounded retries, Toast rate-limit awareness, and explicit partial-data states
- deterministic pure report calculations separated from HTTP and MCP presentation

## Repository orientation

- [`AGENTS.md`](AGENTS.md): binding product, safety, architecture, and delivery rules
- [`LOOP.md`](LOOP.md): phase map, atomic slice ledger, review handoffs, and current state
- [`docs/research/toast-api-reporting-landscape.md`](docs/research/toast-api-reporting-landscape.md): Toast API findings and report-source map
- [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md): initial distribution and security decision

## Current work

The foundation slice documents the official Toast API surface, reporting semantics, operational constraints, 2026 compatibility changes, and public-use terms boundary. The next implementation slice will create the TypeScript `stdio` package and synthetic fixture harness. It will not call production Toast APIs yet.

## Important legal and operational note

Toast API use is governed by Toast's current API Terms of Use and the access agreement attached to each operator's credentials. Operators are responsible for obtaining applicable Toast approval and complying with those terms. A future hosted service, shared credential model, or third-party processing arrangement is outside the current architecture and requires separate Toast, legal, privacy, and security review.

## Primary sources

- Toast API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Toast reporting integration checklist: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistTemplate.html
- Toast Analytics API overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html
- Toast API terms: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
