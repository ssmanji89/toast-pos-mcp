#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants as fsConstants, existsSync } from "node:fs";
import { access, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PREVIEW_VERSION = "0.1.0-preview.1";
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNTIME_CACHE_ROOT = join(
  PLUGIN_ROOT,
  "node_modules",
  ".cache",
  "toast-pos-mcp-preview",
  PREVIEW_VERSION,
);
const DIST_ENTRY = join(RUNTIME_CACHE_ROOT, "dist", "index.js");
const TSC_ENTRY = join(PLUGIN_ROOT, "node_modules", "typescript", "bin", "tsc");
const TSCONFIG = join(PLUGIN_ROOT, "tsconfig.json");
const BUILD_LOCK = join(RUNTIME_CACHE_ROOT, ".build-lock");
const BUILD_TIMEOUT_MS = 120_000;
const BUILD_LOCK_STALE_MS = 135_000;
const BUILD_WAIT_INTERVAL_MS = 100;

try {
  assertSupportedNode();
  await ensureRuntimeBuilt();
  await import(pathToFileURL(DIST_ENTRY).href);
} catch {
  // stdout is reserved for MCP JSON-RPC. Keep failure output generic so no
  // configured credential, environment value, compiler detail, or caught
  // error can cross this wrapper boundary.
  console.error("toast-pos-mcp Claude plugin failed to start");
  process.exitCode = 1;
}

function assertSupportedNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isSafeInteger(major) || major < 20) {
    throw new Error("unsupported Node.js runtime");
  }
}

async function ensureRuntimeBuilt() {
  if (await pathExists(DIST_ENTRY)) return;

  await mkdir(RUNTIME_CACHE_ROOT, { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await acquireBuildLock()) {
      try {
        if (!(await pathExists(DIST_ENTRY))) {
          buildRuntime();
        }
        if (!(await pathExists(DIST_ENTRY))) {
          throw new Error("runtime build did not create its entry point");
        }
        return;
      } finally {
        await rm(BUILD_LOCK, { recursive: true, force: true });
      }
    }

    const waitResult = await waitForConcurrentBuild();
    if (waitResult === "built") return;
  }

  throw new Error("runtime build lock could not be acquired");
}

async function acquireBuildLock() {
  for (;;) {
    try {
      await mkdir(BUILD_LOCK);
      return true;
    } catch (error) {
      if (!isFileSystemError(error, "EEXIST")) throw error;
      if (!(await buildLockIsStale())) return false;
      await rm(BUILD_LOCK, { recursive: true, force: true });
    }
  }
}

async function waitForConcurrentBuild() {
  const deadline = Date.now() + BUILD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await pathExists(DIST_ENTRY)) return "built";
    if (!(await pathExists(BUILD_LOCK)) || (await buildLockIsStale())) {
      return "retry";
    }
    await sleep(BUILD_WAIT_INTERVAL_MS);
  }
  return "retry";
}

function buildRuntime() {
  if (!existsSync(TSC_ENTRY) || !existsSync(TSCONFIG)) {
    throw new Error("plugin dependencies are unavailable");
  }

  const result = spawnSync(
    process.execPath,
    [
      TSC_ENTRY,
      "-p",
      TSCONFIG,
      "--outDir",
      join(RUNTIME_CACHE_ROOT, "dist"),
      "--declaration",
      "false",
      "--declarationMap",
      "false",
      "--sourceMap",
      "false",
    ],
    {
      cwd: PLUGIN_ROOT,
      stdio: "ignore",
      timeout: BUILD_TIMEOUT_MS,
      windowsHide: true,
    },
  );

  if (result.error !== undefined || result.signal !== null || result.status !== 0) {
    throw new Error("plugin runtime compilation failed");
  }
}

async function buildLockIsStale() {
  try {
    const metadata = await stat(BUILD_LOCK);
    return Date.now() - metadata.mtimeMs >= BUILD_LOCK_STALE_MS;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return false;
    throw error;
  }
}

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (isFileSystemError(error, "ENOENT")) return false;
    throw error;
  }
}

function isFileSystemError(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
