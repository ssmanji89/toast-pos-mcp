import type {
  ConfigurationDimensionContext,
  DimensionContextState,
  MenuDimensionContext,
  MenuItemDimension,
} from "./dimension-context.js";
import {
  addExactDecimals,
  exactDecimalFromNumber,
  type ExactDecimal,
} from "./exact-decimal.js";
import type {
  NormalizedOrder,
  NormalizedReference,
  NormalizedSelection,
} from "./orders-normalization.js";
import { addMinorUnits } from "./report-core.js";
import type {
  DimensionDescriptor,
  ItemSalesDimension,
  ItemSalesFoldState,
  MutableGroup,
} from "./item-sales-report.js";

const ZERO_DECIMAL: ExactDecimal = Object.freeze({ coefficient: "0", scale: 0 });

export function aggregateOrderDimensions(
  state: ItemSalesFoldState,
  order: NormalizedOrder,
  dimension: ItemSalesDimension,
  menuContext: MenuDimensionContext | undefined,
  configContext: ConfigurationDimensionContext | undefined,
): void {
  if (order.deleted || order.voided || order.excessFood) return;
  for (const check of order.checks) {
    if (check.deleted || check.voided) continue;
    for (const selection of check.selections) state.modifierSelectionsTraversed += countModifiers(selection);
    if (dimension === "item") {
      for (const selection of check.selections) {
        if (selection.voided || selection.deferred) continue;
        const descriptor = itemDescriptor(selection, menuContext);
        if (descriptor.enrichmentState === "unresolved") state.unresolvedContributionCount += 1;
        const group = getGroup(state.groups, descriptor);
        group.selectionCount += 1;
        group.quantity = addExactDecimals([group.quantity, exactDecimalFromNumber(selection.quantity)]);
        group.grossSelectionAmountMinor = addMinorUnits(group.grossSelectionAmountMinor, selection.preDiscountPriceHundredths);
        group.netSelectionAmountMinor = addMinorUnits(group.netSelectionAmountMinor, selection.priceHundredths);
        group.observedSelectionRefundAmountMinor = addMinorUnits(group.observedSelectionRefundAmountMinor, selection.refundDetails?.refundAmountHundredths ?? 0);
        group.selectionTaxAmountMinor = addMinorUnits(group.selectionTaxAmountMinor, selection.taxHundredths ?? 0);
      }
      continue;
    }
    const descriptors = checkDimensionDescriptors(order, check.selections, dimension, menuContext, configContext);
    if (descriptors.length === 0) descriptors.push(unresolvedDescriptor(dimension));
    for (const descriptor of descriptors) {
      if (descriptor.enrichmentState === "unresolved") state.unresolvedContributionCount += 1;
      const group = getGroup(state.groups, descriptor);
      group.checkCount += 1;
      group.attributedCheckAmountMinor = addMinorUnits(group.attributedCheckAmountMinor, check.amountHundredths);
    }
  }
}

function checkDimensionDescriptors(order: NormalizedOrder, selections: readonly NormalizedSelection[], dimension: Exclude<ItemSalesDimension, "item">, menuContext: MenuDimensionContext | undefined, configContext: ConfigurationDimensionContext | undefined): DimensionDescriptor[] {
  const unique = new Map<string, DimensionDescriptor>();
  if (dimension === "revenue_center") addDescriptor(unique, referenceDescriptor(dimension, order.revenueCenter, configContext?.revenueCenters, configContext?.state));
  else if (dimension === "order_source") addDescriptor(unique, valueDescriptor(dimension, order.source));
  else if (dimension === "service_period") addDescriptor(unique, referenceDescriptor(dimension, order.restaurantService, configContext?.restaurantServices, configContext?.state));
  else if (dimension === "sales_category") {
    for (const selection of selections) if (!selection.voided && !selection.deferred) addDescriptor(unique, referenceDescriptor(dimension, selection.salesCategory, configContext?.salesCategories, configContext?.state));
  } else if (dimension === "dining_option") {
    for (const selection of selections) if (!selection.voided && !selection.deferred) addDescriptor(unique, referenceDescriptor(dimension, selection.diningOption ?? order.diningOption, configContext?.diningOptions, configContext?.state));
    if (unique.size === 0) addDescriptor(unique, referenceDescriptor(dimension, order.diningOption, configContext?.diningOptions, configContext?.state));
  } else if (dimension === "item_tag") {
    for (const selection of selections) {
      if (selection.voided || selection.deferred) continue;
      const item = resolveMenuItem(
        selection.item,
        selection.itemGroup,
        menuContext,
        true,
      );
      if (item === undefined || item.itemTags.length === 0) {
        const unresolved = unresolvedDescriptor(dimension);
        unique.set(unresolved.key, unresolved);
        continue;
      }
      for (const tag of item.itemTags) unique.set(`guid:${tag.guid}`, Object.freeze({ key: `guid:${tag.guid}`, guid: tag.guid, multiLocationId: undefined, value: undefined, displayName: tag.name, enrichmentState: menuContext?.state === "stale" ? "stale" : "current" }));
    }
  }
  return [...unique.values()];
}

function addDescriptor(target: Map<string, DimensionDescriptor>, descriptor: DimensionDescriptor | undefined): void { if (descriptor !== undefined) target.set(descriptor.key, descriptor); }

function itemDescriptor(selection: NormalizedSelection, menuContext: MenuDimensionContext | undefined): DimensionDescriptor {
  const reference = selection.item;
  const item = resolveMenuItem(reference, selection.itemGroup, menuContext);
  return Object.freeze({ key: referenceKey(reference) ?? "unresolved:item", guid: reference?.guid, multiLocationId: reference?.multiLocationId, value: undefined, displayName: item?.name, enrichmentState: item === undefined ? "unresolved" : menuContext?.state === "stale" ? "stale" : "current" });
}

function resolveMenuItem(reference: NormalizedReference | undefined, itemGroupReference: NormalizedReference | undefined, menuContext: MenuDimensionContext | undefined, requireItemGroup = false): MenuItemDimension | undefined {
  if (reference === undefined || menuContext === undefined) return undefined;
  if (requireItemGroup && itemGroupReference === undefined) return undefined;
  const byGuid = reference.guid === undefined || menuContext.ambiguousItemGuids.has(reference.guid) ? undefined : menuContext.itemsByGuid.get(reference.guid);
  const byMulti = reference.multiLocationId === undefined || menuContext.ambiguousMultiLocationIds.has(reference.multiLocationId) ? undefined : menuContext.itemsByMultiLocationId.get(reference.multiLocationId);
  if (byGuid !== undefined && byMulti !== undefined && byGuid.guid !== byMulti.guid) return undefined;
  const item = byGuid ?? byMulti;
  if (item === undefined) return undefined;
  const matchingGroups = item.itemGroups.filter((group) => itemGroupReference === undefined ? true : (itemGroupReference.guid === undefined || group.guid === itemGroupReference.guid) && (itemGroupReference.multiLocationId === undefined || group.multiLocationId === itemGroupReference.multiLocationId));
  if (matchingGroups.length !== 1) return undefined;
  const [matchingGroup] = matchingGroups;
  return matchingGroup === undefined ? undefined : Object.freeze({ ...item, itemTags: matchingGroup.itemTags });
}

function referenceDescriptor(dimension: string, reference: NormalizedReference | undefined, current: ReadonlyMap<string, { readonly name: string | undefined; readonly behavior?: string | undefined }> | undefined, contextState: DimensionContextState | undefined): DimensionDescriptor | undefined {
  const key = referenceKey(reference);
  if (key === undefined) return undefined;
  const currentValue = reference?.guid === undefined ? undefined : current?.get(reference.guid);
  const displayName = dimension === "dining_option" && currentValue?.behavior !== undefined ? `${currentValue.name ?? reference?.guid ?? "Dining option"} (${currentValue.behavior})` : currentValue?.name;
  return Object.freeze({ key, guid: reference?.guid, multiLocationId: reference?.multiLocationId, value: undefined, displayName, enrichmentState: currentValue === undefined ? "unresolved" : contextState === "stale" ? "stale" : "current" });
}

function valueDescriptor(dimension: string, value: string | undefined): DimensionDescriptor | undefined { return value === undefined || value.length === 0 ? undefined : Object.freeze({ key: `${dimension}:${value}`, guid: undefined, multiLocationId: undefined, value, displayName: value, enrichmentState: "historical" as const }); }
function unresolvedDescriptor(dimension: string): DimensionDescriptor { return Object.freeze({ key: `unresolved:${dimension}`, guid: undefined, multiLocationId: undefined, value: undefined, displayName: undefined, enrichmentState: "unresolved" as const }); }
function referenceKey(reference: NormalizedReference | undefined): string | undefined { return reference?.guid === undefined ? reference?.multiLocationId === undefined ? undefined : `multi:${reference.multiLocationId}` : `guid:${reference.guid}`; }
function getGroup(groups: Map<string, MutableGroup>, descriptor: DimensionDescriptor): MutableGroup { const existing = groups.get(descriptor.key); if (existing !== undefined) return existing; const created: MutableGroup = { descriptor, selectionCount: 0, checkCount: 0, quantity: ZERO_DECIMAL, grossSelectionAmountMinor: 0, netSelectionAmountMinor: 0, observedSelectionRefundAmountMinor: 0, selectionTaxAmountMinor: 0, attributedCheckAmountMinor: 0 }; groups.set(descriptor.key, created); return created; }
function countModifiers(selection: NormalizedSelection): number { let count = 0; const stack = [...selection.modifiers]; while (stack.length > 0) { const modifier = stack.pop(); if (modifier === undefined) continue; count += 1; stack.push(...modifier.modifiers); } return count; }
