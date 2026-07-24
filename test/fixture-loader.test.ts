import assert from "node:assert/strict";
import test from "node:test";

import { loadSyntheticFixture } from "./support/synthetic-fixtures.js";

test("loads a validated independently invented fixture", async () => {
  const fixture = await loadSyntheticFixture("runtime-context.json");

  assert.equal(fixture.fixtureKind, "synthetic");
  assert.equal(fixture.fixtureId, "synthetic-runtime-context");
  assert.equal(fixture.restaurant.name, "Synthetic Harbor Cafe");
});

test("rejects parent traversal", async () => {
  await assert.rejects(
    loadSyntheticFixture("../outside.json"),
    /escapes the fixture root/u,
  );
});

test("rejects absolute paths", async () => {
  const absolutePath = pathForCurrentPlatform();

  await assert.rejects(
    loadSyntheticFixture(absolutePath),
    /must be relative/u,
  );
});

test("rejects non-JSON files", async () => {
  await assert.rejects(
    loadSyntheticFixture("runtime-context.txt"),
    /must be JSON files/u,
  );
});

function pathForCurrentPlatform(): string {
  return process.platform === "win32"
    ? "C:\\outside.json"
    : "/tmp/outside.json";
}
