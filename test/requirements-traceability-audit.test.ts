import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const audit = new URL("scripts/audit-requirements-traceability.mjs", root);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const requiredGates = [
  "#60",
  "#28",
  "T5-003-G01",
  "PR #55 review",
  "PR #58 review",
  "Merchant consent and live Analytics",
  "Terms and brand approval",
  "Signing and publication",
];

function inventory(rows: string[]): string {
  return [
    "# Formal Requirement Inventory",
    "",
    `**Canonical source commit:** \`${sourceCommit}\``,
    "",
    "| ID | Canonical source | Source anchor | Canonical quote | Applies to | Implementation status | Implementation links | Evidence status | Evidence links | Production reachability | External-gate disposition |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function matrix(requirementRows: string[], gateRows = requiredGates.map((gate) => `| ${gate} | owner | external proof | open | external |`)): string {
  return [
    "# Evidence Matrix",
    "",
    "| Requirement ID | Implementation links | Local evidence | Review evidence | Production reachability | Evidence level | Gate disposition |",
    "| --- | --- | --- | --- | --- | --- |",
    ...requirementRows,
    "",
    "## Mandatory external gates",
    "",
    "| Gate ID | Owner | Required proof | State | Evidence basis |",
    "| --- | --- | --- | --- | --- |",
    ...gateRows,
    "",
  ].join("\n");
}

const validRequirement = "| REQ-ONE | AGENTS.md | AGENTS.md > Binding safety rules | `Read-only means structurally read-only.` | all tools | implemented | `src/server.ts` | synthetic-tested | `test/server.test.ts` | production-wired | external |";
const validMatrixRow = "| REQ-ONE | `src/server.ts` | `test/server.test.ts` | unverified | production-wired | synthetic-tested | external |";

function runAudit(requirements: string, evidenceMatrix: string) {
  const directory = mkdtempSync(join(tmpdir(), "toast-traceability-audit-"));
  const inventoryPath = join(directory, "REQUIREMENTS.md");
  const matrixPath = join(directory, "matrix.md");
  writeFileSync(inventoryPath, requirements);
  writeFileSync(matrixPath, evidenceMatrix);

  try {
    return spawnSync(process.execPath, [audit.pathname, "--inventory", inventoryPath, "--matrix", matrixPath, "--required-source-commit", sourceCommit], {
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("audit accepts a complete source-traceable inventory", () => {
  const result = runAudit(inventory([validRequirement]), matrix([validMatrixRow]));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /requirements traceability audit: passed/u);
});

test("audit rejects a requirement with a missing required field", () => {
  const missingQuote = validRequirement.replace("`Read-only means structurally read-only.`", "unverified");
  const result = runAudit(inventory([missingQuote]), matrix([validMatrixRow]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-ONE: missing canonical quote/u);
});

test("audit rejects a canonical quote that is absent from its required source revision", () => {
  const forgedQuote = validRequirement.replace("Read-only means structurally read-only.", "Invented release-ready requirement.");
  const result = runAudit(inventory([forgedQuote]), matrix([validMatrixRow]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-ONE: canonical quote is absent from AGENTS.md section AGENTS.md > Binding safety rules at /u);
});

test("audit rejects a quote that occurs outside its claimed source section", () => {
  const swappedAnchor = validRequirement.replace(
    "AGENTS.md | AGENTS.md > Binding safety rules | `Read-only means structurally read-only.`",
    "LOOP.md | LOOP.md > Product boundary | `Deliver a public, locally run, read-only Toast POS Reporting MCP server that produces deterministic, source-attributed reports without exposing credentials, guest-linked data, or write capabilities.`",
  );
  const result = runAudit(inventory([swappedAnchor]), matrix([validMatrixRow]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-ONE: canonical quote is absent from LOOP.md section LOOP.md > Product boundary at /u);
});

test("audit rejects invalid inventory and matrix status enums", () => {
  const invalidInventory = validRequirement.replace("| implemented |", "| complete |");
  const invalidMatrix = validMatrixRow.replace("| synthetic-tested |", "| complete |" );
  const result = runAudit(inventory([invalidInventory]), matrix([invalidMatrix]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-ONE: invalid implementation status: complete/u);
  assert.match(result.stderr, /REQ-ONE: invalid evidence level: complete/u);
});

test("audit rejects duplicate and unlinked requirement IDs", () => {
  const duplicate = runAudit(inventory([validRequirement, validRequirement]), matrix([validMatrixRow]));
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /duplicate inventory ID: REQ-ONE/u);

  const unlinked = runAudit(inventory([validRequirement]), matrix(["| REQ-TWO | unverified | unverified | unverified | unverified | unverified | unverified |"]));
  assert.notEqual(unlinked.status, 0);
  assert.match(unlinked.stderr, /matrix ID has no inventory record: REQ-TWO/u);
  assert.match(unlinked.stderr, /inventory ID has no matrix record: REQ-ONE/u);
});

test("audit rejects a synthetic or local review claim that closes an external gate", () => {
  const collapsedGates = requiredGates.map((gate) => {
    if (gate === "#60") {
      return "| #60 | owner | external proof | closed | synthetic-tested |";
    }

    return `| ${gate} | owner | external proof | open | external |`;
  });
  const result = runAudit(inventory([validRequirement]), matrix([validMatrixRow], collapsedGates));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /#60: external gate cannot close from synthetic-tested evidence/u);
});

test("audit requires every separate mandatory external gate", () => {
  const result = runAudit(inventory([validRequirement]), matrix([validMatrixRow], requiredGates.slice(1).map((gate) => `| ${gate} | owner | external proof | open | external |`)));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing mandatory gate row: #60/u);
});
