# AGENTS.md

## Scope

This file governs the entire repository.

## Product contract

`toast-pos-mcp` is a public, read-only Model Context Protocol server for deterministic Toast POS reporting.

The initial product is a locally run package. Each operator supplies credentials for Toast API access that they are authorized to use. The project is not an official Toast product, does not imply Toast certification, and must not proxy shared project credentials to third parties.

Local execution controls credential custody; it does not authorize AI or third-party processing. Before any Toast Merchant Data is processed by an AI tool or service, the operator must hold documented consent from the applicable Merchant and must satisfy any applicable Toast review or prior-written-consent requirement.

## Binding safety rules

1. **Read-only means structurally read-only.** Do not implement order submission, payment authorization, inventory mutation, labor mutation, or any other Toast write operation in the reporting server.
2. **No secrets in durable artifacts.** Never commit, print, log, journal, test-fixture, snapshot, or return client secrets, bearer tokens, or raw credential payloads. Redaction is not a substitute for avoiding capture.
3. **No real merchant data in the repository.** Tests, examples, screenshots, and documentation use independently invented synthetic fixtures only. Do not derive synthetic fixtures from Toast API data or Merchant Data.
4. **AI processing requires consent and must not train.** Do not process Toast Merchant Data with an AI tool or service unless documented Merchant consent exists. Cloud model providers, MCP hosts, prompt or tool logging, telemetry, retention, and subprocessors are third-party processing considerations even when the MCP server itself runs locally. Do not use the Toast API or data passing through it to train, fine-tune, evaluate for model improvement, otherwise improve a model, or create API-derived synthetic training data without Toast's prior written approval.
5. **Guest-linked data is excluded from the initial product.** Do not request or expose `guest.pi:read`, `delivery_info.address:read`, Analytics guest-payment data, `cardFingerprint`, or other guest-linked payment identifiers. Aggregating a result does not make source-data processing permissible.
6. **Location isolation is mandatory.** Every Toast request and every cache key must be explicitly bound to a restaurant GUID. Never reuse location-scoped data across locations.
7. **Report semantics are deterministic.** Report calculations must be pure over validated normalized records, documented, fixture-tested, and explicit about exclusions, source API, business date, timezone, and data freshness.
8. **Business date is not a UTC date.** Respect restaurant timezone, `closeoutHour`, daylight-saving transitions, and Toast `businessDate` semantics. Do not silently group transactions by UTC calendar date.
9. **Unknown enum values must survive.** Treat Toast response enums as open strings and preserve unknown values. Do not fail a complete report because Toast introduced a new enum member.
10. **No accounting or tax claims.** Analytics and derived reports are informational. Outputs must not claim GAAP compliance or present tax advice.
11. **Fail closed on capability gaps.** Determine available scopes before calling a report path. Missing scopes, inaccessible locations, partial pages, stale caches, expired Analytics request GUIDs, and upstream failures must return explicit structured denials or incomplete-data status, never fabricated zeroes.

## Architecture constraints

- TypeScript on Node.js 20 or later.
- Stable MCP TypeScript SDK v1 until a separately reviewed migration authorizes v2.
- `stdio` is the initial transport. Remote Streamable HTTP requires a separate threat model, authentication design, Toast approval review, and tenant-isolation review.
- Local `stdio` does not bypass Merchant consent, Toast third-party-provider requirements, AI restrictions, logging review, or retention review.
- Separate the Toast transport, authentication, pagination, Analytics report-job lifecycle, normalization, report calculation, and MCP presentation layers.
- Support Standard API and Analytics API through distinct adapters. Never silently mix their metrics.
- Prefer aggregate tools over raw-record dumping. Large datasets belong behind bounded pagination or resource links, not unbounded tool output.
- Honor Toast rate-limit headers and endpoint-specific constraints. Retries must use bounded exponential backoff with jitter and must not retry non-retryable authorization or validation failures.
- Implement pagination by endpoint family: fixed `page`/`pageSize` plus Link traversal for `/ordersBulk`, and `Toast-Next-Page-Token` traversal for configuration endpoints. Scope configuration-publication 409 restarts to page-token configuration reads.
- Treat Analytics reports as bounded jobs: POST to create, GET to retrieve, 202 as pending, 200 as complete, 404 as invalid or expired, and 409 as a failed request that requires a new `reportRequestGuid`.

## Delivery standard

Before changing a path, read `/LOOP.md` and every `AGENTS.md` from the repository root to that path.

Each slice must include the smallest complete behavior, its tests, and any documentation required to operate it. Run local checks and attach exact commands and results to the pull request. GitHub Actions are not a delivery gate for this repository.

Reviewers report findings only. Builders do not self-approve. Tests and acceptance criteria may not be weakened to obtain a pass.

## Documentation check (DOX)

For every slice, verify whether it changes a durable product contract, architecture rule, external interface, report formula, operational procedure, security assumption, or repository structure. Update the nearest owning documentation only when one of those durable facts changes. Record `DOX: updated` or `DOX: no durable change` in the slice evidence.

## Primary external references

- Toast API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Toast authentication: https://doc.toasttab.com/doc/devguide/authentication.html
- Toast rate limiting: https://doc.toasttab.com/doc/devguide/apiRateLimiting.html
- Toast Analytics rate limiting: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html
- Toast pagination: https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
- Toast Analytics process: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html
- Toast dates and timestamps: https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html
- Toast API terms: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
