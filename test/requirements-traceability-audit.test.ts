import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function manifest(rows: string[]): string {
  const parsed = rows.map((row) => row.split("|").slice(1, -1).map((value) => value.trim()));
  const first = parsed[0];
  if (!first) {
    throw new Error("manifest requires at least one row");
  }
  const source = first[1] ?? "";
  const anchor = first[2] ?? "";
  const digest = createHash("sha256")
    .update(parsed.map((row) => [row[0], row[1], row[2], row[3]].join("\u001f")).sort().join("\u001e"))
    .digest("hex");
  return [
    "# Required Leaf Manifest",
    "",
    "| Domain | Canonical source | Source anchor | Requirement ID prefix | Expected leaf count | Leaf digest |",
    "| --- | --- | --- | --- | --- | --- |",
    `| Fixture domain | ${source} | ${anchor} | REQ- | ${rows.length} | ${digest} |`,
    "",
  ].join("\n");
}

const validRequirement = "| REQ-ONE | AGENTS.md | AGENTS.md > Binding safety rules | `Read-only means structurally read-only.` | all tools | implemented | `src/server.ts` | synthetic-tested | `test/server.test.ts` | production-wired | external |";
const validMatrixRow = "| REQ-ONE | `src/server.ts` | `test/server.test.ts` | unverified | production-wired | synthetic-tested | external |";

function runAudit(requirements: string, evidenceMatrix: string, requiredLeaves = manifest([validRequirement])) {
  const directory = mkdtempSync(join(tmpdir(), "toast-traceability-audit-"));
  const inventoryPath = join(directory, "REQUIREMENTS.md");
  const matrixPath = join(directory, "matrix.md");
  const manifestPath = join(directory, "manifest.md");
  writeFileSync(inventoryPath, requirements);
  writeFileSync(matrixPath, evidenceMatrix);
  writeFileSync(manifestPath, requiredLeaves);

  try {
    return spawnSync(process.execPath, [audit.pathname, "--fixture", "--inventory", inventoryPath, "--matrix", matrixPath, "--manifest", manifestPath, "--required-source-commit", sourceCommit], {
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function projectDocuments() {
  const requirements = readFileSync(new URL(".planning/REQUIREMENTS.md", root), "utf8");
  const evidenceMatrix = readFileSync(new URL("docs/verification/phase-06-requirements-evidence-matrix.md", root), "utf8");
  const requiredLeaves = readFileSync(new URL("docs/verification/phase-06-required-leaf-manifest.md", root), "utf8");
  const requiredSourceCommit = requirements.match(/^\*\*Canonical source commit:\*\* `([^`]+)`/mu)?.[1];
  assert.ok(requiredSourceCommit);
  return { requirements, evidenceMatrix, requiredLeaves, requiredSourceCommit };
}

function runProjectAudit(requirements: string, evidenceMatrix: string, requiredLeaves: string, requiredSourceCommit: string) {
  const directory = mkdtempSync(join(tmpdir(), "toast-traceability-domain-"));
  const inventoryPath = join(directory, "REQUIREMENTS.md");
  const matrixPath = join(directory, "matrix.md");
  const manifestPath = join(directory, "manifest.md");
  writeFileSync(inventoryPath, requirements);
  writeFileSync(matrixPath, evidenceMatrix);
  writeFileSync(manifestPath, requiredLeaves);
  try {
    return spawnSync(process.execPath, [audit.pathname, "--inventory", inventoryPath, "--matrix", matrixPath, "--manifest", manifestPath, "--required-source-commit", requiredSourceCommit], { encoding: "utf8" });
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

test("audit rejects a compound baseline that overlaps atomic requirement rows", () => {
  const compound = validRequirement.replaceAll("REQ-ONE", "REQ-PROD-006");
  const atomic = validRequirement.replaceAll("REQ-ONE", "REQ-PROD-006A");
  const compoundMatrix = validMatrixRow.replaceAll("REQ-ONE", "REQ-PROD-006");
  const atomicMatrix = validMatrixRow.replaceAll("REQ-ONE", "REQ-PROD-006A");
  const result = runAudit(inventory([compound, atomic]), matrix([compoundMatrix, atomicMatrix]));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-006: compound baseline overlaps atomic requirement rows/u);
});

test("audit rejects removal of a source-derived required leaf", () => {
  const requiredLeaves = manifest(["| REQ-PROD-001E | AGENTS.md | AGENTS.md > Binding safety rules | any other Toast write operation in the reporting server. |"]);
  const result = runAudit(inventory([validRequirement]), matrix([validMatrixRow]), requiredLeaves);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Fixture domain: required leaf (count|digest) mismatch/u);
});

test("audit accepts the unmodified canonical repository documents", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(documents.requirements, documents.evidenceMatrix, documents.requiredLeaves, documents.requiredSourceCommit);
  assert.equal(result.status, 0, result.stderr);
});

test("audit rejects every mutation mode in every canonical source domain", () => {
  const documents = projectDocuments();
  const domains = [
    { name: "Product contract", id: "REQ-CONTRACT-001A" },
    { name: "Binding safety rules", id: "REQ-PROD-001A" },
    { name: "Architecture constraints", id: "REQ-ARCH-001" },
    { name: "GSD delivery rules", id: "REQ-DEL-001" },
    { name: "Delivery standard", id: "REQ-DEL-006" },
    { name: "Documentation check", id: "REQ-DEL-008" },
  ];

  for (const domain of domains) {
    const inventoryLine = documents.requirements.match(new RegExp(`^\\| ${domain.id} \\|.*\\n`, "mu"))?.[0];
    const matrixLine = documents.evidenceMatrix.match(new RegExp(`^\\| ${domain.id} \\|.*\\n`, "mu"))?.[0];
    assert.ok(inventoryLine, domain.id);
    assert.ok(matrixLine, domain.id);
    const addedId = domain.id.replace(/\d{3}[A-Z]?$/u, "999Z");
    const mutations = [
      { mode: "missing", requirements: documents.requirements.replace(inventoryLine, ""), evidenceMatrix: documents.evidenceMatrix.replace(matrixLine, ""), requiredLeaves: documents.requiredLeaves },
      { mode: "added", requirements: documents.requirements.replace(inventoryLine, `${inventoryLine}${inventoryLine.replace(domain.id, addedId)}`), evidenceMatrix: documents.evidenceMatrix.replace(matrixLine, `${matrixLine}${matrixLine.replace(domain.id, addedId)}`), requiredLeaves: documents.requiredLeaves },
      { mode: "changed", requirements: documents.requirements.replace(inventoryLine, inventoryLine.replace(/^(\| [^|]+ \| [^|]+ \| [^|]+ \| )[^|]+/u, "$1changed source clause")), evidenceMatrix: documents.evidenceMatrix, requiredLeaves: documents.requiredLeaves },
      { mode: "unmanifested", requirements: documents.requirements.replace(inventoryLine, `${inventoryLine}${inventoryLine.replace(domain.id, "REQ-UNMANIFESTED-001A")}`), evidenceMatrix: documents.evidenceMatrix.replace(matrixLine, `${matrixLine}${matrixLine.replace(domain.id, "REQ-UNMANIFESTED-001A")}`), requiredLeaves: documents.requiredLeaves },
    ];
    for (const mutation of mutations) {
      const result = runProjectAudit(mutation.requirements, mutation.evidenceMatrix, mutation.requiredLeaves, documents.requiredSourceCommit);
      assert.notEqual(result.status, 0, `${domain.name}/${mutation.mode}`);
      assert.match(result.stderr, /(required leaf (count|digest) mismatch|canonical inventory leaf is not covered|required leaf .* does not match inventory)/u, `${domain.name}/${mutation.mode}`);
    }
  }
});

test("audit independently requires each canonical domain when matching leaves also disappear", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredMatrix = documents.evidenceMatrix.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredManifest = documents.requiredLeaves.replace(/^\| Product contract \|.*\n/mu, "");
  const result = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest, documents.requiredSourceCommit);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing canonical source domain: Product contract/u);
});

test("audit rejects synchronized leaf, matrix, and manifest fingerprint mutation", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredMatrix = documents.evidenceMatrix.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredManifest = documents.requiredLeaves.replace(
    "| Product contract | AGENTS.md | AGENTS.md > Product contract | REQ-CONTRACT- | 10 | f98c522fa3c58d205d330874768a6a0a0988543c6366bb5186ee8993e3918bb7 |",
    "| Product contract | AGENTS.md | AGENTS.md > Product contract | REQ-CONTRACT- | 9 | c7459f4ba8ab01f873fcac85b4cfbba9ec7fddae48192e6a7c8e4797fd9a4104 |",
  );
  const result = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest, documents.requiredSourceCommit);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Product contract: canonical source domain (expected leaf count|leaf digest) mismatch/u);
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
