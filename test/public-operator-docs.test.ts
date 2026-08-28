import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

const readme = read("README.md");
const catalog = read("docs/architecture/report-contract.md");
const operatorGuide = read("docs/operator-guide.md");
const publicBoundary = read("docs/architecture/public-use-boundary.md");
const threatModel = read("docs/architecture/threat-model.md");
const publicDocuments = [readme, catalog, operatorGuide, publicBoundary, threatModel].join("\n");
const standardRegistration = read("src/report-tools.ts");
const analyticsRegistration = read("src/analytics-report-tools.ts");

function registeredToolNames(registration: string): string[] {
  return [...registration.matchAll(/server\.registerTool\(\s*(?:"([^"]+)"|([A-Z][A-Z0-9_]*))/gu)].map((match) => {
    if (match[1] !== undefined) {
      return match[1];
    }

    const definition = registration.match(new RegExp(`const\\s+${match[2]}\\s*=\\s*"([^"]+)"`, "u"));
    assert.ok(definition?.[1], `missing literal definition for ${match[2]}`);
    return definition[1];
  });
}

const registeredTools = [standardRegistration, analyticsRegistration].flatMap(registeredToolNames);

test("public documentation catalogs every registered report tool", () => {
  assert.deepEqual(registeredTools.sort(), [
    "toast_analytics_metrics_day",
    "toast_cash_summary",
    "toast_item_sales_summary",
    "toast_labor_summary",
    "toast_payment_summary",
    "toast_sales_summary",
  ]);

  for (const tool of registeredTools) {
    assert.match(catalog, new RegExp(`\\b${tool}\\b`, "u"));
    assert.match(readme, new RegExp(`\\b${tool}\\b`, "u"));
  }
});

test("public documentation preserves source and Analytics result boundaries", () => {
  assert.match(catalog, /Standard API/u);
  assert.match(catalog, /Analytics API/u);
  assert.match(catalog, /body-free/u);
  assert.match(catalog, /`denied` or `incomplete`/u);
  assert.match(catalog, /analytics_result_schema_unverified/u);
  assert.match(publicDocuments, /informational and non-GAAP/u);
  assert.match(threatModel, /five Standard API report tools/u);
  assert.match(threatModel, /body-free lifecycle boundary/u);
  assert.doesNotMatch(threatModel, /zero registered MCP tools/u);
  assert.doesNotMatch(threatModel, /no normalization, report calculation, or Analytics adapter code/u);
});

test("operator duties and evidence limits appear before configuration guidance", () => {
  const safetyIndex = operatorGuide.indexOf("## Operator safety checklist");
  const configurationIndex = operatorGuide.indexOf("## Configuration");
  assert.ok(safetyIndex >= 0 && safetyIndex < configurationIndex);

  for (const required of [
    "authorized restaurant credentials",
    "documented Merchant consent",
    "MCP host",
    "model provider",
    "tool logs",
    "retention",
    "subprocessors",
    "no training",
    "guest-linked data",
    "Analytics guest-payment data",
    "delivery addresses",
    "payment identifiers",
    "TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED=true",
    "not proof",
  ]) {
    assert.match(operatorGuide, new RegExp(required, "iu"));
  }

  assert.match(publicDocuments, /https:\/\/pos\.toasttab\.com\/api-terms-of-use/u);
  assert.match(publicDocuments, /2026-06-23/u);
  assert.match(publicDocuments, /not endorsed by Toast/u);
  for (const label of ["Implemented", "Synthetic validation", "External gates"]) {
    assert.match(publicDocuments, new RegExp(label, "u"));
  }
});

test("public documentation rejects unsupported release and Analytics claims", () => {
  assert.match(readme, /local installed-artifact test/u);
  assert.match(threatModel, /local installed-artifact test/u);
  for (const forbidden of [
    /Toast-approved/u,
    /Toast certification/u,
    /published package/u,
    /live-compatible/u,
    /complete Analytics report/u,
    /installed-artifact (?:test|evidence)[^.\n]*(?:release-ready|publish|sign|live.compatib|approval)/iu,
  ]) {
    assert.doesNotMatch(publicDocuments, forbidden);
  }

  for (const openGate of [
    "T5-003-G01",
    "#4/T6-003",
    "#28",
    "live Analytics compatibility",
    "signing",
    "publication",
    "brand",
  ]) {
    assert.match(publicDocuments, new RegExp(openGate.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("license and notice checkpoint records current release metadata only", () => {
  assert.match(read("LICENSE"), /^\s*Apache License/u);
  assert.equal(JSON.parse(read("package.json")).license, "Apache-2.0");
  assert.equal(JSON.parse(read("package-lock.json")).packages[""].license, "Apache-2.0");
  assert.equal(existsSync(new URL("NOTICE", root)), false);
});
