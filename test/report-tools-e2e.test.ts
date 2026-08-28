import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import {
  BUSINESS_DATE,
  connectWithTimeout,
  createConnection,
  groupByGuid,
  INACCESSIBLE_RESTAURANT_GUID,
  ITEM_GUID,
  RESTAURANT_GUID,
  REPORT_SERVER_PATH,
  SALES_CATEGORY_GUID,
  structured,
  TAG_LUNCH_GUID,
  TAG_UNKNOWN_GUID,
  assertSalesDenied,
  assertCancelledReport,
  assertReportDenied,
  observeFixtureStderr,
  textContent,
  type FixtureScenario,
} from "./support/report-tools-e2e-support.js";

test(
  "tools/list advertises only the real Standard result branches",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "success");
    try {
      await connectWithTimeout(connection);
      const listed = await connection.client.listTools();
      for (const contract of [
        ["toast_sales_summary", "sales_summary", ["complete", "denied"]],
        ["toast_payment_summary", "payment_summary", ["complete", "denied"]],
        ["toast_item_sales_summary", "item_sales_summary", ["complete", "denied"]],
        ["toast_cash_summary", "cash_summary", ["complete", "denied"]],
        ["toast_labor_summary", "labor_summary", ["complete", "incomplete", "denied"]],
      ] as const) {
        const [name, report, statuses] = contract;
        const tool = listed.tools.find((candidate) => candidate.name === name);
        assert.ok(tool, `expected ${name} in tools/list`);
        const schema = structured(tool.outputSchema);
        const branches = Array.isArray(schema.anyOf)
          ? schema.anyOf.map(structured)
          : Array.isArray(schema.oneOf)
            ? schema.oneOf.map(structured)
            : [];
        assert.ok(branches.length > 0, `${name} must advertise a result union`);
        assert.deepEqual(
          branches.map((branch) => schemaLiteral(structured(branch.properties).status)).sort(),
          [...statuses].sort(),
        );
        for (const branch of branches) {
          const properties = structured(branch.properties);
          const required = new Set(branch.required as string[]);
          assert.equal(schemaLiteral(properties.report), report);
          for (const field of [
            "schemaVersion", "status", "report", "source", "businessDate",
            "requestedBusinessDate", "generatedAtEpochMs", "formulaNotes", "warnings",
          ]) assert.ok(required.has(field), `${name} ${schemaLiteral(properties.status)} requires ${field}`);
          if (schemaLiteral(properties.status) === "denied") {
            for (const field of [
              "denial", "missingScopes", "missingProvisionedScopes",
              "missingConnectionScopes", "excludedScopes",
            ]) assert.ok(required.has(field), `${name} denied requires ${field}`);
          } else {
            for (const field of ["contextFreshness", "contextProvenance", "provenance"]) {
              assert.ok(required.has(field), `${name} ${schemaLiteral(properties.status)} requires ${field}`);
            }
          }
          if (name === "toast_item_sales_summary") {
            assert.ok(required.has("dimension"), "item output requires its requested dimension");
          }
        }
      }
    } finally {
      await connection.client.close();
    }
  },
);

function schemaLiteral(value: unknown): string {
  const property = structured(value);
  if (typeof property.const === "string") return property.const;
  if (Array.isArray(property.enum) && typeof property.enum[0] === "string") return property.enum[0];
  throw new Error("expected JSON-schema literal");
}
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
  "labor uses the current source snapshot and keeps archived entries out of current totals",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "labor-revised-archived");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_labor_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(result.isError, true);
      const output = structured(result.structuredContent);
      assert.equal(output.status, "complete");
      assert.equal(output.timeEntryCount, 1);
      assert.equal(output.deletedTimeEntryCount, 1);
      assert.equal(output.regularHours, 7.5);
      assert.equal(output.regularWagesMinor, 0);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "validated active labor entries return truthful incomplete output without an error flag",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "labor-active-entry");
    try {
      await connectWithTimeout(connection);
      const result = await connection.client.callTool({
        name: "toast_labor_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(result.isError, true);
      const output = structured(result.structuredContent);
      assert.equal(output.status, "incomplete");
      assert.equal(output.activeTimeEntryCount, 1);
      assert.ok(textContent(result).includes("incomplete"));
      assert.ok(textContent(result).length < 256);
    } finally {
      await connection.client.close();
    }
  },
);

test(
  "cash and labor scope and malformed-source failures deny without fabricated totals",
  { timeout: 30_000 },
  async () => {
    for (const [scenario, name, expectedCode, absentTotal] of [
      ["missing-cash-scope", "toast_cash_summary", "capability_missing_scope", "cashEntryAmountMinor"],
      ["missing-labor-order-scope", "toast_labor_summary", "capability_missing_scope", "regularHours"],
      ["malformed-cash-source", "toast_cash_summary", "cash_source_invalid", "cashEntryAmountMinor"],
      ["malformed-labor-source", "toast_labor_summary", "labor_time_entries_source_invalid", "regularHours"],
    ] as const) {
      await assertReportDenied(scenario, name, expectedCode, absentTotal);
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

test("missing Orders itemGroup does not use singleton current group tags", async () => {
  const connection = createConnection("modern", "missing-item-group-singleton");
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_item_sales_summary",
      arguments: { businessDate: BUSINESS_DATE, dimension: "item_tag" },
    });
    const output = structured(result.structuredContent);
    assert.equal(output.unresolvedContributionCount, 1);
    assert.equal(output.groups.some((group: unknown) =>
      structured(group).guid === TAG_UNKNOWN_GUID), false);
  } finally {
    await connection.client.close();
  }
});

test("conflicting tags for one exact menu item group fail closed", async () => {
  const connection = createConnection("modern", "conflicting-group-tags");
  try {
    await connectWithTimeout(connection);
    const result = await connection.client.callTool({
      name: "toast_item_sales_summary",
      arguments: { businessDate: BUSINESS_DATE, dimension: "item_tag" },
    });
    const output = structured(result.structuredContent);
    assert.equal(output.status, "denied");
    assert.equal(structured(output.denial).code, "item_tag_context_unavailable");
  } finally {
    await connection.client.close();
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
  "modern stdio returns item-report denials for malformed Orders and broken pagination",
  { timeout: 20_000 },
  async () => {
    for (const [scenario, expectedCode] of [
      ["malformed-source", "orders_source_invalid"],
      ["broken-pagination", "pagination_integrity_failed"],
    ] as const) {
      const connection = createConnection("modern", scenario);
      try {
        await connectWithTimeout(connection);
        const result = await connection.client.callTool({
          name: "toast_item_sales_summary",
          arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
        });
        assert.equal(result.isError, true, scenario);
        const output = structured(result.structuredContent);
        assert.equal(output.status, "denied", scenario);
        assert.equal(structured(output.denial).code, expectedCode, scenario);
      } finally {
        await connection.client.close();
      }
    }
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

test(
  "cash report cancellation reaches the selected source read through the nonzero-ID stdio path",
  { timeout: 20_000 },
  async () => {
    await assertCancelledReport("cancel-cash-report", "toast_cash_summary", "cash-entries-fetch");
  },
);

test(
  "labor report cancellation reaches the selected source read through the nonzero-ID stdio path",
  { timeout: 20_000 },
  async () => {
    await assertCancelledReport("cancel-labor-report", "toast_labor_summary", "labor-time-entries-fetch");
  },
);

test(
  "a stored upstream rate limit delays a later cash report and preserves cash provenance",
  { timeout: 20_000 },
  async () => {
    const connection = createConnection("modern", "rate-limit-cash");
    try {
      await connectWithTimeout(connection);
      const startedAt = Date.now();
      const first = await connection.client.callTool({
        name: "toast_cash_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      const elapsedMs = Date.now() - startedAt;
      assert.ok(elapsedMs >= 900, `expected rate-limit delay, observed ${elapsedMs}ms`);
      assert.notEqual(first.isError, true);

      const second = await connection.client.callTool({
        name: "toast_cash_summary",
        arguments: { businessDate: BUSINESS_DATE },
      });
      assert.notEqual(second.isError, true);
      assert.ok(
        structured(structured(second.structuredContent).provenance)
          .upstreamRequestIds.includes("fixture-rate-limited-cash-2"),
      );
    } finally {
      await connection.client.close();
    }
  },
);
