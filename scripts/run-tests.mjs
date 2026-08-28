#!/usr/bin/env node

// Discover compiled test files and hand explicit paths to the Node test runner.
//
// Neither of the shorter alternatives is portable across the supported Node
// range. A quoted glob (`node --test "dist-test/test/**/*.test.js"`) is only
// expanded by the runner on Node 22 and later, so it fails outright on the
// Node 20 floor this package declares. Passing the directory instead diverges
// the other way: Node 20 walks it and executes every .js file it finds,
// including support modules that contain no tests, while Node 22 resolves the
// path as a module and fails to load it.
//
// Discovering here and passing concrete file paths behaves identically on every
// supported version, and excludes support modules by construction.

import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const TEST_ROOT = path.join("dist-test", "test");

if (!existsSync(TEST_ROOT)) {
  console.error(`compiled test directory ${TEST_ROOT} does not exist; run the test build first`);
  process.exit(1);
}

const files = readdirSync(TEST_ROOT, { recursive: true })
  .map((entry) => String(entry))
  .filter((entry) => entry.endsWith(".test.js"))
  .map((entry) => path.join(TEST_ROOT, entry))
  .sort();

const artifactTest = path.join(TEST_ROOT, "package-artifact-e2e.test.js");
const normalFiles = files.filter((file) => file !== artifactTest);

// A build or discovery regression must fail the gate rather than presenting an
// empty run as a pass. The artifact test runs last because npm prepack removes
// dist-test while it creates the real tarball.
if (normalFiles.length === 0) {
  console.error(`no compiled test files discovered under ${TEST_ROOT}`);
  process.exit(1);
}

if (!files.includes(artifactTest)) {
  console.error(`required compiled artifact test ${artifactTest} does not exist`);
  process.exit(1);
}

console.log(`discovered ${files.length} test file(s); running ${normalFiles.length} normal file(s) before the artifact test:`);
for (const file of normalFiles) {
  console.log(`  ${file}`);
}

const normalResult = spawnSync(
  process.execPath,
  ["--test", "--enable-source-maps", ...normalFiles],
  { stdio: "inherit" },
);

if (normalResult.error) {
  console.error(`failed to start the normal test runner: ${normalResult.error.message}`);
  process.exit(1);
}

if (normalResult.status !== 0) process.exit(normalResult.status ?? 1);

const artifactResult = spawnSync(
  process.execPath,
  ["--test", "--enable-source-maps", artifactTest],
  { stdio: "inherit" },
);

if (artifactResult.error) {
  console.error(`failed to start the artifact test runner: ${artifactResult.error.message}`);
  process.exit(1);
}

if (artifactResult.status !== 0) process.exit(artifactResult.status ?? 1);

const rebuildResult = spawnSync("npm", ["run", "build:test"], { stdio: "inherit" });
if (rebuildResult.error) {
  console.error(`failed to rebuild compiled tests after artifact packaging: ${rebuildResult.error.message}`);
  process.exit(1);
}

process.exit(rebuildResult.status ?? 1);
