# Phase 4: Cash and Labor Reporting - Pattern Map

**Mapped:** 2026-08-27  
**Files classified:** 15  
**Analogs found:** 15 / 15

## Scope and Merge Boundary

GitHub issue #20 corrects the ledger dependency: both `T4-001` and `T4-002` depend on merged `T3-002`, not on each other or `T3-003`. They can use separate source/report/test files.

The shared reconciliation surfaces are `src/report-tools.ts`, `test/fixtures/stdio-report-server.ts`, `test/report-tools-e2e.test.ts`, and the report-contract documentation. Stack or reconcile those files on the exact merged base. Do not create a second runtime, transport, location, capability, cache, or MCP server path.

## File Classification

| New or modified file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `src/cash-report-source.ts` | model / utility | transform | `src/orders-normalization-source.ts` | role-match |
| `src/cash-report.ts` | service | request-response | `src/payment-report.ts` | role-match |
| `src/labor-report-source.ts` | model / utility | transform | `src/orders-normalization-source.ts` | role-match |
| `src/labor-report.ts` | service | request-response | `src/item-sales-report.ts` and `src/sales-report.ts` | role-match |
| `src/orders-normalization-source.ts` | model | transform | existing file | exact modification |
| `src/orders-normalization-traversal.ts` | utility | transform | existing file | exact modification |
| `src/orders-normalization-types.ts` | model | transform | existing file | exact modification |
| `src/report-tools.ts` | route / controller | request-response | existing file | exact modification |
| `test/cash-report.test.ts` | test | transform | `test/t3-002-review-fixes.test.ts` and `test/report-tools-e2e.test.ts` | role-match |
| `test/labor-report.test.ts` | test | transform | `test/orders-normalization.test.ts` and `test/report-tools-e2e.test.ts` | role-match |
| `test/fixtures/stdio-report-server.ts` | test fixture | request-response | existing file | exact modification |
| `test/report-tools-e2e.test.ts` | integration test | request-response | existing file | exact modification |
| `docs/architecture/standard-report-tools.md` | documentation | transform | existing file | exact modification |
| `docs/architecture/orders-normalization-contract.md` | documentation | transform | existing file | exact modification |
| `docs/research/toast-api-reporting-landscape.md` | documentation | transform | existing file | exact modification |

## Pattern Assignments

### `src/cash-report-source.ts` (model / utility, transform)

**Analog:** `src/orders-normalization-source.ts`

Use local strict Zod schemas. Use `z.string().min(1)` for open Toast enum strings. Use `.passthrough()` only on the transient source schema. Export only inferred source types. Never carry the raw body into a report result.

**Imports and strict source-schema pattern** ([src/orders-normalization-source.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-source.ts:1)):

```typescript
import { z } from "zod";

const openEnumSchema = z.string().min(1);
const sourceMoneySchema = z.number().finite();

export const sourcePaymentSchema = z.object({
  guid: guidSchema,
  type: openEnumSchema,
  amount: sourceMoneySchema,
}).passthrough();
```

Apply it to cash entries and deposits. Keep `type`, `undoes`, drawer/reason references, business date, and money. Preserve unknown types and unresolved references. Do not add guest payment fields or employee display data.

---

### `src/cash-report.ts` (service, request-response)

**Analog:** `src/payment-report.ts`

Use one top-level async builder. Resolve location, perform one preflight decision, make sequential restaurant-scoped reads, validate each source, add detailed provenance, fold minor units, and return either a complete or denied envelope.

**Capability-first pattern** ([src/payment-report.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/payment-report.ts:157)):

```typescript
const locationContext = await runtime.getLocationContext(input.restaurantGuid, {
  signal: options.signal,
});
const { location } = locationContext;
const capabilityContext = await createCapabilityContext(runtime.tokenManager, location);
const capability = decideCapability(capabilityContext, {
  restaurantGuid: location.restaurantGuid,
  requiredScopes: ["orders:read"],
});
if (capability.status === "denied") {
  return capabilityDenied(/* request, location, capability, context */);
}
```

Replace the required scope with the complete cash source plan: `cashmgmt:read` and `config:read`. Do this before entries, deposits, or configuration reads.

**Detailed source and provenance pattern** ([src/payment-report.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/payment-report.ts:405)):

```typescript
const result = await runtime.toastHttpClient.getJsonDetailedCancellable(
  {
    path: "/orders/v2/payments",
    restaurantGuid,
    query: { [event]: businessDate },
    rateLimitKey: `payments-${event}`,
  },
  { signal },
);
provenance.add(result);
```

Use the same form for `/cashmgmt/v1/entries` and `/cashmgmt/v1/deposits`. Keep a distinct, restaurant-scoped rate-limit key per endpoint. Fold entries and deposits only after source validation. Keep cross-date `undoes` links as observed entries with an explicit warning, never guessed netting.

**Fail-closed envelope pattern** ([src/payment-report.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/payment-report.ts:380)):

```typescript
} catch (error) {
  return Object.freeze({
    schemaVersion: STANDARD_REPORT_SCHEMA_VERSION,
    status: "denied" as const,
    report: "payment_summary" as const,
    source: "standard_api" as const,
    restaurantGuid: resolvedRestaurantGuid,
    denial: denialFromError(error),
    missingScopes: Object.freeze([]),
    formulaNotes: PAYMENT_FORMULA_NOTES,
    warnings: PAYMENT_WARNINGS,
  });
}
```

Copy this shape for `cash_summary`. Do not return zero totals after a malformed source, cancellation, scope denial, or upstream failure.

---

### `src/labor-report-source.ts` (model / utility, transform)

**Analog:** `src/orders-normalization-source.ts`

Create strict transient schemas for time entries, jobs, break types, and tip-withholding configuration. Each schema must preserve open strings and only retain report-required fields.

**Source model pattern** ([src/orders-normalization-source.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-source.ts:1)):

```typescript
const openEnumSchema = z.string().min(1);
const sourceDateTimeSchema = z.string().min(1).refine(
  isValidSourceDateTime,
  { message: "must be a zoned ISO-8601 date-time" },
);
const businessDateSchema = z.number().int().refine(
  isValidBusinessDate,
  { message: "must be a valid yyyyMMdd date" },
);
```

Validate the returned time-entry `businessDate` against the requested business date. Retain deleted and active states. Do not retain employee name, email, contact data, or opaque employee payloads.

---

### `src/labor-report.ts` (service, request-response)

**Analogs:** `src/item-sales-report.ts` and `src/sales-report.ts`

Use the sales report for the runtime/capability/fold/denial envelope. Use item sales for a multi-source plan with Orders normalization plus context sources. Request labor data with restaurant-local closeout bounds, `includeArchived=true`, and `includeMissedBreaks=true`; include only validated records whose source business date equals the request.

**Sequential source-plan pattern** ([src/dimension-context.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/dimension-context.ts:289)):

```typescript
const provenance = new ReportProvenanceCollector();

const salesCategories = await this.#configurationEndpoint(
  restaurantGuid,
  "/config/v2/salesCategories",
  "config-sales-categories",
  provenance,
  signal,
  namedConfigSchema,
);
```

Make labor source reads sequential. Add each successful detailed result to the same report collector. Do not turn a required-source failure into a stale or unresolved success. That stale-enrichment policy is only safe for T3 descriptive dimensions.

**Bounded Orders fold pattern** ([src/sales-report.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/sales-report.ts:216)):

```typescript
await runtime.toastHttpClient.foldOrdersBulkPagesCancellable(
  { restaurantGuid: location.restaurantGuid, query: { businessDate: input.businessDate }, pageSize: 100 },
  state,
  (foldState, page, pageNumber) => {
    const normalized = normalizeOrdersPages({ location, query, pages: [page] });
    foldState.provenance.add(page);
    // Fold only normalized facts here.
    return foldState;
  },
  { signal: options.signal },
);
```

Use Orders server/payment facts for labor sales and tips. Do not use TimeEntry sales or tip fields. Keep employee identifiers only inside the fold. Return aggregate buckets and counts. Report overtime hours but never calculate overtime wage. Return `incomplete` for validated active time entries, with explicit active-entry counts and finality warnings.

---

### Orders server-attribution extension (model / transform)

**Files:** `src/orders-normalization-source.ts`, `src/orders-normalization-traversal.ts`, and `src/orders-normalization-types.ts`  
**Analog:** the existing source-to-immutable-normalized pipeline.

The current model ends at normalized order/check/payment structures. Add the smallest validated server reference required for labor attribution. Keep it as an identifier-only reference. Do not copy any display/contact/free-text server fields.

**Validation and normalization boundary** ([src/orders-normalization-traversal.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-traversal.ts:15)):

```typescript
const rawOrders = z.array(z.unknown()).safeParse(page.body);
if (!rawOrders.success) throw sourceInvalid();
for (const rawOrder of rawOrders.data) {
  const parsed = sourceOrderSchema.safeParse(rawOrder);
  if (!parsed.success) throw sourceInvalid();
  if (query.mode === "business_date" && parsed.data.businessDate !== query.businessDate) {
    throw new OrdersNormalizationError("orders_business_date_mismatch", "...");
  }
  orders.push(normalizeOrder(parsed.data, guards));
}
```

**Immutable normalized shape pattern** ([src/orders-normalization-types.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-types.ts:27)):

```typescript
export interface NormalizedCheck {
  readonly guid: string;
  readonly amountHundredths: number;
  readonly payments: readonly NormalizedPayment[];
}
```

Use the existing `normalizeReference()` and `Object.freeze()` convention. Extend the source schema, its inferred type, the correct `normalizeOrder` or `normalizeCheck` mapper, and the matching normalized interface in one change. Extend privacy tests with distinctive employee markers that must not survive serialization.

---

### `src/report-tools.ts` (route / controller, request-response)

**Analog:** existing registration function.

Add both registrations in this one file only after the cash/labor modules exist. Reuse `reportInputSchema`, `baseCompleteOutputSchema`, `readOnlyAnnotations()`, and `toolResult()`. Update `baseCompleteOutputSchema.report` to include both report names.

**Registration pattern** ([src/report-tools.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/report-tools.ts:73)):

```typescript
server.registerTool(
  "toast_payment_summary",
  {
    title: "Toast Payment Summary",
    inputSchema: reportInputSchema,
    outputSchema: baseCompleteOutputSchema,
    annotations: readOnlyAnnotations(),
  },
  async (input, ctx) => toolResult(await buildPaymentSummaryReport(
    runtime,
    input.restaurantGuid === undefined
      ? { businessDate: input.businessDate }
      : { businessDate: input.businessDate, restaurantGuid: input.restaurantGuid },
    { signal: ctx.mcpReq.signal },
  )),
);
```

`toolResult()` currently accepts only `complete | denied` ([src/report-tools.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/report-tools.ts:146)). Extend it deliberately for the labor `incomplete` state. `incomplete` must have structured content and truthful bounded text. It must not be marked as a completed report and must not be silently coerced to `denied` when the validated source fact is an active entry.

---

### Unit report tests (test, transform)

**Files:** `test/cash-report.test.ts` and `test/labor-report.test.ts`  
**Analogs:** `test/t3-002-review-fixes.test.ts`, `test/orders-normalization.test.ts`, and the direct report patterns above.

Use independently invented UUIDs and data. Test pure folds and builder failure behavior. Include malformed source, open-string type, minor-unit precision, restaurant mismatch, and serialization assertions.

**Exact cross-boundary assertion pattern** ([test/report-tools-e2e.test.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/test/report-tools-e2e.test.ts:63)):

```typescript
const output = structured(result.structuredContent);
assert.equal(output.schemaVersion, 1);
assert.equal(output.status, "complete");
assert.ok(!JSON.stringify(output).includes("must-not-leak"));
```

Cash cases must prove no guest cash-payment double count, open-string type grouping, deposits, no-sales, reversals, and unresolved cross-date reversal warning. Labor cases must prove deletion, active/incomplete, break and missed-break states, hourly versus salaried semantics, overtime-hours-only policy, Orders-derived sales/tips, and absent employee/guest/card data.

---

### Stdio fixture and E2E test (test fixture / integration test, request-response)

**Files:** `test/fixtures/stdio-report-server.ts` and `test/report-tools-e2e.test.ts`  
**Analogs:** existing fixture server and modern stdio tool calls.

**Production runtime fixture pattern** ([test/fixtures/stdio-report-server.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/test/fixtures/stdio-report-server.ts:71)):

```typescript
const runtime = createApplicationRuntime({
  env: SYNTHETIC_VALID_RUNTIME_ENV,
  authFetch: async () => jsonResponse({ token: { /* synthetic only */ } }),
  dataFetch: syntheticToastFetch,
});

startStdioServer(({ era }) => createServer(
  era === "modern" ? { runtime } : { advertiseToolListChanged: true },
));
```

Add scenario names, token scopes, Partners connection scopes, synthetic routes, request assertions, and call counts together. Every cash/labor route must assert the restaurant header. The fixture must never contain real merchant data or secret material.

**Modern-client integration pattern** ([test/report-tools-e2e.test.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/test/report-tools-e2e.test.ts:45)):

```typescript
const listed = await connection.client.listTools();
assert.ok(listed.tools.some((tool) => tool.name === "toast_sales_summary"));

const result = await connection.client.callTool({
  name: "toast_sales_summary",
  arguments: { businessDate: BUSINESS_DATE },
});
const output = structured(result.structuredContent);
assert.equal(output.status, "complete");
```

Extend this pattern for both tools. Include tool discoverability, `readOnlyHint`, source endpoint calls, provenance, scope denial before business reads, malformed-source denial, cancellation during a read and rate-limit wait, and JSON serialization privacy checks. Use the active cancellation form in [test/report-tools-e2e.test.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/test/report-tools-e2e.test.ts:560).

---

### Documentation updates (documentation, transform)

**Files:** `docs/architecture/standard-report-tools.md`, `docs/architecture/orders-normalization-contract.md`, and `docs/research/toast-api-reporting-landscape.md`.

**Report contract analog:** [docs/architecture/standard-report-tools.md](/Users/sully/Documents/GitHub/toast-pos-mcp/docs/architecture/standard-report-tools.md:1)

Add the durable source, formula, completeness, privacy, cancellation, and production-proof contract. Define `incomplete` only for validated labor facts that cannot be final. Keep denied behavior for unavailable, malformed, or failed required sources.

**Normalization contract analog:** [docs/architecture/orders-normalization-contract.md](/Users/sully/Documents/GitHub/toast-pos-mcp/docs/architecture/orders-normalization-contract.md:80)

```text
Only identifiers survive. Human-readable free-text values from selections,
check tabs, customers, delivery fields, and tax display/jurisdiction fields are
intentionally excluded.
```

Record the identifier-only server attribution extension, its source location, and its privacy boundary. Do not widen the Orders model with raw employee data.

**Source-catalog analog:** [docs/research/toast-api-reporting-landscape.md](/Users/sully/Documents/GitHub/toast-pos-mcp/docs/research/toast-api-reporting-landscape.md:170)

Keep cash entries/deposits distinct from Orders guest cash payments. Record the labor rules that Orders, rather than TimeEntry monetary fields, supplies employee sales/tips and that overtime wage is not calculable from Toast data.

## Shared Patterns

### Location authority, capability, and cancellation

**Sources:** [src/runtime.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/runtime.ts:144) and [src/capabilities.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/capabilities.ts:102)  
**Apply to:** Both report builders and all source reads.

```typescript
const locationContext = await runtime.getLocationContext(input.restaurantGuid, {
  signal: options.signal,
});
const capabilityContext = await createCapabilityContext(runtime.tokenManager, locationContext.location);
const decision = decideCapability(capabilityContext, {
  restaurantGuid: locationContext.location.restaurantGuid,
  requiredScopes,
});
```

The report must use the selected restaurant GUID on every Toast request. Make one capability decision before any business-data request. Pass the MCP signal to every request.

### Provenance, deterministic money, and structured denials

**Source:** [src/report-core.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/report-core.ts:35)  
**Apply to:** Cash, labor, and any extension to Orders attribution.

```typescript
const provenance = new ReportProvenanceCollector();
provenance.add(result);
const totalMinor = addMinorUnits(previousMinor, moneyToMinorUnits(value, "field"));
```

Use integer minor units. Preserve bounded upstream request IDs. Translate errors only through `denialFromError()`. Never serialize raw Toast bodies, headers, tokens, or caught error messages.

### Immutable open-string normalized facts

**Sources:** [src/orders-normalization-source.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-source.ts:5) and [src/orders-normalization-traversal.ts](/Users/sully/Documents/GitHub/toast-pos-mcp/src/orders-normalization-traversal.ts:15)  
**Apply to:** Cash entry types, labor state/break/job values, and server reference extension.

Validate source data at the boundary. Preserve unknown string values. Freeze the retained normalized record. Reject malformed required source data. Keep unresolved identifiers as identifiers, not guessed labels.

## External Gates That Remain Open

- Issue #28 remains the owner-authorized live Standard credential gate.
- Documented Merchant consent remains required before real Merchant Data reaches an AI tool, host, log, telemetry system, or cloud provider.
- Synthetic fixture and stdio evidence does not prove Toast endpoint, payload, scope, or live compatibility.
- The tools remain read-only and informational. They make no accounting, tax, payroll, GAAP, certification, or publication claim.

## Metadata

**Analog search scope:** `src/`, `test/`, `docs/`, code graph, GitHub issue #20  
**Files scanned:** 26 code graph files; 22 current source/test/document files  
**Pattern extraction date:** 2026-08-27
