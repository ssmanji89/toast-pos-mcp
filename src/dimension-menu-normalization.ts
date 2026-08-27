import { z } from "zod";

import type {
  MenuItemDimension,
  MenuItemGroupDimension,
  MenuTagDimension,
} from "./dimension-context.js";

const guidSchema = z.string().uuid();
const nonBlankSchema = z.string().min(1).refine((value) => value.trim().length > 0);

export interface NormalizedMenuPayload {
  readonly publishedAt: string;
  readonly itemsByGuid: ReadonlyMap<string, MenuItemDimension>;
  readonly itemsByMultiLocationId: ReadonlyMap<string, MenuItemDimension>;
  readonly ambiguousItemGuids: ReadonlySet<string>;
  readonly ambiguousMultiLocationIds: ReadonlySet<string>;
}

export function normalizeMenuPayload(body: unknown, restaurantGuid: string, metadataPublishedAt: string): NormalizedMenuPayload {
  if (!isRecord(body)) throw new Error("invalid menus payload");
  const payloadRestaurantGuid = guidSchema.safeParse(body.restaurantGuid);
  const lastUpdated = z.string().min(1).safeParse(body.lastUpdated);
  if (!payloadRestaurantGuid.success || payloadRestaurantGuid.data.toLowerCase() !== restaurantGuid || !lastUpdated.success || !isValidDateTime(lastUpdated.data)) throw new Error("invalid menus payload identity");
  if (Date.parse(lastUpdated.data) < Date.parse(metadataPublishedAt)) throw new Error("full menu predates metadata");
  const itemsByGuid = new Map<string, MenuItemDimension>();
  const itemsByMultiLocationId = new Map<string, MenuItemDimension>();
  const ambiguousItemGuids = new Set<string>();
  const ambiguousMultiLocationIds = new Set<string>();
  if (!Array.isArray(body.menus)) throw new Error("invalid menus payload structure");
  const stack: Array<{ readonly node: unknown; readonly itemGroup: MenuItemGroupDimension | undefined }> = body.menus.map((node) => ({ node, itemGroup: undefined }));
  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined || !isRecord(entry.node)) throw new Error("invalid menus payload structure");
    const menuGroups = entry.node.menuGroups;
    const menuItems = entry.node.menuItems;
    if (menuGroups !== undefined && !Array.isArray(menuGroups)) throw new Error("invalid menu groups structure");
    if (menuItems !== undefined && !Array.isArray(menuItems)) throw new Error("invalid menu items structure");
    if (Array.isArray(menuGroups)) for (const group of menuGroups) { const itemGroup = normalizeMenuItemGroup(group); if (itemGroup === undefined) throw new Error("invalid menu group identity"); stack.push({ node: group, itemGroup }); }
    if (Array.isArray(menuItems)) { if (entry.itemGroup === undefined) throw new Error("menu item has no group ancestry"); for (const rawItem of menuItems) mergeMenuItem(normalizeMenuItem(rawItem, entry.itemGroup), itemsByGuid, itemsByMultiLocationId, ambiguousItemGuids, ambiguousMultiLocationIds); }
  }
  return Object.freeze({ publishedAt: lastUpdated.data, itemsByGuid, itemsByMultiLocationId, ambiguousItemGuids, ambiguousMultiLocationIds });
}

function normalizeMenuItemGroup(raw: unknown): MenuItemGroupDimension | undefined { if (!isRecord(raw)) return undefined; const guid = guidSchema.safeParse(raw.guid); return !guid.success ? undefined : Object.freeze({ guid: guid.data.toLowerCase(), multiLocationId: nonEmptyString(raw.multiLocationId), itemTags: Object.freeze([]) }); }
function normalizeMenuItem(raw: unknown, itemGroup: MenuItemGroupDimension): MenuItemDimension {
  if (!isRecord(raw)) throw new Error("invalid menu item");
  const guid = guidSchema.safeParse(raw.guid); const name = nonBlankSchema.safeParse(raw.name);
  if (!guid.success || !name.success || !Array.isArray(raw.itemTags)) throw new Error("invalid menu item identity");
  const tags: MenuTagDimension[] = []; const seenTags = new Set<string>();
  for (const rawTag of raw.itemTags) { if (!isRecord(rawTag)) throw new Error("invalid menu item tag"); const tagGuid = guidSchema.safeParse(rawTag.guid); const tagName = nonBlankSchema.safeParse(rawTag.name); if (!tagGuid.success || !tagName.success) throw new Error("invalid menu item tag"); const normalizedGuid = tagGuid.data.toLowerCase(); if (seenTags.has(normalizedGuid)) throw new Error("repeated menu item tag identity"); seenTags.add(normalizedGuid); tags.push(Object.freeze({ guid: normalizedGuid, name: tagName.data })); }
  tags.sort((left, right) => left.guid.localeCompare(right.guid) || left.name.localeCompare(right.name));
  return Object.freeze({ guid: guid.data.toLowerCase(), multiLocationId: nonEmptyString(raw.multiLocationId), name: name.data, itemTags: Object.freeze(tags), itemGroups: Object.freeze([Object.freeze({ ...itemGroup, itemTags: Object.freeze(tags) })]) });
}
function nonEmptyString(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function mergeMenuItem(item: MenuItemDimension, byGuid: Map<string, MenuItemDimension>, byMulti: Map<string, MenuItemDimension>, ambiguousGuids: Set<string>, ambiguousMulti: Set<string>): void { mergeIdentity(item.guid, item, byGuid, ambiguousGuids); if (item.multiLocationId !== undefined) mergeIdentity(item.multiLocationId, item, byMulti, ambiguousMulti); }
function mergeIdentity(key: string, item: MenuItemDimension, target: Map<string, MenuItemDimension>, ambiguous: Set<string>): void { if (ambiguous.has(key)) return; const existing = target.get(key); if (existing === undefined) { target.set(key, item); return; } if (!sameMenuItem(existing, item)) { target.delete(key); ambiguous.add(key); return; } target.set(key, mergeMenuItemGroups(existing, item)); }
function mergeMenuItemGroups(left: MenuItemDimension, right: MenuItemDimension): MenuItemDimension { const groups = new Map<string, MenuItemGroupDimension>(); for (const group of [...left.itemGroups, ...right.itemGroups]) { const key = group.multiLocationId === undefined ? group.guid : `${group.guid}:${group.multiLocationId}`; const existing = groups.get(key); if (existing !== undefined && !sameTags(existing.itemTags, group.itemTags)) throw new Error("conflicting menu item group tags"); groups.set(key, group); } return Object.freeze({ ...left, itemGroups: Object.freeze([...groups.values()].sort((a, b) => a.guid.localeCompare(b.guid) || (a.multiLocationId ?? "").localeCompare(b.multiLocationId ?? ""))) }); }
function sameTags(left: readonly MenuTagDimension[], right: readonly MenuTagDimension[]): boolean { return left.length === right.length && left.every((tag, index) => tag.guid === right[index]?.guid && tag.name === right[index]?.name); }
function sameMenuItem(left: MenuItemDimension, right: MenuItemDimension): boolean { return left.guid === right.guid && left.multiLocationId === right.multiLocationId && left.name === right.name; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isValidDateTime(value: string): boolean { return Number.isFinite(Date.parse(value)); }
