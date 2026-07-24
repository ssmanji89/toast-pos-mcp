# Public-Use Architecture Boundary

**Decision:** accepted for the initial product  
**Date:** 2026-07-24  
**Applies to:** all releases before a superseding reviewed decision

## Context

The project is intended for public use, but Toast API access is credentialed, location-scoped, governed by Toast's access models and current API Terms of Use, and capable of exposing sensitive merchant, employee, guest, and operational data.

A conventional hosted SaaS MCP would require the project to receive and process third-party Toast credentials and Merchant Data. That would introduce tenant isolation, credential custody, data residency, subprocessors, privacy notices, breach response, availability, and Toast-approval obligations before the reporting behavior itself is proven.

A local MCP avoids centralized credential custody, but locality does not determine whether downstream processing is permitted. A local `stdio` server can still send report content through an MCP host to a cloud model, trace collector, logging service, retention system, or other third party.

Toast API Terms section 11.6 requires Merchant consent before AI tools or services process Merchant Data and prohibits using the API or data passing through it to train, fine-tune, or otherwise improve AI models, including creating API-derived synthetic training data, without Toast's prior written approval. Section 2.6 separately requires Toast's prior written consent before engaging a third-party provider to use the APIs in connection with application development.

Standard API and Analytics API customers also do not receive a sandbox. A public implementation cannot depend on live Merchant Data for ordinary development or validation.

## Decision

The initial product will be an open-source, locally run, read-only MCP server distributed as an installable Node.js package.

It will:

- use MCP `stdio` as the first transport
- accept operator-owned Toast credentials at process runtime
- keep credentials and bearer tokens in memory only
- make direct requests from the operator's environment to the operator's authorized Toast API hostname
- expose deterministic reporting tools only
- contain no Toast write-operation implementation
n- use independently invented synthetic fixtures for all repository tests and examples
- require an explicit operator acknowledgment that documented Merchant consent exists before AI processing is enabled
- exclude guest PII, delivery-address scopes, Analytics guest-payment data, and guest-linked payment identifiers
- keep Standard API and Analytics API metrics in distinct adapters and tool namespaces

It will not:

- operate as a hosted credential proxy
- provide shared credentials
- persist Merchant Data by default
- transmit telemetry containing Merchant Data, employee data, restaurant GUIDs, request payloads, or credentials
- imply that local execution authorizes cloud model, MCP-host, logging, retention, or subprocessor use
- use Toast API data for training, fine-tuning, evaluation for model improvement, model improvement, or API-derived synthetic training data without Toast's prior written approval
- claim endorsement, certification, or official status from Toast
- expose live order, payment, stock, labor, or configuration writes behind a feature flag

## AI and third-party processing boundary

This boundary applies regardless of whether the server transport is local or remote.

Before the server is configured for use with an AI tool or service, the operator must:

- hold documented consent from the applicable Merchant for that AI processing
- identify the MCP client or host, model provider, prompt and tool logging, telemetry, retention, deletion behavior, and subprocessors
- determine and satisfy any applicable Toast prior-written-consent or other review requirement
- configure the provider so Toast API data is not used for training or model improvement unless Toast has given prior written approval
- ensure onward disclosure and retention comply with the operator's Toast agreement and applicable privacy obligations

The package can require an explicit acknowledgment, but it cannot establish that consent is legally sufficient. Consent evidence remains outside the repository and is the operator's responsibility.

A provider's claim that data is not used for training does not by itself resolve logging, human review, retention, subprocessor, residency, or onward-disclosure obligations.

## Credential model

Required runtime values will be supplied through environment variables or a pluggable secret-provider interface:

- API hostname
- client ID
- client secret
- user access type, fixed to the documented machine-client value
- optional default restaurant GUID
- explicit acknowledgment that Merchant consent for configured AI processing has been documented

The default implementation must not:

- accept credentials as MCP tool arguments
- return credential configuration through MCP resources
- save secrets to a configuration file
- print a secret-bearing exception body
- include authentication request bodies in debug logs
- rely on a fixed token lifetime
- store or display Merchant consent evidence

A token cache may retain the current bearer token and expiry instant in process memory. It must refresh during the final minute of validity and clear the token on authentication denial.

## Authorization and capability model

The server will derive a capability view from configured access type, token scope claims, and observed API authorization.

The capability view is advisory for tool discovery and denial messages. It is not a substitute for Toast authorization. A tool must fail closed when:

- a required scope is absent
- a restaurant is not accessible
- an upstream 403 contradicts the cached capability view
- the report cannot retrieve a complete and internally consistent page set
- an Analytics request GUID is expired, invalid, or cannot be replaced within the bounded request budget
- the required Merchant-AI-consent acknowledgment is absent for an AI-configured deployment

Tools with unavailable capabilities may remain discoverable if they return a precise structured denial explaining the missing scope or access type. They must not disappear and encourage an agent to guess whether the server is broken.

## Location isolation

Every request, cache entry, report calculation, Analytics report job, and result envelope must include an explicit restaurant GUID or an explicit management-group member set.

Cache keys must include at least:

- non-secret credential identity fingerprint
- restaurant GUID or normalized management-group restaurant set
- API family
- resource identity
- version or freshness marker where applicable

A request without an explicit restaurant GUID may use a configured default only when exactly one default is present. Multi-location operations must iterate locations explicitly and return per-location statuses. No cross-location aggregate may omit its member locations or partial failures.

## Report result contract

Every report will return structured content with:

- report identifier and schema version
- source adapter
- restaurant GUID or declared management-group members
- requested date mode and bounds
- effective business date or modification window
- restaurant timezone and closeout hour where applicable
- generated-at and source-retrieved-at timestamps
- completeness status
- records and pages processed or Analytics job state
- totals and dimensions
- applied exclusions
- unresolved references
- warnings and upstream request IDs

Numeric values must remain numeric in structured content. Human-readable text is supplementary and must not be the only representation.

The result status is one of:

- `complete`: all required data was retrieved and normalized
- `partial`: bounded data exists but one or more declared components are incomplete or stale
- `denied`: authorization, capability, configuration, consent acknowledgment, or integrity requirements prevented a trustworthy report

`partial` and `denied` are not represented as successful zero-value reports. An Analytics 202 response is a pending job state, not a zero report and not yet a complete report.

## Data minimization

The default tools return aggregates rather than raw orders, checks, employee objects, or payment records.

Initial source processing and output exclude:

- guest name, email, phone, address, and delivery notes
- Analytics guest-payment endpoints
- `cardFingerprint`, order GUIDs tied to guest-payment analytics, payment GUIDs tied to guest-payment analytics, and other guest-linked payment identifiers
- client secrets and access tokens
- raw employee contact details
- arbitrary upstream response bodies

Aggregation does not retroactively make excluded source-data processing permissible. Any guest-payment Analytics work requires a superseding privacy and terms decision before implementation.

Employee reporting should use synthetic-safe display labels or operator-approved identifiers and should support an aggregate-only mode.

## Reliability model

The shared Toast transport owns:

- token lifecycle
- request IDs
- timeout policy
- global, API, endpoint, account, and Analytics time-range-aware rate-limit state
- bounded exponential backoff with jitter
- retry classification
- pagination-family dispatch
- Analytics report-job lifecycle
- cancellation
- response-size bounds

Tools must not implement independent retry, pagination, or Analytics polling loops.

### Pagination families

`/ordersBulk` uses fixed-size pagination:

- request with `page` and `pageSize`, with `pageSize` no greater than 100
- follow response Link relations, especially `next`, while preserving the original bounded query
- do not require a `last` relation because `/ordersBulk` does not return one
- stop when no `next` relation exists
- reject repeated page numbers, repeated `next` URLs, non-progressing links, or a page count beyond the configured bound
- treat an incomplete traversal as `partial` or `denied`, never complete

Configuration endpoints use page-token pagination:

- read `Toast-Next-Page-Token` and pass it back as `pageToken`
- stop when no next token is returned
- reject repeated or non-progressing tokens and enforce a page bound
- when a configuration publish causes HTTP 409, discard the partial page set and restart without `pageToken` within a bounded restart budget

The configuration-publication 409 restart rule is not generalized to `/ordersBulk`.

### Analytics report jobs

Analytics datasets other than restaurant information use a two-step lifecycle:

1. POST the dataset and time-range endpoint to create the report request.
2. Store the returned `reportRequestGuid` in memory with dataset, time range, restaurant set, creation instant, and limiter key.
3. GET the matching retrieval endpoint.
4. Treat 202 as pending and retry only within a bounded polling budget governed by the Analytics GET rate limit.
5. Treat 200 as complete and validate the full response before reporting success.
6. Treat 404 as invalid or expired; request GUIDs expire seven days after creation.
7. Treat 409 as a failed report request that requires a new `reportRequestGuid`, subject to the POST rate limit and bounded replacement budget.
8. Treat exhausted polling, expiry, unrecoverable 409, 429, 5xx, or validation failure as `partial` or `denied` with request IDs and job state preserved.

Analytics limiter keys must include method, dataset endpoint, time range, credential identity, and management-group or restaurant-set identity. POST limits can be as low as 10 requests per hour or 5 requests per minute; GET retrieval limits are commonly 5 requests per second and 30 requests per minute. The implementation must use current endpoint-specific values rather than the Standard API default.

A 429 honors Toast reset and retry headers. A 5xx can be retried within the bounded budget. A 400, persistent 401, 403, or 422 is not retried as though it were transient.

## Time model

`business_date` is the default reporting mode.

The report context must retrieve restaurant timezone and closeout hour. Timestamp conversion must use an IANA timezone and support daylight-saving transitions. The configured closeout hour, not midnight UTC, determines the restaurant reporting day.

`modified_window` is a separate explicit mode for revision-oriented or sub-day reports. It must not be presented as equivalent to a Toast business-date report.

Analytics time ranges are explicit endpoint contracts. The adapter must preserve whether the request used `day`, `week`, `month`, `year`, or a custom range and must validate endpoint-specific bounds before creating a job.

## API-source separation

The Standard API adapter derives reports from operational objects such as orders, checks, payments, selections, cash entries, deposits, and time entries.

The Analytics API adapter consumes Toast's specialized reporting datasets, excluding the guest-payment dataset in the initial product.

The adapters may share output vocabulary but may not silently substitute for each other. Every result identifies its source. Cross-source comparison is a separate future report with documented reconciliation behavior.

## MCP transport and SDK

The initial implementation uses the stable MCP TypeScript SDK v1 and local `stdio` transport.

Reasons:

- credential custody remains with the operator
- no remote MCP authentication layer is needed
- no tenant routing or shared cache exists
- the stable SDK has current client compatibility
- fixture-driven testing is simpler

These reasons reduce infrastructure risk. They do not authorize AI processing or onward disclosure of Merchant Data.

A remote Streamable HTTP transport requires a superseding decision covering:

- Toast's approval and third-party provider terms
- Merchant consent for AI processing
- model-provider, MCP-host, logging, retention, and subprocessor data flows
- OAuth or equivalent MCP client authentication
- tenant and restaurant isolation
- secret storage and rotation
- authorization policy
- CSRF, CORS, origin, host-header, and DNS-rebinding defenses
- logging and telemetry minimization
- retention and deletion
- incident response
- deployment regions and subprocessors

## Public package and branding

The package and repository must state that they are unofficial and not endorsed by Toast.

Before the first public package release, T6 must confirm:

- package and repository naming do not imply official status
- license and notices are compatible with the implementation
- no Toast documentation, OpenAPI specification, proprietary examples, or real Merchant Data is redistributed
- operators are directed to current Toast terms and documentation
- the operator notice explains Merchant consent, AI restrictions, provider logging, retention, and subprocessors
- current Toast terms have been reviewed for material changes

## Consequences

### Benefits

- materially smaller secret and privacy blast radius
- useful public distribution without shared credential custody
- deterministic reporting can be validated entirely with independently invented synthetic fixtures
- write safety is architectural rather than controlled by an environment flag
- Standard and Analytics semantics remain auditable
- AI and third-party processing obligations are not hidden behind the word "local"

### Costs

- operators must install and configure the package locally
- operators must establish and document Merchant consent before AI processing
- webhook freshness is not automatic in the first release
- Standard and Analytics access can only be smoke-tested by authorized operators in production
- no centralized caching or cross-customer benchmark dataset
- remote MCP clients are deferred
- guest-payment Analytics is unavailable until separately reviewed

These costs are intentional. Restaurant financial data does not become less sensitive because an LLM can summarize it attractively.

## Revisit triggers

A new architecture decision is required before any of the following:

- adding Streamable HTTP or another network listener
- changing the AI provider, MCP host, logging, retention, or subprocessor assumptions documented for a distribution
- storing credentials or Merchant Data
- adding telemetry beyond local non-sensitive diagnostics
- processing guest PII, delivery addresses, Analytics guest-payment data, `cardFingerprint`, or other guest-linked payment identifiers
- using Toast API data for training, fine-tuning, model improvement, or API-derived synthetic training data
- adding a Toast write operation
- offering a hosted or managed service
- aggregating data across unrelated merchants
- representing Analytics metrics as accounting or tax records
