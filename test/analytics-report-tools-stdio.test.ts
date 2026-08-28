import assert from "node:assert/strict";
import test from "node:test";

import { registerAnalyticsReportTools } from "../src/analytics-report-tools.js";
import {
  ANALYTICS_BUSINESS_DATE,
  ANALYTICS_RESTAURANT_GUID,
  connectAnalytics,
  createAnalyticsConnection,
  INACCESSIBLE_ANALYTICS_RESTAURANT_GUID,
  observeFixtureStderr,
  structured,
  type AnalyticsFixtureScenario,
} from "./support/analytics-report-tools-stdio-support.js";

void registerAnalyticsReportTools;

test("Analytics tool registration exposes one fixed metrics-day tool", { timeout: 20_000 }, async () => {
  const connection = createAnalyticsConnection();
  try {
    await connectAnalytics(connection);
    const tools = await connection.client.listTools();
    const analyticsTools = tools.tools.filter((tool) => tool.name.startsWith("toast_analytics_"));
    assert.deepEqual(analyticsTools.map((tool) => tool.name), ["toast_analytics_metrics_day"]);
    assert.equal(analyticsTools[0]?.annotations?.readOnlyHint, true);
    assert.equal(analyticsTools[0]?.annotations?.idempotentHint, true);
  } finally {
    await connection.client.close();
  }
});

test("Analytics tool requires one UUID restaurant and one real numeric business date", { timeout: 20_000 }, async () => {
  const connection = createAnalyticsConnection();
  try {
    await connectAnalytics(connection);
    for (const arguments_ of [
      {},
      { restaurantGuid: "not-a-guid", businessDate: ANALYTICS_BUSINESS_DATE },
      { restaurantGuid: ANALYTICS_RESTAURANT_GUID, businessDate: 20260230 },
      { restaurantGuids: [ANALYTICS_RESTAURANT_GUID], businessDate: ANALYTICS_BUSINESS_DATE },
    ]) {
      await assert.rejects(connection.client.callTool({ name: "toast_analytics_metrics_day", arguments: arguments_ }));
    }
  } finally {
    await connection.client.close();
  }
});

test("Analytics tool denies absent capability or inaccessible selection before Metrics job access", { timeout: 20_000 }, async () => {
  await assertDenied("absent-analytics-runtime", "analytics_runtime_unavailable");
  await assertDenied("missing-analytics-scope", "analytics_scope_unavailable");
  await assertDenied("inaccessible-analytics-restaurant", "analytics_selection_invalid", INACCESSIBLE_ANALYTICS_RESTAURANT_GUID);
});

test("Analytics tool uses only the closed Metrics/day lifecycle input", { timeout: 20_000 }, async () => {
  const output = await callAnalytics("success");
  assert.equal(output.status, "incomplete");
  assert.equal(output.reason, "analytics_result_schema_unverified");
  assert.equal(output.source, "analytics_api");
  assert.equal(output.report, "analytics_metrics_day");
});

test("Analytics terminal states publish only body-free denied or incomplete envelopes", { timeout: 30_000 }, async () => {
  for (const [scenario, expectedStatus, expectedReason] of [
    ["pending-exhausted", "incomplete", "analytics_pending_exhausted"],
    ["invalid-or-expired", "incomplete", "analytics_invalid_or_expired"],
    ["replacement-exhausted", "incomplete", "analytics_replacement_exhausted"],
    ["request-failed", "incomplete", "analytics_failed_or_incomplete"],
    ["result-contract-unavailable", "incomplete", "analytics_result_schema_unverified"],
  ] as const) {
    const output = await callAnalytics(scenario);
    assert.equal(output.status, expectedStatus, scenario);
    assert.equal(output.reason, expectedReason, scenario);
    for (const forbidden of ["complete", "amount", "result", "body", "token", "reportRequestId", "guest", "payment", "restaurantName", "grouping", "currencyCode", "timezone", "closeoutHour"]) {
      assert.equal(JSON.stringify(output).includes(forbidden), false, `${scenario} leaked ${forbidden}`);
    }
  }
});

test("Analytics tool preserves public lifecycle provenance and informational non-GAAP scope", { timeout: 20_000 }, async () => {
  const output = await callAnalytics("success");
  assert.deepEqual(output.requestPolicyExclusions, ["guest_linked_data", "payment_data", "restaurant_name", "grouping", "inactive_only"]);
  assert.match(String(output.formulaNote), /informational.*non-GAAP/iu);
  assert.equal(output.restaurantGuid, ANALYTICS_RESTAURANT_GUID);
  assert.equal(output.businessDate, ANALYTICS_BUSINESS_DATE);
  assert.equal(structured(output.provenance).apiFamily, "analytics");
});

test("Analytics tool propagates nonzero MCP cancellation without publishing an envelope", { timeout: 20_000 }, async () => {
  const connection = createAnalyticsConnection("cancel-active-analytics");
  const stderr = observeFixtureStderr(connection.transport);
  try {
    await connectAnalytics(connection);
    const controller = new AbortController();
    const call = connection.client.callTool(
      { name: "toast_analytics_metrics_day", arguments: { restaurantGuid: ANALYTICS_RESTAURANT_GUID, businessDate: ANALYTICS_BUSINESS_DATE } },
      { signal: controller.signal },
    );
    await stderr.waitFor("analytics-fetch-started");
    controller.abort("synthetic Analytics cancellation");
    await assert.rejects(call);
    await stderr.waitFor("analytics-fetch-aborted");
  } finally {
    try { await connection.client.close(); } finally { stderr.stop(); }
  }
});

async function callAnalytics(scenario: AnalyticsFixtureScenario): Promise<Record<string, unknown>> {
  const connection = createAnalyticsConnection(scenario);
  try {
    await connectAnalytics(connection);
    const result = await connection.client.callTool({
      name: "toast_analytics_metrics_day",
      arguments: { restaurantGuid: ANALYTICS_RESTAURANT_GUID, businessDate: ANALYTICS_BUSINESS_DATE },
    });
    return structured(result.structuredContent);
  } finally {
    await connection.client.close();
  }
}

async function assertDenied(
  scenario: AnalyticsFixtureScenario,
  expectedCode: string,
  restaurantGuid = ANALYTICS_RESTAURANT_GUID,
): Promise<void> {
  const connection = createAnalyticsConnection(scenario);
  try {
    await connectAnalytics(connection);
    const result = await connection.client.callTool({
      name: "toast_analytics_metrics_day",
      arguments: { restaurantGuid, businessDate: ANALYTICS_BUSINESS_DATE },
    });
    assert.equal(result.isError, true, scenario);
    const output = structured(result.structuredContent);
    assert.equal(output.status, "denied", scenario);
    assert.equal(output.reason, expectedCode, scenario);
  } finally {
    await connection.client.close();
  }
}
