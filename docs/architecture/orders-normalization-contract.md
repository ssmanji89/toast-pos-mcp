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

## Query and timestamp modes are not interchangeable

Toast documents two materially different `/ordersBulk` query modes:

- `business_date`: `businessDate=yyyyMMdd`, selecting orders opened/promised on that restaurant business day;
- `modified_window`: `startDate` inclusive and `endDate` exclusive, selecting by order modification time.

The normalizer records the caller-selected mode verbatim and validates it. It does not infer one mode from timestamps and does not rewrite Toast's `Order.businessDate` from UTC time. In `business_date` mode, every returned order must carry `Order.businessDate` equal to the requested business date; a missing or mismatched value fails the entire batch because otherwise the batch label and source records would contradict each other. `modified_window` may legitimately span multiple Toast business dates.

A scheduled order's `promisedDate` and `approvalStatus` remain explicit so the report layer can distinguish future fulfillment from completed/past sales using an injected/report-time clock rather than normalization-time wall clock.

Source timestamps and modified-window bounds must use Toast's zoned ISO-8601 form: date plus `T` time plus either `Z` or an explicit numeric UTC offset. Numeric offsets with or without the colon are accepted because current Toast examples use both forms. Human-readable locale strings and zone-less local date-times are rejected even when JavaScript's `Date.parse` happens to accept them.

## Currency and arithmetic boundaries

The location context supplies the ISO-4217 `currencyCode`; there is no USD fallback.

### Rounded settlement/display totals

Toast documents ordinary Orders currency totals as two-decimal amounts. The following retained values therefore cross the normalization boundary as integer currency hundredths:

- check `amount`, `taxAmount`, and `totalAmount`;
- selection `price`, `preDiscountPrice`, and aggregate `tax`;
- payment amount/tip/refund totals;
- service-charge amount and refund totals;
- applied-discount amounts.

A source value in one of those fields that cannot round-trip at two decimal places, or would overflow a JavaScript safe integer after multiplication by 100, fails closed. The normalizer never silently rounds a higher-precision value.

Quantities and percentages are **not** currency. A weighted quantity such as `0.5` remains a number and is never converted to currency hundredths.

T3 calculations must sum integer currency hundredths for these rounded totals. They must not re-price selections or reconstruct Toast tax/pricing algorithms from configuration when Toast already returned the amount.

### Applied-tax source components

The earlier blanket assumption that *every* monetary-looking Orders field is two-decimal currency is false for `AppliedTaxRate.taxAmount`. Current Toast response examples include source tax components such as `0.075` and `0.625` whose enclosing selection/check aggregate tax is rounded to two decimals. Toast's sales-report guidance also instructs consumers to sum tax amounts per tax rate for drilldown.

For that reason, each normalized applied-tax record retains:

- tax-rate configuration reference only, not source name/display/jurisdiction free text;
- source `rate` as an exact canonical decimal when present;
- source `taxAmount` as an exact canonical decimal;
- open-string tax `type`;
- `facilitatorCollectAndRemitTax` when present.

The decimal model is JSON-safe `{ coefficient: string, scale: number }`. Conversion begins from JavaScript's shortest round-tripping base-10 rendering of the already-parsed JSON number. Later addition aligns scales and uses `BigInt` internally, then returns another string-coefficient decimal. No public normalized object contains a `BigInt`, and no report formula may sum these components with binary floating-point arithmetic.

No fixed tax-component decimal scale is invented because Toast does not document one. Negative component values are preserved when the source API supplies them; the schema is a finite double with no non-negative constraint. A later report formula must decide how a negative adjustment contributes to its named metric rather than normalization silently changing the sign.

## Report dimensions retained before the privacy boundary

The source model keeps structured dimensions that downstream reports cannot reconstruct after raw Orders objects are discarded:

- `Order.numberOfGuests` as a non-negative integer when Toast returns it, for guest counts and guest-normalized metrics;
- order-level dining option, revenue center, restaurant service, and source;
- selection-level dining option plus item, item group, option group, and sales category references;
- check `taxExempt` state, using Toast's documented `false` default when the response omits the field;
- selection/service-charge applied-tax source components;
- unresolved configuration references by GUID and/or multi-location ID.

Only identifiers survive. Human-readable free-text values from selections, check tabs, customers, delivery fields, and tax display/jurisdiction fields are intentionally excluded.

### Identifier-only server attribution

The source `Order.server.guid` is validated as a Toast GUID at ingress. The
normalization traversal copies only that GUID to immutable
`NormalizedOrder.serverGuid`. No source server name, contact field, external
identifier, role, free text, or raw employee object crosses the normalization
boundary.

`serverGuid` is an internal in-memory join key for `toast_labor_summary`. The
labor fold matches it to the validated TimeEntry employee GUID so it can derive
aggregate Orders sales and tips. The join key is never displayed, returned in
structured MCP output, persisted as reconciliation state, or expanded through
an employee lookup. An absent server GUID simply cannot contribute to that
labor attribution count.

## Lifecycle state retained

The model preserves enough explicit state for later formulas to make their exclusions visible:

- order/check/selection deleted and voided state;
- void date and void business date where returned;
- order business date, promised date, and approval status;
- selection `deferred` and open-string `selectionType`;
- recursive modifiers at arbitrary nesting depth without recursive call-stack dependence;
- payment status/type, paid business date, refund amount, and tip refund separately;
- service-charge amount, category, gratuity flag, tax components, and refund details;
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
- tax names, display names, or jurisdiction free text;
- arbitrary upstream response bodies, headers, URLs, or raw `Response` objects.

The source object exists transiently at JSON parsing/validation time, but unknown fields are never copied into normalized runtime state. Tests inject distinctive markers into these surfaces and require that they are absent from serialization and deep traversal of the normalized result.

## Entity and pagination integrity

The transport proves page traversal. The normalizer adds record-level integrity:

- at least one detailed page must exist;
- retrieval timestamps must be valid non-negative safe integers;
- order GUIDs are unique across all pages in one normalized batch;
- check, selection (including nested modifiers), payment, and applied service-charge GUIDs are also unique across the complete batch, not merely within one parent order, so a malformed repeated Toast entity cannot be double-counted under two distinct orders;
- applied-discount identity is intentionally not asserted batch-global without a sourced uniqueness guarantee; check-level duplicates are guarded within their owning order and selection discounts within their owning selection;
- a malformed record anywhere in the batch fails the whole normalization operation; T3-001 does not invent a partial-record policy.

One page may legitimately contain zero orders. The page and record counts in the normalized batch are derived from the validated page bodies and aligned transport provenance, not guessed from query parameters.

## Standard and Analytics sources remain separate

This model is `source: standard_api`. T5 Analytics datasets must not be coerced into this structure merely because fields appear similar. Any reusable cross-source report abstraction is a later reviewed design decision.

## Production wiring requirement

T3-001 alone is not proof of a working product feature. T3-002 must consume it through the actual executable path:

`MCP stdio request -> input schema -> same RuntimeConfig identity -> validated location context -> capability preflight -> shared ToastHttpClient/pagination -> T3 normalizer -> report formula/envelope -> MCP response`.

The executable integration test must spawn built `dist/index.js`; an in-memory callback test is insufficient.

## Primary Toast sources

- Orders API reference, including `Order`, `Check`, `Selection`, `Payment`, `Refund`, `AppliedTaxRate`, and `AppliedServiceCharge`
- Get multiple orders (`/ordersBulk`) reference
- Toast guide: Calculating net sales using the orders API
- Toast guide: Building a sales report
- Toast guide: Order object summary
- Toast guide: Deferred menu items
- Toast guide: Daily order for tracking excess food

DOX: updated for the durable T3 source/privacy/arithmetic/integrity boundary.
