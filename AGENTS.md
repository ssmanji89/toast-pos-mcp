# AGENTS.md

## Scope

This file governs the entire repository.

## Product contract

`toast-pos-mcp` is a public, read-only Model Context Protocol server for deterministic Toast POS reporting.

The initial product is a locally run package. Each operator supplies credentials for Toast API access that they are authorized to use. The project is not an official Toast product, does not imply Toast certification, and must not proxy shared project credentials to third parties.

## Binding safety rules

1. **Read-only means structurally read-only.** Do not implement order submission, payment authorization, inventory mutation, labor mutation, or any other Toast write operation in the reporting server.
2. **No secrets in durable artifacts.** Never commit, print, log, journal, test-fixture, snapshot, or return client secrets, bearer tokens, or raw credential payloads. Redaction is not a substitute for avoiding capture.
3. **No real merchant data in the repository.** Tests, examples, screenshots, and documentation use synthetic fixtures only.
4. **PII is excluded from the initial product.** Do not request or expose `guest.pi:read` or `delivery_info.address:read` in the initial reporting surface. Employee identifiers must be minimized and aggregate reports preferred.
5. **Location isolation is mandatory.** Every Toast request and every cache key must be explicitly bound to a restaurant GUID. Never reuse location-scoped data across locations.
6. **Report semantics are deterministic.** Report calculations must be pure over validated normalized records, documented, fixture-tested, and explicit about exclusions, source API, business date, timezone, and data freshness.
7. **Business date is not a UTC date.** Respect restaurant timezone, `closeoutHour`, daylight-saving transitions, and Toast `businessDate` semantics. Do not silently group transactions by UTC calendar date.
8. **Unknown enum values must survive.** Treat Toast response enums as open strings and preserve unknown values. Do not fail a complete report because Toast introduced a new enum member.
9. **No accounting or tax claims.** Analytics and derived reports are informational. Outputs must not claim GAAP compliance or present tax advice.
10. **Fail closed on capability gaps.** Determine available scopes before calling a report path. Missing scopes, inaccessible locations, partial pages, stale caches, and upstream failures must return explicit structured denials or incomplete-data status, never fabricated zeroes.

## Architecture constraints

- TypeScript on Node.js 20 or later.
- Stable MCP TypeScript SDK v1 until a separately reviewed migration authorizes v2.
- `stdio` is the initial transport. Remote Streamable HTTP requires a separate threat model, authentication design, Toast approval review, and tenant-isolation review.
- Separate the Toast transport, authentication, pagination, normalization, report calculation, and MCP presentation layers.
- Support Standard API and Analytics API through distinct adapters. Never silently mix their metrics.
- Prefer aggregate tools over raw-record dumping. Large datasets belong behind bounded pagination or resource links, not unbounded tool output.
- Honor Toast rate-limit headers and endpoint-specific constraints. Retries must use bounded exponential backoff with jitter and must not retry non-retryable authorization or validation failures.

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
- Toast dates and timestamps: https://doc.toasttab.com/doc/devguide/api_dates_and_timestamps.html
- Toast API terms: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
