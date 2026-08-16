# Toast POS Reporting MCP

A public, read-only Model Context Protocol server for deterministic reporting over authorized Toast POS data.

> **Status:** implementation campaign in progress. The local Standard API runtime, OAuth lifecycle, read-only transport, and both Standard pagination families are implemented. Location discovery is being repaired around credential-wide connection discovery plus restaurant-scoped detail hydration; Standard-credential compatibility of the credential-wide source remains explicitly release-gated because Toast's current documentation conflicts. Reporting MCP tools and an installable release are not yet available.

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

## Runtime foundation

The current runtime provides:

- Node.js 20-or-later ESM TypeScript with strict checking
- the stable MCP TypeScript SDK v1 over local `stdio`
- separate server construction and process startup modules
- non-persistent runtime configuration with a fail-closed Merchant-AI-consent acknowledgment gate
- an in-memory OAuth client-credentials token lifecycle
- a shared read-only Standard API HTTP transport with sanitized structured errors, bounded waits/retries, and isolated rate-limit state
- configuration page-token traversal with scoped 409 restart handling
- `/ordersBulk` Link-header traversal with fail-closed completeness guards
- a two-stage Standard location context that enumerates credential-accessible restaurant connections and hydrates report-critical restaurant detail when the credential-wide source is available
- an independently invented JSON fixture directory with schema validation and traversal protection
- Node's built-in test runner, including a real MCP client-to-child-process `stdio` handshake
- declaration files, source maps, an explicit package file list, and an unpublished private package boundary

Reporting normalization, capability-tool wiring, Analytics jobs, and Toast reporting MCP tools belong to later slices. No Toast data tool is registered yet.

## Runtime configuration

The process loads non-persistent runtime configuration from environment variables only, validated with Zod, before it starts the MCP transport. Nothing is written to disk and nothing is cached to a durable artifact. `TOAST_CLIENT_ID` and `TOAST_CLIENT_SECRET` are never logged, printed, returned, or included in error messages, fixtures, or snapshots. The loaded configuration object never carries the OAuth client-credentials pair as a data property at all: it is held in a module-private store keyed by the config object's identity and reachable only through a single named accessor, so generic enumeration, spreading, cloning, or serialization of the configuration (`JSON.stringify`, `util.inspect`, `Object.entries`/`values`, object spread, `Object.assign`, `structuredClone`, `for...in`) can never reach it.

Required variables:

| Variable | Purpose |
|---|---|
| `TOAST_API_HOSTNAME` | Bare Toast API hostname (for example, `ws-api.toasttab.com`); no scheme, path, or port |
| `TOAST_CLIENT_ID` | OAuth client ID issued by Toast |
| `TOAST_CLIENT_SECRET` | OAuth client secret issued by Toast |
| `TOAST_ACCESS_TYPE` | Documented machine-client access type; must be exactly `TOAST_MACHINE_CLIENT` |
| `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED` | Explicit operator acknowledgment that documented Merchant consent exists before AI processing of Toast Merchant Data; must be exactly `true` |

Optional:

| Variable | Purpose |
|---|---|
| `TOAST_DEFAULT_RESTAURANT_GUID` | Bootstrap restaurant GUID used to fail closed if the configured operating context is not among the credential's active accessible locations |

If any required variable is absent or invalid, or `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED` is not exactly `true`, the process fails closed: it exits non-zero before opening the MCP transport and prints only a generic startup-failure message on stderr, never a configured value. `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` records operator intent only; it does not by itself establish that Merchant consent is legally sufficient. See [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md).

The OAuth token lifecycle uses these credentials only through the named runtime-configuration accessor. The token manager posts the documented client-credentials body to `https://[toast-api-hostname]/authentication/v1/authentication/login`, caches the returned bearer token according to Toast's `expiresIn` value, refreshes within the final minute of validity, deduplicates simultaneous token requests behind one exchange, and returns structured authentication errors without including credentials, bearer tokens, or upstream response bodies.

The shared Toast HTTP transport is constructed at startup from that same validated configuration and token manager. Restaurant-scoped Standard API reads attach the explicit `Toast-Restaurant-External-ID` GUID and isolate rate-limit state by API family, restaurant GUID, and limiter key. The one credential-scoped discovery read is structurally allowlisted to `GET /partners/v1/restaurants`; it intentionally omits the restaurant header and keeps a separate credential-scoped rate-limit bucket inside the same config-bound client instance. Both paths use the same OAuth acquisition, bounded retries, server-wait ceiling, status classification, JSON parsing, and error-sanitization machinery. A credential failure is never misclassified as a retryable data-network error, and structured transport errors never retain upstream response bodies, credentials, bearer tokens, or caught exception details.

The location discovery layer consumes the Partners accessible-restaurants source when that credential-wide source is authorized, retains only active restaurant GUID/group/scope context, and hydrates every active restaurant through `GET /restaurants/v1/restaurants/{restaurantGUID}` with a matching restaurant header and `includeArchived=false`. The retained immutable location context contains only the restaurant GUID, report name, IANA timezone, `closeoutHour` (0 through 12), ISO-4217 currency code, normalized management-group GUID when present, and the frozen connection-scope list required by capability preflight. Deleted/inactive connections are excluded. Duplicate GUIDs, a missing/deleted bootstrap location, source disagreement, malformed detail, or any mid-hydration failure fails closed without replacing a previously complete registry with partial state.

Toast's current official documentation conflicts on whether Standard API credentials are authorized for `/partners/v1/restaurants`. Therefore an authorization failure at that credential-wide source becomes the static, fail-closed `location_discovery_source_unavailable` error; the runtime does **not** fall back to every restaurant in the management group, because Standard credentials can be configured for only a subset. The exact source conflict, runtime decision, and release-blocking live proof are recorded in [`docs/architecture/standard-location-discovery-compatibility.md`](docs/architecture/standard-location-discovery-compatibility.md) and issue #28. Standard production compatibility is not claimed until that gate is satisfied.

## Local development

Requirements:

- Node.js 20 or later
- npm 10 or later

Install exact dependencies and run the complete local gate:

```bash
npm install
npm run check
```

Individual commands:

```bash
npm run typecheck
npm run build
npm run build:test
npm test
npm run pack:check
```

`npm run check` cleans generated output, performs strict source and test type checking, builds declarations and source maps, compiles and runs tests, performs the `stdio` handshake, and inspects the package with `npm pack --dry-run`. The package is marked `private` and is not publishable in this phase.

The executable can be started after a build, once the required runtime configuration variables above are set:

```bash
npm run build
TOAST_API_HOSTNAME=ws-api.toasttab.com \
TOAST_CLIENT_ID=your-client-id \
TOAST_CLIENT_SECRET=your-client-secret \
TOAST_ACCESS_TYPE=TOAST_MACHINE_CLIENT \
TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true \
node dist/index.js
```

It waits for MCP JSON-RPC on stdin and reserves stdout for protocol framing. Startup validates runtime configuration and the Merchant-AI-consent acknowledgment, constructs the OAuth token manager and shared Toast HTTP transport, then starts the MCP transport. It intentionally makes no startup Toast data request and registers no reporting tools yet; location discovery is invoked by later reporting-tool orchestration.

## Repository orientation

- [`AGENTS.md`](AGENTS.md): binding product, safety, architecture, and delivery rules
- [`LOOP.md`](LOOP.md): phase map, atomic slice ledger, review handoffs, and current state
- [`docs/research/toast-api-reporting-landscape.md`](docs/research/toast-api-reporting-landscape.md): Toast API findings and report-source map
- [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md): initial distribution, AI-processing, and security decision
- [`docs/architecture/standard-location-discovery-compatibility.md`](docs/architecture/standard-location-discovery-compatibility.md): Standard credential source ambiguity, fail-closed behavior, and live release gate
- [`docs/architecture/threat-model.md`](docs/architecture/threat-model.md): assets, trust boundaries, local-distribution and AI-provider data-flow threats, future-remote-transport requirements, and residual risk

## Current work

T0-001 established the reviewed public-use foundation. T1-001 through T1-006 completed the local runtime, configuration/consent gate, OAuth lifecycle, shared Standard API transport, and both Standard pagination families. T2-001 originally introduced location state; the current repair replaces its synthetic aggregate-source assumption with production-shaped credential-wide discovery plus per-restaurant detail hydration and carries currency and restaurant-connection scopes forward for T3/T2-002. Standard compatibility of the credential-wide source remains a live release gate. Capability preflight, T3 normalization/reporting tools, T4 cash/labor reports, and the T5 Analytics adapter remain to be completed.

## Important legal and operational note

Toast API use is governed by Toast's current API Terms of Use and the access agreement attached to each operator's credentials. Operators remain responsible for approved API use, documented Merchant consent before AI processing, applicable third-party-provider approval, privacy and retention controls, and current Toast terms.

Local `stdio` is a credential-custody decision, not a waiver of those requirements. A hosted service, shared credential model, guest-payment analytics feature, or materially different third-party processing arrangement is outside the current architecture and requires separate Toast, legal, privacy, and security review.

This repository's interpretation is engineering guidance, not legal advice.

## Primary sources

- Toast API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Toast Standard API access overview: https://doc.toasttab.com/doc/devguide/devApiAccessUserGuide.html
- Toast Standard API credentials: https://doc.toasttab.com/doc/devguide/devApiAccessCredentials.html
- Toast Partners location access: https://doc.toasttab.com/doc/devguide/apiPartnersGettingAccessibleRestaurants.html
- Toast Partners API: https://doc.toasttab.com/openapi/partners/operation/restaurantsGet/
- Toast Restaurants API: https://doc.toasttab.com/openapi/restaurants/operation/restaurantsGuidGet/
- Toast reporting integration checklist: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistTemplate.html
- Toast pagination: https://doc.toasttab.com/doc/devguide/apiResponseDataPagination.html
- Toast `/ordersBulk` pagination: https://doc.toasttab.com/doc/devguide/apiOrdersGetDetailedInfoAboutMultipleOrders.html
- Toast Analytics API overview: https://doc.toasttab.com/doc/devguide/apiAnalyticsOverview.html
- Toast Analytics process: https://doc.toasttab.com/doc/devguide/apiAnalyticsUnderstandingProcess.html
- Toast Analytics rate limits: https://doc.toasttab.com/doc/devguide/apiAnalyticsRateLimiting.html
- Toast API terms: https://pos.toasttab.com/api-terms-of-use
- MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
