import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const STDIO_CONNECT_TIMEOUT_MS = 10_000;
const REPORT_SERVER_PATH = path.resolve(
  process.cwd(),
  "dist-test",
  "test",
  "fixtures",
  "stdio-report-server.js",
);
const BUSINESS_DATE = 20260816;
const INACCESSIBLE_RESTAURANT_GUID =
  "00000000-0000-4000-8000-000000009999";
const ITEM_GUID = "00000000-0000-4000-8000-000000000811";
const SECOND_ITEM_GUID = "00000000-0000-4000-8000-000000000812";
const SALES_CATEGORY_GUID = "00000000-0000-4000-8000-000000000814";
const TAG_LUNCH_GUID = "00000000-0000-4000-8000-000000000818";
const TAG_UNKNOWN_GUID = "00000000-0000-4000-8000-000000000819";

type FixtureScenario =
  | "success"
  | "missing-scope"
  | "malformed-source"
  | "broken-pagination"
  | "cancel-active-report"
  | "rate-limit-wait"
  | "missing-menu-item"
  | "menu-refresh-fails-after-cache"
  | "menu-unavailable-no-cache"
  | "missing-config-category"
  | "malformed-menu-structure"
  | "missing-menus-scope"
  | "missing-config-scope"
  | "multi-group-tags"
  | "missing-item-group"
  | "conflicting-item-group";

test(
  "production-wired pinned 2026-07-28 stdio lists and calls both Standard report tools",
  { timeout: 30_000 },
  async () => {
    const connection = createConnection("modern");
    try {
      await connectWithTimeout(connection);
      const listed = await connection.client.listTools();
      const names = listed.tools.map((tool) => tool.name).sort();
      assert.ok(names.includes("toast_sales_summary"));
      assert.ok(names.includes("toast_payment_summary"));
      assert.ok(names.includes("toast_item_sales_summary"));

      const sales = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(sales.isError, true);
      const salesOutput = structured(sales.structuredContent);
      assert.equal(salesOutput.schemaVersion, 1);
      assert.equal(salesOutput.status, "complete");
      assert.equal(salesOutput.report, "sales_summary");
      assert.equal(salesOutput.restaurantName, "Synthetic Tool Cafe");
      assert.equal(salesOutput.requestedBusinessDate, BUSINESS_DATE);
      assert.equal(salesOutput.effectiveBusinessDate, BUSINESS_DATE);
      assert.equal(structured(salesOutput.contextFreshness).maxAgeMs, 21_600_000);
      const combined = structured(salesOutput.combined);
      assert.equal(combined.grossCheckAmountMinor, 1000);
      assert.equal(combined.netOrderAmountMinor, 900);
      assert.equal(combined.netSalesMinor, 600);
      assert.equal(combined.ordersEmbeddedRefundAmountMinor, 200);
      assert.equal(combined.fundraisingContributionAmountMinor, 100);
      assert.ok(!JSON.stringify(salesOutput).includes("must-not-leak"));

      const payments = await connection.client.callTool({
        name: "toast_payment_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(payments.isError, true);
      const paymentOutput = structured(payments.structuredContent);
      assert.equal(paymentOutput.schemaVersion, 1);
      assert.equal(paymentOutput.status, "complete");
      assert.equal(paymentOutput.eventListCount, 3);
      assert.equal(paymentOutput.paymentDetailsProcessed, 1);
      assert.equal(structured(paymentOutput.paid).amountMinor, 1000);
      assert.equal(structured(paymentOutput.refunded).refundAmountMinor, 200);
      assert.equal(structured(paymentOutput.voided).amountMinor, 1000);
      assert.ok(!JSON.stringify(paymentOutput).includes("must-not-leak"));

      const itemsFirst = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(itemsFirst.isError, true);
      const itemOutput = structured(itemsFirst.structuredContent);
      assert.equal(itemOutput.status, "complete");
      assert.equal(itemOutput.report, "item_sales_summary");
      assert.equal(itemOutput.dimension, "item");
      assert.equal(itemOutput.metricBasis, "selection");
      assert.equal(itemOutput.nonAdditiveAcrossGroups, false);
      assert.equal(itemOutput.modifierSelectionsTraversed, 2);
      assert.equal(itemOutput.unresolvedContributionCount, 0);
      assert.equal(structured(itemOutput.dimensionContext).menuState, "current");
      assert.deepEqual(
        structured(structured(itemOutput.dimensionContext).menuSourceProvenance)
          .upstreamRequestIds,
        ["fixture-menu-full-1"],
      );
      assert.deepEqual(
        structured(structured(itemOutput.dimensionContext).menuFreshnessProvenance)
          .upstreamRequestIds,
        ["fixture-menu-metadata-1"],
      );

      const firstItem = groupByGuid(itemOutput, ITEM_GUID);
      const secondItem = groupByGuid(itemOutput, SECOND_ITEM_GUID);
      assert.equal(firstItem.displayName, "Current Burger");
      assert.equal(secondItem.displayName, "Current Burger");
      assert.notEqual(firstItem.key, secondItem.key);
      assert.equal(firstItem.quantity, "0.5");
      assert.equal(firstItem.grossSelectionAmountMinor, 900);
      assert.equal(firstItem.netSelectionAmountMinor, 800);
      assert.equal(secondItem.quantity, "1");
      assert.equal(secondItem.netSelectionAmountMinor, 200);
      assert.equal(
        firstItem.netSelectionAmountMinor + secondItem.netSelectionAmountMinor,
        1000,
      );

      const itemsSecond = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(itemsSecond.isError, true);
      const secondOutput = structured(itemsSecond.structuredContent);
      assert.equal(structured(secondOutput.dimensionContext).menuState, "current");
      assert.deepEqual(
        structured(structured(secondOutput.dimensionContext).menuFreshnessProvenance)
          .upstreamRequestIds,
        ["fixture-menu-metadata-2"],
      );
      assert.deepEqual(
        structured(structured(secondOutput.dimensionContext).menuSourceProvenance)
          .upstreamRequestIds,
        ["fixture-menu-full-1"],
      );

      const categories = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: {
          businessDate: BUSINESS_DATE,
          dimension: "sales_category",
        },
      });
      assert.notEqual(categories.isError, true);
      const categoryOutput = structured(categories.structuredContent);
      assert.equal(categoryOutput.metricBasis, "check_attribution");
      assert.equal(categoryOutput.nonAdditiveAcrossGroups, true);
      assert.equal(
        structured(categoryOutput.dimensionContext).configurationState,
        "current",
      );
      const category = groupByGuid(categoryOutput, SALES_CATEGORY_GUID);
      assert.equal(category.displayName, "Current Entrees");
      assert.equal(category.attributedCheckAmountMinor, 1000);
      assert.ok(
        structured(categoryOutput.dimensionContext)
          .configurationLastModifiedCursor,
      );

      // Every config endpoint in the fixture throws on another full snapshot.
      // This second successful call therefore proves same-day cache reuse.
      const categoriesAgain = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: {
          businessDate: BUSINESS_DATE,
          dimension: "sales_category",
        },
      });
      assert.notEqual(categoriesAgain.isError, true);
      assert.equal(
        groupByGuid(
          structured(categoriesAgain.structuredContent),
          SALES_CATEGORY_GUID,
        ).attributedCheckAmountMinor,
        1000,
      );

      const tags = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item_tag" },
      });
      assert.notEqual(tags.isError, true);
      const tagOutput = structured(tags.structuredContent);
      assert.equal(tagOutput.nonAdditiveAcrossGroups, true);
      assert.equal(groupByGuid(tagOutput, TAG_LUNCH_GUID).displayName, "Lunch");
      assert.equal(
        groupByGuid(tagOutput, TAG_LUNCH_GUID).attributedCheckAmountMinor,
        1000,
      );
      assert.equal(
        groupByGuid(tagOutput, TAG_UNKNOWN_GUID).displayName,
        "NEW_ENUM_TAG",
      );
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "historical item absent from current menu remains a distinct unresolved sales fact",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "missing-menu-item");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(result.isError, true);
      const output = structured(result.structuredContent);
      const historical = groupByGuid(output, ITEM_GUID);
      assert.equal(historical.displayName, undefined);
      assert.equal(historical.enrichmentState, "unresolved");
      assert.equal(historical.quantity, "0.5");
      assert.equal(historical.netSelectionAmountMinor, 800);
      assert.equal(output.unresolvedContributionCount, 1);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "unavailable menu with no prior cache preserves historical item sales as unresolved",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "menu-unavailable-no-cache");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(result.isError, true);
      const output = structured(result.structuredContent);
      assert.equal(structured(output.dimensionContext).menuState, "unresolved");
      const historical = groupByGuid(output, ITEM_GUID);
      assert.equal(historical.enrichmentState, "unresolved");
      assert.equal(historical.netSelectionAmountMinor, 800);
      assert.ok(
        (output.warnings as unknown[]).some((warning) =>
          String(warning).includes("unresolved")),
      );
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "failed metadata refresh after a valid menu snapshot reports stale enrichment instead of current or zero sales",
  { timeout: 25_000 },
  async () => {
    const connection = createConnection(
      "modern",
      "menu-refresh-fails-after-cache",
    );
    try {
      await connectWithTimeout(connection);
      const first = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(first.isError, true);

      const second = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
      });
      assert.notEqual(second.isError, true);
      const output = structured(second.structuredContent);
      assert.equal(structured(output.dimensionContext).menuState, "stale");
      assert.equal(groupByGuid(output, ITEM_GUID).enrichmentState, "stale");
      assert.equal(groupByGuid(output, ITEM_GUID).netSelectionAmountMinor, 800);
      assert.ok(
        (output.warnings as unknown[]).some((warning) =>
          String(warning).includes("stale")),
      );
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "historical sales category missing from current Configuration remains reportable and unresolved",
  { timeout: 25_000 },
  async () => {
    const connection = createConnection("modern", "missing-config-category");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: {
          businessDate: BUSINESS_DATE,
          dimension: "sales_category",
        },
      });
      assert.notEqual(result.isError, true);
      const output = structured(result.structuredContent);
      const category = groupByGuid(output, SALES_CATEGORY_GUID);
      assert.equal(category.displayName, undefined);
      assert.equal(category.enrichmentState, "unresolved");
      assert.equal(category.attributedCheckAmountMinor, 1000);
      assert.equal(output.unresolvedContributionCount, 1);
    } finally {
      await connection.client.close();
    }
  },
);

test("item enrichment retains a multi-group menu item when Orders supplies its itemGroup", async () => {
  const connection = createConnection("modern");
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_item_sales_summary",
      arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
    });
    const output = structured(result.structuredContent);
    assert.equal(groupByGuid(output, ITEM_GUID).enrichmentState, "current");
    assert.equal(groupByGuid(output, ITEM_GUID).displayName, "Current Burger");
  } finally {
    await connection.client.close();
  }
});

test("item tags use the menu group selected by the Orders itemGroup", async () => {
  const connection = createConnection("modern", "multi-group-tags");
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_item_sales_summary",
      arguments: { businessDate: BUSINESS_DATE, dimension: "item_tag" },
    });
    const output = structured(result.structuredContent);
    assert.equal(groupByGuid(output, TAG_UNKNOWN_GUID).displayName, "NEW_ENUM_TAG");
  } finally {
    await connection.client.close();
  }
});

test("missing or conflicting Orders itemGroup leaves merged menu tags unresolved", async () => {
  for (const scenario of ["missing-item-group", "conflicting-item-group"] as const) {
    const connection = createConnection("modern", scenario);
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension: "item_tag" },
      });
      const output = structured(result.structuredContent);
      assert.equal(output.unresolvedContributionCount, 1, scenario);
      assert.equal(output.groups.some((group: unknown) =>
        structured(group).guid === TAG_UNKNOWN_GUID), false);
    } finally {
      await connection.client.close();
    }
  }
});

test("malformed full menus leave item enrichment unresolved without deleting historical sales", async () => {
  const connection = createConnection("modern", "malformed-menu-structure");
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_item_sales_summary",
      arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
    });
    const output = structured(result.structuredContent);
    assert.equal(structured(output.dimensionContext).menuState, "unresolved");
    assert.equal(groupByGuid(output, ITEM_GUID).netSelectionAmountMinor, 800);
  } finally {
    await connection.client.close();
  }
});

test("missing menu or configuration scopes publish unresolved required context", async () => {
  for (const [scenario, dimension, key] of [
    ["missing-menus-scope", "item", "menuState"],
    ["missing-config-scope", "sales_category", "configurationState"],
  ] as const) {
    const connection = createConnection("modern", scenario);
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_item_sales_summary",
        arguments: { businessDate: BUSINESS_DATE, dimension },
      });
      const output = structured(result.structuredContent);
      assert.notEqual(result.isError, true);
      assert.equal(structured(output.dimensionContext)[key], "unresolved");
    } finally {
      await connection.client.close();
    }
  }
});

test(
  "production-wired pinned 2026-07-28 stdio exposes and calls a real report tool",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern");
    try {
      await connectWithTimeout(connection);
      const listed = await connection.client.listTools();
      assert.ok(listed.tools.some((tool) => tool.name === "toast_sales_summary"));
      assert.ok(
        listed.tools.some((tool) => tool.name === "toast_item_sales_summary"),
      );

      const result = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      const output = structured(result.structuredContent);
      assert.equal(output.status, "complete");
      assert.equal(output.schemaVersion, 1);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "MCP input schema rejects impossible business dates before report orchestration",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: 20260230 },
      });
      assert.equal(result.isError, true);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "built stdio denies before Orders fetch when the required provisioned scope is missing",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied("missing-scope", {}, "capability_missing_scope");
  },
);

test(
  "built stdio denies an inaccessible restaurant instead of returning empty totals",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied(
      "success",
      { restaurantGuid: INACCESSIBLE_RESTAURANT_GUID },
      "runtime_restaurant_inaccessible",
    );
  },
);

test(
  "built stdio denies malformed Orders source instead of fabricating a complete report",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied("malformed-source", {}, "orders_source_invalid");
  },
);

test(
  "built stdio denies broken ordersBulk pagination instead of silently stopping early",
  { timeout: 20_000 },
  async () => {
    await assertSalesDenied(
      "broken-pagination",
      {},
      "pagination_integrity_failed",
    );
  },
);

test(
  "a nonzero-ID active report cancellation aborts Standard fetch and returns a structured denial",
  { timeout: 20_000 },
  async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [REPORT_SERVER_PATH, "cancel-active-report"],
      cwd: process.cwd(),
      stderr: "pipe",
    });
    const stderr = observeFixtureStderr(transport);
    const client = new Client(
      { name: "toast-report-cancellation-test", version: "0.0.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } },
    );
    try {
      await client.connect(transport);
      await client.discover({ timeout: 5_000 });

      const controller = new AbortController();
      const cancelled = client.callTool(
        {
          name: "toast_sales_summary",
          arguments: { businessDate: BUSINESS_DATE },
        },
        {
          signal: controller.signal,
          timeout: 5_000,
          toolDefinition: {
            name: "toast_sales_summary",
            inputSchema: {
              type: "object",
              properties: { businessDate: { type: "number" } },
              required: ["businessDate"],
              additionalProperties: false,
            },
          },
        },
      );
      await stderr.waitFor("orders-fetch-started");
      controller.abort("synthetic active cancellation");
      await assert.rejects(cancelled);

      // `server/discover` consumes ID zero on this retained modern connection.
      // The active report request therefore uses a nonzero ID.
      await stderr.waitFor("orders-fetch-aborted");
      await client.discover({ timeout: 5_000 });
    } finally {
      try {
        await client.close();
      } finally {
        stderr.stop();
      }
    }
  },
);

test(
  "a stored upstream rate limit delays a later stdio report without bypassing report provenance",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "rate-limit-wait");
    try {
      await connectWithTimeout(connection);
      const first = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.equal(first.isError, undefined);

      const startedAt = Date.now();
      const second = await connection.client.callTool({
        name: "toast_sales_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs >= 900, `expected rate-limit delay, observed ${elapsedMs}ms`);
      assert.equal(second.isError, undefined);
      const output = structured(second.structuredContent);
      assert.equal(output.status, "complete");
      assert.equal(structured(output.combined).netSalesMinor, 600);
      assert.ok(
        structured(output.provenance)
          .upstreamRequestIds.includes("fixture-rate-limited-orders-2"),
      );
    } finally {
      await connection.client.close();
    }
  },
);

interface Connection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
}

function createConnection(
  era: "legacy" | "modern",
  scenario: FixtureScenario = "success",
): Connection {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [REPORT_SERVER_PATH, scenario],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client(
    {
      name: `toast-report-e2e-${era}-${scenario}`,
      version: "0.0.0",
    },
    era === "modern"
      ? {
          versionNegotiation: {
            mode: { pin: "2026-07-28" },
            probe: { timeoutMs: STDIO_CONNECT_TIMEOUT_MS },
          },
        }
      : { versionNegotiation: { mode: "legacy" } },
  );
  return { client, transport };
}

async function assertSalesDenied(
  scenario: FixtureScenario,
  extraArguments: Readonly<Record<string, unknown>>,
  expectedCode: string,
): Promise<void> {
  const connection = createConnection("modern", scenario);
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_sales_summary",
      arguments: {
        businessDate: BUSINESS_DATE,
        ...extraArguments,
      },
    });
    assert.equal(result.isError, true);
    const output = structured(result.structuredContent);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.status, "denied");
    assert.equal(structured(output.denial).code, expectedCode);
    assert.equal("combined" in output, false);
  } finally {
    await connection.client.close();
  }
}

function groupByGuid(
  output: Record<string, any>,
  guid: string,
): Record<string, any> {
  assert.ok(Array.isArray(output.groups));
  const group = (output.groups as unknown[]).find((candidate) =>
    structured(candidate).guid === guid);
  assert.ok(group, `expected group for GUID ${guid}`);
  return structured(group);
}

async function connectWithTimeout(connection: Connection): Promise<void> {
  await Promise.race([
    connection.client.connect(connection.transport),
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out connecting to synthetic report stdio server")),
        STDIO_CONNECT_TIMEOUT_MS,
      );
      timer.unref();
    }),
  ]);
}

function structured(value: unknown): Record<string, any> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, any>;
}

function observeFixtureStderr(transport: StdioClientTransport): {
  readonly waitFor: (marker: string) => Promise<void>;
  readonly stop: () => void;
} {
  const stream = transport.stderr;
  assert.ok(stream !== null, "expected fixture stderr");
  let output = "";
  let waiter: Deferred<void> | undefined;
  const onData = (chunk: Buffer | string): void => {
    output += chunk.toString();
    waiter?.resolve();
    waiter = undefined;
  };
  stream.on("data", onData);
  return {
    waitFor: async (marker: string): Promise<void> => {
      while (!output.includes(marker)) {
        waiter = deferred<void>();
        await waiter.promise;
      }
    },
    stop: () => stream.off("data", onData),
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((next) => { resolve = next; }),
    resolve,
  };
}
