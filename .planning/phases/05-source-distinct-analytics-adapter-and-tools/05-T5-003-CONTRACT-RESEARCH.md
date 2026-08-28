# T5-003 Analytics MCP Result Contract Research

**Researched:** 2026-08-27 (America/Chicago)  
**Base reconciled:** `main` = `1be8e24488c4fe34bdea2990f344178d7b304932`  
**Scope:** T5-003 only: a safe public MCP presentation boundary over the closed T5-002 Analytics job adapter.  
**Confidence:** MEDIUM — the official current sources agree on request routing and defaults. They conflict on the completed Metrics response shape.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use separate optional Analytics credentials and a separate token
  manager. Never use Standard credentials as an Analytics fallback.
- **D-02:** Require `enterprise-metrics:read` before every Analytics request.
  A denied preflight must make zero Analytics business-data requests.
- **D-03:** Keep Analytics management-group restaurant authority separate from
  `ToastLocation`, `connectionScopes`, and the Standard location registry.

### the agent's Discretion

Use existing TypeScript, Zod, immutable publication, cancellation, and
secret-safe error patterns. Select local environment variable names that do
not conflict with the Standard contract, then document the new local contract.

### Deferred Ideas (OUT OF SCOPE)

- Analytics job creation, polling, expiry, and replacement belong to T5-002.
- Analytics MCP tools and informational/non-GAAP presentation belong to T5-003.
- Live Analytics compatibility remains an owner-authorized external release gate.
</user_constraints>

## Phase Requirements

| ID | Description | Research support |
|---|---|---|
| T5-003 | Implement source-distinct Analytics reporting tools excluding guest-payment datasets. | This document defines the only post-gate data tool, its fixed request, public projection, result gate, provenance, and completeness rules. [VERIFIED: `LOOP.md`] |

## Project Constraints (from AGENTS.md)

- The server must stay structurally read-only. [VERIFIED: `AGENTS.md`]
- The server must not log, return, fixture, or commit credentials or raw credential payloads. [VERIFIED: `AGENTS.md`]
- Tests must use independently invented synthetic records only. [VERIFIED: `AGENTS.md`]
- The operator needs documented Merchant consent before an AI tool or service processes Toast Merchant Data. [VERIFIED: `AGENTS.md`]
- Guest-linked datasets, guest-payment routes, payment identifiers, and `cardFingerprint` are outside the initial product. [VERIFIED: `AGENTS.md`]
- Analytics authority, token state, rate state, and selected restaurants must stay separate from Standard API state. [VERIFIED: `AGENTS.md`] [VERIFIED: `05-CONTEXT.md`]
- Outputs must state their API source, business-date semantics, freshness, provenance, exclusions, and completeness. [VERIFIED: `AGENTS.md`]
- The server must not make accounting, tax, or GAAP claims. [VERIFIED: `AGENTS.md`]
- A missing capability, malformed source body, stale state, lifecycle failure, or unknown completeness state must fail closed. [VERIFIED: `AGENTS.md`]
- The production proof must use the full stdio request-to-response chain. Direct calculator tests do not prove MCP wiring. [VERIFIED: `AGENTS.md`]

## Summary

The current safe public data scope is not yet a successful Analytics report. The official downloaded Analytics OpenAPI defines `GET /era/v1/metrics/{reportRequestGuid}` as one `MetricsReportingData` object. The current official Metrics retrieval guide shows a JSON array of those rows. No exact completed-result top-level schema is proven. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]

T5-002 already treats a successful Analytics retrieval as `result_contract_unavailable`. It returns only a body-free incomplete lifecycle envelope while this contract gate stays open. T5-003 must preserve that behavior. It must not add a parser, a raw-body cache, or a `complete` MCP response before Toast resolves the shape conflict. [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `AGENTS.md`]

**Primary recommendation:** Do not register a data-returning T5-003 Analytics tool until gate T5-003-G01 closes. The first approved data tool after that gate is one single-restaurant, single-business-date `toast_analytics_metrics_day` tool. It uses only the existing closed Metrics day job path and emits a direct, non-GAAP Metrics projection. [VERIFIED: `src/analytics-report-jobs.ts`] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| MCP input validation and response envelope | API / Backend | — | The local server validates the date and restaurant selection before any job call. [VERIFIED: `AGENTS.md`] |
| Analytics capability and selection authority | API / Backend | — | T5-001 and T5-002 already keep private Analytics identity and restaurant selection state separate. [VERIFIED: `src/analytics-access.ts`] [VERIFIED: `src/analytics-report-jobs.ts`] |
| Analytics report job lifecycle | API / Backend | External Toast Analytics API | T5-002 owns bounded create, poll, replacement, rate limit, cancellation, and body-free lifecycle statuses. [VERIFIED: `src/analytics-report-jobs.ts`] |
| Completed Metrics response parsing | API / Backend | External Toast Analytics API | This tier can parse only after Toast supplies one current, unambiguous top-level contract. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] |
| Public result rendering | API / Backend | MCP client | MCP returns a structured, source-labelled informational envelope. It does not calculate accounting or tax results. [VERIFIED: `AGENTS.md`] |

## Official Contract Evidence

### Downloaded OpenAPI artifact

The official downloadable file was read without Toast credentials or Toast data. The local SHA-256 was `e95803ea36d60dd87d694228759153519d7133227fa16e967371f712ce3a0b83`. Its `GET /metrics/{reportRequestGuid}` 200 schema references the object definition `MetricsReportingData`. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: local `curl` download]

The same file defines `MetricsReportingData` fields for restaurant GUID, business date, counts, sales amounts, grouping dimensions, hourly values, and an optional restaurant name. It does not define `cardFingerprint` in this Metrics result definition. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml]

### Current developer-guide conflict

The current Metrics retrieval guide shows the successful response as a JSON array of Metrics rows. The displayed rows contain fields such as `restaurantGuid`, `businessDate`, counts, sales amounts, and an optional grouping value. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]

The OpenAPI object schema and the guide array example conflict. The repository must treat this as unresolved vendor contract evidence. It must not select either representation as live-compatible without an updated Toast artifact or written Toast confirmation. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]

### Request lifecycle and safety boundary

Toast documents a two-step Analytics process: create a request, then retrieve it with the returned `reportRequestGuid`. It says a request GUID expires after seven days, and an expired or invalid GUID returns 404. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html]

T5-002 already limits its closed operation catalog to Metrics, Check, Labor, Menu, Payout by settled date, and Payout by sales date. It excludes the guest route family and the payout-by-payment family. [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `AGENTS.md`]

## Safe T5-003 Boundary

### Current executable boundary: no successful data tool

Until T5-003-G01 closes, T5-003 may add only production-chain tests that prove an Analytics MCP boundary returns structured `denied` or `incomplete` results. It may use the existing body-free T5-002 lifecycle result. It must not register a tool that exposes a successful 200 Analytics payload. [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `AGENTS.md`]

The planned test path is `stdio request → MCP input validation → Analytics runtime identity → selected Analytics restaurant → capability preflight → T5-002 job adapter → body-free lifecycle result → MCP envelope`. The test uses synthetic upstream responses and an invented identity only. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/server.ts`] [VERIFIED: `src/report-tools.ts`]

### Post-gate smallest data tool

After T5-003-G01 closes, add exactly one tool named `toast_analytics_metrics_day`. The tool accepts one canonical Analytics-selected restaurant GUID and one caller-supplied `businessDate` in `YYYYMMDD` form. It must not accept an omitted restaurant, multiple restaurants, a relative date, a UTC date, or a free-form time range. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: `AGENTS.md`]

The tool may call only these two closed routes through T5-002: `POST /era/v1/metrics/day`, then `GET /era/v1/metrics/{reportRequestGuid}`. It must not expose a caller-defined operation, method, path, group, or report GUID. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] [VERIFIED: `src/analytics-report-jobs.ts`]

The tool needs no new package. It reuses TypeScript, Zod, the existing Analytics adapter, the existing exact-decimal helper, and the MCP SDK already locked in this repository. [VERIFIED: `package.json`] [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `src/exact-decimal.ts`]

## Fixed Request Contract After T5-003-G01

| Field | Required value | Reason |
|---|---|---|
| `operation` | `metrics` | This is the only Analytics result family with a small, aggregate, non-guest projection defined here. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `timeRange` | `day` | Toast defines `day` as one business date. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `startBusinessDate` | caller `businessDate` | Toast documents this value as `YYYYMMDD`. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `endBusinessDate` | the same caller `businessDate` | Toast permits omission for `day`, but the downloaded OpenAPI lists it as required. Sending the identical value satisfies both published contracts. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `restaurantIds` | one selected GUID | A non-empty include list scopes the request to that Analytics restaurant. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `excludedRestaurantIds` | `[]` | Toast warns that populated include and exclude lists are contradictory. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `groupBy` | omitted | The first tool exposes no source dimensions. Omission removes dimension names and avoids row aggregation. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `aggregateBy` | omitted | Toast states that `day` defaults to daily aggregation. `HOUR` is out of scope. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `onlyInactiveRestaurants` | omitted | Toast says its default returns active restaurant data. The repository has no verified crosswalk from T5-001 status fields to this query. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: `05-T5-002-CONTRACT-RESEARCH.md`] |
| `fetchRestaurantNames` | omitted | Toast says omission behaves as `false`, so the Metrics result does not add a restaurant name. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] |

## Business-Date Contract

The tool requires an explicit `YYYYMMDD` Toast business date. It never calculates a date from the local clock, UTC calendar date, or a request timestamp. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: `AGENTS.md`]

Toast documents general timestamps as UTC values and requires integrations to convert timestamps to the correct location timezone. The Metrics day input is instead documented as a business date. The tool must pass the validated business-date token unchanged. [CITED: https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]

The tool must not state a timezone or closeout hour in the Analytics result. The Analytics Metrics request and response evidence reviewed here does not supply either field. The result must say that Toast supplied the requested business-date semantics and that the tool performed no UTC-date grouping. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `AGENTS.md`]

## Post-gate Safe Projection

### Allowed fields

After top-level shape confirmation, validate the complete vendor row before projection. The public Metrics-day result may retain only the following fields. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `AGENTS.md`]

| Public field | Upstream field | Rule |
|---|---|---|
| `restaurantGuid` | `restaurantGuid` | It must equal the single selected Analytics restaurant GUID. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `businessDate` | `businessDate` | It must equal the requested `YYYYMMDD` business date. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `ordersCount` | `ordersCount` | Keep as a non-negative integer source value. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `voidOrdersCount` | `voidOrdersCount` | Keep as a non-negative integer source value. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `discountOrderCount` | `discountOrderCount` | Keep as a non-negative integer source value. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] |
| `netSalesAmount` | `netSalesAmount` | Parse to the repository exact-decimal representation and render a canonical decimal string. Do not calculate a replacement net-sales formula. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |
| `grossSalesAmount` | `grossSalesAmount` | Parse to an exact-decimal string without summing it with another source. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |
| `discountAmount` | `discountAmount` | Parse to an exact-decimal string without deriving tax or accounting totals. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |
| `voidOrdersAmount` | `voidOrdersAmount` | Parse to an exact-decimal string. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |
| `refundAmount` | `refundAmount` | Parse to an exact-decimal string. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |
| `avgOrderValue` | `avgOrderValue` | Parse to an exact-decimal string. Do not recompute it. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `src/exact-decimal.ts`] |

The public field name must identify each value as an Analytics source value. The tool must not claim a currency code because the reviewed Metrics result contract does not include one. It must not combine Metrics values with Standard API currency state. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `AGENTS.md`]

### Required exclusions

- Exclude `guestCount`. The first tool does not need this field, and the product boundary excludes guest-linked data handling. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `AGENTS.md`]
- Exclude `restaurantName`. The fixed retrieval request omits `fetchRestaurantNames`. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]
- Exclude `revenueCenter`, `diningOption`, `orderSource`, and `businessHour`. The fixed request omits both grouping controls. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]
- Exclude hourly-job fields. The first tool is a Metrics sales projection, not an employee or labor report. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [VERIFIED: `AGENTS.md`]
- Exclude the disputed open and closed order counts. The OpenAPI uses singular field names, while the current guide displays plural field names. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]
- Exclude every guest route, guest payment value, payment identifier, payout-by-payment operation, and `cardFingerprint` at the request layer. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/analytics-report-jobs.ts`]

## Formula, Provenance, and Completeness Contract

### Formula

The first tool has no cross-row aggregation formula. It returns one validated Metrics row for one selected restaurant and one business date. Each allowed numeric field is a direct source projection. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml]

The tool must store and render source decimal values through the repository exact-decimal helper. It must not use JavaScript floating-point addition, invent tax values, convert the data into an accounting statement, or merge Standard API report values. [VERIFIED: `src/exact-decimal.ts`] [VERIFIED: `AGENTS.md`]

`formulaNotes` must state: `Values are direct Toast Analytics Metrics values. No Standard API values were combined. Amounts are informational and are not accounting, tax, payroll, or GAAP statements.` [VERIFIED: `AGENTS.md`]

### Provenance

Every response must include `source: "analytics_api"`, `report: "analytics_metrics_day"`, selected `restaurantGuid`, requested `businessDate`, `apiFamily: "analytics"`, operation `metrics`, time range `day`, local create/retrieval timestamps, poll count, replacement count, and safe Toast request IDs recorded by T5-002. [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `AGENTS.md`]

Every response must include the fixed request policy: one included restaurant, empty exclude list, no grouping, daily default aggregation, no inactive-only query, and no restaurant-name query. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]

The response must not include bearer tokens, raw upstream error bodies, raw completed bodies, unprojected fields, or the `reportRequestGuid`. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/analytics-report-jobs.ts`]

### Completeness

Before T5-003-G01 closes, every 200 retrieval becomes `status: "incomplete"` with reason `analytics_result_schema_unverified`. The tool must not emit a row, a zero-valued report, or a `complete` status. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] [VERIFIED: `AGENTS.md`]

After T5-003-G01 closes, `status: "complete"` requires one validated documented top-level shape, exactly one row, matching selected restaurant GUID, matching requested business date, successful immutable safe projection, and a completed T5-002 lifecycle. Any mismatch, unsupported field type, missing required allowed field, second row, empty row set, 202 exhaustion, 404, 409 exhaustion, cancellation, 429 exhaustion, or other source failure returns `incomplete` or `denied`; it never becomes a zero report. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/analytics-report-jobs.ts`]

The `onlyInactiveRestaurants` default means the tool cannot claim that the selected-set registry predicts source inclusion. It must record the fixed omission and must not infer inactive status, test status, archive status, timezone, or source currency from another API family. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: `05-T5-002-CONTRACT-RESEARCH.md`] [VERIFIED: `AGENTS.md`]

## Required Plan Boundary

1. Do not add a completed-result parser or a data-returning Analytics MCP tool until T5-003-G01 has written Toast evidence. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]
2. Before that gate, limit T5-003 code to Analytics runtime composition and child-process stdio tests for tool absence or body-free `denied` and `incomplete` envelopes. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/analytics-report-jobs.ts`]
3. After that gate, add only `toast_analytics_metrics_day`. Keep all other Analytics datasets, ranges, grouping modes, payout data, guest data, and employee data out of the slice. [VERIFIED: `AGENTS.md`] [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml]
4. Add synthetic tests for zero Analytics data calls after capability denial, fixed POST/GET routes, fixed default query omission, no guest routes, no raw data in outputs, exact-decimal rendering, complete/incomplete conditions, and end-to-end stdio registration. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/report-tools.ts`]
5. Keep live Analytics compatibility, documented Merchant consent, Toast terms review, and first-tool-request cancellation as external release gates. Local synthetic evidence must not close them. [VERIFIED: `AGENTS.md`] [VERIFIED: `LOOP.md`]

## Open Gates

| ID | Gate | Blocking effect | Required owner evidence |
|---|---|---|---|
| T5-003-G01 | The official OpenAPI says a completed Metrics response is one object. The official guide shows an array. | Blocks every successful 200 parser and every data-returning `toast_analytics_metrics_day` result. | A current corrected downloadable OpenAPI or written Toast confirmation that states the exact top-level type and cardinality for `GET /era/v1/metrics/{reportRequestGuid}`. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] |
| T5-002-G04 | The OpenAPI lists `openOrderCount` and `closedOrderCount`. The guide shows plural names. | The first public projection omits both fields. | Toast field-name and numeric-type clarification. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] |
| T5-002-G02 | The source registry status fields have no verified mapping to the `onlyInactiveRestaurants` query. | The fixed request omits the query. The result makes no source-status inclusion claim. | Toast field-level status crosswalk. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: `05-T5-002-CONTRACT-RESEARCH.md`] |
| External live gate | Synthetic fixtures cannot establish live Analytics compatibility or Merchant consent. | Blocks a live compatibility or release claim. | Owner-authorized account, documented Merchant consent, and a separately reviewed live verification. [VERIFIED: `AGENTS.md`] [VERIFIED: `LOOP.md`] |
| T6-003 | The first-tool-request cancellation issue remains a release gate. | Blocks public release completion. | T6-003 evidence. [VERIFIED: `LOOP.md`] [VERIFIED: `.planning/STATE.md`] |

## Validation Architecture

| Requirement | Test proof |
|---|---|
| No tool before G01 | Child-process stdio discovery does not list any successful Analytics report tool. [VERIFIED: `AGENTS.md`] |
| Fail closed lifecycle | Synthetic 202, 404, 409, 429, malformed body, and cancellation cases return only the safe incomplete or denied envelope. [VERIFIED: `src/analytics-report-jobs.ts`] |
| Fixed scope after G01 | A synthetic end-to-end test records exactly `POST /era/v1/metrics/day` and `GET /era/v1/metrics/{guid}`. It rejects every other Analytics path and method. [VERIFIED: `src/analytics-report-jobs.ts`] |
| Privacy | Tests prove zero guest, payout-by-payment, restaurant-name, raw-body, token, and raw-error fields in the MCP result. [VERIFIED: `AGENTS.md`] |
| Determinism | Tests give decimal source values that would expose floating-point drift. They assert canonical exact-decimal strings and no source mixing. [VERIFIED: `src/exact-decimal.ts`] [VERIFIED: `AGENTS.md`] |
| Public wiring | A synthetic stdio client discovers the post-gate tool and exercises capability preflight, selection, job adapter, projection, provenance, and response envelope. [VERIFIED: `AGENTS.md`] [VERIFIED: `src/server.ts`] |

## Package Legitimacy Audit

No external package is needed for this T5-003 boundary. The package-legitimacy protocol does not apply. [VERIFIED: `package.json`]

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | A future written Toast response-shape clarification will make a single Metrics-day MCP tool suitable as the first public Analytics report. | Safe T5-003 Boundary | The phase needs a different approved source family or no public Analytics data tool. [ASSUMED] |

## Sources

### Primary official sources

- [Toast Reporting API OpenAPI](https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml) — downloaded Metrics routes, request fields, 200 object schema, response fields, and scope.
- [Toast Metrics request guide](https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html) — date formats, day range, include/exclude semantics, grouping, query defaults, and request rates.
- [Toast Metrics retrieval guide](https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html) — retrieval route, name-query omission, rate, and array response example.
- [Toast Analytics process](https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html) — create/retrieve lifecycle and seven-day report GUID expiry.
- [Toast dates and timestamps](https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html) — UTC timestamp and timezone guidance.

### Repository sources

- `AGENTS.md` — product boundary, privacy, consent, isolation, deterministic reporting, and evidence requirements.
- `LOOP.md` and `.planning/ROADMAP.md` Phase 5 — T5-003 ownership and external gates.
- `src/analytics-report-jobs.ts` — closed six-operation lifecycle and current body-free 200 handling.
- `src/analytics-access.ts`, `src/exact-decimal.ts`, `src/report-tools.ts`, and `src/server.ts` — reusable identity, decimal, MCP result, and stdio patterns.

## Metadata

**Confidence breakdown:**

- Request routes and defaults: MEDIUM — current official OpenAPI and guide agree. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]
- Completed Metrics response shape: LOW — current official OpenAPI and guide conflict. [CITED: https://doc.toasttab.com/toast-api-specifications/toast-reporting-api.yaml] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html]
- Repository integration boundary: HIGH — it is directly verified in the closed T5-002 source and the binding repository contract. [VERIFIED: `src/analytics-report-jobs.ts`] [VERIFIED: `AGENTS.md`]

**Valid until:** The first change to the Toast OpenAPI or Metrics retrieval guide. Recheck the two sources before planning any 200-result parser.
