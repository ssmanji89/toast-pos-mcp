# Standard Orders Normalization Contract

**Status:** T3-001 implementation contract  
**Last reviewed:** 2026-08-16  
**Source:** Toast Standard Orders API only

## Purpose

T3-001 creates the privacy and arithmetic boundary between raw Toast Orders responses and deterministic report calculations. It does **not** register an MCP tool and it does not define final sales/payment formulas. The next report slice consumes this normalized model through the real process path.

The normalizer accepts only:

1. one validated `ToastLocation` context, including restaurant GUID, timezone, closeout hour, and ISO-4217 currency code;
2. one explicit Orders query mode;
3. the detailed, proven-complete `/ordersBulk` pages produced by the shared transport.

It emits immutable Standard-API records containing only data needed by planned reporting calculations.

## Query modes are not interchangeable

Toast documents two materially different `/ordersBulk` query modes:

- `business_date`: `businessDate=yyyyMMdd`, recommended for reconciliation with Toast Web and based on the restaurant's local business-day cutoff;
- `modified_window`: `startDate` inclusive and `endDate` exclusive, selecting by order modification time.

The normalizer records the caller-selected mode verbatim and validates it. It does not infer one mode from timestamps and does not rewrite Toast's `Order.businessDate` from UTC time. A scheduled order's `promisedDate` and `approvalStatus` remain explicit so the report layer can distinguish future fulfillment from completed/past sales using an injected/report-time clock rather than normalization-time wall clock.

## Currency and arithmetic boundary

Toast documents Orders monetary values as two-decimal currency amounts. The location context supplies the ISO-4217 `currencyCode`; there is no USD fallback.

Every retained currency amount is converted to integer minor units at normalization time. A source value that cannot round-trip at two decimal places or would overflow a JavaScript safe integer after multiplication by 100 fails closed. The normalizer never silently rounds a higher-precision source value.

Quantities and percentages are **not** currency. A weighted quantity such as `0.5` remains a number and is never converted to minor units.

T3 calculations must sum integer minor units. They must not re-price selections or reconstruct Toast tax/pricing algorithms from configuration when Toast already returned the amount.

## Lifecycle state retained

The model preserves enough explicit state for later formulas to make their exclusions visible:

- order/check/selection deleted and voided state;
- void date and void business date where returned;
- order business date, promised date, and approval status;
- selection `deferred` and open-string `selectionType`;
- recursive modifiers at arbitrary nesting depth without recursive call-stack dependence;
- payment status/type, paid business date, refund amount, and tip refund separately;
- service-charge amount, category, gratuity flag, and refund details;
- check/selection discounts needed for report explanation;
- unresolved configuration references by GUID and/or multi-location ID.

Unknown enum strings are preserved. Toast's compatibility policy permits new enum members; an unknown value is data, not a reason to throw away an otherwise valid report source batch.

## Net-sales-relevant source facts, not formula execution

Current Toast guidance says typical net sales excludes voided/deleted orders and checks, `excessFood` orders, deferred selections, `HOUSE_ACCOUNT_PAY_BALANCE` selections, `FUNDRAISING_CAMPAIGN` service charges, and payment `refund.refundAmount`; tip refunds remain separate because tips are not included in net sales. T3-001 preserves those source facts. T3-002 owns the actual formula and its executable report envelope.

A missing/null `AppliedServiceCharge.serviceChargeCategory` is normalized to `SERVICE_CHARGE`, matching Toast's current guidance.

## Privacy and data minimization

Raw Orders responses can contain guest and payment-card-linked material that this reporting product does not need. The normalized model deliberately has no field capable of retaining:

- customer names, email addresses, phone numbers, addresses, delivery notes, or vehicle/free-text delivery information;
- check tab names or selection display/special-request text;
- card first-six/last-four, card type/entry mode, card payment IDs, tender transaction IDs, network transaction identifiers, or arbitrary payment metadata;
- house-account/customer identifiers;
- arbitrary upstream response bodies, headers, URLs, or raw `Response` objects.

The source object exists transiently at JSON parsing/validation time, but unknown fields are never copied into normalized runtime state. Tests inject distinctive markers into these surfaces and require that they are absent from serialization and deep traversal of the normalized result.

## Entity and pagination integrity

The transport proves page traversal. The normalizer adds record-level integrity:

- at least one detailed page must exist;
- retrieval timestamps must be valid non-negative safe integers;
- duplicate order GUIDs across pages fail closed rather than double-count;
- duplicate check, payment, service-charge, or selection GUIDs within one order fail closed where they represent repeated source entities;
- a malformed record anywhere in the batch fails the whole normalization operation; T3-001 does not invent a partial-record policy.

One page may legitimately contain zero orders. The page and record counts in the normalized batch are derived from the validated page bodies and aligned transport provenance, not guessed from query parameters.

## Standard and Analytics sources remain separate

This model is `source: standard_api`. T5 Analytics datasets must not be coerced into this structure merely because fields appear similar. Any reusable cross-source report abstraction is a later reviewed design decision.

## Production wiring requirement

T3-001 alone is not proof of a working product feature. T3-002 must consume it through the actual executable path:

`MCP stdio request -> input schema -> same RuntimeConfig identity -> validated location context -> capability preflight -> shared ToastHttpClient/pagination -> T3 normalizer -> report formula/envelope -> MCP response`.

The executable integration test must spawn built `dist/index.js`; an in-memory callback test is insufficient.

## Primary Toast sources

- Orders API reference, including `Order`, `Check`, `Selection`, `Payment`, `Refund`, and `AppliedServiceCharge`
- Get multiple orders (`/ordersBulk`) reference
- Toast guide: Calculating net sales using the orders API
- Toast guide: Building a sales report
- Toast guide: Order object summary
- Toast guide: Deferred menu items
- Toast guide: Daily order for tracking excess food

DOX: updated for the durable T3 source/privacy/arithmetic boundary.
