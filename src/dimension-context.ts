import { z } from "zod";

import { awaitRefreshForCaller } from "./dimension-context-helpers.js";
import { normalizeMenuPayload } from "./dimension-menu-normalization.js";
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
  readonly itemGroups: readonly MenuItemGroupDimension[];
}

export interface MenuItemGroupDimension {
  readonly guid: string;
  readonly multiLocationId: string | undefined;
  readonly itemTags: readonly MenuTagDimension[];
}

export interface NamedConfigurationDimension {
  readonly guid: string;
  readonly name: string | undefined;
  readonly behavior?: string | undefined;
}

export interface MenuDimensionContext {
  readonly state: DimensionContextState;
  readonly publishedAt: string | undefined;
  readonly checkedAtEpochMs: number;
  readonly retrievedThroughEpochMs: number | undefined;
  /** Full-menu request supplying the current descriptive values. */
  readonly sourceProvenance: ReportProvenance;
  /** Metadata request proving/challenging freshness for this invocation. */
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
   * It is not an authoritative cursor: clock skew and Configuration's omission
   * of archived/deleted entities make incremental-only refresh insufficient
   * for active-set correctness.
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
 * Process-owned descriptive context. Orders remain the historical fact source;
 * current Menus/Configuration values may label a historical reference but
 * never replace its identity or amount.
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
    if (existing !== undefined) return awaitRefreshForCaller(existing, options.signal);
    const refresh = this.#getMenuContext(location, undefined);
    this.#menuRefreshes.set(restaurantGuid, refresh);
    void refresh.then(
      () => {
        if (this.#menuRefreshes.get(restaurantGuid) === refresh) {
          this.#menuRefreshes.delete(restaurantGuid);
        }
      },
      () => {
        if (this.#menuRefreshes.get(restaurantGuid) === refresh) {
          this.#menuRefreshes.delete(restaurantGuid);
        }
      },
    );
    return awaitRefreshForCaller(refresh, options.signal);
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
    if (existing !== undefined) return awaitRefreshForCaller(existing, options.signal);
    const refresh = this.#refreshConfiguration(location, undefined);
    this.#configRefreshes.set(restaurantGuid, refresh);
    void refresh.then(
      () => {
        if (this.#configRefreshes.get(restaurantGuid) === refresh) {
          this.#configRefreshes.delete(restaurantGuid);
        }
      },
      () => {
        if (this.#configRefreshes.get(restaurantGuid) === refresh) {
          this.#configRefreshes.delete(restaurantGuid);
        }
      },
    );
    return awaitRefreshForCaller(refresh, options.signal);
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
      return createUnresolvedMenuContext(
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
      return createUnresolvedMenuContext(
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

    return this.#loadChangedMenu(
      restaurantGuid, metadata.data.lastUpdated, cached, checkedAtEpochMs,
      freshnessProvenance, signal,
    );
  }

  async #loadChangedMenu(
    restaurantGuid: string,
    publishedAt: string,
    cached: MenuCacheEntry | undefined,
    checkedAtEpochMs: number,
    freshnessProvenance: ReportProvenance,
    signal: AbortSignal | undefined,
  ): Promise<MenuDimensionContext> {
    try {
      const menuResult = await this.#client.getJsonDetailedCancellable({ path: "/menus/v2/menus", restaurantGuid, rateLimitKey: "menus-v2-full" }, { signal });
      const parsed = normalizeMenuPayload(menuResult.body, restaurantGuid, publishedAt);
      const entry: MenuCacheEntry = Object.freeze({ publishedAt: parsed.publishedAt, retrievedThroughEpochMs: menuResult.retrievedAtEpochMs, sourceProvenance: provenanceFrom(menuResult), itemsByGuid: parsed.itemsByGuid, itemsByMultiLocationId: parsed.itemsByMultiLocationId, ambiguousItemGuids: parsed.ambiguousItemGuids, ambiguousMultiLocationIds: parsed.ambiguousMultiLocationIds });
      this.#menus.set(restaurantGuid, entry);
      return menuContextFromCache(entry, "current", checkedAtEpochMs, freshnessProvenance, []);
    } catch (error) {
      rethrowCancellation(error);
      if (cached !== undefined) return menuContextFromCache(cached, "stale", checkedAtEpochMs, freshnessProvenance, ["Menus full refresh failed after metadata changed; cached item context is stale."]);
      return createUnresolvedMenuContext(checkedAtEpochMs, freshnessProvenance, "Menus full refresh failed; item enrichment is unresolved.");
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
      // The Standard transport serializes data fetches already. Keep these
      // source reads sequential so request-ID provenance is deterministic and
      // a failed/restarted endpoint is fully reconciled before the next one.
      const salesCategories = await this.#configurationEndpoint(
        restaurantGuid,
        "/config/v2/salesCategories",
        "config-sales-categories",
        provenance,
        signal,
        namedConfigSchema,
      );
      const revenueCenters = await this.#configurationEndpoint(
        restaurantGuid,
        "/config/v2/revenueCenters",
        "config-revenue-centers",
        provenance,
        signal,
        namedConfigSchema,
      );
      const diningOptions = await this.#configurationEndpoint(
        restaurantGuid,
        "/config/v2/diningOptions",
        "config-dining-options",
        provenance,
        signal,
        diningOptionSchema,
      );
      const restaurantServices = await this.#configurationEndpoint(
        restaurantGuid,
        "/config/v2/restaurantServices",
        "config-restaurant-services",
        provenance,
        signal,
        namedConfigSchema,
      );

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
      return createUnresolvedConfigContext(
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

export function createUnresolvedMenuContext(
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
    ambiguousItemGuids: new Set<string>(),
    ambiguousMultiLocationIds: new Set<string>(),
  });
}

export function createUnavailableMenuContext(
  checkedAtEpochMs: number,
  warning: string,
): MenuDimensionContext {
  return createUnresolvedMenuContext(
    checkedAtEpochMs,
    emptyProvenance(),
    warning,
  );
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

export function createUnresolvedConfigContext(
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
