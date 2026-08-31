import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const REPOSITORY_ROOT = process.cwd();
const VALIDATOR = resolve(
  REPOSITORY_ROOT,
  "scripts",
  "validate-claude-preview-plugin.mjs",
);
const LAUNCHER = resolve(
  REPOSITORY_ROOT,
  "scripts",
  "claude-plugin-launcher.mjs",
);
const PREVIEW_VERSION = "0.1.0-preview.1";

test("Claude Code preview manifest, marketplace, MCP, docs, and feedback contract validate", () => {
  const result = spawnSync(process.execPath, [VALIDATOR], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(
    result.stdout,
    /Claude Code public-preview plugin contract validated/u,
  );
  assert.equal(result.stderr, "");
});

test("cache-local launcher compiles once without MCP stdout noise and fails generically", async () => {
  const root = await mkdirTemporaryRoot();
  const scripts = join(root, "scripts");
  const compiler = join(root, "node_modules", "typescript", "bin", "tsc");
  const runtimeEntry = join(
    root,
    "node_modules",
    ".cache",
    "toast-pos-mcp-preview",
    PREVIEW_VERSION,
    "dist",
    "index.js",
  );

  try {
    await mkdir(scripts, { recursive: true });
    await mkdir(join(root, "node_modules", "typescript", "bin"), {
      recursive: true,
    });
    await writeFile(
      join(root, "node_modules", "typescript", "package.json"),
      JSON.stringify({ type: "commonjs" }),
    );
    await cp(LAUNCHER, join(scripts, "claude-plugin-launcher.mjs"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ type: "module" }),
    );
    await writeFile(
      join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022" } }),
    );
    await writeFakeCompiler(compiler, false);

    const first = runLauncher(root);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.equal(first.stdout, "");
    assert.equal(first.stderr, "preview-runtime-started\n");
    assert.match(await readFile(runtimeEntry, "utf8"), /preview-runtime-started/u);

    // A completed build is reused. Replacing the compiler with a failure must
    // not affect the second launch of the same preview version.
    await writeFakeCompiler(compiler, true);
    const second = runLauncher(root);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
    assert.equal(second.stdout, "");
    assert.equal(second.stderr, "preview-runtime-started\n");

    await rm(dirnameForVersionCache(root), { recursive: true, force: true });
    await rm(compiler, { force: true });
    const failed = runLauncher(root, {
      TOAST_CLIENT_SECRET: "preview-secret-must-not-leak",
    });
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, "");
    assert.equal(
      failed.stderr,
      "toast-pos-mcp Claude plugin failed to start\n",
    );
    assert.ok(!failed.stderr.includes("preview-secret-must-not-leak"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function mkdirTemporaryRoot(): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), "toast-pos-mcp-claude-preview-"));
}

async function writeFakeCompiler(path: string, fail: boolean): Promise<void> {
  const runtimeSource = JSON.stringify(
    'process.stderr.write("preview-runtime-started\\n");\n',
  );
  const source = fail
    ? "process.exitCode = 71;\n"
    : `
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const outIndex = process.argv.indexOf("--outDir");
if (outIndex < 0 || process.argv[outIndex + 1] === undefined) process.exit(72);
const outDir = process.argv[outIndex + 1];
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.js"), ${runtimeSource});
`;
  await writeFile(path, source);
}

function runLauncher(
  root: string,
  environment: Readonly<Record<string, string>> = {},
) {
  return spawnSync(
    process.execPath,
    [join(root, "scripts", "claude-plugin-launcher.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...environment },
    },
  );
}

function dirnameForVersionCache(root: string): string {
  return join(
    root,
    "node_modules",
    ".cache",
    "toast-pos-mcp-preview",
    PREVIEW_VERSION,
  );
}
