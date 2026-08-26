import { z } from "zod";

import type { ToastLocation } from "./locations.js";
import type { RateLimitAwareToastHttpClient } from "./rate-limited-client.js";
import {
  ReportProvenanceCollector,
  type ReportProvenance,
} from "./report-core.js";
import {
  ToastHttpError,
  type ToastDetailedJsonResult,
} from "./transport.js";

const CONFIG_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const guidSchema = z.string().uuid();
const nonBlankSchema = z.string().min(1).refine(
  (value) => value.trim().length > 0,
);
const metadataSchema = z.object({
  restaurantGuid: guidSchema,
  lastUpdated: z.string().min(1),
});
const namedConfigSchema = z.object({
  guid: guidSchema,
  name: nonBlankSchema.optional(),
}).passthrough();
const diningOptionSchema = namedConfigSchema.extend({
  behavior: z.string().min(1).optional(),
}).passthrough();

export type DimensionContextState = "current" | "stale" | "unresolved";

export interface MenuTagDimension {
  readonly guid: string;
  readonly name: string;
}

export interface MenuItemDimension {
  readonly guid: string;
  readonly multiLocationId: string | undefined;
  readonly name: string;
  readonly itemTags: readonly MenuTagDimension[];
  readonly currentSalesCategoryGuid: string | undefined;
  readonly currentSalesCategoryName: string | undefined;
}

export interface NamedConfigurationDimension {
  readonly guid: string;
  readonly name: string | undefined;
  readonly behavior?: string | undefined;
}

export interface MenuDimensionContext {
  readonly state: DimensionContextState;
  readonly publishedAt: string | undefined;
  /** Time at which `/menus/v2/metadata` was attempted for this invocation. */
  readonly checkedAtEpochMs: number;
  /** Retrieval time of the full menu snapshot supplying descriptive values. */
  readonly retrievedThroughEpochMs: number | undefined;
  /** Successful request(s) that supplied the cached/full descriptive source. */
  readonly sourceProvenance: ReportProvenance;
  /** Successful metadata request proving or challenging freshness now. */
  readonly freshnessProvenance: ReportProvenance;
  readonly warnings: readonly string[];
  readonly itemsByGuid: ReadonlyMap<string, MenuItemDimension>;
  readonly itemsByMultiLocationId: ReadonlyMap<string, MenuItemDimension>;
  readonly ambiguousItemGuids: ReadonlySet<string>;
  readonly ambiguousMultiLocationIds: ReadonlySet<string>;
}

export interface ConfigurationDimensionContext {
  readonly state: DimensionContextState;
  readonly retrievedThroughEpochMs: number | undefined;
  /**
   * Local refresh-start timestamp retained as a future incremental candidate.
   * It is not used as the sole correctness source because server/client clock
   * skew and omitted archived/deleted entities make incremental-only refresh
   * insufficient for authoritative active-set reconciliation.
   */
  readonly lastModifiedCursor: string | undefined;
  readonly provenance: ReportProvenance;
  readonly warnings: readonly string[];
  readonly salesCategories: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly revenueCenters: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly diningOptions: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly restaurantServices: ReadonlyMap<string, NamedConfigurationDimension>;
}

interface MenuCacheEntry {
  readonly publishedAt: string;
  readonly retrievedThroughEpochMs: number;
  readonly sourceProvenance: ReportProvenance;
  readonly itemsByGuid: ReadonlyMap<string, MenuItemDimension>;
  readonly itemsByMultiLocationId: ReadonlyMap<string, MenuItemDimension>;
  readonly ambiguousItemGuids: ReadonlySet<string>;
  readonly ambiguousMultiLocationIds: ReadonlySet<string>;
}

interface ConfigCacheEntry {
  readonly retrievedThroughEpochMs: number;
  readonly lastModifiedCursor: string;
  readonly provenance: ReportProvenance;
  readonly salesCategories: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly revenueCenters: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly diningOptions: ReadonlyMap<string, NamedConfigurationDimension>;
  readonly restaurantServices: ReadonlyMap<string, NamedConfigurationDimension>;
}

/**
 * Process-owned, in-memory descriptive context for T3-003. Orders remain the
 * transactional authority. This provider never rewrites order references and
 * never persists menu/configuration payloads to disk.
 */
export class StandardDimensionContextProvider {
  #client: RateLimitAwareToastHttpClient;
  #now: () => number;
  #menus = new Map<string, MenuCacheEntry>();
  #configs = new Map<string, ConfigCacheEntry>();
  #menuRefreshes = new Map<string, Promise<MenuDimensionContext>>();
  #configRefreshes = new Map<string, Promise<ConfigurationDimensionContext>>();

  constructor(
    client: RateLimitAwareToastHttpClient,
    now: () => number,
  ) {
    this.#client = client;
    this.#now = now;
  }

  async getMenuContext(
    location: ToastLocation,
    options: { readonly signal?: AbortSignal | undefined } = {},
  ): Promise<MenuDimensionContext> {
    const restaurantGuid = location.restaurantGuid.toLowerCase();
    const existing = this.#menuRefreshes.get(restaurantGuid);
    if (existing !== undefined) return existing;

    const refresh = this.#getMenuContext(location, options.signal);
    this.#menuRefreshes.set(restaurantGuid, refresh);
    try {
      return await refresh;
    } finally {
      if (this.#menuRefreshes.get(restaurantGuid) === refresh) {
        this.#menuRefreshes.delete(restaurantGuid);
      }
    }
  }

  async getConfigurationContext(
    location: ToastLocation,
    options: { readonly signal?: AbortSignal | undefined } = {},
  ): Promise<ConfigurationDimensionContext> {
    const restaurantGuid = location.restaurantGuid.toLowerCase();
    const cached = this.#configs.get(restaurantGuid);
    const now = this.#now();
    if (
      cached !== undefined
      && now >= cached.retrievedThroughEpochMs
      && now - cached.retrievedThroughEpochMs < CONFIG_MAX_AGE_MS
    ) {
      return configContextFromCache(cached, "current", []);
    }

    const existing = this.#configRefreshes.get(restaurantGuid);
    if (existing !== undefined) return existing;
    const refresh = this.#refreshConfiguration(location, options.signal);
    this.#configRefreshes.set(restaurantGuid, refresh);
    try {
      return await refresh;
    } finally {
      if (this.#configRefreshes.get(restaurantGuid) === refresh) {
        this.#configRefreshes.delete(restaurantGuid);
      }
    }
  }

  async #getMenuContext(
    location: ToastLocation,
    signal: AbortSignal | undefined,
  ): Promise<MenuDimensionContext> {
    const restaurantGuid = location.restaurantGuid.toLowerCase();
    const cached = this.#menus.get(restaurantGuid);
    const checkedAtEpochMs = this.#now();
    let metadataResult: ToastDetailedJsonResult;

    try {
      metadataResult = await this.#client.getJsonDetailedCancellable(
        {
          path: "/menus/v2/metadata",
          restaurantGuid,
          rateLimitKey: "menus-v2-metadata",
        },
        { signal },
      );
    } catch (error) {
      rethrowCancellation(error);
      if (cached !== undefined) {
        return menuContextFromCache(
          cached,
          "stale",
          checkedAtEpochMs,
          emptyProvenance(),
          ["Menus metadata refresh failed; descriptive item context is stale."],
        );
      }
      return unresolvedMenuContext(
        checkedAtEpochMs,
        emptyProvenance(),
        "Menus metadata could not be retrieved; item enrichment is unresolved.",
      );
    }

    const freshnessProvenance = provenanceFrom(metadataResult);
    const metadata = metadataSchema.safeParse(metadataResult.body);
    if (
      !metadata.success
      || metadata.data.restaurantGuid.toLowerCase() !== restaurantGuid
      || !isValidDateTime(metadata.data.lastUpdated)
    ) {
      if (cached !== undefined) {
        return menuContextFromCache(
          cached,
          "stale",
          checkedAtEpochMs,
          freshnessProvenance,
          ["Menus metadata was malformed or mismatched; cached item context is stale."],
        );
      }
      return unresolvedMenuContext(
        checkedAtEpochMs,
        freshnessProvenance,
        "Menus metadata was malformed or mismatched; item enrichment is unresolved.",
      );
    }

    if (cached?.publishedAt === metadata.data.lastUpdated) {
      return menuContextFromCache(
        cached,
        "current",
        checkedAtEpochMs,
        freshnessProvenance,
        [],
      );
    }

    try {
      const menuResult = await this.#client.getJsonDetailedCancellable(
        {
          path: "/menus/v2/menus",
          restaurantGuid,
          rateLimitKey: "menus-v2-full",
        },
        { signal },
      );
      const parsed = normalizeMenuPayload(
        menuResult.body,
        restaurantGuid,
        metadata.data.lastUpdated,
      );
      const entry: MenuCacheEntry = Object.freeze({
        publishedAt: parsed.publishedAt,
        retrievedThroughEpochMs: menuResult.retrievedAtEpochMs,
        sourceProvenance: provenanceFrom(menuResult),
        itemsByGuid: parsed.itemsByGuid,
        itemsByMultiLocationId: parsed.itemsByMultiLocationId,
        ambiguousItemGuids: parsed.ambiguousItemGuids,
        ambiguousMultiLocationIds: parsed.ambiguousMultiLocationIds,
      });
      this.#menus.set(restaurantGuid, entry);
      return menuContextFromCache(
        entry,
        "current",
        checkedAtEpochMs,
        freshnessProvenance,
        [],
      );
    } catch (error) {
      rethrowCancellation(error);
      if (cached !== undefined) {
        return menuContextFromCache(
          cached,
          "stale",
          checkedAtEpochMs,
          freshnessProvenance,
          ["Menus full refresh failed after metadata changed; cached item context is stale."],
        );
      }
      return unresolvedMenuContext(
        checkedAtEpochMs,
        freshnessProvenance,
        "Menus full refresh failed; item enrichment is unresolved.",
      );
    }
  }

  async #refreshConfiguration(
    location: ToastLocation,
    signal: AbortSignal | undefined,
  ): Promise<ConfigurationDimensionContext> {
    const restaurantGuid = location.restaurantGuid.toLowerCase();
    const cached = this.#configs.get(restaurantGuid);
    const refreshStartedAt = this.#now();
    const provenance = new ReportProvenanceCollector();

    try {
      const [salesCategories, revenueCenters, diningOptions, restaurantServices] =
        await Promise.all([
          this.#configurationEndpoint(
            restaurantGuid,
            "/config/v2/salesCategories",
            "config-sales-categories",
            provenance,
            signal,
            namedConfigSchema,
          ),
          this.#configurationEndpoint(
            restaurantGuid,
            "/config/v2/revenueCenters",
            "config-revenue-centers",
            provenance,
            signal,
            namedConfigSchema,
          ),
          this.#configurationEndpoint(
            restaurantGuid,
            "/config/v2/diningOptions",
            "config-dining-options",
            provenance,
            signal,
            diningOptionSchema,
          ),
          this.#configurationEndpoint(
            restaurantGuid,
            "/config/v2/restaurantServices",
            "config-restaurant-services",
            provenance,
            signal,
            namedConfigSchema,
          ),
        ]);

      const snapshot = provenance.snapshot();
      const entry: ConfigCacheEntry = Object.freeze({
        retrievedThroughEpochMs:
          snapshot.retrievedThroughEpochMs ?? refreshStartedAt,
        lastModifiedCursor: new Date(refreshStartedAt).toISOString(),
        provenance: snapshot,
        salesCategories,
        revenueCenters,
        diningOptions,
        restaurantServices,
      });
      this.#configs.set(restaurantGuid, entry);
      return configContextFromCache(entry, "current", []);
    } catch (error) {
      rethrowCancellation(error);
      if (cached !== undefined) {
        return configContextFromCache(
          cached,
          "stale",
          ["Configuration refresh failed; descriptive dimensions are stale."],
        );
      }
      return unresolvedConfigContext(
        "Configuration could not be retrieved; descriptive dimensions are unresolved.",
      );
    }
  }

  async #configurationEndpoint<T extends z.ZodTypeAny>(
    restaurantGuid: string,
    path: `/${string}`,
    rateLimitKey: string,
    provenance: ReportProvenanceCollector,
    signal: AbortSignal | undefined,
    schema: T,
  ): Promise<ReadonlyMap<string, NamedConfigurationDimension>> {
    const pages = await this.#client.getConfigurationPagesDetailedCancellable(
      { path, restaurantGuid, rateLimitKey },
      { signal },
    );
    const result = new Map<string, NamedConfigurationDimension>();

    for (const page of pages) {
      provenance.add(page);
      const parsed = z.array(schema).safeParse(page.body);
      if (!parsed.success) {
        throw new Error("invalid configuration dimension source");
      }
      for (const raw of parsed.data as Array<z.infer<T>>) {
        const value = raw as {
          guid: string;
          name?: string;
          behavior?: string;
        };
        const guid = value.guid.toLowerCase();
        if (result.has(guid)) {
          throw new Error("repeated configuration dimension GUID");
        }
        result.set(guid, Object.freeze({
          guid,
          name: value.name,
          ...(value.behavior === undefined ? {} : { behavior: value.behavior }),
        }));
      }
    }
    return result;
  }
}

function normalizeMenuPayload(
  body: unknown,
  restaurantGuid: string,
  metadataPublishedAt: string,
): Omit<MenuCacheEntry, "retrievedThroughEpochMs" | "sourceProvenance"> {
  if (!isRecord(body)) throw new Error("invalid menus payload");
  const payloadRestaurantGuid = guidSchema.safeParse(body.restaurantGuid);
  const lastUpdated = z.string().min(1).safeParse(body.lastUpdated);
  if (
    !payloadRestaurantGuid.success
    || payloadRestaurantGuid.data.toLowerCase() !== restaurantGuid
    || !lastUpdated.success
    || !isValidDateTime(lastUpdated.data)
  ) {
    throw new Error("invalid menus payload identity");
  }

  // A full menu older than metadata is provably stale. A newer full response
  // is valid because another publish may have raced the metadata call.
  if (Date.parse(lastUpdated.data) < Date.parse(metadataPublishedAt)) {
    throw new Error("full menu predates metadata");
  }

  const itemsByGuid = new Map<string, MenuItemDimension>();
  const itemsByMultiLocationId = new Map<string, MenuItemDimension>();
  const ambiguousItemGuids = new Set<string>();
  const ambiguousMultiLocationIds = new Set<string>();

  const menus = Array.isArray(body.menus) ? body.menus : [];
  const stack = [...menus];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    if (Array.isArray(node.menuGroups)) stack.push(...node.menuGroups);
    if (Array.isArray(node.menuItems)) {
      for (const rawItem of node.menuItems) {
        const item = normalizeMenuItem(rawItem);
        if (item !== undefined) {
          mergeMenuItem(
            item,
            itemsByGuid,
            itemsByMultiLocationId,
            ambiguousItemGuids,
            ambiguousMultiLocationIds,
          );
        }
      }
    }
  }

  // Menus V2 documents this as a restaurant-level map keyed by referenceId.
  if (isRecord(body.modifierOptionReferences)) {
    for (const rawItem of Object.values(body.modifierOptionReferences)) {
      const item = normalizeMenuItem(rawItem);
      if (item !== undefined) {
        mergeMenuItem(
          item,
          itemsByGuid,
          itemsByMultiLocationId,
          ambiguousItemGuids,
          ambiguousMultiLocationIds,
        );
      }
    }
  }

  return Object.freeze({
    publishedAt: lastUpdated.data,
    itemsByGuid,
    itemsByMultiLocationId,
    ambiguousItemGuids,
    ambiguousMultiLocationIds,
  });
}

function normalizeMenuItem(raw: unknown): MenuItemDimension | undefined {
  if (!isRecord(raw)) return undefined;
  const guid = guidSchema.safeParse(raw.guid);
  const name = nonBlankSchema.safeParse(raw.name);
  if (!guid.success || !name.success) return undefined;

  const tags: MenuTagDimension[] = [];
  if (Array.isArray(raw.itemTags)) {
    const seenTags = new Set<string>();
    for (const rawTag of raw.itemTags) {
      if (!isRecord(rawTag)) continue;
      const tagGuid = guidSchema.safeParse(rawTag.guid);
      const tagName = nonBlankSchema.safeParse(rawTag.name);
      if (!tagGuid.success || !tagName.success) continue;
      const normalizedGuid = tagGuid.data.toLowerCase();
      if (seenTags.has(normalizedGuid)) continue;
      seenTags.add(normalizedGuid);
      tags.push(Object.freeze({ guid: normalizedGuid, name: tagName.data }));
    }
  }
  tags.sort((left, right) =>
    left.guid.localeCompare(right.guid) || left.name.localeCompare(right.name));

  let currentSalesCategoryGuid: string | undefined;
  let currentSalesCategoryName: string | undefined;
  if (isRecord(raw.salesCategory)) {
    const categoryGuid = guidSchema.safeParse(raw.salesCategory.guid);
    if (categoryGuid.success) {
      currentSalesCategoryGuid = categoryGuid.data.toLowerCase();
    }
    const categoryName = nonBlankSchema.safeParse(raw.salesCategory.name);
    if (categoryName.success) {
      currentSalesCategoryName = categoryName.data;
    }
  }

  const multiLocationId = typeof raw.multiLocationId === "string"
    && raw.multiLocationId.length > 0
    ? raw.multiLocationId
    : undefined;

  return Object.freeze({
    guid: guid.data.toLowerCase(),
    multiLocationId,
    name: name.data,
    itemTags: Object.freeze(tags),
    currentSalesCategoryGuid,
    currentSalesCategoryName,
  });
}

function mergeMenuItem(
  item: MenuItemDimension,
  byGuid: Map<string, MenuItemDimension>,
  byMulti: Map<string, MenuItemDimension>,
  ambiguousGuids: Set<string>,
  ambiguousMulti: Set<string>,
): void {
  mergeIdentity(item.guid, item, byGuid, ambiguousGuids);
  if (item.multiLocationId !== undefined) {
    mergeIdentity(item.multiLocationId, item, byMulti, ambiguousMulti);
  }
}

function mergeIdentity(
  key: string,
  item: MenuItemDimension,
  target: Map<string, MenuItemDimension>,
  ambiguous: Set<string>,
): void {
  if (ambiguous.has(key)) return;
  const existing = target.get(key);
  if (existing === undefined) {
    target.set(key, item);
    return;
  }
  if (!sameMenuItem(existing, item)) {
    target.delete(key);
    ambiguous.add(key);
  }
}

function sameMenuItem(
  left: MenuItemDimension,
  right: MenuItemDimension,
): boolean {
  return left.guid === right.guid
    && left.multiLocationId === right.multiLocationId
    && left.name === right.name
    && left.currentSalesCategoryGuid === right.currentSalesCategoryGuid
    && left.currentSalesCategoryName === right.currentSalesCategoryName
    && left.itemTags.length === right.itemTags.length
    && left.itemTags.every((tag, index) => {
      const other = right.itemTags[index];
      return other !== undefined
        && tag.guid === other.guid
        && tag.name === other.name;
    });
}

function menuCacheFields(cache: MenuCacheEntry) {
  return {
    publishedAt: cache.publishedAt,
    retrievedThroughEpochMs: cache.retrievedThroughEpochMs,
    sourceProvenance: cache.sourceProvenance,
    itemsByGuid: cache.itemsByGuid,
    itemsByMultiLocationId: cache.itemsByMultiLocationId,
    ambiguousItemGuids: cache.ambiguousItemGuids,
    ambiguousMultiLocationIds: cache.ambiguousMultiLocationIds,
  };
}

function menuContextFromCache(
  cache: MenuCacheEntry,
  state: "current" | "stale",
  checkedAtEpochMs: number,
  freshnessProvenance: ReportProvenance,
  warnings: readonly string[],
): MenuDimensionContext {
  return Object.freeze({
    ...menuCacheFields(cache),
    state,
    checkedAtEpochMs,
    freshnessProvenance,
    warnings: Object.freeze([...warnings]),
  });
}

function unresolvedMenuContext(
  checkedAtEpochMs: number,
  freshnessProvenance: ReportProvenance,
  warning: string,
): MenuDimensionContext {
  return Object.freeze({
    state: "unresolved" as const,
    publishedAt: undefined,
    checkedAtEpochMs,
    retrievedThroughEpochMs: undefined,
    sourceProvenance: emptyProvenance(),
    freshnessProvenance,
    warnings: Object.freeze([warning]),
    itemsByGuid: new Map(),
    itemsByMultiLocationId: new Map(),
    ambiguousItemGuids: new Set(),
    ambiguousMultiLocationIds: new Set(),
  });
}

function configContextFromCache(
  cache: ConfigCacheEntry,
  state: "current" | "stale",
  warnings: readonly string[],
): ConfigurationDimensionContext {
  return Object.freeze({
    state,
    retrievedThroughEpochMs: cache.retrievedThroughEpochMs,
    lastModifiedCursor: cache.lastModifiedCursor,
    provenance: cache.provenance,
    warnings: Object.freeze([...warnings]),
    salesCategories: cache.salesCategories,
    revenueCenters: cache.revenueCenters,
    diningOptions: cache.diningOptions,
    restaurantServices: cache.restaurantServices,
  });
}

function unresolvedConfigContext(
  warning: string,
): ConfigurationDimensionContext {
  return Object.freeze({
    state: "unresolved" as const,
    retrievedThroughEpochMs: undefined,
    lastModifiedCursor: undefined,
    provenance: emptyProvenance(),
    warnings: Object.freeze([warning]),
    salesCategories: new Map(),
    revenueCenters: new Map(),
    diningOptions: new Map(),
    restaurantServices: new Map(),
  });
}

function provenanceFrom(result: ToastDetailedJsonResult): ReportProvenance {
  const collector = new ReportProvenanceCollector();
  collector.add(result);
  return collector.snapshot();
}

function emptyProvenance(): ReportProvenance {
  return Object.freeze({
    retrievedThroughEpochMs: undefined,
    upstreamRequestIds: Object.freeze([]),
    upstreamRequestIdCount: 0,
    upstreamRequestIdsTruncated: false,
  });
}

function rethrowCancellation(error: unknown): void {
  if (error instanceof ToastHttpError && error.code === "request_cancelled") {
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
