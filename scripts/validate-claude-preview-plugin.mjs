#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PREVIEW_VERSION = "0.1.0-preview.1";
const failures = [];

const plugin = await readJson(".claude-plugin/plugin.json");
const marketplace = await readJson(".claude-plugin/marketplace.json");
const mcp = await readJson("claude-plugin.mcp.json");
const packageManifest = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const launcher = await readText("scripts/claude-plugin-launcher.mjs");
const skill = await readText("skills/toast-reporting/SKILL.md");
const previewGuide = await readText("docs/claude-code-preview.md");
const rootReadme = await readText("README.md");
const feedbackTemplate = await readText(
  ".github/ISSUE_TEMPLATE/claude-preview.yml",
);

check(plugin.name === "toast-pos-mcp", "plugin name must be toast-pos-mcp");
check(
  plugin.version === PREVIEW_VERSION,
  `plugin version must be ${PREVIEW_VERSION}`,
);
check(
  plugin.defaultEnabled === false,
  "plugin must install disabled until an operator explicitly configures and enables it",
);
check(
  plugin.mcpServers === "./claude-plugin.mcp.json",
  "plugin must use the custom MCP config path instead of a project-level .mcp.json",
);
check(plugin.license === "Apache-2.0", "plugin license must remain Apache-2.0");
check(
  plugin.repository === "https://github.com/ssmanji89/toast-pos-mcp",
  "plugin repository must identify the public source repository",
);

const expectedOptions = [
  "merchant_ai_consent_acknowledged",
  "toast_api_hostname",
  "toast_client_id",
  "toast_client_secret",
  "toast_default_restaurant_guid",
];
check(
  sameStrings(Object.keys(plugin.userConfig ?? {}), expectedOptions),
  "plugin userConfig must expose only the reviewed Standard preview options",
);
for (const key of expectedOptions) {
  check(
    plugin.userConfig?.[key]?.required === true,
    `${key} must be required`,
  );
}
for (const key of [
  "toast_client_id",
  "toast_client_secret",
  "toast_default_restaurant_guid",
]) {
  check(
    plugin.userConfig?.[key]?.sensitive === true,
    `${key} must use Claude Code sensitive storage`,
  );
}
check(
  plugin.userConfig?.merchant_ai_consent_acknowledged?.type === "boolean",
  "Merchant consent acknowledgment must be a boolean prompt",
);
check(
  plugin.userConfig?.merchant_ai_consent_acknowledged?.default === false,
  "Merchant consent acknowledgment must default to false",
);

check(
  marketplace.name === "toast-pos-mcp-preview",
  "marketplace name must remain toast-pos-mcp-preview",
);
check(
  Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1,
  "marketplace must expose exactly one preview plugin",
);
const marketplacePlugin = marketplace.plugins?.[0];
check(
  marketplacePlugin?.name === plugin.name,
  "marketplace and plugin names must agree",
);
check(
  marketplacePlugin?.source === "./",
  "marketplace must copy the repository root so the locked runtime source is included",
);
check(
  marketplacePlugin?.version === undefined,
  "marketplace plugin entry must defer version authority to plugin.json",
);

const servers = mcp.mcpServers ?? {};
check(
  sameStrings(Object.keys(servers), ["toast-pos-reporting"]),
  "plugin MCP config must expose exactly one server",
);
const server = servers["toast-pos-reporting"] ?? {};
check(server.command === "node", "plugin MCP server must launch with Node.js");
check(
  Array.isArray(server.args)
    && server.args.length === 1
    && server.args[0]
      === "${CLAUDE_PLUGIN_ROOT}/scripts/claude-plugin-launcher.mjs",
  "plugin MCP server must use the reviewed cache-local launcher",
);
const expectedEnvironment = {
  TOAST_ACCESS_TYPE: "TOAST_MACHINE_CLIENT",
  TOAST_API_HOSTNAME: "${user_config.toast_api_hostname}",
  TOAST_CLIENT_ID: "${user_config.toast_client_id}",
  TOAST_CLIENT_SECRET: "${user_config.toast_client_secret}",
  TOAST_DEFAULT_RESTAURANT_GUID:
    "${user_config.toast_default_restaurant_guid}",
  TOAST_MERCHANT_AI_CONSENT_ACKNOWLEDGED:
    "${user_config.merchant_ai_consent_acknowledged}",
};
check(
  JSON.stringify(sortRecord(server.env ?? {}))
    === JSON.stringify(sortRecord(expectedEnvironment)),
  "plugin MCP environment must contain only the reviewed Standard runtime values",
);

check(
  packageManifest.private === true,
  "Claude preview must not silently turn the runtime into an npm publication",
);
check(
  packageManifest.engines?.node === ">=20",
  "plugin runtime must preserve the Node.js 20 floor",
);
check(
  packageManifest.devDependencies?.typescript === "6.0.3",
  "cache-local compilation must use the committed TypeScript version",
);
check(
  packageLock.lockfileVersion === 3,
  "Claude automatic dependency restore requires the committed npm lockfile",
);
check(
  packageLock.packages?.[""]?.devDependencies?.typescript === "6.0.3",
  "package lock must pin the compiler used by the plugin launcher",
);

for (const marker of [
  "node_modules",
  "typescript",
  "dist",
  "index.js",
  "spawnSync",
  "stdio: \"ignore\"",
  "process.execPath",
  "BUILD_LOCK",
]) {
  check(launcher.includes(marker), `launcher must retain ${marker}`);
}
check(!launcher.includes("shell: true"), "launcher must never invoke a shell");
check(
  !launcher.includes("TOAST_CLIENT_SECRET"),
  "launcher must not inspect or interpolate Toast credentials",
);
check(
  launcher.includes("toast-pos-mcp Claude plugin failed to start"),
  "launcher must expose one generic stderr failure boundary",
);

for (const marker of [
  "complete",
  "incomplete",
  "denied",
  "Merchant consent",
  "no training",
  "toast_sales_summary",
  "toast_labor_summary",
  "toast_analytics_metrics_day",
]) {
  check(skill.includes(marker), `reporting skill must document ${marker}`);
}

for (const marker of [
  "/plugin marketplace add ssmanji89/toast-pos-mcp",
  "/plugin install toast-pos-mcp@toast-pos-mcp-preview",
  "/plugin enable toast-pos-mcp@toast-pos-mcp-preview",
  "/reload-plugins",
  "0.1.0-preview.1",
]) {
  check(previewGuide.includes(marker), `preview guide must include ${marker}`);
  check(rootReadme.includes(marker), `README must include ${marker}`);
}
for (const marker of [
  "Do not include credentials",
  "Do not include Merchant Data",
  "sanitized",
]) {
  check(
    feedbackTemplate.includes(marker),
    `feedback template must include ${marker}`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Claude Code public-preview plugin contract validated at ${PREVIEW_VERSION}.`,
  );
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(join(REPOSITORY_ROOT, relativePath), "utf8");
}

function sameStrings(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function sortRecord(record) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
