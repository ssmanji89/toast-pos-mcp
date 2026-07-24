import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

const SYNTHETIC_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "test",
  "fixtures",
  "synthetic",
);

const syntheticFixtureSchema = z
  .object({
    fixtureKind: z.literal("synthetic"),
    fixtureId: z.string().regex(/^synthetic-[a-z0-9-]+$/u),
    restaurant: z
      .object({
        guid: z.string().uuid(),
        name: z.string().startsWith("Synthetic "),
        timezone: z.string().min(1),
        closeoutHour: z.number().int().min(0).max(23),
      })
      .strict(),
  })
  .strict();

export type SyntheticFixture = z.infer<typeof syntheticFixtureSchema>;

function assertRelativeJsonPath(relativePath: string): void {
  if (relativePath.length === 0) {
    throw new Error("Synthetic fixture path must not be empty");
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error("Synthetic fixture path must be relative");
  }

  if (path.extname(relativePath).toLowerCase() !== ".json") {
    throw new Error("Synthetic fixtures must be JSON files");
  }
}

function assertWithinRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Synthetic fixture path escapes the fixture root");
  }
}

/** Load and validate one independently invented repository fixture. */
export async function loadSyntheticFixture(
  relativePath: string,
): Promise<SyntheticFixture> {
  assertRelativeJsonPath(relativePath);

  const root = await realpath(SYNTHETIC_FIXTURE_ROOT);
  const requestedPath = path.resolve(root, relativePath);
  assertWithinRoot(root, requestedPath);

  // Resolve symlinks before reading so a repository fixture cannot redirect the
  // harness outside the dedicated synthetic fixture boundary.
  const fixturePath = await realpath(requestedPath);
  assertWithinRoot(root, fixturePath);

  const source = await readFile(fixturePath, "utf8");
  const parsed: unknown = JSON.parse(source);

  return syntheticFixtureSchema.parse(parsed);
}
