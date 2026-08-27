# Toast POS Reporting MCP

A public, read-only Model Context Protocol server for deterministic reporting over authorized Toast POS data.

> **Status:** implementation campaign in progress. `LOOP.md` and GitHub are authoritative. The MCP v2 stdio baseline and repaired location authority are merged. Capability preflight is under review. Standard credential support for its credential-wide source is an explicit release gate. No public release exists.

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

The initial distribution runs locally over MCP `stdio`. Each operator must use Toast credentials they are authorized to use. This repository does not provide shared credentials and is not affiliated with or endorsed by Toast, Inc.

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

The current runtime uses Node.js 20-or-later ESM TypeScript, local MCP `stdio`, a fail-closed configuration and consent gate, OAuth, read-only Standard transport, bounded Standard pagination, and synthetic fixture tests.

The merged MCP v2 runtime uses `@modelcontextprotocol/server` in production and `@modelcontextprotocol/client` in executable tests. It uses `serveStdio(factory)` for legacy 2025 and 2026-07-28 clients. It owns asynchronous transport errors through a sanitized terminal wrapper.

The branch adds a two-stage location context. It discovers credential-accessible restaurant connections and hydrates report-critical restaurant detail when the credential-wide source is available.

This PR repairs location discovery through credential-wide Partners connection discovery and restaurant-scoped detail hydration. Reporting tools remain unavailable.

This branch adds stateless, restaurant-specific capability preflight. It intersects the current token's provisioned scopes with the selected restaurant connection scopes, then removes product-excluded guest scopes. Reporting tools remain unavailable.

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
| `TOAST_DEFAULT_RESTAURANT_GUID` | Bootstrap restaurant GUID. It fails closed when the configured location is not accessible to the credential. |
| `TOAST_ANALYTICS_API_HOSTNAME` | Analytics API hostname. Set this only with the other three Analytics variables. |
| `TOAST_ANALYTICS_ACCESS_TYPE` | Analytics machine-client access type. |
| `TOAST_ANALYTICS_CLIENT_ID` | Analytics OAuth client ID. |
| `TOAST_ANALYTICS_CLIENT_SECRET` | Analytics OAuth client secret. |

If any required variable is absent or invalid, or `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED` is not exactly `true`, the process fails closed: it exits non-zero before opening the MCP transport and prints only a generic startup-failure message on stderr, never a configured value. `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` records operator intent only; it does not by itself establish that Merchant consent is legally sufficient. See [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md).

The OAuth token lifecycle uses these credentials only through the named runtime-configuration accessor. The token manager posts the documented client-credentials body to `https://[toast-api-hostname]/authentication/v1/authentication/login`, caches the returned bearer token according to Toast's `expiresIn` value, refreshes within the final minute of validity, deduplicates simultaneous token requests behind one exchange, and returns structured authentication errors without including credentials, bearer tokens, or upstream response bodies. `getProvisionedScopes()` decodes the documented scope claim inside the token owner and returns only a frozen scope array.

The shared Toast HTTP transport uses one validated configuration and token manager. Restaurant-scoped reads use an explicit restaurant GUID and isolated rate-limit state. The credential-scoped discovery path is structurally allowlisted to `GET /partners/v1/restaurants`, omits the restaurant header, and uses a separate credential-scoped rate-limit bucket. Both paths use the same OAuth, bounded retries, wait ceiling, parsing, and error sanitization.

The location layer consumes the Partners accessible-restaurants source when it is authorized. It retains only active restaurant GUID/group/scope context. It hydrates each active restaurant with `GET /restaurants/v1/restaurants/{restaurantGUID}`, a matching restaurant header, and `includeArchived=false`. Invalid or incomplete results fail closed without publishing partial state.

Toast documentation conflicts on Standard credential access to `/partners/v1/restaurants`. An authorization failure returns static `location_discovery_source_unavailable`. The runtime never falls back to every management-group location. Issue #28 records the required live release proof.

Capability preflight uses two independent Toast authorities for the selected restaurant. It intersects the current authentication-token JWT scopes with that restaurant connection's scopes. It then removes guest-linked scopes. A missing scope returns a deterministic denial with global or connection diagnostics. A product-excluded scope returns `excluded_scope_required`. A generic Toast 403 remains an invocation-level denial. It is never cached as capability state. See [`docs/research/toast-auth-capability-contract.md`](docs/research/toast-auth-capability-contract.md).

### Internal Analytics authority

The four optional `TOAST_ANALYTICS_*` values are an all-or-nothing local contract. They are operator-supplied, non-persistent, and separate from Standard credentials. When all four values are absent, Standard startup does not change. When any value is absent or invalid, Analytics authority is unavailable and fails closed. The runtime never uses Standard host, access-type, client-ID, or client-secret values as Analytics fallback values.

T5-001 provides an internal, capability-gated Analytics management-group discovery adapter. It requires `enterprise-metrics:read` before its only operation: `GET /era/v1/restaurants-information`. The closed operation sends no `Toast-Restaurant-External-ID` header. It does not construct guest-payment routes or request guest-linked data, including `cardFingerprint`. It validates and freezes a minimized restaurant registry. Later callers must submit a non-empty, canonical UUID subset that binds to the private Analytics credential identity.

This is not an MCP tool, a stdio tool path, an Analytics report, or live-compatibility proof. T5-002 owns report-job creation, polling, expiry, 409 replacement, and dataset/time-range policy. T5-003 owns Analytics report tools and presentation. Authorized live Analytics access, Merchant consent for AI processing, first-tool-request cancellation, signing, publication, and install smoke remain release gates.

## MCP stdio failure behavior

Stdout is MCP JSON-RPC only. Startup errors use static stderr text and a non-zero exit status. The v2 `serveStdio()` error path uses `startStdioServer()`. It writes only `toast-pos-mcp stdio transport error`, sets non-zero status, closes its owned handle, and collapses repeated errors into one terminal transition.

## Local development

Requirements:

- Node.js 20 or later
- npm 10 or later

Restore the exact committed dependency graph and run the complete local gate:

```bash
npm ci
npm run check
```

Use `npm install` only when intentionally changing dependencies and regenerating `package-lock.json`. The MCP v2 migration is not CLEAN until npm has generated a lockfile for the authentic v2 package graph and clean Node 20/Node 22 executions have passed.

Individual commands:

```bash
npm run typecheck
npm run build
npm run build:test
npm test
npm run pack:check
```

`npm run check` cleans generated output, performs strict source and test type checking, builds declarations and source maps, compiles and runs every discovered test file, performs executable `stdio` handshakes, and inspects the package with `npm pack --dry-run`. The package is marked `private` and is not publishable in this phase.

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

It waits for MCP JSON-RPC on stdin and reserves stdout for protocol framing. Startup validates configuration and consent, constructs one OAuth manager and shared transport, then serves the v2 protocol boundary. No startup Toast data request is made. Later reporting-tool orchestration invokes location discovery and capability preflight.

## Planning and execution control plane

`LOOP.md` and GitHub are authoritative for slice state. `.planning/ROADMAP.md` defines outcome and production-verification gates. `.planning/STATE.md` is a staleable snapshot. Passing tests alone does not prove production MCP wiring.

## Repository orientation

- [`AGENTS.md`](AGENTS.md): binding product, safety, architecture, delivery, and GSD-precedence rules
- [`LOOP.md`](LOOP.md): canonical atomic slice ledger and review state
- [`.planning/ROADMAP.md`](.planning/ROADMAP.md): outcome-oriented campaign and production-verification gates
- [`.planning/STATE.md`](.planning/STATE.md): non-authoritative resume snapshot
- [`docs/research/toast-api-reporting-landscape.md`](docs/research/toast-api-reporting-landscape.md): Toast API findings and report-source map
- [`docs/research/toast-auth-capability-contract.md`](docs/research/toast-auth-capability-contract.md): JWT and restaurant-connection capability authority contract
- [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md): initial distribution, AI-processing, and security decision
- [`docs/architecture/threat-model.md`](docs/architecture/threat-model.md): historical/current threat catalog for the broader product boundary
- [`docs/architecture/threat-model-mcp-v2-runtime.md`](docs/architecture/threat-model-mcp-v2-runtime.md): MCP v2 local-runtime addendum
- [`docs/architecture/standard-location-discovery-compatibility.md`](docs/architecture/standard-location-discovery-compatibility.md): Standard credential source ambiguity and live release gate

## Current work

The campaign completed the location-authority repair. It now validates capability preflight, provenance, bounded page folding, normalization, and reporting tools. Standard support for the credential-wide source remains a live release gate. Use `LOOP.md` and GitHub for the current state.

## Important legal and operational note

Toast API use is governed by Toast's current API Terms of Use and the access agreement attached to each operator's credentials. Operators remain responsible for approved API use, documented Merchant consent before AI processing, applicable third-party-provider approval, privacy and retention controls, and current Toast terms.

Local `stdio` is a credential-custody decision, not a waiver of those requirements. A hosted service, shared credential model, guest-payment analytics feature, or materially different third-party processing arrangement is outside the current architecture and requires separate Toast, legal, privacy, and security review.

This repository's interpretation is engineering guidance, not legal advice.

## Primary sources

- Toast API overview: https://doc.toasttab.com/doc/devguide/apiOverview.html
- Toast authentication: https://doc.toasttab.com/doc/devguide/authentication.html
- Toast Standard API scopes: https://doc.toasttab.com/doc/devguide/devApiAccessScopes.html
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
- MCP TypeScript SDK v2: https://github.com/modelcontextprotocol/typescript-sdk
