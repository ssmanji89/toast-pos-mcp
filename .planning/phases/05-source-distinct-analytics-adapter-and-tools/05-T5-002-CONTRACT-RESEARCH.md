# Phase 5: T5-002 Analytics Report-Job Contract Research

**Researched:** 2026-08-27  
**Domain:** Toast Analytics report-job wire contracts  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Authority and isolation

- **D-01:** Use separate optional Analytics credentials and a separate token
  manager. Never use Standard credentials as an Analytics fallback.
- **D-02:** Require `enterprise-metrics:read` before every Analytics request.
  A denied preflight must make zero Analytics business-data requests.
- **D-03:** Keep Analytics management-group restaurant authority separate from
  `ToastLocation`, `connectionScopes`, and the Standard location registry.

### Request safety and privacy

- **D-04:** T5-001 allows only the literal `GET /era/v1/restaurants-information`
  operation. It sends no Standard restaurant header.
- **D-05:** Do not represent, construct, fixture, or fetch guest-payment paths
  or guest-linked fields, including `cardFingerprint`.
- **D-06:** Keep a closed Analytics operation type. Do not create a generic
  no-header or arbitrary-path transport primitive.

### Slice and evidence boundary

- **D-07:** T5-001 creates a validated immutable management-group restaurant
  registry and canonical selected-set validation for later job callers.
- **D-08:** T5-002 owns report POST/GET lifecycle, polling, expiry, 409
  replacement, and endpoint/time-range limiter policy.
- **D-09:** T5-003 owns MCP tools, Analytics reports, and stdio wiring.
  T5-001 must not register a tool or claim live compatibility.

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

| ID | Description | Research Support |
|---|---|---|
| T5-002 | Create, retrieve, poll, expire, replace, and limit closed Analytics report jobs. | This note supplies the allowed routes, request shapes, status policy, limiter policy, and owned documentation gates. [VERIFIED: LOOP.md] |

## Summary

T5-002 must use one closed catalog. The catalog has six approved Analytics report families: metrics, check, labor, menu, payout by settled date, and payout by sales date. Each family uses a literal `POST` create route and a literal `GET` retrieval route. Every request uses Analytics bearer authentication only. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [VERIFIED: AGENTS.md]

The present 05-04 plan names a seventh family, payout by payment. Toast documents that its completed rows contain `orderGuid`, `checkGuid`, and `paymentGuid`. The product contract excludes guest-linked order and payment identifiers. Toast public documentation does not prove that this endpoint can return a safe projection without those identifiers. T5-002 must therefore exclude the entire payout-by-payment operation until an owner resolves gate `T5-002-G01`. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/] [VERIFIED: docs/architecture/public-use-boundary.md]

Toast documents `202` as still gathering, `404` as invalid or expired GUID / an error, and `409` as a request that needs a new GUID. Toast does not document a poll interval, poll count, elapsed-time limit, or replacement count. The `1 second`, `30 attempts`, `30 seconds`, and `one replacement` values in 05-05 are local safety policy, not vendor facts. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [VERIFIED: .planning/phases/05-source-distinct-analytics-adapter-and-tools/05-05-PLAN.md]

**Primary recommendation:** Amend 05-04 and 05-05 to implement six closed operations, classify `404` as `invalid_or_expired`, and keep every unproven field or policy behind its named gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Closed operation catalog and wire schemas | API / Backend | — | The local Analytics adapter owns request construction and source validation. [VERIFIED: AGENTS.md] |
| Capability preflight and selection ownership | API / Backend | — | The adapter must prove `enterprise-metrics:read` and private selected-set authority before a source request. [VERIFIED: 05-CONTEXT.md] |
| Report-job polling and limiter state | API / Backend | — | The local process owns bounded waits and identity-isolated request budgets. [VERIFIED: AGENTS.md] |
| Tool registration and presentation | Frontend Server (stdio MCP boundary) | API / Backend | T5-003 alone owns MCP exposure. [VERIFIED: 05-CONTEXT.md] |

## Project Constraints (from AGENTS.md)

- Keep the reporting server structurally read-only. [VERIFIED: AGENTS.md]
- Do not store, print, log, fixture, snapshot, or return secrets. [VERIFIED: AGENTS.md]
- Use invented synthetic records only. [VERIFIED: AGENTS.md]
- Do not process or expose guest-linked payment data or identifiers. [VERIFIED: AGENTS.md]
- Bind each request and cache key to its reviewed restaurant scope or an explicitly reviewed credential-scoped exception. [VERIFIED: AGENTS.md]
- Keep Standard and Analytics adapters, metrics, and rate-limit state separate. [VERIFIED: AGENTS.md]
- Return explicit denial or incomplete state for capability, paging, cache, request-GUID, or upstream failures. [VERIFIED: AGENTS.md]
- Use TypeScript on Node 20+ and the official stdio boundary. [VERIFIED: AGENTS.md]
- Review the complete stdio-to-source chain before making an MCP-reachable claim. [VERIFIED: AGENTS.md]

## Approved Closed Operation Catalog

`restaurantIds` is the canonical selected-set UUID list. `excludedRestaurantIds` must be the empty list. This product rule prevents a request from expanding beyond the private selected set. Toast documents that only one of the two fields may contain restaurant GUIDs. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsCheckReportingDataCreateRequest.html]

| Operation ID | Literal POST create path | Literal GET path | Allowed time range | Allowed create query | Request date fields |
|---|---|---|---|---|---|
| `metrics` | `/era/v1/metrics` or `/era/v1/metrics/{day|week|month|year}` | `/era/v1/metrics/{reportRequestGuid}` | custom; day; week; month; year | `onlyInactiveRestaurants` is not allowed pending G02; `aggregateBy=HOUR` only for `day` after G04 | `startBusinessDate`; `endBusinessDate` required except optional for day. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| `check` | `/era/v1/check/day` | `/era/v1/check/{reportRequestGuid}` | day only | `onlyInactiveRestaurants` is not allowed pending G02 | `startBusinessDate` and `endBusinessDate` must match. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsCheckReportingDataCreateRequest.html] |
| `labor` | `/era/v1/labor/{day|week|month}` | `/era/v1/labor/{reportRequestGuid}` | day; week; month | `onlyInactiveRestaurants` is not allowed pending G02 | `startBusinessDate`; `endBusinessDate`; same date for day. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsLaborReportingDataCreateRequest.html] |
| `menu` | `/era/v1/menu` or `/era/v1/menu/{day|week|month|year}` | `/era/v1/menu/{reportRequestGuid}` | custom; day; week; month; year | `onlyInactiveRestaurants` is not allowed pending G02 | `startBusinessDate`; `endBusinessDate`; day permits an optional equal end date. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMenuReportingDataCreateRequest.html] |
| `payout_settled_date` | `/era/v1/payout/{day|week|month}` | `/era/v1/payout/{reportRequestGuid}` | day; week; month | `onlyInactiveRestaurants` is not allowed pending G02 | `startDate`; `endDate`. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSettledDateSpecificTimeRange/] |
| `payout_sales_date` | `/era/v1/payout/sales-date/{day|week|month}` | `/era/v1/payout/sales-date/{reportRequestGuid}` | day; week; month | `onlyInactiveRestaurants` is not allowed pending G02 | `startDate`; `endDate`. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSalesDateSpecificTimeRange/] |

### Explicitly Excluded Operation

| Operation | Disposition | Reason |
|---|---|---|
| `/era/v1/payout/payments/day` and `/era/v1/payout/payments/{reportRequestGuid}` | Exclude from all routes, types, fixtures, schemas, tests, limiters, and documentation. | The official row includes order, check, and payment GUIDs. Public docs do not prove these fields can be avoided at the request boundary. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/] [VERIFIED: AGENTS.md] |
| `/era/v1/guest/payments/*` | Exclude from all routes, types, fixtures, schemas, tests, limiters, and documentation. | This is Analytics guest-payment data and it exposes `cardFingerprint`. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getGuestByPaymentDateReportingData/] [VERIFIED: AGENTS.md] |

## Input Contracts

All create requests require `Content-Type: application/json` and an Analytics bearer token. They do not use a Standard restaurant header. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] [VERIFIED: AGENTS.md]

```ts
type RestaurantSet = {
  readonly restaurantIds: readonly Uuid[]; // exact canonical selected set
  readonly excludedRestaurantIds: readonly []; // product restriction
};

type BusinessDate = `${number}`; // validate actual YYYYMMDD calendar date
type MetricsCreate = RestaurantSet & {
  readonly operation: "metrics";
  readonly timeRange: "custom" | "day" | "week" | "month" | "year";
  readonly startBusinessDate: BusinessDate;
  readonly endBusinessDate?: BusinessDate;
  readonly groupBy?: readonly ("DINING_OPTION" | "ORDER_SOURCE" | "REVENUE_CENTER")[];
};
type CheckCreate = RestaurantSet & {
  readonly operation: "check"; readonly timeRange: "day";
  readonly startBusinessDate: BusinessDate; readonly endBusinessDate: BusinessDate;
};
type LaborCreate = RestaurantSet & {
  readonly operation: "labor"; readonly timeRange: "day" | "week" | "month";
  readonly startBusinessDate: BusinessDate; readonly endBusinessDate: BusinessDate;
  readonly groupBy?: readonly "JOB"[]; // `EMPLOYEE` is excluded by product policy
};
type MenuCreate = RestaurantSet & {
  readonly operation: "menu";
  readonly timeRange: "custom" | "day" | "week" | "month" | "year";
  readonly startBusinessDate: BusinessDate; readonly endBusinessDate?: BusinessDate;
  readonly groupBy?: readonly ("MENU" | "MENU_GROUP" | "MENU_ITEM" | "MODIFIER")[];
};
type PayoutCreate = RestaurantSet & {
  readonly operation: "payout_settled_date" | "payout_sales_date";
  readonly timeRange: "day" | "week" | "month";
  readonly startDate: BusinessDate; readonly endDate: BusinessDate;
};
```

The type sketch is a local implementation projection. The listed operation fields come from Toast request references. `Uuid` validation and exact date calendar validation are local checks; the public OpenAPI create-response schema only says `string` while the guide calls it a GUID. Gate G03 decides whether a strict UUID response parser is allowed. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postLaborReportingDataSpecificTimeRangeRequest/] [CITED: https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSettledDateSpecificTimeRange/] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html]

### Date and Range Rules

| Family | Rule |
|---|---|
| metrics | Custom ranges end on the current date or earlier and cover at most 366 inclusive days. Day is one date; week is at most 7 days; month at most 31 days; year at most 366 days. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html] |
| check | Day only. Start and end business dates must be equal. Toast bases inclusion on the date an order was initially expected to be fulfilled. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsCheckReportingDataCreateRequest.html] |
| labor | Day, week, and month. Day dates must be equal. The public guide gives no calendar-length rule for week/month beyond the named range. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsLaborReportingDataCreateRequest.html] |
| menu | Custom ends on the current date or earlier. Day is one date; week is at most 7 days; month at most 31 days; year at most 366 days. The current guide does not state a maximum custom range. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMenuReportingDataCreateRequest.html] |
| payout settled/sales date | Day, week, or month. The OpenAPI says day is one day, week is at most 7 days, and month is at most 31 days. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSettledDateSpecificTimeRange/] [CITED: https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSalesDateSpecificTimeRange/] |

## Result Contracts

The adapter must use two stages: strict validation of a documented upstream row, then immutable projection to the fields below. It must not retain raw bodies, upstream error bodies, credentials, tokens, or excluded identifiers. This two-stage model prevents a normal documented-but-unneeded source field from becoming a public or durable field. [VERIFIED: AGENTS.md]

| Operation | Allowed retained row fields | Required exclusion or gate |
|---|---|---|
| metrics | `restaurantGuid`, `businessDate`, counts, sales/discount/refund/void amounts, `avgOrderValue`, optional `revenueCenter`, `diningOption`, `orderSource`, `businessHour`, and hourly-job aggregates. Treat `orderSource` as an open string or null. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] | G04: the guide uses `openOrdersCount` and `closedOrdersCount`, while the OpenAPI sample uses singular names. Pin the source schema only after Toast resolves the mismatch. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData/] [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] |
| check | `restaurantGuid`, order/check numbers, order-open and check timestamps, open-string `checkStatus`, void status, dining option, revenue center, and monetary check totals. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getCheckReportingData/] | Do not retain `serverName`. Do not invent a guest or payment relationship for order/check fields. T5-003 must define its output projection before this row becomes MCP-visible. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getCheckReportingData/] [VERIFIED: AGENTS.md] |
| labor | `restaurantGuid`, business date, hours, costs, sales-per-hour and cost ratios, plus job GUID/title/code when the request uses `JOB` grouping. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getLaborReportingData/] | Exclude `EMPLOYEE` grouping and all employee IDs/names. The existing product boundary forbids individual employee reports and raw employee expansion. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postLaborReportingDataSpecificTimeRangeRequest/] [VERIFIED: .planning/phases/04-cash-and-labor-reporting/04-03-PLAN.md] |
| menu | `restaurantGuid`, business date, sales/discount/refund/void amounts, quantity, average price, waste totals, and only the identifiers/names that match the requested menu group dimension. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMenuReportingData/] | Do not retain an unrequested menu dimension merely because Toast returns it. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMenuReportingDataUnderstandingData.html] |
| payout settled date | `restaurantGuid`, settled date, sales-period times, counts, payment/refund/fee/withholding/payout amounts, and open-string `payoutStatus`. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutSettledDateReportingData/] | Do not treat the result as accounting or tax advice. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html] [VERIFIED: AGENTS.md] |
| payout sales date | `restaurantGuid`, sales date, settled-date list, counts, payment/refund/fee/withholding/payout amounts. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutSalesDateReportingData/] | Do not retain payment-level identifiers. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutSalesDateReportingData/] [VERIFIED: AGENTS.md] |

The public API reference displays completed-result samples as a JSON object, while selected developer-guide retrieval examples display arrays. T5-002 must not guess whether each live response is an object or an array. Gate G05 requires the current official downloadable Analytics OpenAPI artifact or a Toast documentation answer before a strict top-level Zod schema is implemented. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] [CITED: https://doc.toasttab.com/openapi/analytics/overview/]

## Lifecycle and Status Classifier

| HTTP status | Required classifier | Contract |
|---|---|---|
| 200 | `complete` only after the G05-proven schema validates and immutable projection succeeds. | The retrieval endpoints return reporting data on 200. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] |
| 202 | `pending` | Toast is gathering data. Retry later. Do not parse or retain a body. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] |
| 404 | `invalid_or_expired` | Toast documents invalid or expired GUIDs as 404, and endpoint references call 404 an unexpected error. Do not parse or retain the message. Do not claim a known expiry cause. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] |
| 409 | `replacement_required` | Toast says it could not process the request and requires a new `reportRequestGuid`. Recreate only the original validated typed request. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] |
| other non-200 / malformed body | `failed_or_incomplete` | The project must fail closed and must not produce an empty success. [VERIFIED: AGENTS.md] |

Toast says a report request GUID expires seven days after creation. The local lifecycle may record creation time and use that fact for provenance, but it cannot distinguish `404` expiry from another invalid/error cause without retaining a server message. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [VERIFIED: AGENTS.md]

## Rate-Limit Contract

The limiter key must include the private Analytics identity reference, closed operation ID, HTTP method, time-range form, and canonical selected-set GUID sequence. This is the product isolation policy. Toast documents endpoint/method/time-range limits and Analytics global limits, but it does not document this local object-identity key. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] [VERIFIED: AGENTS.md]

| Operation | Create budget | Retrieval budget |
|---|---|---|
| metrics | custom/month/year: 10/hour; day/week: 10/minute and 60/hour | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| check | 5/minute and 60/day | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| labor | month: 10/hour; day/week: 10/minute and 60/hour | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| menu | custom/month/year: 10/hour; day/week: 10/minute and 60/hour | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| payout settled date | month: 10/hour; day/week: 10/minute and 60/hour | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| payout sales date | month: 10/hour; day/week: 10/minute and 60/hour | 5/second and 30/minute. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |

Every source turn, including a replacement POST and a polling GET, consumes its endpoint/method/time-range bucket before fetch. A 429 wait uses Toast rate-limit response headers when present; a retry never treats authorization or validation failure as retryable. [CITED: https://doc.toasttab.com/doc/devguide/apiRateLimiting.html] [VERIFIED: AGENTS.md]

## Restaurant Status Policy

Do not send `onlyInactiveRestaurants` in T5-002. Toast says the default returns active restaurants and `true` returns only restaurants considered inactive when the request is sent. Toast does not map this concept to the `active`, `testMode`, and `archived` fields retained by T5-001. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsInactiveRestaurantData.html] [VERIFIED: 05-RESEARCH.md]

The caller can select only an identity-bound canonical subset from T5-001. T5-002 must record the selected set as provenance. It must not claim that a T5-001 status field proves Analytics inclusion or exclusion. [VERIFIED: 05-CONTEXT.md] [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsInactiveRestaurantData.html]

## Plan Corrections Required Before Implementation

1. Replace every reference to seven approved operations in 05-04 and 05-05 with the six-operation catalog above. Remove payout-by-payment paths, schemas, fixtures, test cases, and limiter entries. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/] [VERIFIED: AGENTS.md]
2. Replace the 05-05 `expired` terminal state with `invalid_or_expired`. The source does not prove a 404 cause without reading an upstream message. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html]
3. Mark the 1-second, 30-attempt, 30-second, and one-replacement bounds as local product policy. They are not Toast documented values. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] [VERIFIED: 05-05-PLAN.md]
4. Remove `onlyInactiveRestaurants` and labor `EMPLOYEE` grouping from the implemented input types until their gates close. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsInactiveRestaurantData.html] [VERIFIED: .planning/phases/04-cash-and-labor-reporting/04-03-PLAN.md]
5. Do not implement strict UUID-only create-response or strict top-level result parsing until G03 and G05 close. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postLaborReportingDataSpecificTimeRangeRequest/] [CITED: https://doc.toasttab.com/openapi/analytics/overview/]

## Owned External / Documentation Gates

| ID | Unproven fact | Owner and required evidence | Plan effect while open |
|---|---|---|---|
| T5-002-G01 | Payout-by-payment results can be requested without processing guest-linked order, check, or payment identifiers. | Product owner obtains written Toast documentation or approval that defines a safe request-layer projection. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/] | Exclude the family completely. |
| T5-002-G02 | T5-001 `active` / `testMode` / `archived` fields map to Analytics `onlyInactiveRestaurants`. | Toast documentation owner supplies a field-level crosswalk. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsInactiveRestaurantData.html] | Do not use the query parameter or claim a status policy. |
| T5-002-G03 | Toast guarantees a UUID-formatted create response. | Toast provides an OpenAPI response format of UUID or a written contract clarification. [CITED: https://doc.toasttab.com/openapi/analytics/operation/postLaborReportingDataSpecificTimeRangeRequest/] | Do not use UUID-only rejection for a source response. |
| T5-002-G04 | Metrics response uses one canonical `open/closed order count` field spelling and numeric types. | Toast documentation owner resolves the guide/OpenAPI mismatch. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/] | Exclude those disputed fields from the retained projection. |
| T5-002-G05 | Each retrieval endpoint returns a known top-level array or object contract. | Pin the current official downloadable Analytics OpenAPI file and review its response schemas. [CITED: https://doc.toasttab.com/openapi/analytics/overview/] | Do not implement a strict completed-result schema or claim 200 result compatibility. |

## Don't Hand-Roll

| Problem | Do not build | Use instead | Why |
|---|---|---|---|
| Request routing | Caller-defined Analytics path or generic no-header request helper | Closed discriminated operation catalog | It structurally prevents guest routes, alternate verbs, and scope expansion. [VERIFIED: AGENTS.md] |
| Rate calculation | One copied Standard limiter | A separate Analytics endpoint/method/time-range limiter | Toast assigns endpoint-specific Analytics budgets. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html] |
| Status meaning | A parser for Toast error bodies | The body-free classifier above | Error messages can contain upstream data and do not prove the exact 404 cause. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [VERIFIED: AGENTS.md] |

## Common Pitfalls

### Pitfall 1: Treating a payout-by-payment route as non-guest

**What goes wrong:** The code fetches payment-level GUIDs before it can filter them. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/]

**How to avoid:** Omit the operation from the catalog until G01 closes. [VERIFIED: AGENTS.md]

### Pitfall 2: Treating 404 as proven expiry

**What goes wrong:** The tool presents an expiry explanation when the source only proves invalid-or-expired / error. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html] [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/]

**How to avoid:** Return `invalid_or_expired` without the upstream body. [VERIFIED: AGENTS.md]

### Pitfall 3: Sharing a limit between unlike Analytics requests

**What goes wrong:** A low-volume retrieve or another time-range form consumes a create budget incorrectly. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html]

**How to avoid:** Key every turn by closed operation, method, time-range, private identity, and canonical selection. [VERIFIED: AGENTS.md]

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Node built-in test runner through the TypeScript test build. [VERIFIED: package.json] |
| Quick run | `npm run build:test && node --test dist-test/test/analytics-report-jobs.test.js`. [VERIFIED: 05-04-PLAN.md] |
| Contract tests | Assert six literal route pairs, zero source calls for invalid input, body-free 202/404/409 classifiers, and separate limiter buckets. [VERIFIED: 05-04-PLAN.md] |
| Gate tests | Assert no payment-payout or guest route name, fixture, schema, or limiter entry exists. [VERIFIED: AGENTS.md] |

## Security Domain

| ASVS category | Applies | Control |
|---|---|---|
| V2 Authentication | Yes | Separate Analytics token manager and `enterprise-metrics:read` preflight. [VERIFIED: 05-CONTEXT.md] |
| V4 Access Control | Yes | Private identity-bound canonical restaurant selection. [VERIFIED: 05-CONTEXT.md] |
| V5 Input Validation | Yes | Closed typed operation catalog and strict source validation after G03/G05. [VERIFIED: AGENTS.md] |
| V6 Cryptography | No new control | The phase consumes the existing token manager and does not add cryptography. [VERIFIED: 05-04-PLAN.md] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `Uuid` and exact calendar-date validation are useful local checks. | Input Contracts | They could reject a vendor-valid response or date representation. |
| A2 | The requested result fields are sufficient for T5-003 presentation. | Result Contracts | T5-003 could require a field not approved for retention. |

## Sources

### Primary

- [Analytics process](https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html) — lifecycle and seven-day GUID expiry.
- [Analytics rate limits](https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html) — endpoint, method, and time-range limits.
- [Analytics OpenAPI overview](https://doc.toasttab.com/openapi/analytics/overview/) — official current API-reference artifact.
- [Metrics create](https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataCreateRequest.html), [check create](https://doc.toasttab.com/doc/devguide/apiAnalyticsCheckReportingDataCreateRequest.html), [labor create](https://doc.toasttab.com/doc/devguide/apiAnalyticsLaborReportingDataCreateRequest.html), and [menu create](https://doc.toasttab.com/doc/devguide/apiAnalyticsMenuReportingDataCreateRequest.html) — create payloads and time ranges.
- [Payout settled create](https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSettledDateSpecificTimeRange/) and [payout sales-date create](https://doc.toasttab.com/openapi/analytics/operation/postPayoutReportSalesDateSpecificTimeRange/) — payout inputs.
- [Payout payment retrieve](https://doc.toasttab.com/openapi/analytics/operation/getPayoutPaymentsReportingData/) — G01 evidence.

## Metadata

**Confidence breakdown:**

- Routes and rate limits: MEDIUM — current official Toast pages were read through WebSearch. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html]
- Status semantics: MEDIUM — official endpoint pages agree on 202 and 409; 404 has a documented ambiguity. [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/]
- Result schemas: LOW — current official guide and OpenAPI presentation show unresolved shape/name differences. [CITED: https://doc.toasttab.com/doc/devguide/apiAnalyticsMetricsReportingDataRetrieveData.html] [CITED: https://doc.toasttab.com/openapi/analytics/operation/getMetricsReportingData/]

**Research date:** 2026-08-27  
**Valid until:** 2026-09-03, because Toast Analytics documentation changes.
