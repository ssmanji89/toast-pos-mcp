# Item and Dimension Sales Context Contract

**Status:** T3-003 production-source contract
**Tool:** `toast_item_sales_summary`
**Base report schema:** `1`

## Authority split

T3-003 has three deliberately separate authorities:

1. **Orders = historical facts**
   - business date;
   - order/check lifecycle;
   - item/item-group/sales-category/dining-option/revenue-center/service references;
   - selection quantity, `preDiscountPrice`, `price`, tax and observed refundDetails;
   - order source.
2. **Menus V2 = current descriptive item/tag context**
   - current item name;
   - current item tags;
   - GUID/multi-location identity used only to resolve a historical reference.
3. **Configuration API = current descriptive dimension names**
   - sales categories;
   - revenue centers;
   - dining options and behavior;
   - restaurant services/service periods.

A current display name is never allowed to create or change historical identity.
Two current objects with the same name and different GUIDs remain separate.
A historical GUID that no longer exists in the current descriptive source stays
in the report as an unresolved historical group rather than disappearing.

## Menus V2 cache

This reporting integration is not an ordering integration, so Menus V2 remains
the descriptive menu source.

For every invocation that needs menu context:

1. call `GET /menus/v2/metadata` through the shared cancellable Standard client;
2. validate restaurant GUID and `lastUpdated`;
3. if the cached full-menu `publishedAt` matches `lastUpdated`, reuse the full
   snapshot without downloading `/menus/v2/menus` again;
4. otherwise fetch and validate the full menu;
5. require the full menu's `lastUpdated` not to predate the metadata value.

`sourceProvenance` describes the successful full-menu snapshot that supplied
names/tags. `freshnessProvenance` describes the metadata request that proved or
challenged freshness for the current invocation. They are intentionally not
collapsed into one timestamp.

A failed metadata/full refresh with a previous valid snapshot yields
`state: stale` plus a warning. With no prior snapshot it yields
`state: unresolved`. Request cancellation is never converted into stale or
unresolved; it propagates as cancellation.

### Multi-path identity

The same menu item can appear in multiple menu groups or paths. The cache merges
repeated appearances only when stable item identity and name agree. Each exact
group identity retains its own canonicalized tag set. Conflicting tag sets for
one exact item-group identity fail closed. Orders `itemGroup` selects the tag
set. Missing or ambiguous group context remains unresolved.

Top-level item sales do not index the restaurant-level
`modifierOptionReferences` map. Nested modifiers are already present in Orders
and are traversed for integrity/context; their prices are not added as separate
item-sale facts in this slice.

## Configuration cache

Configuration entities are fetched through the existing reviewed
page-token/409-restart traversal. T3-003 does not own another pagination or
retry implementation.

The active descriptive snapshot is reconciled at most once per 24 hours for:

- `/config/v2/salesCategories`;
- `/config/v2/revenueCenters`;
- `/config/v2/diningOptions`;
- `/config/v2/restaurantServices`.

The endpoints are read sequentially in fixed order. The Standard transport
already serializes data fetches; the sequential source order therefore gives
deterministic provenance and ensures an endpoint restart finishes before the
next dimension is read.

Configuration supports `lastModified`, and the runtime records a local
refresh-start ISO timestamp as a future incremental candidate. It is **not**
treated as an authoritative cursor: server/client clock skew and the API's
omission of archived/deleted entities make incremental-only refresh incapable
of reconciling the active set safely. A full active-set refresh at least daily
prevents deleted current labels from persisting forever.

If refresh fails and a valid snapshot exists, descriptive context is `stale`.
With no previous snapshot it is `unresolved`. Historical Orders groups remain
reportable either way.

## Item metric basis

`dimension: item` uses additive top-level Selection facts.

For each non-void, non-deferred top-level selection:

- grouping identity is the historical `item` GUID, then `multiLocationId` when
  GUID is unavailable;
- `quantity` is accumulated as an exact decimal and serialized as a canonical
  base-10 string, so weighted quantities such as `0.5` are never integerized or
  binary-float accumulated;
- `grossSelectionAmountMinor` is the historical `preDiscountPrice`;
- `netSelectionAmountMinor` is the historical `Selection.price`;
- `selectionTaxAmountMinor` is retained separately;
- `observedSelectionRefundAmountMinor` is retained separately.

Toast documents `Selection.price` as already reflecting quantity, discounts and
modifier price adjustments. Nested modifiers are therefore traversed and
counted but not added again to parent item money.

`refundDetails` does not carry the refund business date needed to move the
refund into the correct reporting day. T3-003 does not subtract or re-date that
amount into the original order day; it exposes the observed value explicitly.
The payment lifecycle tool remains the source for paid/refund/void business-date
reporting.

## Check-attribution metric basis

The remaining dimensions expose `metricBasis: check_attribution` and
`attributedCheckAmountMinor`, using Toast's own sales-reporting style of adding
`check.amount` to each distinct dimension represented on the check.

- `revenue_center`: one historical order revenue-center group per eligible
  check;
- `order_source`: one historical open-enum source value per eligible check;
- `service_period`: one historical restaurant-service reference per eligible
  check;
- `sales_category`: each distinct historical selection sales-category GUID on
  the check;
- `dining_option`: each distinct historical selection dining-option reference,
  falling back to order dining option;
- `item_tag`: each distinct current/stale MenuItem tag associated with the
  historical top-level item reference.

`sales_category`, `dining_option`, and `item_tag` are marked
`nonAdditiveAcrossGroups: true` because one check can intentionally contribute
its full check amount to multiple groups. Revenue center, order source and
service period attribute an eligible check once.

Item-tag reporting requires a validated current or explicitly stale menu
snapshot. A completely unresolved menu source cannot truthfully claim which
current tags belong to the historical item and therefore denies the tag report.

## Unresolved context

Unresolved descriptive context never erases historical facts.

The report preserves the historical grouping key and monetary contribution,
sets `displayName` to undefined, marks the group `enrichmentState: unresolved`,
and increments `unresolvedContributionCount` for each contribution that could
not be descriptively resolved.

For item sales, menu capability/source failure can degrade to unresolved while
Orders facts remain complete. For item tags, missing/unresolved menu context is
not enough to define the requested dimension and therefore denies the report.

## Provenance

The result keeps source classes separate:

- `contextProvenance` / `contextFreshness`: validated restaurant context;
- `provenance`: Orders pages that supplied historical facts;
- `dimensionContext.menuSourceProvenance`: full menu descriptive source;
- `dimensionContext.menuFreshnessProvenance`: metadata freshness check;
- `dimensionContext.configurationProvenance`: current Configuration snapshot.

This separation prevents a fresh metadata poll from masquerading as a freshly
downloaded menu and prevents current menu/config timestamps from being confused
with the timestamp of the historical sale.

## Cancellation and shared infrastructure

All T3-003 reads use the same process-owned `ApplicationRuntime`, OAuth token
manager, hierarchical rate-limit coordinator, cancellation wrapper and Toast
transport as T3-002. The MCP handler forwards `ctx.mcpReq.signal`.

Menus/Configuration refreshes are coalesced per restaurant. Cancellation is
propagated, not swallowed into stale fallback.

The Orders path uses the same bounded `/ordersBulk` fold and cross-page
order/check/selection/payment/service-charge identity guard as sales summary.
There is no T3-local raw-page accumulator.

## Executable proof

The shared child-process stdio fixture uses the production
`createApplicationRuntime -> createServer -> startStdioServer` path.
Adversarial scenarios prove:

- two distinct GUIDs with the same current item name stay separate;
- weighted quantity `0.5` survives exactly;
- nested modifiers are traversed but not double-counted into item money;
- Orders `itemGroup` selects the matching menu-path tags;
- missing, ambiguous, or conflicting item-group tags remain unresolved;
- a second item-report call polls metadata again but does not download the full
  menu when `lastUpdated` is unchanged;
- failed metadata refresh after a valid snapshot yields stale enrichment and
  preserves sales;
- failed menu retrieval with no cache yields unresolved item enrichment and
  preserves historical sales;
- a historical item absent from current Menus remains reportable by its GUID;
- a historical sales-category GUID absent from current Configuration remains
  reportable with unresolved display context;
- the first sales-category Configuration read returns 409 and the report still
  succeeds through the shared T1 restart path;
- a second same-day Configuration-backed report succeeds while the fixture is
  configured to fail any second full snapshot, proving cache reuse;
- open/new item-tag strings remain reportable;
- item-tag groups are explicitly non-additive.

## Non-goals

T3-003 does not:

- reconstruct historical menu/configuration versions;
- fabricate deleted current entities;
- re-price historical orders from the current menu;
- group modifier selections as independent monetary item sales;
- move selection refunds to a guessed business date;
- introduce Analytics facts;
- make accounting, settlement or tax claims;
- persist Merchant Data.

## Validation gate

Source/design artifacts still require the same authentic exact-head dependency
and Node 20/22 gate as the stacked T3-002 branch. No source checkout, global
TypeScript version, validation double or hand-written lockfile is acceptance
evidence.

DOX: this document is the authoritative T3-003 item/dimension source contract.
