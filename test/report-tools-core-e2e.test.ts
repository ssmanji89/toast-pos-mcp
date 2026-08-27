import assert from "node:assert/strict";
import test from "node:test";

import {
  BUSINESS_DATE,
  createConnection,
  connectWithTimeout,
  groupByGuid,
  ITEM_GUID,
  RESTAURANT_GUID,
  SALES_CATEGORY_GUID,
  SECOND_ITEM_GUID,
  structured,
  TAG_LUNCH_GUID,
  TAG_UNKNOWN_GUID,
} from "./support/report-tools-e2e-support.js";

test("production-wired stdio lists and calls cash and labor reports", { timeout: 30_000 }, async () => {
  const connection = createConnection("modern");
  try {
    await connectWithTimeout(connection);
    await assertListedTools(connection);
    await assertCashAndLaborReports(connection);
  } finally {
    await connection.client.close();
  }
});

test("production-wired stdio calls sales and payment reports", { timeout: 30_000 }, async () => {
  const connection = createConnection("modern");
  try {
    await connectWithTimeout(connection);
    await assertSalesAndPaymentReports(connection);
  } finally {
    await connection.client.close();
  }
});

test("production-wired stdio calls item and dimension reports", { timeout: 30_000 }, async () => {
  const connection = createConnection("modern");
  try {
    await connectWithTimeout(connection);
    await assertItemAndDimensionReports(connection);
  } finally {
    await connection.client.close();
  }
});

type ReportConnection = ReturnType<typeof createConnection>;

async function assertListedTools(connection: ReportConnection): Promise<void> {
  const listed = await connection.client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  for (const name of [
    "toast_sales_summary",
    "toast_payment_summary",
    "toast_item_sales_summary",
    "toast_cash_summary",
    "toast_labor_summary",
  ]) assert.ok(names.includes(name));
  for (const name of ["toast_cash_summary", "toast_labor_summary"]) {
    assert.deepEqual(listed.tools.find((tool) => tool.name === name)?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  }
}

async function assertCashAndLaborReports(connection: ReportConnection): Promise<void> {
  const cash = await connection.client.callTool({
    name: "toast_cash_summary",
    arguments: { businessDate: BUSINESS_DATE },
  });
  assert.notEqual(cash.isError, true);
  const cashOutput = structured(cash.structuredContent);
  assert.equal(cashOutput.status, "complete");
  assert.equal(cashOutput.report, "cash_summary");
  assert.equal(cashOutput.cashEntryAmountMinor, 1234);
  assert.equal(cashOutput.depositAmountMinor, 1000);
  assert.equal(cashOutput.restaurantGuid, RESTAURANT_GUID);
  assert.ok(structured(cashOutput.provenance).upstreamRequestIds.includes("fixture-cash-entries"));

  const labor = await connection.client.callTool({
    name: "toast_labor_summary",
    arguments: { businessDate: BUSINESS_DATE },
  });
  assert.notEqual(labor.isError, true);
  const laborOutput = structured(labor.structuredContent);
  assert.equal(laborOutput.status, "complete");
  assert.equal(laborOutput.report, "labor_summary");
  assert.equal(laborOutput.regularHours, 7.5);
  assert.equal(laborOutput.ordersSalesMinor, 800);
  assert.equal(laborOutput.ordersTipsMinor, 50);
  assert.equal(laborOutput.restaurantGuid, RESTAURANT_GUID);
  assert.ok(structured(laborOutput.provenance).upstreamRequestIds.includes("fixture-labor-time-entries"));
  const serializedReports = JSON.stringify({ cashOutput, laborOutput });
  for (const marker of [
    "synthetic-cash-employee-must-not-survive",
    "synthetic-cash-card-must-not-survive",
    "synthetic-cash-raw-source-must-not-survive",
    "synthetic-employee-name-must-not-survive",
    "synthetic-employee-external-id-must-not-survive",
  ]) assert.equal(serializedReports.includes(marker), false, marker);
}

async function assertSalesAndPaymentReports(connection: ReportConnection): Promise<void> {
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
}

async function assertItemAndDimensionReports(connection: ReportConnection): Promise<void> {
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
    structured(structured(itemOutput.dimensionContext).menuSourceProvenance).upstreamRequestIds,
    ["fixture-menu-full-1"],
  );
  assert.deepEqual(
    structured(structured(itemOutput.dimensionContext).menuFreshnessProvenance).upstreamRequestIds,
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
  assert.equal(firstItem.netSelectionAmountMinor + secondItem.netSelectionAmountMinor, 1000);

  await assertCachedItemDimensionReports(connection);
}

async function assertCachedItemDimensionReports(connection: ReportConnection): Promise<void> {
  const itemsSecond = await connection.client.callTool({
    name: "toast_item_sales_summary",
    arguments: { businessDate: BUSINESS_DATE, dimension: "item" },
  });
  assert.notEqual(itemsSecond.isError, true);
  const secondOutput = structured(itemsSecond.structuredContent);
  assert.equal(structured(secondOutput.dimensionContext).menuState, "current");
  assert.deepEqual(
    structured(structured(secondOutput.dimensionContext).menuFreshnessProvenance).upstreamRequestIds,
    ["fixture-menu-metadata-2"],
  );
  assert.deepEqual(
    structured(structured(secondOutput.dimensionContext).menuSourceProvenance).upstreamRequestIds,
    ["fixture-menu-full-1"],
  );

  const categories = await connection.client.callTool({
    name: "toast_item_sales_summary",
    arguments: { businessDate: BUSINESS_DATE, dimension: "sales_category" },
  });
  assert.notEqual(categories.isError, true);
  const categoryOutput = structured(categories.structuredContent);
  assert.equal(categoryOutput.metricBasis, "check_attribution");
  assert.equal(categoryOutput.nonAdditiveAcrossGroups, true);
  assert.equal(structured(categoryOutput.dimensionContext).configurationState, "current");
  const category = groupByGuid(categoryOutput, SALES_CATEGORY_GUID);
  assert.equal(category.displayName, "Current Entrees");
  assert.equal(category.attributedCheckAmountMinor, 1000);
  assert.ok(structured(categoryOutput.dimensionContext).configurationLastModifiedCursor);

  // Every config endpoint in the fixture throws on another full snapshot.
  // This second successful call therefore proves same-day cache reuse.
  const categoriesAgain = await connection.client.callTool({
    name: "toast_item_sales_summary",
    arguments: { businessDate: BUSINESS_DATE, dimension: "sales_category" },
  });
  assert.notEqual(categoriesAgain.isError, true);
  assert.equal(
    groupByGuid(structured(categoriesAgain.structuredContent), SALES_CATEGORY_GUID)
      .attributedCheckAmountMinor,
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
  assert.equal(groupByGuid(tagOutput, TAG_LUNCH_GUID).attributedCheckAmountMinor, 1000);
  assert.equal(groupByGuid(tagOutput, TAG_UNKNOWN_GUID).displayName, "NEW_ENUM_TAG");
}
