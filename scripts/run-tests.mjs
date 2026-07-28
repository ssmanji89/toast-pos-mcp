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

// A build or discovery regression must fail the gate rather than presenting an
// empty run as a pass.
if (files.length === 0) {
  console.error(`no compiled test files discovered under ${TEST_ROOT}`);
  process.exit(1);
}

console.log(`discovered ${files.length} test file(s):`);
for (const file of files) {
  console.log(`  ${file}`);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--enable-source-maps", ...files],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(`failed to start the test runner: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
