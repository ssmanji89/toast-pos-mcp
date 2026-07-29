# Public-Use Architecture Boundary

**Decision:** accepted for the initial product  
**Date:** 2026-07-24  
**Applies to:** all releases before a superseding reviewed decision

## Context

Toast API access is credentialed, location-scoped, governed by Toast's access models and API Terms of Use, and capable of exposing sensitive merchant, employee, guest, and operational data.

A hosted MCP would add centralized credential custody, tenant isolation, data residency, subprocessor, retention, deletion, incident-response, and Toast-approval obligations. A local MCP removes some of those infrastructure risks, but locality does not determine whether downstream processing is permitted. A local `stdio` process can still send report content through an MCP host to a cloud model, trace collector, logging service, retention system, or other third party.

Toast API Terms section 11.6 requires Merchant consent before AI tools or services process Merchant Data. It also prohibits using the API or data passing through it to train, fine-tune, or otherwise improve AI models, including API-derived synthetic training data, without Toast's prior written approval. Section 2.6 separately requires Toast's prior written consent before engaging a third-party provider to use the APIs in connection with application development.

Standard and Analytics API access are production-only for the access models targeted here. Public development and validation therefore cannot depend on live Merchant Data.

## Decision

The initial product is an open-source, locally run, read-only MCP server distributed as an installable Node.js package.

It will:

- use MCP `stdio` as the first transport
- accept operator-owned Toast credentials only at process runtime
- keep credentials and bearer tokens in memory
- request data directly from the operator's environment
- expose deterministic reporting tools only
- contain no Toast write-operation implementation
- use independently invented synthetic fixtures
- require an explicit operator acknowledgment that documented Merchant consent exists before configured AI processing
- exclude guest PII, delivery-address scopes, Analytics guest-payment data, `cardFingerprint`, and other guest-linked payment identifiers
- keep Standard API and Analytics API metrics in distinct adapters and tool namespaces

It will not:

- operate as a hosted credential proxy
- provide shared credentials
- persist Merchant Data by default
- emit Merchant Data, restaurant GUIDs, request payloads, or credentials through telemetry
- imply that local execution authorizes cloud-model, MCP-host, logging, retention, or subprocessor use
- use Toast API data for training, fine-tuning, model improvement, or API-derived synthetic training data without Toast's prior written approval
- claim Toast endorsement, certification, or official status
- hide Toast write operations behind feature flags

## AI and third-party processing boundary

This boundary applies regardless of transport.

Before an AI tool or service processes Toast Merchant Data, the operator must:

- hold documented consent from the applicable Merchant
- identify the MCP client or host, model provider, prompt and tool logging, telemetry, retention, deletion behavior, human review, and subprocessors
- determine and satisfy applicable Toast prior-written-consent or review requirements
- configure providers so Toast API data is not used for training or model improvement unless Toast has given prior written approval
- ensure onward disclosure and retention comply with the operator's Toast agreement and applicable privacy obligations

The package may require an acknowledgment, but it cannot establish legal sufficiency. Consent evidence stays outside the repository. A provider's “no training” setting does not resolve logging, retention, human-review, residency, or subprocessor obligations.

## Credential and capability model

Runtime configuration includes:

- API hostname
- client ID
- client secret
- documented machine-client access type
- optional default restaurant GUID
- explicit Merchant-AI-consent acknowledgment for configured AI processing

The implementation must not accept credentials as tool arguments, return them as resources, save them to ordinary configuration files, log authentication bodies, store consent evidence, or assume a fixed token lifetime.

The capability view derives from configured access type, token scope claims, and observed API authorization. It is advisory, not a replacement for Toast authorization. Tools fail closed when:

- a required scope is absent
- a restaurant is inaccessible
- an upstream 403 contradicts cached capability state
- a page set cannot be proven complete
- an Analytics request GUID is invalid, expired, or cannot be replaced within bounds
- required consent acknowledgment is absent for an AI-configured deployment

## Location isolation

Every request, cache entry, report calculation, Analytics report job, and result envelope includes an explicit restaurant GUID or declared management-group restaurant set.

Cache keys include credential identity, restaurant or management-group identity, API family, resource identity, and freshness or version information. Multi-location reports return member locations and per-location failures; they never conceal a partial location set.

## Report result contract

Every report identifies:

- report and schema version
- source adapter
- restaurant or management-group members
- requested and effective date bounds
- timezone and closeout hour where applicable
- generation and source-retrieval timestamps
- completeness status
- pages and records processed or Analytics job state
- totals, dimensions, exclusions, unresolved references, warnings, and upstream request IDs

Status is:

- `complete`: all required data was retrieved and validated
- `partial`: validated bounded data exists, but declared components are incomplete or stale
- `denied`: authorization, capability, configuration, consent acknowledgment, or integrity requirements prevent a trustworthy report

Pending Analytics jobs, incomplete pages, and failures never become zero-value successful reports.

## Data minimization

Default tools return aggregates rather than raw orders, checks, employees, or payments.

Initial source processing and output exclude:

- guest name, email, phone, address, and delivery notes
- Analytics guest-payment endpoints
- `cardFingerprint`, guest-linked order GUIDs, guest-linked payment GUIDs, and similar identifiers
- secrets and tokens
- raw employee contact details
- arbitrary upstream response bodies

Aggregation does not make excluded source-data processing permissible. Guest-payment Analytics requires a superseding privacy and terms decision.

## Reliability model

The shared transport owns token lifecycle, request IDs, timeouts, rate-limit state, bounded retries, pagination dispatch, Analytics job lifecycle, cancellation, and response-size limits. Tools do not implement independent retry, pagination, or polling loops.

### Pagination families

`/ordersBulk` uses fixed-size pagination:

- send `page` and `pageSize`, with `pageSize` at most 100
- follow Link relations, especially `next`, while preserving the bounded query
- do not require `last`; `/ordersBulk` does not return it
- stop when `next` is absent
- reject repeated page numbers, repeated URLs, non-progressing links, and page-bound overruns
- return `partial` or `denied` when completion cannot be proven

Configuration endpoints use page-token pagination:

- read `Toast-Next-Page-Token` and return it as `pageToken`
- stop when no next token exists
- reject repeated or non-progressing tokens and page-bound overruns
- on a configuration-publication HTTP 409, discard the partial set and restart without `pageToken` within a bounded restart budget

The configuration 409 restart rule does not apply to `/ordersBulk`.

### Analytics report jobs

Analytics datasets other than restaurant information use a two-step lifecycle:

1. POST to create a report request.
2. Store the returned `reportRequestGuid` with dataset, time range, restaurant set, creation time, and limiter key.
3. GET the matching retrieval endpoint.
4. Treat 202 as pending and poll only within a bounded budget and the GET rate limit.
5. Treat 200 as complete only after full validation.
6. Treat 404 as invalid or expired; GUIDs expire seven days after creation.
7. Treat 409 as a failed request requiring a new GUID within the POST limit and replacement budget.
8. Treat exhausted polling, expiry, unrecoverable 409, 429, 5xx, or validation failure as `partial` or `denied`.

Analytics limiter keys include method, dataset endpoint, time range, credential identity, and management-group or restaurant-set identity. POST limits can be as low as 10 requests/hour or 5 requests/minute; GET retrieval limits are commonly 5 requests/second and 30 requests/minute. Standard API defaults must not be reused blindly.

## Time and source separation

`business_date` is the default Standard API reporting mode. Restaurant timezone, `closeoutHour`, and daylight-saving transitions determine the reporting day. `modified_window` is a separate revision or sub-day mode.

Analytics time ranges are explicit endpoint contracts. The adapter preserves whether a request used `day`, `week`, `month`, `year`, or a custom range and validates endpoint-specific bounds before creating a job.

Standard API reports derive from operational objects. Analytics reports consume specialized datasets, excluding guest-payment data. The two sources never silently substitute for one another.

## MCP transport and public release

The initial stable MCP TypeScript SDK v1 and `stdio` transport reduce credential and tenant risk. They do not authorize AI processing or onward disclosure.

Remote transport requires a superseding decision covering Toast approval, Merchant consent, model-provider and MCP-host flows, authentication, tenant isolation, secret storage, logging, retention, deletion, incident response, regions, and subprocessors.

Before public release, T6 confirms:

- naming and branding do not imply official status
- license and notices are compatible
- no Toast documentation, OpenAPI content, proprietary examples, or real Merchant Data is redistributed
- operators are directed to current Toast terms and documentation
- the operator notice covers Merchant consent, AI restrictions, logging, retention, and subprocessors
- current Toast terms have been reviewed

## Consequences

The design lowers credential and tenant risk, preserves read-only safety, keeps report semantics auditable, and makes AI-processing obligations explicit. Costs include local installation, operator consent work, production-only smoke testing, no centralized benchmark dataset, deferred remote clients, and no guest-payment Analytics.

Restaurant financial data does not become less sensitive because an LLM can summarize it attractively.

## Threat model

`threat-model.md` extends this decision with a concrete threat catalog — assets, trust boundaries, per-area threat walkthroughs for local distribution, AI-provider data flow, and future remote transport, file-level evidence for controls implemented to date, and an explicit residual-risk list. Read it alongside this decision rather than in place of it.

## Revisit triggers

A new architecture decision is required before:

- adding a network listener
- changing model-provider, MCP-host, logging, retention, or subprocessor assumptions
- storing credentials or Merchant Data
- adding Merchant Data telemetry
- processing guest PII, delivery addresses, Analytics guest-payment data, or guest-linked payment identifiers
- using Toast API data for training, fine-tuning, model improvement, or API-derived synthetic training data
- adding a Toast write operation
- offering a hosted or managed service
- aggregating unrelated merchants
- representing Analytics metrics as accounting or tax records
