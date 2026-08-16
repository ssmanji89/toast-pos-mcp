# Toast POS Reporting MCP

A public, read-only Model Context Protocol server for deterministic reporting over authorized Toast POS data.

> **Status:** implementation campaign in progress. `LOOP.md` and GitHub are authoritative for exact slice state; `.planning/ROADMAP.md` describes outcome/production-verification gates rather than claiming that planned or branch-only behavior is already shipped.

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

The current merged runtime includes:

- Node.js 20-or-later ESM TypeScript with strict checking
- a local MCP `stdio` process
- separate server construction and process startup modules
- non-persistent runtime configuration and a fail-closed Merchant-AI-consent acknowledgment gate
- an in-memory OAuth client-credentials token lifecycle
- a shared structurally read-only Standard API HTTP transport with bounded retry/rate-limit behavior
- both Standard pagination families
- location state keyed by runtime-config identity plus restaurant GUID
- an independently invented JSON fixture directory with traversal protection
- Node's built-in test runner, including a real MCP client-to-child-process `stdio` handshake
- declaration files, source maps, an explicit package file list, and an unpublished private package boundary

The repository is actively correcting production assumptions around location discovery, capability authority, transport provenance, SDK generation, and large-order-page consumption before user-facing reporting tools are registered. Consult `LOOP.md`, GitHub, and `.planning/ROADMAP.md` rather than inferring completion from this summary.

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
| `TOAST_DEFAULT_RESTAURANT_GUID` | Bootstrap/default restaurant GUID used by location-scoped runtime work |

If any required variable is absent or invalid, or `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED` is not exactly `true`, the process fails closed: it exits non-zero before opening the MCP transport and prints only a generic startup-failure message on stderr, never a configured value. `TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true` records operator intent only; it does not by itself establish that Merchant consent is legally sufficient. See [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md).

The OAuth token lifecycle uses these credentials only through the named runtime-configuration accessor. The token manager posts the documented client-credentials body to `https://[toast-api-hostname]/authentication/v1/authentication/login`, caches the returned bearer token according to Toast's `expiresIn` value, refreshes within the final minute of validity, deduplicates simultaneous token requests behind one exchange, and returns structured authentication errors without including credentials, bearer tokens, or upstream response bodies.

The shared Toast HTTP transport is constructed at startup from that same validated configuration and token manager, so later tool slices do not reload or reconstruct credential-bearing state. Restaurant-scoped Standard reads attach the bearer token and explicit restaurant GUID, maintain isolated rate-limit state, honor bounded server waits, and apply bounded exponential backoff with jitter only to retryable classes. Structured transport errors include sanitized status/request ID metadata when available but never upstream response bodies, credentials, bearer tokens, or caught exception details.

No user-facing Toast reporting MCP tool is registered on merged `main` yet. Planned reporting work must prove the complete production chain through stdio rather than only invoking calculators directly.

## Local development

Requirements:

- Node.js 20 or later
- npm 10 or later

Install exact dependencies and run the complete local gate:

```bash
npm ci
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

It waits for MCP JSON-RPC on stdin and reserves stdout for protocol framing. Startup validates runtime configuration and the Merchant-AI-consent acknowledgment, constructs the OAuth token manager and shared Toast HTTP transport, then starts the MCP transport. No startup Toast data request is made, and no reporting tools are registered on merged `main` yet.

## Planning and execution control plane

This repository uses GSD-style outcome planning without replacing the existing serial engineering ledger:

- [`LOOP.md`](LOOP.md) plus current GitHub state are authoritative for atomic slice state, exact heads, review rounds, dependencies, merges, and closures.
- [`.planning/ROADMAP.md`](.planning/ROADMAP.md) projects those slices into phase outcomes, production-wiring requirements, empirical verification, and explicit human/external gates. It does **not** maintain a second mutable slice-state ledger.
- [`.planning/STATE.md`](.planning/STATE.md) is a dated execution snapshot for resumption. It is expected to become stale and must never override current GitHub or `LOOP.md`.

A passing test suite proves only the gate it actually ran. For behavior that will be reachable through MCP, production completion also requires the intended runtime dependency chain to be wired and exercised through the stdio/MCP boundary, plus live/external proof where the contract genuinely depends on vendor authorization or production semantics.

## Repository orientation

- [`AGENTS.md`](AGENTS.md): binding product, safety, architecture, delivery, and GSD-precedence rules
- [`LOOP.md`](LOOP.md): canonical atomic slice ledger and review state
- [`.planning/ROADMAP.md`](.planning/ROADMAP.md): outcome-oriented campaign and production-verification gates
- [`.planning/STATE.md`](.planning/STATE.md): non-authoritative resume snapshot
- [`docs/research/toast-api-reporting-landscape.md`](docs/research/toast-api-reporting-landscape.md): Toast API findings and report-source map
- [`docs/architecture/public-use-boundary.md`](docs/architecture/public-use-boundary.md): initial distribution, AI-processing, and security decision
- [`docs/architecture/threat-model.md`](docs/architecture/threat-model.md): assets, trust boundaries, local-distribution and AI-provider data-flow threats, future-remote-transport requirements, and residual risk

## Current work

The current implementation campaign is reconciling production prerequisites before T3 user-facing report tools: corrected location authority, restaurant-level capability scope intersection, successful-request provenance, bounded-memory order-page consumption, stable MCP SDK v2/runtime compatibility, and real stdio tool wiring. Exact current status belongs to `LOOP.md` and GitHub; `.planning/STATE.md` is only a snapshot.

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
- MCP TypeScript SDK: https://ts.sdk.modelcontextprotocol.io/
