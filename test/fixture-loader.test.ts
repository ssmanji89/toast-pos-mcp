import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("rejects a fixture symlink that resolves outside the fixture root", async (context) => {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "toast-pos-mcp-fixture-"),
  );
  const outsideFixturePath = path.join(temporaryDirectory, "outside.json");
  const fixtureLinkPath = path.resolve(
    process.cwd(),
    "test",
    "fixtures",
    "synthetic",
    "symlink-escape.json",
  );

  await writeFile(
    outsideFixturePath,
    JSON.stringify({
      fixtureKind: "synthetic",
      fixtureId: "synthetic-outside-root",
      restaurant: {
        guid: "00000000-0000-4000-8000-000000000099",
        name: "Synthetic Outside Root",
        timezone: "America/Chicago",
        closeoutHour: 4,
      },
    }),
    "utf8",
  );
  await rm(fixtureLinkPath, { force: true });

  try {
    try {
      await symlink(outsideFixturePath, fixtureLinkPath, "file");
    } catch (error) {
      if (isSymlinkPermissionError(error)) {
        context.skip("The current platform does not permit file symlink creation");
        return;
      }

      throw error;
    }

    await assert.rejects(
      loadSyntheticFixture("symlink-escape.json"),
      /escapes the fixture root/u,
    );
  } finally {
    await rm(fixtureLinkPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

function pathForCurrentPlatform(): string {
  return process.platform === "win32"
    ? "C:\\outside.json"
    : "/tmp/outside.json";
}

function isSymlinkPermissionError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPERM" || code === "EACCES" || code === "ENOTSUP";
}
