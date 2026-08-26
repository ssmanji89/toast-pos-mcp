# Toast API Reporting Landscape

**Status:** foundation research  
**Last reviewed:** 2026-07-24  
**Scope:** public, read-only Toast POS Reporting MCP  
**Authority:** official Toast documentation and current Toast API Terms of Use unless explicitly labeled as ecosystem research

## Executive findings

1. Toast does not expose one uniform reporting API. A reporting product must distinguish raw operational APIs from the specialized Analytics API.
2. Standard API access is production-only, read-only, location-specific, and does not include a sandbox. Independently invented synthetic fixtures are therefore mandatory for public development and tests.
3. Analytics API access is also read-only but requires qualifying Restaurant Management Suite access and management-group permissions. Its metrics are informational and are not represented by Toast as GAAP-compliant.
4. Correct reporting depends on restaurant-local `businessDate`, restaurant timezone, `closeoutHour`, daylight-saving transitions, and upstream revision timestamps. UTC calendar grouping is insufficient.
5. Toast recommends webhooks for order changes and menu changes, with bounded polling/backfill as a supplement. A local MCP package cannot assume the operator configured webhooks, so it needs an explicit freshness model.
6. Rate limits are global, API-level, endpoint-level, account-specific, and, for Analytics, method/dataset/time-range-specific. The transport must coordinate requests across tools instead of letting each tool retry independently.
7. Toast uses at least three retrieval patterns relevant to this project: fixed `page`/`pageSize` plus Link headers for `/ordersBulk`, page tokens for configuration endpoints, and POST-created report jobs followed by GET retrieval for Analytics datasets.
8. Toast changed its enum compatibility policy effective 2026-07-20: new values may be added to existing enums without being treated as breaking changes. Parsers must preserve unknown strings.
9. Toast's API Terms of Use were updated 2026-06-23. Merchant consent is required before AI tools or services process Merchant Data, and Toast's prior written approval is required before Toast API data is used to train, fine-tune, otherwise improve a model, or create API-derived synthetic training data.
10. Local `stdio` limits credential custody but does not remove third-party-processing obligations. Cloud model providers, MCP hosts, prompt/tool logging, retention, and subprocessors remain part of the terms and privacy boundary.
11. Analytics guest-payment data contains guest-linked payment identifiers such as `cardFingerprint`; it is excluded from the initial product even if a future output would be aggregated.

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

### Explicitly excluded initial data access

- `guest.pi:read`
- `delivery_info.address:read`
- Analytics `/era/v1/guest/payments/*`
- `cardFingerprint` and other guest-linked payment identifiers
- every write scope

Guest and delivery scopes expose personal information that is not necessary for the initial sales, cash, and labor reporting contract. Analytics guest-payment reporting processes payment-card-linked identifiers even when the final result is aggregated. CRM and guest analytics are therefore separate privacy and terms workstreams, not incidental checkboxes.

## Authentication and location access

Toast uses OAuth 2 client credentials. Authentication posts `clientId`, `clientSecret`, and `userAccessType: TOAST_MACHINE_CLIENT` to the Toast authentication endpoint. The response determines token lifetime; the client must cache according to the returned expiry rather than assuming a fixed duration.

Operational Standard API requests are location-specific and use an explicit restaurant GUID, commonly represented by the `Toast-Restaurant-External-ID` header or a restaurant GUID parameter depending on the API. Standard API credentials can be configured for selected locations. The credential-wide Partners accessible-restaurants read is the deliberate exception used to discover which restaurant connections the credential can access; that call does not fabricate a restaurant header.

Analytics requests operate on a management-group restaurant set. The request body can include or exclude restaurant GUIDs according to the endpoint contract. The client must preserve the exact normalized member set in job state and result metadata.

### Required implementation behavior

- Load secrets at runtime from environment variables or a secret-provider interface.
- Never write credentials or tokens to disk, logs, telemetry, MCP output, snapshots, or fixtures.
- Require explicit operator acknowledgment that documented Merchant consent exists before configured AI processing.
- Refresh within the final minute of token validity.
- Decode scope claims for capability reporting, but do not treat unverified JWT display metadata as an authorization decision. Actual API authorization remains authoritative.
- Bind token cache, rate-limit state, page state, Analytics job state, configuration cache, and report results to credential identity and restaurant or management-group identity.

### Token response shape — original implementation note, not sourced from Toast documentation

> **Known stale subsection:** T2-002 review finding `T2-002-R2-F2` owns reconciliation of this note with the current official authentication reference. Do not treat the opaque-token wording below as the current capability source contract until that finding is closed.

The T1-003 implementation originally assumed the following response shape and encoded that assumption as a Zod schema so a mismatch failed closed rather than becoming implicit parser behavior:

```json
{
  "token": {
    "tokenType": "Bearer",
    "expiresIn": 600,
    "accessToken": "<opaque bearer token string>"
  }
}
```

`tokenType` is asserted to be the literal string `"Bearer"`; any other value, or a response missing the `token` wrapper object entirely, is treated as unusable. T2-002 is responsible for replacing the stale token-shape/capability assumptions here with the current sourced contract.

## Reporting source map

### Restaurant and configuration context

Use restaurant and configuration APIs to resolve names and reporting dimensions:

- restaurant name, timezone, `closeoutHour`, and currency
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

### Standard location discovery source contract — re-verified 2026-08-16

The original T2-001 implementation assumed that `GET /restaurants/v1/restaurants`, sent with one bootstrap `Toast-Restaurant-External-ID`, returned a credential-wide wrapper such as `{ "restaurants": [...] }`. Current official Toast sources do not define that aggregate behavior. The production location context is therefore two-stage:

1. `GET /partners/v1/restaurants` enumerates the restaurant connections available to the credential. Standard API guidance explicitly directs Standard API users to the Partners API to retrieve their selected location GUIDs. This credential-wide read does **not** send a fabricated restaurant header.
2. For each active accessible restaurant, `GET /restaurants/v1/restaurants/{restaurantGUID}?includeArchived=false` hydrates report-critical restaurant detail and sends a matching `Toast-Restaurant-External-ID` header.

The Partners response includes substantially more data than reporting needs. The retained runtime connection context is deliberately minimized to:

- normalized `restaurantGuid`
- normalized `managementGroupGuid` when present
- the frozen open-string `connectionScopes` list granted for that restaurant connection

Partner contact email, external references, timestamps, names, and other partner metadata are not retained. `deleted:true` connections are excluded from active reporting context. If the configured bootstrap GUID is absent or appears only as deleted/inactive, discovery fails closed.

The Restaurants detail response supplies the report context retained for each active location:

- restaurant GUID, which must match the requested connection
- display name
- IANA timezone
- `closeoutHour`, integer **0 through 12 inclusive**
- `currencyCode`, ISO-4217 alpha shape
- management-group GUID when present

If both Partners and Restaurants sources provide a management-group GUID, disagreement fails closed rather than silently choosing one. A detail response marked archived despite `includeArchived=false` is also rejected.

Discovery is atomic with respect to the in-memory registry: the complete active connection set is parsed first, every restaurant detail is hydrated and validated, and only then is the registry replaced. A failure on restaurant N must not publish restaurants 1..N-1 as an apparently complete location set or overwrite a previously complete registry.

The credential-scoped Partners transport remains structurally allowlisted rather than exposing a generic headerless request helper. It reuses the same config-bound OAuth manager, bounded retry/wait logic, status classification, JSON parsing, error sanitization, and rate-limit machinery as restaurant reads, with a separate credential-scoped rate-limit key so it cannot collide with any restaurant bucket.

This source contract supersedes the prior synthetic aggregate-wrapper assumption and the prior `closeoutHour` 0–23 range.

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
- `/ordersBulk` uses `page` and `pageSize`, with a maximum `pageSize` of 100, and response Link relations for traversal.
- `/ordersBulk` does not return a `last` Link relation, so completion is determined by the absence of `next`, not by reaching a declared last page.

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

The initial Analytics adapter may support:

- aggregated sales
- checks
- labor
- menus
- payouts
- restaurant identities

The Analytics guest-payment dataset is excluded. It contains payment details associated with a guest's payment card, including `cardFingerprint`, and processing that source is not authorized merely because a downstream result is aggregated.

Analytics metrics must be exposed through tools and schemas that clearly identify `source: analytics_api`. They must not be silently substituted for Standard API calculations or described as GAAP-compliant.

#### Analytics report-request lifecycle

Analytics retrieval is generally a two-step process:

1. POST to the dataset endpoint, including the supported `timeRange` or custom range and restaurant inclusion/exclusion set.
2. Receive the `reportRequestGuid`.
3. GET the matching dataset retrieval endpoint with that GUID.
4. Treat HTTP 202 as pending and retry later within a bounded poll budget.
5. Treat HTTP 200 as the completed dataset.
6. Treat HTTP 404 as invalid or expired. A `reportRequestGuid` expires seven days after creation.
7. Treat HTTP 409 as an unusable report request and create a new request GUID within a bounded replacement budget.
8. Preserve dataset, time range, restaurant set, creation time, attempts, request IDs, and limiter key in in-memory job state.

The client must not present a 202, expired GUID, exhausted poll budget, or failed replacement as an empty successful report. It returns `partial` only when validated bounded data exists; otherwise it returns `denied` with job state and upstream request IDs.

## Cross-cutting API behavior

### Dates and business days

Toast timestamps generally use ISO 8601 and represent absolute instants. Reporting must convert them to the restaurant timezone. Query-string timestamps must be correctly URL-encoded. `businessDate` changes after the restaurant's configured closeout hour, which defaults to 4:00 a.m. local time unless changed.

A report request should use one of two explicit Standard API modes:

- `business_date`: restaurant reporting day and default mode
- `modified_window`: absolute time interval for revision or sub-day analysis

The server must not infer one mode from ambiguous timestamps. Analytics time ranges are endpoint-specific contracts and must remain explicit.

### Pagination

Toast has more than one pagination family.

#### Fixed-size pagination

`GET /ordersBulk` accepts:

- `pageSize`, maximum 100
- `page`, the one-based sequence number

Its response Link headers can include `first`, `self`, `prev`, and `next`. Unlike configuration endpoints, `/ordersBulk` does not return a `last` relation.

Required traversal behavior:

- preserve the original bounded date and restaurant query while following `next`
- stop only when no `next` relation exists
- reject repeated page numbers, repeated URLs, non-progressing `next` links, and page counts beyond the configured bound
- record pages and records processed
- return `partial` or `denied` when traversal cannot be proven complete

#### Page-token pagination

Configuration endpoints use `Toast-Next-Page-Token`, passed back as `pageToken`.

Required traversal behavior:

- stop when no next token is returned
- reject repeated or non-progressing tokens
- enforce a configured page bound
- if a restaurant publishes configuration changes during traversal and Toast returns HTTP 409, discard the partial page set and restart without `pageToken` within a bounded restart budget

The configuration-publication 409 restart behavior is scoped to page-token configuration retrieval and is not generalized to `/ordersBulk`.

### Rate limits

Current documented Standard API defaults at review time:

- global: 20 requests/second and 10,000 requests/15 minutes
- default per API: 20 requests/second and 10,000 requests/15 minutes
- menus `GET /menus`: 1 request/second per client per location
- orders `GET /ordersBulk`: 5 requests/second per client per location
- historical `/ordersBulk` modification windows: maximum one month, with calls spaced at least 5-10 seconds apart

Analytics API limits depend on method, dataset endpoint, and time range. Representative documented limits include:

- metrics custom range POST: 10 requests/hour
- metrics month/year POST: 10 requests/hour
- metrics day/week POST: 10 requests/minute and 60 requests/hour
- check day POST: 5 requests/minute and 60 requests/day
- labor month POST: 10 requests/hour
- labor day/week POST: 10 requests/minute and 60 requests/hour
- menu custom range POST: 10 requests/hour
- payout payments day POST: 5 requests/minute and 60 requests/day
- Analytics report GET endpoints: commonly 5 requests/second and 30 requests/minute

The shared limiter must key Analytics limits by method, endpoint, time range, credential identity, and management-group or restaurant-set identity. It must not reuse Standard API defaults for Analytics POST or GET operations.

The transport must read Toast rate-limit headers, coordinate all tools through a shared limiter, honor 429 responses, and use bounded exponential backoff with jitter for retryable failures. Credential, scope, validation, inaccessible-location, expired-GUID, and consent-acknowledgment failures are not blindly retryable.

### Legacy rate-limit-reset fallback semantics — original implementation note, not sourced from Toast documentation

Current Toast documentation now defines `X-Toast-RateLimit-Reset` as an absolute epoch. The current-header hierarchy uses that documented contract. This note remains unresolved for only the historical unprefixed `Toast-RateLimit-Reset` fallback. `src/transport.ts` preserves the established compatibility snapshot behavior by treating it as an absolute point in time, encoded as epoch seconds or epoch milliseconds. The historical fallback does not create hierarchy coordination waits. A future reviewer with a live legacy response or source documentation must confirm or correct the fallback before treating it as production-proven semantics.

### Errors and completeness

Toast commonly returns JSON error objects containing HTTP status, service code, user message, request ID, developer detail, nested errors, and retry guidance. Important classes include:

- 202: Analytics report is still being prepared
- 401: token invalid or expired
- 403: authorization failure; the exact cause is not safely inferred from status alone
- 404: Analytics request GUID invalid or expired, according to the endpoint message
- 409: configuration publication conflict during page-token pagination, or unusable Analytics report request depending on endpoint
- 429: rate limit exceeded
- 5xx: upstream service or gateway failure

MCP results need a structured envelope with:

- `status`: `complete`, `partial`, or `denied`
- `source`
- `restaurant_guid` or declared management-group member set
- requested and effective date bounds
- restaurant timezone and closeout hour where applicable
- retrieval timestamp
- pages and records processed or Analytics job state
- exclusions and unresolved references
- warnings
- upstream request IDs for support, with no secrets

A failed, pending, expired, or incomplete retrieval must never collapse to a numeric zero.

### Downtime and freshness

Toast recommends exponential reduction of polling during 5xx incidents, resuming from the last successful retrieval timestamp, and caching necessary data. For a local reporting package, each report should declare data freshness and whether it used cached configuration or menus.

Analytics polling must be separately bounded so repeated 202 responses do not exhaust endpoint limits or conceal a stale request GUID.

### Deployment

Toast recommends weekday deployments, avoiding peak dinner traffic, incremental rollout, active error monitoring, and rollback on increased error or latency. Those recommendations apply most directly to hosted integrations, but public releases should still use staged package channels and install smoke evidence.

Deployment documentation must identify whether report content reaches an AI provider, MCP host, trace/log system, retention service, or subprocessor. Local server transport alone is not a complete data-flow description.

## 2026 compatibility requirements

The current change log creates immediate parser requirements:

- Existing enums are open as of 2026-07-20. Unknown enum values are data, not fatal parse errors.
- Orders can include `selectionType: COMBO`.
- New payment card types and service-charge categories can appear.
- Menu data may require a restaurant publish before newly introduced fields appear.

Implementation rule: validate object shape and required invariants while representing evolving enums as known-string unions plus an unknown-string fallback.

## Terms, AI processing, privacy, and public distribution

Toast's API Terms of Use updated 2026-06-23 state, among other things:

- API use is subject to approval and limited to the permitted application purpose.
- Credentials must remain confidential and limits may not be circumvented.
- Toast's prior written consent is required before engaging a third-party provider to use the APIs in connection with application development.
- Merchant consent is required before an AI tool or service processes Merchant Data.
- The API or data passing through it may not be used to train, fine-tune, otherwise improve an AI model, or create API-derived synthetic training data without Toast's prior written approval.
- Merchant Data includes data originating from, derived from, or relating to the Merchant or the Merchant's business, not merely personal information.

Repository consequences:

- Publish client software, not credentials or a shared Toast access service.
- Require operators to provide their own authorized credentials.
- Require explicit operator acknowledgment of documented Merchant consent before AI processing.
- Treat cloud models, MCP hosts, prompt/tool logs, tracing, retention, human review, and subprocessors as part of the third-party-processing assessment.
- Do not derive repository fixtures or model-training datasets from Toast API data or Merchant Data.
- Do not claim Toast endorsement, certification, or official status.
- Do not vendor or redistribute Toast documentation or OpenAPI specifications.
- Link to Toast documentation and write original implementation notes and schemas.
- Keep remote hosting, telemetry, Merchant Data persistence, guest-payment Analytics, and materially different subprocessors behind a formal Toast/legal/privacy/security checkpoint.
- Include a notice that users remain responsible for their Toast agreement, access permissions, Merchant consent, and provider configuration.

This is an engineering interpretation, not legal advice.

## Public MCP ecosystem review

A small public Python package named `toast-mcp` currently exposes restaurant configuration, menus, bulk orders, live order submission, and stock updates. Its write actions are enabled by an environment flag. Another public repository named `ToastDevMcp` contains little more than a description.

This project should not duplicate that shape. Its differentiation is:

- reporting-only, with no write implementation present
- deterministic calculations rather than raw endpoint wrappers
- source-distinct Standard and Analytics reports
- explicit capability, freshness, completeness, and denial states
- restaurant business-date correctness
- no guest-linked Analytics data in the initial product
- independently invented synthetic parity fixtures and public report formulas
- explicit Merchant-consent and no-training boundaries for AI use

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

The initial Analytics namespace excludes guest-payment reporting.

### Resources

- report formula catalog
- capability and scope catalog
- data freshness policy
- report result schema
- AI-processing operator notice

Raw records should not be a default tool surface. A future bounded export resource can be considered after data-minimization, AI-provider, logging, retention, and context-size review.

## Primary official sources

- API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Integration types: https://doc.toasttab.com/doc/devguide/apiIntegrationTypes.html
- Standard API overview: https://doc.toasttab.com/doc/devguide/devApiAccessUserGuide.html
- Standard API scopes: https://doc.toasttab.com/doc/devguide/devApiAccessScopes.html
- Partners accessible restaurants: https://doc.toasttab.com/openapi/partners/operation/restaurantsGet/
- Restaurant detail: https://doc.toasttab.com/openapi/restaurants/operation/restaurantsGuidGet/
- Analytics access: https://doc.toasttab.com/doc/devguide/apiAnalyticsAccessOverview.html
- Analytics API overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html
- Analytics process: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html
- Analytics rate limits: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html
- Analytics guest data overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsGuestDataOverview.html
- Authentication: https://doc.toasttab.com/doc/devguide/authentication.html
- Rate limiting: https://doc.toasttab.com/doc/devguide/apiRateLimiting.html
- Dates and timestamps: https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html
- Pagination: https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
- `/ordersBulk` pagination: https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html
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
