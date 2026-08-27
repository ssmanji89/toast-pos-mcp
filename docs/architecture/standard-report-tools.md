# Standard Report Tools Contract

**Status:** T3/T4 production contract
**Report schema:** `1`  
**Tools:** `toast_sales_summary`, `toast_payment_summary`,
`toast_item_sales_summary`, `toast_cash_summary`, `toast_labor_summary`

## Production path

Both tools execute through the same process-owned runtime:

```text
MCP stdio tools/call
  -> MCP v2 Zod input validation
  -> ApplicationRuntime
  -> fresh validated location context + source provenance
  -> JWT provisioned scopes ∩ restaurant connection scopes
  -> one rate-limit-aware/cancellable ToastHttpClient
  -> bounded Standard API source retrieval
  -> privacy-minimized normalization / deterministic minor-unit formula
  -> bounded provenance + complete|incomplete|denied envelope
  -> MCP structured result
```

No handler constructs its own OAuth manager, transport, location registry,
retry loop, or pagination loop. `src/index.ts` creates one runtime before stdio
serving; the MCP server factory captures that exact runtime for every server
instance the dual-era stdio boundary creates.

## Result schema version 1

A successful report contains, at minimum:

- `schemaVersion: 1`;
- `status: complete`;
- `report` and `source: standard_api`;
- restaurant GUID and current guest-facing restaurant name;
- `businessDate` compatibility field plus `requestedBusinessDate` and
  `effectiveBusinessDate`;
- restaurant timezone, closeout hour, and ISO-4217 currency code;
- generation time;
- context freshness and context-source provenance;
- report-data retrieval provenance;
- source records/pages/details processed as applicable;
- deterministic integer minor-unit totals;
- explicit formula notes and warnings.

A denied result keeps the same schema/version/report/source/request identity
where known and adds structured denial diagnostics. It never substitutes zero
totals for an unprovable result. MCP marks denied results with `isError=true`;
therefore the SDK validates the advertised output schema against complete
results and allows the error result to carry its denial shape.

`complete` means every source traversal required by that invocation completed
and validated as of the reported retrieval time. It does **not** mean a current
business day is financially final. In particular, refunds, voids, and tip
adjustments may continue after the original payment. The payment report keeps
that operator-visible caveat in `warnings`.

There is no T3-002 partial policy. Any malformed source, pagination-integrity
failure, stale-context refresh failure, inaccessible restaurant, missing
required capability, over-bound payment set, cancellation, or upstream failure
returns `denied` instead of fabricating a partial complete report.

`toast_labor_summary` has one narrow `incomplete` state. It means all required
source reads and validations succeeded, but validated active or unresolved
labor facts prevent a final labor aggregate. It returns aggregate facts,
warnings, provenance, and `isError=false`. It never says completed. `denied`
is reserved for missing capability, inaccessible location, malformed source,
failed traversal, cancellation, or upstream failure. A denied result has
`isError=true` and contains no fabricated aggregate totals.

## Location/context freshness

Toast currently recommends:

- polling the Partners restaurant-connection source a few times per day when a
  webhook cannot be relied upon; and
- polling Restaurants/configuration information at least once per restaurant
  location per day.

This local stdio package has no always-on webhook receiver. Its conservative
in-memory policy is therefore a **6-hour maximum age** for the validated
location generation. Six hours satisfies both recommendations without
persisting Merchant Data.

Before a report uses an older generation, `ApplicationRuntime` performs one
coalesced refresh. Concurrent callers share the same refresh promise. Registry
publication and its provenance are one observable generation: no caller can
see a newly replaced registry before the matching provenance has been bound.

If a required refresh fails, the invoking report fails closed. The previous
complete registry may remain in memory for recovery, but it is not silently
relabelled current. A later caller attempts refresh again.

The result exposes:

- `contextFreshness.retrievedThroughEpochMs`;
- `contextFreshness.ageMs`;
- `contextFreshness.maxAgeMs`;
- bounded `contextProvenance` request IDs and truncation metadata.

## Sales summary

### Source

`GET /orders/v2/ordersBulk?businessDate=YYYYMMDD&page=...&pageSize=100`
through the reviewed sequential fold. Raw page N is normalized/aggregated
before page N+1 is requested; report code never materializes all raw pages.

The page-local normalizer preserves T3-001 semantics. Because page-local calls
cannot themselves see later pages, `SalesCrossPageIdentityGuard` carries only
the batch-global GUID sets T3-001 already treats as unique:

- order;
- check;
- selection, including nested modifiers;
- payment;
- applied service charge.

Applied-discount GUIDs remain order-local exactly as in T3-001. The guard
retains no raw page, normalized record, guest data, or free text.

### Formula

For non-deleted, non-voided, non-`excessFood` orders and checks:

- start from Toast-returned check `amount`; do not re-price items;
- `netOrderAmount` subtracts fundraising-campaign service charges;
- `netSales` subtracts:
  - fundraising-campaign service charges;
  - the **union** of deferred selections and
    `HOUSE_ACCOUNT_PAY_BALANCE` selections; and
  - embedded payment `refundAmount`;
- a selection matching both exclusion predicates is deducted once;
- tip refunds remain separate from net sales;
- taxes, discounts, non-fundraising service charges, guest-count coverage, and
  exclusion counters are reported separately;
- orders whose `promisedDate` is later than report generation time are reported
  in the `future` bucket rather than silently merged into current/past sales.

Selection prices are Toast-returned final selection prices. The exclusion pass
inspects the check's direct selections as Toast's reporting guidance specifies;
it does not recursively subtract modifier prices and thereby double-count a
price already incorporated into the parent selection.

Current menu/configuration names are not used to rewrite historical order
facts. Item/category/revenue-center enrichment and unresolved-reference display
belong to T3-003.

## Payment summary

### Source

Payment lifecycle events use the documented Orders payments retrieval modes as
three distinct business-date sources:

1. `GET /orders/v2/payments?paidBusinessDate=YYYYMMDD`;
2. `GET /orders/v2/payments?refundBusinessDate=YYYYMMDD`;
3. `GET /orders/v2/payments?voidBusinessDate=YYYYMMDD`.

Each source returns payment GUIDs for that event date. The ordered union is
hydrated through `GET /orders/v2/payments/{paymentGUID}`. One payment may
legitimately appear in multiple event lists; its detail is fetched once and
may contribute to multiple lifecycle groups when the returned event date
matches the requested business date.

The local unique-detail ceiling is 5,000. Exceeding it is `denied`, not a
truncated report.

### Privacy boundary

The payment-detail Zod schema uses strip semantics. Only reporting-required
fields survive parsing: identity, payment type/status, amount/tip, refund
amount/tip refund and event dates, and void event date. Guest/customer, first
six/last four digits, card/tender/network transaction identifiers, and unknown
payment metadata do not survive into normalized report state.

### Totals

The report keeps separate minor-unit totals for:

- paid amount and paid tip;
- refund amount and tip refund;
- voided payment amount;
- paid amount/tip grouped by open payment type;
- payment-status and refund-status counts.

No accounting, tax, settlement, or GAAP conclusion is inferred from these
operational source totals.

## Cash summary

`toast_cash_summary` accepts the standard report input: a valid Toast
`businessDate` and an optional restaurant GUID. The selected restaurant context
supplies the restaurant GUID, name, timezone, closeout hour, currency code,
freshness, and bounded context provenance. Its required capability set is
`cashmgmt:read` and `config:read`.

The report reads these restaurant-scoped Standard API sources in sequence:

1. `GET /cashmgmt/v1/entries?businessDate=YYYYMMDD`;
2. `GET /cashmgmt/v1/deposits?businessDate=YYYYMMDD`;
3. paged `GET /config/v2/cashDrawers`;
4. paged `GET /config/v2/noSaleReasons`; and
5. paged `GET /config/v2/payoutReasons`.

Each source contributes its own bounded provenance. Every request carries the
selected restaurant header. A capability denial happens before any business
source read.

Cash entries and deposits are separate Cash Management facts. Cash entries are
not guest cash payments, and this tool does not calculate expected drawer
balances or expected deposits. It reports exact minor-unit entry and deposit
amounts, source entry types, drawer/reason reference resolution, no-sales, and
observed reversal references. Deposit reversals use the documented `undoes`
relationship. Cross-business-date reversal references remain visible warnings;
the tool does not invent a netting relationship outside the invocation.

The aggregate output excludes raw entry/deposit bodies, employee/contact data,
guest data, payment-card markers, credentials, and tokens. A malformed or
missing required source is denied rather than represented by zero cash totals.

## Labor summary

`toast_labor_summary` uses the same input and location context fields as the
cash tool. Its required capability set is `labor:read`, `config:read`, and
`orders:read`. It returns aggregate-only data; no employee identity, contact
field, display name, external identifier, or raw source body is public output.

The report reads these selected-restaurant Standard API sources:

1. `GET /labor/v1/timeEntries` with restaurant-local closeout bounds and
   `includeArchived=true` plus `includeMissedBreaks=true`;
2. bounded `GET /labor/v1/jobs?jobIds=...` batches for referenced jobs;
3. paged `GET /config/v2/breakTypes`;
4. `GET /config/v2/tipWithholding`; and
5. bounded, sequential `GET /orders/v2/ordersBulk?businessDate=YYYYMMDD`
   page folding for sales and tip attribution.

The TimeEntry response is the current source snapshot for the requested
business date. Deleted/archived facts remain observable as deletion counts but
do not enter current hours or wages. Active entries and unresolved optional
labor references produce `incomplete`, not a completed result. A source
failure, malformed source, missing required scope, or inaccessible restaurant
produces `denied` and no totals.

Regular wages use only reported regular hours and explicit hourly wage. A null
hourly wage is preserved as salaried state. Overtime hours are reported, but no
overtime wage is calculated because no source multiplier exists. Sales and tips
come only from matching Orders server attribution and payment facts; TimeEntry
sales or tip fields are not used. Voided payments are excluded, explicit
refunds are deducted, and optional tip withholding remains a distinct
aggregate calculation.

## Cancellation and rate limits

The MCP v2 handler passes `ctx.mcpReq.signal` into request-owned report work.
The production Standard client carries that signal through its serialized
rate-limit turn, hierarchy wait, retry/backoff wait, and actual fetch. An
observed cancellation is a static non-retryable `request_cancelled` denial and
never exposes an AbortSignal reason.

First-use/stale location discovery is process-owned shared bootstrap state. A
cancelled report stops waiting promptly but does not abort the shared discovery
another concurrent report may need.

Current `X-Toast-RateLimit-*` hierarchy coordination, restaurant/account
isolation, Retry-After handling, and the bounded wait ceiling remain owned by
the shared pre-T3 rate-limit layer.

## Executable proof

`test/report-tools-e2e.test.ts` spawns the compiled synthetic report server and
connects through the actual MCP client over stdio. The fixture uses the same
`createApplicationRuntime`, `createServer`, and `startStdioServer` production
path. Synthetic upstream response scenarios prove:

- raw 2025 stdio clients receive no report tools;
- pinned 2026-07-28 clients discover and invoke the real report tools;
- sales and payment happy-path formula/output/privacy behavior;
- cash entries/deposits and required drawer/reason configuration sources;
- labor complete, archived/deleted current-snapshot, and active-entry
  incomplete behavior;
- cash/labor scope denial before business reads, malformed-source denial,
  selected-restaurant headers, bounded provenance, source-read cancellation,
  rate-limit waits, and aggregate-only serialization;
- invalid MCP input is rejected before orchestration;
- missing required scope is denied before Orders data access;
- inaccessible restaurant is denied instead of returning empty totals;
- malformed Orders source is denied;
- broken `/ordersBulk` Link progression is denied rather than silently ending
  a complete report.

Additional focused tests prove atomic context/provenance publication,
clock-controlled freshness refresh/failure recovery, cross-page identity
invariants, cancellation behavior, hierarchical rate limits, and the existing
T1/T2 transport contracts.

## Authentic validation gate

Source/unit/integration artifacts are not CLEAN until the exact dependency graph
can be installed and executed with authentic locked packages on the supported
Node versions. Required gate:

```bash
nvm use 20.20.2
npm ci --no-audit --no-fund
npm run check
npm run build:test
node --test dist-test/test/report-tools-e2e.test.js
npm pack --dry-run --json

nvm use 22.22.2
npm ci --no-audit --no-fund
npm run check
npm run build:test
node --test dist-test/test/report-tools-e2e.test.js
npm pack --dry-run --json
```

Inspect discovered test-file count and total test count, package/lock
provenance, and mutate every new formula, completeness, freshness, privacy,
cancellation, and cross-page guard before a fresh exact-head CLEAN review.

DOX: updated for the durable T3/T4 Standard report contract.
