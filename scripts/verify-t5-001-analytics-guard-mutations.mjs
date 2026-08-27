import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const sourcePath = new URL("../src/analytics-access.ts", import.meta.url);
const testCommand = [
  "npm", "run", "build:test", "--", "&&", "node", "--test",
  "dist-test/test/analytics-config.test.js",
  "dist-test/test/analytics-capabilities.test.js",
  "dist-test/test/analytics-access-adapter.test.js",
];

const guards = Object.freeze([
  ["analytics-method", "method: \"GET\"", "method: \"POST\""],
  ["analytics-path", "/era/v1/restaurants-information", "/era/v1/guest/payments"],
  ["analytics-standard-header", "Toast-Restaurant-External-ID", "Toast-Restaurant-External-ID: \"forbidden\""],
  ["analytics-scope-preflight", "enterprise-metrics:read", "enterprise-metrics:write"],
  ["analytics-schema", "analyticsRestaurantResponseSchema", "z.unknown()"],
  ["analytics-duplicate-guid", "seenRestaurantGuids.has", "false"],
  ["analytics-selection-duplicate", "seen.has", "false"],
  ["analytics-selection-membership", "registry.restaurantByGuid.has", "true"],
  ["analytics-cancellation", "signal: options.signal", "signal: undefined"],
]);

const original = await readFile(sourcePath, "utf8").catch(() => undefined);
if (original === undefined) {
  console.error("Analytics source is absent. Run this guard harness after the GREEN implementation.");
  process.exitCode = 1;
} else {
  const temporary = await mkdtemp(join(tmpdir(), "t5-001-analytics-guards-"));
  try {
    for (const [name, search, replacement] of guards) {
      if (!original.includes(search)) {
        throw new Error(`${name}: source guard marker is absent`);
      }
      const candidate = original.replace(search, replacement);
      await writeFile(sourcePath, candidate);
      const result = spawnSync(testCommand[0], testCommand.slice(1), {
        cwd: new URL("..", import.meta.url), shell: true, stdio: "ignore",
      });
      if (result.status === 0) {
        throw new Error(`${name}: mutation survived focused Analytics tests`);
      }
      await writeFile(sourcePath, original);
      console.log(`${name}: caught`);
    }
  } finally {
    await writeFile(sourcePath, original);
    await rm(temporary, { recursive: true, force: true });
  }
}
