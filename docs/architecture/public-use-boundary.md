# Public-Use Architecture Boundary

**Decision:** accepted for the initial product  
**Date:** 2026-07-24  
**Applies to:** all releases before a superseding reviewed decision

## Context

The project is intended for public use, but Toast API access is credentialed, location-scoped, governed by Toast's access models and current API Terms of Use, and capable of exposing sensitive merchant, employee, guest, and operational data.

A conventional hosted SaaS MCP would require the project to receive and process third-party Toast credentials and merchant data. That would introduce tenant isolation, credential custody, data residency, subprocessors, privacy notices, breach response, availability, and Toast-approval obligations before the reporting behavior itself is proven.

Standard API and Analytics API customers also do not receive a sandbox. A public implementation cannot depend on live merchant data for ordinary development or validation.

## Decision

The initial product will be an open-source, locally run, read-only MCP server distributed as an installable Node.js package.

It will:

- use MCP `stdio` as the first transport
- accept operator-owned Toast credentials at process runtime
- keep credentials and bearer tokens in memory only
- make direct requests from the operator's environment to the operator's authorized Toast API hostname
- expose deterministic reporting tools only
- contain no Toast write-operation implementation
- use synthetic fixtures for all repository tests and examples
- exclude guest PII and delivery-address scopes
- keep Standard API and Analytics API metrics in distinct adapters and tool namespaces

It will not:

- operate as a hosted credential proxy
- provide shared credentials
- persist merchant API responses by default
- transmit telemetry containing merchant data, employee data, restaurant GUIDs, request payloads, or credentials
- claim endorsement, certification, or official status from Toast
- expose live order, payment, stock, labor, or configuration writes behind a feature flag

## Credential model

Required runtime values will be supplied through environment variables or a pluggable secret-provider interface:

- API hostname
- client ID
- client secret
- user access type, fixed to the documented machine-client value
- optional default restaurant GUID

The default implementation must not:

- accept credentials as MCP tool arguments
- return credential configuration through MCP resources
- save secrets to a configuration file
- print a secret-bearing exception body
- include authentication request bodies in debug logs
- rely on a fixed token lifetime

A token cache may retain the current bearer token and expiry instant in process memory. It must refresh during the final minute of validity and clear the token on authentication denial.

## Authorization and capability model

The server will derive a capability view from configured access type, token scope claims, and observed API authorization.

The capability view is advisory for tool discovery and denial messages. It is not a substitute for Toast authorization. A tool must fail closed when:

- a required scope is absent
- a restaurant is not accessible
- an upstream 403 contradicts the cached capability view
- the report cannot retrieve a complete and internally consistent page set

Tools with unavailable capabilities may remain discoverable if they return a precise structured denial explaining the missing scope or access type. They must not disappear and encourage an agent to guess whether the server is broken.

## Location isolation

Every request, cache entry, report calculation, and result envelope must include an explicit restaurant GUID.

Cache keys must include at least:

- non-secret credential identity fingerprint
- restaurant GUID
- API family
- resource identity
- version or freshness marker where applicable

A request without an explicit restaurant GUID may use a configured default only when exactly one default is present. Multi-location operations must iterate locations explicitly and return per-location statuses. No cross-location aggregate may omit its member locations or partial failures.

## Report result contract

Every report will return structured content with:

- report identifier and schema version
- source adapter
- restaurant GUID
- requested date mode and bounds
- effective business date or modification window
- restaurant timezone and closeout hour
- generated-at and source-retrieved-at timestamps
- completeness status
- records and pages processed
- totals and dimensions
- applied exclusions
- unresolved references
- warnings and upstream request IDs

Numeric values must remain numeric in structured content. Human-readable text is supplementary and must not be the only representation.

The result status is one of:

- `complete`: all required data was retrieved and normalized
- `partial`: bounded data exists but one or more declared components are incomplete or stale
- `denied`: authorization, capability, configuration, or integrity requirements prevented a trustworthy report

`partial` and `denied` are not represented as successful zero-value reports.

## Data minimization

The default tools return aggregates rather than raw orders, checks, employee objects, or payment records.

Initial output excludes:

- guest name, email, phone, address, and delivery notes
- payment card identifiers or guest-card analytics
- client secrets and access tokens
- raw employee contact details
- arbitrary upstream response bodies

Employee reporting should use synthetic-safe display labels or operator-approved identifiers and should support an aggregate-only mode.

## Reliability model

The shared Toast transport owns:

- token lifecycle
- request IDs
- timeout policy
- global, API, endpoint, and account-aware rate-limit state
- bounded exponential backoff with jitter
- retry classification
- pagination
- cancellation
- response-size bounds

Tools must not implement independent retry loops.

A 409 during a paginated configuration read invalidates the page set. The operation restarts from the first page within a bounded retry budget.

A 429 honors Toast reset and retry headers. A 5xx can be retried within the bounded budget. A 400, persistent 401, 403, or 422 is not retried as though it were transient.

## Time model

`business_date` is the default reporting mode.

The report context must retrieve restaurant timezone and closeout hour. Timestamp conversion must use an IANA timezone and support daylight-saving transitions. The configured closeout hour, not midnight UTC, determines the restaurant reporting day.

`modified_window` is a separate explicit mode for revision-oriented or sub-day reports. It must not be presented as equivalent to a Toast business-date report.

## API-source separation

The Standard API adapter derives reports from operational objects such as orders, checks, payments, selections, cash entries, deposits, and time entries.

The Analytics API adapter consumes Toast's specialized reporting datasets.

The adapters may share output vocabulary but may not silently substitute for each other. Every result identifies its source. Cross-source comparison is a separate future report with documented reconciliation behavior.

## MCP transport and SDK

The initial implementation uses the stable MCP TypeScript SDK v1 and local `stdio` transport.

Reasons:

- credential custody remains with the operator
- no remote MCP authentication layer is needed
- no tenant routing or shared cache exists
- the stable SDK has current client compatibility
- fixture-driven testing is simpler

A remote Streamable HTTP transport requires a superseding decision covering:

- Toast's approval and third-party provider terms
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
- no Toast documentation, OpenAPI specification, proprietary examples, or real merchant data is redistributed
- operators are directed to current Toast terms and documentation
- current Toast terms have been reviewed for material changes

## Consequences

### Benefits

- materially smaller secret and privacy blast radius
- useful public distribution without shared credential custody
- deterministic reporting can be validated entirely with synthetic fixtures
- write safety is architectural rather than controlled by an environment flag
- Standard and Analytics semantics remain auditable

### Costs

- operators must install and configure the package locally
- webhook freshness is not automatic in the first release
- standard and analytics access can only be smoke-tested by authorized operators in production
- no centralized caching or cross-customer benchmark dataset
- remote MCP clients are deferred

These costs are intentional. Restaurant financial data does not become less sensitive because an LLM can summarize it attractively.

## Revisit triggers

A new architecture decision is required before any of the following:

- adding Streamable HTTP or another network listener
- storing credentials or merchant data
- adding telemetry beyond local non-sensitive diagnostics
- processing guest PII or delivery addresses
- adding a Toast write operation
- offering a hosted or managed service
- aggregating data across unrelated merchants
- representing Analytics metrics as accounting or tax records
