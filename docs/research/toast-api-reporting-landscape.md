# Toast API Reporting Landscape

**Status:** foundation research  
**Last reviewed:** 2026-07-24  
**Scope:** public, read-only Toast POS Reporting MCP  
**Authority:** official Toast documentation and current Toast API Terms of Use unless explicitly labeled as ecosystem research

## Executive findings

1. Toast does not expose one uniform reporting API. A reporting product must distinguish raw operational APIs from the specialized Analytics API.
2. Standard API access is production-only, read-only, location-specific, and does not include a sandbox. Synthetic fixtures are therefore mandatory for public development and tests.
3. Analytics API access is also read-only but requires qualifying Restaurant Management Suite access and management-group permissions. Its metrics are informational and are not represented by Toast as GAAP-compliant.
4. Correct reporting depends on restaurant-local `businessDate`, restaurant timezone, `closeoutHour`, daylight-saving transitions, and upstream revision timestamps. UTC calendar grouping is insufficient.
5. Toast recommends webhooks for order changes and menu changes, with bounded polling/backfill as a supplement. A local MCP package cannot assume the operator configured webhooks, so it needs an explicit freshness model.
6. Rate limits are global, API-level, endpoint-level, and potentially account-specific. The transport must coordinate requests across tools instead of letting each tool retry independently.
7. Toast changed its enum compatibility policy effective 2026-07-20: new values may be added to existing enums without being treated as breaking changes. Parsers must preserve unknown strings.
8. Toast's API Terms of Use were updated 2026-06-23 and require approved use, confidential credentials, permitted-purpose limitations, privacy compliance, and additional scrutiny for third-party processing. The initial public product should be local software using operator-owned credentials, not a hosted credential broker.

## Access models

| Access type | Credential source | Typical capability | Environment implications | MCP consequence |
|---|---|---|---|---|
| Partner integration | Toast integrations team after review | Approved read/write scopes across connected merchants | Sandbox and production as approved | Not assumed by the public package |
| Custom integration | Toast integrations team after approval | Organization-specific approved read/write scopes | Sandbox and production as approved | Supported only through explicit capabilities; no writes in this product |
| Standard API access | Operator creates credentials in Toast Web | Selected read-only APIs and selected locations | Production only; no sandbox | Primary initial compatibility target |
| Analytics API access | Operator creates credentials in Toast Web | Specialized read-only reporting datasets for a management group | Production only; qualifying RMS plan and permissions required | Separate adapter and source-labeled tools |

### Standard API scopes relevant to reporting

- `restaurants:read`
- `config:read`
- `menus:read`
- `orders:read`
- `cashmgmt:read`
- `labor:read`
- `labor.employees:read`
- `stock:read`, only for read-only availability reporting
- `device-details.info:read`, only if operational device reporting is later approved

### Explicitly excluded initial scopes

- `guest.pi:read`
- `delivery_info.address:read`
- every write scope

Guest and delivery scopes expose personal information that is not necessary for the initial sales, cash, and labor reporting contract. CRM functionality is therefore a separate privacy workstream, not an incidental checkbox.

## Authentication and location access

Toast uses OAuth 2 client credentials. Authentication posts `clientId`, `clientSecret`, and `userAccessType: TOAST_MACHINE_CLIENT` to the Toast authentication endpoint. The response determines token lifetime; the client must cache according to the returned expiry rather than assuming a fixed duration.

Every operational API request is location-specific and must carry an explicit restaurant GUID, commonly represented by the `Toast-Restaurant-External-ID` header or a restaurant GUID parameter depending on the API. Standard API credentials can be configured for selected locations.

### Required implementation behavior

- Load secrets at runtime from environment variables or a secret-provider interface.
- Never write credentials or tokens to disk, logs, telemetry, MCP output, snapshots, or fixtures.
- Refresh within the final minute of token validity.
- Decode scope claims for capability reporting, but do not treat unverified JWT display metadata as an authorization decision. Actual API authorization remains authoritative.
- Bind token cache, rate-limit state, page state, configuration cache, and report results to credential identity and restaurant GUID.

## Reporting source map

### Restaurant and configuration context

Use restaurant and configuration APIs to resolve names and reporting dimensions:

- restaurant name, timezone, and `closeoutHour`
- dining options
- revenue centers
- sales categories
- restaurant services
- alternative payment types
- discounts
- service charges
- tax rates
- tip withholding
- void reasons
- cash drawers
- payout reasons
- no-sale reasons
- break types

Toast recommends refreshing restaurant/configuration context at least daily per location. Menu metadata should be checked throughout the day, with a menu refresh after a detected publish.

### Orders-based reporting

Primary source: orders updated webhook where configured; `/ordersBulk` for bounded retrieval and backfill.

Potential reports:

- gross and net sales
- order, check, and guest counts
- taxes, discounts, service charges, gratuities, tips, refunds, and voids
- payment totals by type and status
- sales by item, category, revenue center, dining option, source, employee, and service period
- average order/check value and discount/refund rates

Important rules:

- Prefer `businessDate` for reconciliation with Toast Web reports.
- Use modification-time windows only when the requested report is explicitly about change time or a sub-day interval.
- Historical `startDate`/`endDate` retrieval must not exceed one-month windows and should be spaced according to Toast guidance.
- Toast recommends approximately twelve weeks of initial historical retrieval for reporting integrations, but this must be opt-in and resumable for a local tool.
- Deferred selections should not be counted as current sales.
- Fundraising contributions represented as service charges may need exclusion from net-sales formulas.
- Nested modifiers can be arbitrarily deep.
- Orders may contain discounts or references that no longer have matching current configuration; reports must preserve unresolved identifiers instead of dropping rows.

### Cash reporting

Primary sources:

- cash management `/entries` by `businessDate`
- cash management `/deposits` by `businessDate`
- configuration lookups for drawers and reasons
- labor employee lookup for responsible employees

Potential reports:

- cash in and cash out
- cash tips
- no-sale activity
- driver reimbursements
- closeouts and deposits
- reversed cash transactions
- expected-drawer inputs and large-transaction review

Toast recommends retrieving the previous business day's entries and deposits daily and suggests twelve weeks of historical cash backfill for a newly connected reporting integration.

### Labor reporting

Primary sources:

- labor `/employees`
- labor `/jobs`
- labor `/timeEntries` by modification window
- labor `/shifts` by scheduled date window
- orders for employee sales and tips
- configuration for breaks and tip withholding

Potential reports:

- regular and overtime hours
- breaks and missed breaks
- clock-in timeliness
- wages from regular hours and hourly wage
- sales and tips per employee or labor hour

Important rules:

- The labor API does not provide the overtime multiplier needed to calculate overtime wages.
- A null hourly wage can indicate a salaried job.
- Toast recommends orders, not time-entry sales fields, for sales and tips because orders can occur outside the shift and time-entry values may not be revised after administrative edits.
- Employee names and identifiers should be minimized. Aggregate mode should be the default MCP output.

### Menus and inventory analysis

The menus API supplies menu structure, item identifiers, tags, sales categories, and SKUs. Orders supply sold selections. A reporting tool can estimate item usage and sales but cannot infer ingredient inventory without operator-defined recipes and purchase/waste records.

The initial product may report read-only stock status when `stock:read` is available, but stock mutation is permanently outside the reporting server.

### Analytics API reporting

The Analytics API supplies specialized datasets for:

- aggregated sales
- checks
- labor
- menus
- payouts
- guests
- restaurant identities

Analytics metrics must be exposed through tools and schemas that clearly identify `source: analytics_api`. They must not be silently substituted for Standard API calculations or described as GAAP-compliant. Guest analytics require a separate privacy review even when the API response is less direct than raw guest PII.

## Cross-cutting API behavior

### Dates and business days

Toast timestamps generally use ISO 8601 and represent absolute instants. Reporting must convert them to the restaurant timezone. Query-string timestamps must be correctly URL-encoded. `businessDate` changes after the restaurant's configured closeout hour, which defaults to 4:00 a.m. local time unless changed.

A report request should use one of two explicit modes:

- `business_date`: restaurant reporting day and default mode
- `modified_window`: absolute time interval for revision or sub-day analysis

The server must not infer one mode from ambiguous timestamps.

### Pagination

Toast is replacing older page-number pagination with page-token pagination. Paginated responses return `Toast-Next-Page-Token`, which is passed back as `pageToken`.

If restaurant configuration changes during pagination, Toast can return HTTP 409. The client must discard the partial page set and restart the bounded retrieval rather than combine incompatible snapshots.

### Rate limits

Current documented defaults at review time:

- global: 20 requests/second and 10,000 requests/15 minutes
- default per API: 20 requests/second and 10,000 requests/15 minutes
- menus `GET /menus`: 1 request/second per client per location
- orders `GET /ordersBulk`: 5 requests/second per client per location
- historical `/ordersBulk` modification windows: maximum one month, with calls spaced at least 5-10 seconds apart

The transport must read Toast rate-limit headers, coordinate all tools through a shared limiter, honor 429 responses, and use bounded exponential backoff with jitter for retryable failures. Credential, scope, validation, and inaccessible-location failures are not retryable.

### Errors and completeness

Toast commonly returns JSON error objects containing HTTP status, service code, user message, request ID, developer detail, nested errors, and retry guidance. Important classes include:

- 401: token invalid or expired
- 403: scope or location access denied
- 409: state conflict, including configuration publication during pagination
- 429: rate limit exceeded
- 5xx: upstream service or gateway failure

MCP results need a structured envelope with:

- `status`: `complete`, `partial`, or `denied`
- `source`
- `restaurant_guid`
- requested and effective date bounds
- restaurant timezone and closeout hour
- retrieval timestamp
- pages and records processed
- exclusions and unresolved references
- warnings
- upstream request IDs for support, with no secrets

A failed or incomplete retrieval must never collapse to a numeric zero.

### Downtime and freshness

Toast recommends exponential reduction of polling during 5xx incidents, resuming from the last successful retrieval timestamp, and caching necessary data. For a local reporting package, each report should declare data freshness and whether it used cached configuration or menus.

### Deployment

Toast recommends weekday deployments, avoiding peak dinner traffic, incremental rollout, active error monitoring, and rollback on increased error or latency. Those recommendations apply most directly to hosted integrations, but public releases should still use staged package channels and install smoke evidence.

## 2026 compatibility requirements

The current change log creates immediate parser requirements:

- Existing enums are open as of 2026-07-20. Unknown enum values are data, not fatal parse errors.
- Orders can include `selectionType: COMBO`.
- New payment card types and service-charge categories can appear.
- Menu data may require a restaurant publish before newly introduced fields appear.

Implementation rule: validate object shape and required invariants while representing evolving enums as known-string unions plus an unknown-string fallback.

## Terms, privacy, and public distribution

Toast's 2026-06-23 API Terms of Use state, among other things, that API use is subject to approval, credentials must remain confidential, use must remain within the approved application purpose, limits may not be circumvented, applicable privacy and security laws must be followed, and third-party processing can require prior written consent.

Repository consequences:

- Publish client software, not credentials or a shared Toast access service.
- Require operators to provide their own authorized credentials.
- Do not claim Toast endorsement, certification, or official status.
- Do not vendor or redistribute Toast documentation or OpenAPI specifications.
- Link to Toast documentation and write original implementation notes and schemas.
- Keep remote hosting, telemetry, merchant-data persistence, and third-party subprocessors behind a formal Toast/legal/privacy/security checkpoint.
- Include a notice that users remain responsible for their Toast agreement and access permissions.

This is an engineering interpretation, not legal advice.

## Public MCP ecosystem review

A small public Python package named `toast-mcp` currently exposes restaurant configuration, menus, bulk orders, live order submission, and stock updates. Its write actions are enabled by an environment flag. Another public repository named `ToastDevMcp` contains little more than a description.

This project should not duplicate that shape. Its differentiation is:

- reporting-only, with no write implementation present
- deterministic calculations rather than raw endpoint wrappers
- source-distinct Standard and Analytics reports
- explicit capability, freshness, completeness, and denial states
- restaurant business-date correctness
- no guest PII in the initial product
- synthetic parity fixtures and public report formulas

Ecosystem references:

- https://github.com/NoBanks/toast-mcp
- https://github.com/JakeDahl/ToastDevMcp

## Recommended initial MCP surface

### Capability and context tools

- `toast_list_locations`
- `toast_get_capabilities`
- `toast_get_report_context`

### Standard API report tools

- `toast_sales_summary`
- `toast_payment_summary`
- `toast_item_sales_summary`
- `toast_cash_summary`
- `toast_labor_summary`

### Analytics API report tools

Use a separate `toast_analytics_*` namespace so an MCP client cannot mistake an Analytics metric for a Standard API calculation.

### Resources

- report formula catalog
- capability and scope catalog
- data freshness policy
- report result schema

Raw records should not be a default tool surface. A future bounded export resource can be considered after data-minimization and context-size review.

## Primary official sources

- API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Integration types: https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html
- Standard API overview: https://doc.toasttab.com/doc/devguide/devApiAccessUserGuide.html
- Standard API scopes: https://doc.toasttab.com/doc/devguide/devApiAccessScopes.html
- Analytics access: https://doc.toasttab.com/doc/devguide/apiAnalyticsAccessOverview.html
- Analytics API overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html
- Authentication: https://doc.toasttab.com/doc/devguide/authentication.html
- Rate limiting: https://doc.toasttab.com/doc/devguide/apiRateLimiting.html
- Dates and timestamps: https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html
- Pagination: https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
- Responses and errors: https://doc.toasttab.com/doc/devguide/apiResponsesAndErrors.html
- Downtime: https://doc.toasttab.com/doc/devguide/apiHandlingDowntimes.html
- Deployment: https://doc.toasttab.com/doc/devguide/apiDeployment.html
- Analytics integration checklist: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistTemplate.html
- Sales reports: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistAccounting.html
- Labor reports: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html
- Data warehouse integration: https://doc.toasttab.com/doc/cookbook/apiHowToReporting.html
- Cash reports: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html
- Inventory integration: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistInventory.html
- CRM integration: https://doc.toasttab.com/doc/cookbook/apiHowToBuildACrmGuestEngagementIntegration.html
- API change log: https://doc.toasttab.com/doc/relnotes/devPortalApiChangeLog.html
- API Terms of Use: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
