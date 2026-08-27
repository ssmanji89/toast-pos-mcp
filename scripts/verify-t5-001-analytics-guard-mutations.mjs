import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const accessSourcePath = new URL("../src/analytics-access.ts", import.meta.url);
const capabilitiesSourcePath = new URL("../src/capabilities.ts", import.meta.url);
const testCommand = "npm run build:test && node --test dist-test/test/analytics-config.test.js dist-test/test/analytics-capabilities.test.js dist-test/test/analytics-access-adapter.test.js";

const guards = Object.freeze([
  ["analytics-method", accessSourcePath, "method: \"GET\"", "method: \"POST\""],
  ["analytics-path", accessSourcePath, "/era/v1/restaurants-information", "/era/v1/report-request"],
  ["analytics-standard-header", accessSourcePath, "headers: { authorization: await this.#tokenManager.getAuthorizationHeader() }", "headers: { authorization: await this.#tokenManager.getAuthorizationHeader(), \"Toast-Restaurant-External-ID\": \"forbidden\" }"],
  ["analytics-scope-preflight", capabilitiesSourcePath, "ANALYTICS_REQUIRED_SCOPE = \"enterprise-metrics:read\"", "ANALYTICS_REQUIRED_SCOPE = \"enterprise-metrics:write\""],
  ["analytics-schema", accessSourcePath, "restaurantGuid: restaurantGuidSchema", "restaurantGuid: z.string()"],
  ["analytics-duplicate-guid", accessSourcePath, "seenRestaurantGuids.has", "false"],
  ["analytics-selection-duplicate", accessSourcePath, "seen.has", "false"],
  ["analytics-selection-membership", accessSourcePath, "!registryByGuid.has(guid)", "false"],
  ["analytics-cancellation", accessSourcePath, "signal: options.signal", "signal: undefined"],
  ["analytics-endpoint-limiter", accessSourcePath, "MAX_REQUESTS_PER_SECOND = 5", "MAX_REQUESTS_PER_SECOND = 6"],
]);

for (const [name, sourcePath, search, replacement] of guards) {
    const original = await readFile(sourcePath, "utf8").catch(() => undefined);
    if (original === undefined) {
      throw new Error("Analytics source is absent. Run this guard harness after the GREEN implementation.");
    }
    try {
      if (!original.includes(search)) {
        throw new Error(`${name}: source guard marker is absent`);
      }
      const candidate = original.replace(search, replacement);
      await writeFile(sourcePath, candidate);
      const result = spawnSync("sh", ["-lc", testCommand], {
        cwd: new URL("..", import.meta.url), stdio: "ignore",
      });
      if (result.status === 0) {
        throw new Error(`${name}: mutation survived focused Analytics tests`);
      }
      console.log(`${name}: caught`);
    } finally {
      await writeFile(sourcePath, original);
    }
}
