# Phase 4: Cash and Labor Reporting - Research

**Researched:** 2026-08-27
**Domain:** Read-only Toast Standard API cash and labor reporting through MCP stdio
**Confidence:** MEDIUM

## Summary

Phase 4 extends the merged Standard-report production chain. It must use the process-owned `ApplicationRuntime`, location context, capability decision, rate-limited client, cancellation signal, and result provenance. It must not create a second HTTP, OAuth, location, scope, or cache path. [VERIFIED: codebase]

Use two bounded tools: `toast_cash_summary` and `toast_labor_summary`. Each tool must accept one Toast `businessDate` and one optional restaurant GUID. Cash reads `/cashmgmt/v1/entries` and `/deposits` for that date. Labor reads time entries, jobs, break types, tip withholding, and normalized Orders facts. [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html] [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]

The cash tool must report source cash-entry and deposit facts. It must not call a cash entry a guest cash payment. The labor tool must use Orders facts for employee sales and tips, but it must keep employee identifiers only during its in-memory fold and return aggregate buckets by default. [CITED: https://doc.toasttab.com/doc/devguide/apiWorkingWithCashEntriesAndDeposits.html] [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html] [VERIFIED: AGENTS.md]

**Primary recommendation:** Add only source-specific adapters, normalizers, calculators, and stdio tools over the existing runtime. Use `denied` for unavailable or malformed required sources. Use a labelled `incomplete` result only for validated source facts that cannot yet form a final labor result, such as an active time entry. [VERIFIED: codebase] [CITED: https://doc.toasttab.com/doc/devguide/apiGettingTimeEntriesForEmployees.html]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Cash entries and deposits | API / Backend | Database / Storage — | Toast exposes restaurant-scoped GET resources. The local process must calculate and keep only bounded in-memory state. [CITED: https://doc.toasttab.com/doc/devguide/apiUsingCashManagementApi.html] [VERIFIED: AGENTS.md] |
| Cash drawer and reason labels | API / Backend | Database / Storage — | Configuration is read through the existing restaurant-scoped page-token client. Same-day cache state must include restaurant GUID and provenance. [VERIFIED: codebase] |
| Labor time entries and breaks | API / Backend | Browser / Client — | The labor API returns time entries and break records. The server must validate and fold them before MCP presentation. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/] |
| Sales and tips for labor | API / Backend | Database / Storage — | Toast directs integrations to Orders facts for employee sales and tips. The existing Orders fold and normalizer own this retrieval path. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html] [VERIFIED: codebase] |
| Deterministic aggregate result | API / Backend | Browser / Client — | Pure minor-unit calculations and a structured MCP envelope belong in the server. The client must not calculate report formulas. [VERIFIED: AGENTS.md] |

## Project Constraints (from AGENTS.md)

- The server is public, local, TypeScript on Node 20+, and read-only. It must not add Toast write operations. [VERIFIED: AGENTS.md]
- Never retain, log, test, return, or commit credentials, tokens, raw credential payloads, real Merchant Data, guest-linked data, or payment identifiers. Use independently invented synthetic fixtures only. [VERIFIED: AGENTS.md]
- Every Toast request and every cache key must bind to one restaurant GUID. The reviewed credential-scoped Partners read is the only exception. [VERIFIED: AGENTS.md]
- Report calculations must be pure, fixture-tested, source-attributed, business-date-aware, explicit about freshness and exclusions, and safe for unknown enum strings. [VERIFIED: AGENTS.md]
- Capability gaps, partial traversal, stale required data, upstream failure, and cancellation must return a structured denial or incomplete-data status. They must never return invented zeroes. [VERIFIED: AGENTS.md]
- Default to aggregate outputs. Do not make accounting, tax, payroll-filing, GAAP, certification, live-compatibility, or publication claims. [VERIFIED: AGENTS.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---:|---|---|
| TypeScript | 6.0.3 | Typed adapters, normalizers, reports, and fixtures | The repository already compiles source and tests with TypeScript. [VERIFIED: package.json] |
| Node.js | >=20 | Local MCP stdio runtime and Node test runner | This is the repository runtime floor. [VERIFIED: package.json] |
| `@modelcontextprotocol/server` | 2.0.0 | Production MCP server and tool registration | The merged runtime uses this package through `McpServer` and stdio. [VERIFIED: package.json] [VERIFIED: codebase] |
| Zod | 4.4.3 | Strict input and source payload validation | Existing report tools use Zod input schemas and fail closed on invalid upstream structures. [VERIFIED: package.json] [VERIFIED: codebase] |

### Supporting

| Component | Purpose | When to Use |
|---|---|---|
| `ApplicationRuntime` | Shares one config identity, token manager, transport, location registry, and context freshness policy | Every new report tool. [VERIFIED: codebase] |
| `RateLimitAwareToastHttpClient` | Performs cancellable restaurant-scoped JSON GETs and existing bounded Orders folds | Every Standard source read. [VERIFIED: codebase] |
| `ReportProvenanceCollector` | Preserves retrieval timestamp and bounded upstream request IDs | Every successful source response. [VERIFIED: codebase] |
| Node built-in test runner | Runs compiled tests through explicit file discovery | Unit and stdio child-process tests. [VERIFIED: scripts/run-tests.mjs] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Existing Standard runtime | A new cash or labor HTTP client | Do not use it. It would bypass shared cancellation, rate limits, location isolation, and provenance. [VERIFIED: AGENTS.md] [VERIFIED: codebase] |
| Orders facts for labor sales and tips | Time-entry sales and tip fields | Do not use the time-entry fields for this formula. Toast states that they can be stale after order or administrative changes. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html] |
| Aggregate MCP reports | Raw employee, cash-entry, or deposit dumps | Do not use raw dumps. They increase personal-data exposure and do not meet the bounded-output contract. [VERIFIED: AGENTS.md] |

**Installation:** No package installation is required. [VERIFIED: package.json]

## Package Legitimacy Audit

Not required. This phase must use the existing locked dependencies and must not add an external package. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```text
MCP stdio tools/call
        |
        v
Zod input validation
        |
        v
ApplicationRuntime.getLocationContext()
        |
        +--> selected restaurant + current context provenance
        |
        v
Capability preflight: token scopes ∩ connection scopes
        |
        +--> denied result when a required scope is unavailable
        |
        +--> cash: entries + deposits + required configuration
        |         -> validate -> reversal-aware fold -> cash summary
        |
        +--> labor: time entries + jobs + break/tip configuration + Orders
                  -> validate -> privacy-minimized fold -> labor summary
        |
        v
Complete | incomplete | denied envelope
        |
        v
MCP structured content with source, provenance, freshness, warnings, and exclusions
```

The existing report tools already use this path from MCP input through `ApplicationRuntime`, capability preflight, shared transport, source fold, and an envelope. Phase 4 must retain that path. [VERIFIED: src/report-tools.ts] [VERIFIED: src/sales-report.ts]

### Recommended Project Structure

```text
src/
├── cash-report-source.ts       # strict CashEntry and Deposit schemas
├── cash-report.ts              # pure cash fold and report envelope
├── labor-report-source.ts      # strict time entry, job, and configuration schemas
├── labor-report.ts             # pure labor fold and report envelope
├── report-tools.ts             # registration of both new MCP tools
├── report-core.ts              # reuse minor-unit and provenance helpers
└── orders-normalization-*.ts   # extend only for minimal server attribution
test/
├── cash-report.test.ts         # synthetic formula and source adversarial tests
├── labor-report.test.ts        # synthetic formula and state adversarial tests
└── report-tools-e2e.test.ts    # production stdio child-process tests
```

### Pattern 1: Capability-first source plan

**What:** Resolve the location, then create one capability context. Check the complete required scope set before any business-data request. [VERIFIED: src/sales-report.ts] [VERIFIED: src/capabilities.ts]

**Use:**

- Cash: require `cashmgmt:read` and `config:read`. Do not request `labor.employees:read` while default output omits employee names. [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html] [VERIFIED: AGENTS.md]
- Labor: require `labor:read`, `config:read`, and `orders:read`. Do not request `labor.employees:read` while default output stays aggregate. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html] [VERIFIED: AGENTS.md]
- Keep `restaurants:read` as the existing runtime-context prerequisite, not a new private report dependency. [VERIFIED: codebase]

**Code analogue:**

```typescript
// Source: src/sales-report.ts [VERIFIED: codebase]
const locationContext = await runtime.getLocationContext(input.restaurantGuid, {
  signal: options.signal,
});
const context = await createCapabilityContext(runtime.tokenManager, locationContext.location);
const decision = decideCapability(context, {
  restaurantGuid: locationContext.location.restaurantGuid,
  requiredScopes: ["cashmgmt:read", "config:read"],
});
if (decision.status === "denied") return capabilityDenied(/* stable envelope */);
```

### Pattern 2: Strict source validation and sequential fold

**What:** Request only a restaurant-scoped endpoint through `getJsonDetailedCancellable`. Validate each body before a pure fold. Add every successful detailed result to `ReportProvenanceCollector`. [VERIFIED: src/rate-limited-client.ts] [VERIFIED: src/report-core.ts]

**Use:** Cash endpoints return arrays for exactly one business date. Labor uses a bounded time-entry query with `includeMissedBreaks=true` and valid source `businessDate` checks. [CITED: https://doc.toasttab.com/openapi/cashmanagement/operation/depositsGet/] [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/]

**Code analogue:**

```typescript
// Source: src/dimension-context.ts and src/report-core.ts [VERIFIED: codebase]
const source = await runtime.toastHttpClient.getJsonDetailedCancellable(
  { path: "/cashmgmt/v1/entries", restaurantGuid, query, rateLimitKey: "cash-entries" },
  { signal },
);
provenance.add(source);
const entries = cashEntryArraySchema.parse(source.body);
const result = foldCashEntries(entries); // no I/O and no mutable global state
```

### Pattern 3: Source identity is authoritative

**What:** Preserve every open-string enum and every unresolved GUID. Do not turn an unknown cash-entry type, break type, job, drawer, reason, or employee reference into a discarded record. [VERIFIED: AGENTS.md] [VERIFIED: src/orders-normalization-traversal.ts]

**Use:** Match an entry or deposit reversal only when `undoes` points to a record present in the same invocation. When the original is outside the date result, keep the reversal in the declared type bucket and emit an `unresolvedCrossDateReversalCount` warning. Cash reversals can span business dates. [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html]

### Pattern 4: Labor business-date and revision policy

**What:** Use the source `businessDate` as the inclusion fact. Build restaurant-local closeout boundaries only to make a bounded `startDate`/`endDate` request. Set `includeArchived=true` and `includeMissedBreaks=true`. Validate that returned entry `businessDate` equals the requested business date. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/]

**Why:** A `businessDate` query does not return archived entries. A bounded `startDate`/`endDate` request can include archived time entries when `includeArchived=true`. A deleted record must stay visible as an exclusion or incomplete-data fact. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/] [CITED: https://doc.toasttab.com/doc/relnotes/devPortalApiChangeLog.html]

**Revision backfill:** Use `modifiedStartDate` and `modifiedEndDate` only in an explicit repair or refresh path. Those parameters return modified records, including archived records, and the range has a one-month maximum. Do not silently replace a business-date report with a modification-window report. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/] [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]

### Anti-Patterns to Avoid

- **A second client or cache:** Do not bypass `ApplicationRuntime`. It can break restaurant isolation and provenance. [VERIFIED: AGENTS.md]
- **Time-entry sales and tips formula:** Do not use it for sales/tips. Use Orders facts with minimal server attribution. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]
- **Employee names by default:** Do not call `/employees` only to decorate an aggregate report. Keep references in-memory and remove them before output. [VERIFIED: AGENTS.md]
- **Cross-day reversal netting:** Do not cancel a reversal against a guessed missing original. Keep the observed fact and warning. [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html]
- **Invented overtime pay:** Do not calculate overtime wage. Toast does not provide the overtime factor. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]

## Don't Hand-Roll

| Problem | Do Not Build | Use Instead | Why |
|---|---|---|---|
| OAuth, rate limits, retries, cancellation | A report-local fetch loop | `ApplicationRuntime.toastHttpClient` | The shared client already owns bounded retries, rate-limit coordination, transport errors, and MCP cancellation. [VERIFIED: codebase] |
| Location authority | A report-local restaurant lookup | `ApplicationRuntime.getLocationContext()` | The runtime binds credential identity, active restaurant context, freshness, and provenance. [VERIFIED: src/runtime.ts] |
| Scope logic | Per-tool token parsing | `createCapabilityContext()` and `decideCapability()` | The current model intersects provisioned and connection scopes and preserves denials. [VERIFIED: src/capabilities.ts] |
| Money arithmetic | Floating-point totals | `moneyToMinorUnits()` and `addMinorUnits()` | Existing helpers reject values that do not map exactly to two-decimal integer minor units. [VERIFIED: src/report-core.ts] |
| MCP result wiring | A test-only calculator entry point | `registerStandardReportTools()` plus stdio fixture | Production MCP tests already use this registration boundary. [VERIFIED: src/report-tools.ts] [VERIFIED: test/report-tools-e2e.test.ts] |

**Key insight:** The new behavior is source normalization and deterministic aggregation. The phase must reuse all process and transport controls. [VERIFIED: AGENTS.md]

## Common Pitfalls

### Pitfall 1: Treating cash entries as cash check payments

**What goes wrong:** The tool reports drawer movements as customer payments.
**Why it happens:** The cash management API expressly separates cash entries from guest cash payments.
**How to avoid:** Report entries and deposits as their own source facts. Add an expected-deposit formula only in a separate, capability-gated report that also uses Orders payments.
**Warning signs:** A cash summary contains a guest check count or claims total cash sales without Orders data. [CITED: https://doc.toasttab.com/doc/devguide/apiWorkingWithCashEntriesAndDeposits.html]

### Pitfall 2: Losing reversals across business dates

**What goes wrong:** A source reversal is dropped or netted against a missing record.
**Why it happens:** Toast documents that undo entry pairs can occur on different business dates.
**How to avoid:** Keep each source entry in its date result. Pair only records retrieved together. Mark unresolved cross-date links.
**Warning signs:** A reversal count is zero although an `undoes` field exists. [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html]

### Pitfall 3: Calling an active labor shift final

**What goes wrong:** The tool calls partial hours or sales final.
**Why it happens:** `outDate: null` means the shift is incomplete. Active time-entry values can change.
**How to avoid:** Return `incomplete` with explicit active-entry count and no final-wage claim.
**Warning signs:** A current business-day result has `status: complete` and an active entry. [CITED: https://doc.toasttab.com/doc/devguide/apiGettingTimeEntriesForEmployees.html]

### Pitfall 4: Computing overtime wage

**What goes wrong:** The tool invents a statutory or restaurant-specific overtime multiplier.
**Why it happens:** The API reports overtime hours but not the factor for overtime wages.
**How to avoid:** Output regular wage estimate only. Output overtime hours separately and state that overtime wage is not computed.
**Warning signs:** `overtimeWagesMinor` appears without a sourced multiplier. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]

### Pitfall 5: Exposing employee data through report rows

**What goes wrong:** The tool returns names, employee GUIDs, external IDs, or raw breaks.
**Why it happens:** The source has employee references and reporting joins need them internally.
**How to avoid:** Use identifiers only for in-memory joining and deduplication. Return aggregate totals and counts only.
**Warning signs:** A serialized result contains `employeeReference`, `externalId`, or employee names. [VERIFIED: AGENTS.md]

## Code Examples

### Cash reversal-safe fold

```typescript
// Source pattern: official CashEntry `undoes` guidance and src/report-core.ts
// [CITED: https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html]
for (const entry of entries) {
  totalsByType.get(entry.type)?.add(entry.amountMinor);
  if (entry.undoes !== undefined && !entryGuids.has(entry.undoes)) {
    unresolvedCrossDateReversalCount += 1;
  }
  entryGuids.add(entry.guid);
}
```

### Labor finality and wage policy

```typescript
// Source: Toast labor report guidance
// [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]
if (entry.deleted) exclusions.deletedTimeEntries += 1;
else if (entry.outDate === undefined) incomplete.activeTimeEntries += 1;
else {
  totals.regularHours += entry.regularHours;
  totals.overtimeHours += entry.overtimeHours;
  if (entry.hourlyWageMinor !== undefined) {
    totals.regularWagesMinor += entry.regularHoursTimes(entry.hourlyWageMinor);
  } else {
    counts.salariedTimeEntries += 1;
  }
}
// Deliberately do not compute overtimeWagesMinor.
```

### Production tool registration

```typescript
// Source: src/report-tools.ts [VERIFIED: codebase]
server.registerTool("toast_cash_summary", {
  title: "Toast Cash Summary",
  inputSchema: reportInputSchema,
  outputSchema: standardReportOutputSchema,
  annotations: readOnlyAnnotations(),
}, async (input, ctx) => toolResult(await buildCashSummaryReport(runtime, input, {
  signal: ctx.mcpReq.signal,
})));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `businessDate` labor query without archived records | `startDate`/`endDate` plus `includeArchived=true` when deleted records matter | Toast reference current at research date | A report can expose deleted-entry exclusions instead of silently losing them. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/] |
| Time-entry sales and tips | Orders-based sales and tips | Current Toast reporting guide | Labor reports avoid known stale time-entry sales/tip values after order or administrative changes. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html] |
| Direct unit calculator evidence | Child-process stdio MCP evidence | Existing Phase 3 production contract | Phase 4 must prove the real report registration and runtime chain. [VERIFIED: docs/architecture/standard-report-tools.md] [VERIFIED: test/report-tools-e2e.test.ts] |

**Deprecated or unsuitable:**

- Time-entry `cashSales`, `nonCashSales`, `declaredCashTips`, and `nonCashTips` are unsuitable for Phase 4 sales/tips calculations. [CITED: https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html]
- An accounting, tax, or payroll-filing result is out of scope. [VERIFIED: AGENTS.md]

## Assumptions Log

All technical claims in this research are verified against current repository code or cited Toast documentation. No assumption requires user confirmation.

## Open Questions

1. **What exact cash summary formula belongs in T4-001?**
   - What we know: The slice requires cash-entry and deposit summaries. Toast documents a separate expected-deposit formula that also needs Orders payments. [VERIFIED: LOOP.md] [CITED: https://doc.toasttab.com/doc/devguide/apiCalculatingExpectedCashDeposits.html]
   - What is unclear: The phase text does not include the expected-deposit formula.
   - Recommendation: Keep T4-001 limited to entries, deposits, closeouts, reversals, and declared drawer context. Make expected-deposit calculation a separately scoped future tool with `orders:read`.

2. **How far must labor revision repair look back?**
   - What we know: Toast supports `modifiedStartDate` and `modifiedEndDate`, includes archived records in that mode, and limits a range to one month. [CITED: https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/]
   - What is unclear: The project has no persisted reconciliation store or selected repair lookback policy.
   - Recommendation: Make the report's direct business-date read authoritative at retrieval time. Add no silent historical repair loop in T4-002. Record a later backfill policy as a separate decision.

3. **Should individual employee reports ever be exposed?**
   - What we know: The product requires data minimization and aggregate default output. [VERIFIED: AGENTS.md]
   - What is unclear: No approved individual-report contract exists.
   - Recommendation: Exclude individual employee output from Phase 4. Require a separate privacy and consent review before adding it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | Build and test | ✓ | 22.22.2 | Node 20.20.2 remains the declared floor. [VERIFIED: local environment] [VERIFIED: package.json] |
| npm | Locked dependency restore and check | ✓ | 10.9.7 | — [VERIFIED: local environment] |
| Toast Standard credentials | Owner-authorized live evidence | ✗ | — | Synthetic fixtures for implementation only. This does not prove live compatibility. [VERIFIED: STATE.md] |

**Missing dependencies with no fallback:**

- Owner-authorized Toast credentials block only live compatibility evidence. They do not block synthetic implementation and stdio-chain validation. [VERIFIED: STATE.md]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | TypeScript compiled tests plus Node built-in `node:test`. [VERIFIED: package.json] |
| Config file | `scripts/run-tests.mjs` explicitly discovers compiled `*.test.js` files. [VERIFIED: scripts/run-tests.mjs] |
| Quick run command | `npm run build:test && node --test dist-test/test/cash-report.test.js` |
| Full suite command | `npm run check` |

### Phase Behavior → Test Map

| Slice | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| T4-001 | Cash totals by open-string type, deposit totals, closeouts, no-sales, and cross-date reversal warnings | Unit | `npm run build:test && node --test dist-test/test/cash-report.test.js` | ❌ Wave 0 |
| T4-001 | Missing scope, malformed source, cancellation, upstream error, and location mismatch return denial | Unit and stdio | `npm run build:test && node --test dist-test/test/cash-report.test.js dist-test/test/report-tools-e2e.test.js` | ❌ Wave 0 |
| T4-002 | Deleted, active, salaried, break, regular-hour, overtime-hour, and tip-withholding states | Unit | `npm run build:test && node --test dist-test/test/labor-report.test.js` | ❌ Wave 0 |
| T4-002 | Orders-derived sales/tips never use time-entry sales/tip fields | Unit | `npm run build:test && node --test dist-test/test/labor-report.test.js` | ❌ Wave 0 |
| T4-001/T4-002 | Tool list, success, denial, cancellation, provenance, and no employee-data leak through real stdio | Child-process integration | `npm run build:test && node --test dist-test/test/report-tools-e2e.test.js` | ✅ Extend |

### Required Production-Chain Tests

1. Start `dist-test/test/fixtures/stdio-report-server.js` through the official MCP client. Call both new tools. Assert registered names, `readOnlyHint`, schema version, source, location context, provenance, and bounded text content. [VERIFIED: test/report-tools-e2e.test.ts]
2. Run a missing-scope scenario. Assert no business-data route receives a request. Assert `isError=true`, stable denial fields, and no zero totals. [VERIFIED: src/capabilities.ts] [VERIFIED: test/report-tools-e2e.test.ts]
3. Run malformed cash, deposit, time-entry, configuration, and Orders payload scenarios. Assert no `complete` result. [VERIFIED: AGENTS.md]
4. Abort each tool during a source read and during a rate-limit wait. Assert no later endpoint request occurs. [VERIFIED: src/rate-limited-client.ts]
5. Serialize every result. Assert no secret, token, employee name, employee GUID, external ID, guest data, or raw source array is present. [VERIFIED: AGENTS.md]

### External and Live Gates

1. Preserve issue #28 as the owner-authorized live Standard credential gate. Synthetic fixtures do not establish endpoint, scope, or payload compatibility. [VERIFIED: STATE.md]
2. Require documented Merchant consent before any real Merchant Data reaches an AI tool, MCP host, cloud provider, prompt log, or telemetry system. [VERIFIED: AGENTS.md]
3. Before live evidence, verify selected-location scope grants for `cashmgmt:read`, `labor:read`, `config:read`, and `orders:read`. Verify actual Toast responses use the reviewed restaurant header path. [CITED: https://doc.toasttab.com/doc/devguide/devApiAccessScopes.html] [CITED: https://doc.toasttab.com/doc/devguide/authentication.html]
4. Do not treat this research or synthetic validation as a publication, certification, accounting, or payroll claim. [VERIFIED: AGENTS.md]

### Sampling Rate

- **Per task commit:** Focused compiled test command for the changed report.
- **Per wave merge:** `npm run check` on Node 20.20.2 and Node 22.22.2. [VERIFIED: LOOP.md]
- **Phase gate:** Full suite, package check, independent review, production stdio evidence, and retained external gates. [VERIFIED: ROADMAP.md]

### Wave 0 Gaps

- [ ] `test/cash-report.test.ts` — source schemas, totals, reversals, negative paths, and privacy serialization.
- [ ] `test/labor-report.test.ts` — time-entry lifecycle, break, wage, deletion, and Orders-attribution rules.
- [ ] Extend `test/fixtures/stdio-report-server.ts` — cash/labor source routes and adversarial scenarios.
- [ ] Extend `test/report-tools-e2e.test.ts` — real stdio calls and complete/incomplete/denied paths.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Yes | Reuse process-owned OAuth manager. Do not expose tokens. [VERIFIED: AGENTS.md] [VERIFIED: src/runtime.ts] |
| V3 Session Management | Yes | Keep token, rate-limit, and report state in memory and scoped to runtime identity. [VERIFIED: AGENTS.md] |
| V4 Access Control | Yes | Require restaurant-bound location context and scope intersection before every report source plan. [VERIFIED: AGENTS.md] [VERIFIED: src/capabilities.ts] |
| V5 Input Validation | Yes | Use Zod for MCP input and each upstream payload. Reject malformed data. [VERIFIED: package.json] [VERIFIED: codebase] |
| V6 Cryptography | Yes | Reuse HTTPS/OAuth bearer transport. Do not implement crypto or secret persistence. [VERIFIED: AGENTS.md] |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Cross-location data reuse | Information disclosure | Require restaurant GUID on every source request and every cache key. [VERIFIED: AGENTS.md] |
| Scope bypass before read | Elevation of privilege | Check token scope and selected connection scope before network access. [VERIFIED: src/capabilities.ts] |
| Employee or guest data leak | Information disclosure | Use aggregate output. Exclude guest scopes and raw-source dumps. [VERIFIED: AGENTS.md] |
| Source failure interpreted as zero | Tampering | Return structured `denied` or `incomplete` status with reason and provenance. [VERIFIED: AGENTS.md] |
| Unknown Toast enum fails report | Denial of service | Preserve the raw open string and group it as unknown. [VERIFIED: AGENTS.md] |

## Sources

### Primary

- [Toast cash transactions reporting guide](https://doc.toasttab.com/doc/cookbook/apiHowToCashReports.html) - cash sources, required context, cash types, reversals, closeouts, and deposits.
- [Toast labor reporting guide](https://doc.toasttab.com/doc/cookbook/apiIntegrationChecklistPayroll.html) - scopes, retrieval modes, wages, breaks, sales/tips, and limits.
- [Toast time entries API reference](https://doc.toasttab.com/openapi/labor/operation/timeEntriesGet/) - query semantics, archived behavior, missed breaks, and restaurant header.
- [Toast cash deposits API reference](https://doc.toasttab.com/openapi/cashmanagement/operation/depositsGet/) - business-date and restaurant-scoped deposit retrieval.
- [Toast Standard API scopes](https://doc.toasttab.com/doc/devguide/devApiAccessScopes.html) - current read scope names.

### Repository Evidence

- [Existing Standard report contract](../../../docs/architecture/standard-report-tools.md) - production-chain and envelope conventions. [VERIFIED: codebase]
- [Cash/labor source map](../../../docs/research/toast-api-reporting-landscape.md) - prior curated Toast source map. [VERIFIED: codebase]
- [Runtime and report implementation](../../../src/runtime.ts) - process-owned authority and freshness. [VERIFIED: codebase]
- [Production stdio report test](../../../test/report-tools-e2e.test.ts) - current integration-test analogue. [VERIFIED: codebase]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — package versions and production patterns are verified in the repository.
- Architecture: HIGH — the merged T3 runtime and tool path is present in source and tests.
- Toast cash/labor semantics: MEDIUM — current official Toast guides and OpenAPI references support the source contracts, but live credential compatibility remains gated.
- Live behavior: LOW — this executor has no authorized Toast credentials. [VERIFIED: STATE.md]

**Research date:** 2026-08-27
**Valid until:** 2026-09-03, because Toast API references and release notes can change.
