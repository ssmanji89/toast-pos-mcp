import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const audit = new URL("scripts/audit-requirements-traceability.mjs", root);
const canonicalSourceCommit = "761cba89b70c3da96f71cb84b3eaa4ef849438c5";

function projectDocuments() {
  const requirements = readFileSync(new URL(".planning/REQUIREMENTS.md", root), "utf8");
  const evidenceMatrix = readFileSync(new URL("docs/verification/phase-06-requirements-evidence-matrix.md", root), "utf8");
  const requiredLeaves = readFileSync(new URL("docs/verification/phase-06-required-leaf-manifest.md", root), "utf8");
  return { requirements, evidenceMatrix, requiredLeaves };
}

function runProjectAudit(requirements: string, evidenceMatrix: string, requiredLeaves: string, extraArguments: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "toast-traceability-domain-"));
  const inventoryPath = join(directory, "REQUIREMENTS.md");
  const matrixPath = join(directory, "matrix.md");
  const manifestPath = join(directory, "manifest.md");
  writeFileSync(inventoryPath, requirements);
  writeFileSync(matrixPath, evidenceMatrix);
  writeFileSync(manifestPath, requiredLeaves);
  try {
    return spawnSync(process.execPath, [audit.pathname, "--inventory", inventoryPath, "--matrix", matrixPath, "--manifest", manifestPath, ...extraArguments], { encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("audit accepts a complete source-traceable inventory", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(documents.requirements, documents.evidenceMatrix, documents.requiredLeaves);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /requirements traceability audit: passed/u);
});

test("audit rejects a requirement with a missing required field", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(/^\| REQ-PROD-001A \|([^|]*\|){2}[^|]*/mu, "| REQ-PROD-001A | AGENTS.md | AGENTS.md > Binding safety rules | unverified");
  const result = runProjectAudit(alteredRequirements, documents.evidenceMatrix, documents.requiredLeaves);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-001A: missing canonical quote/u);
});

test("audit rejects a canonical quote that is absent from its required source revision", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(/^\| REQ-PROD-001A \|([^|]*\|){2}[^|]*/mu, "| REQ-PROD-001A | AGENTS.md | AGENTS.md > Binding safety rules | invented release-ready requirement");
  const result = runProjectAudit(alteredRequirements, documents.evidenceMatrix, documents.requiredLeaves);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-001A: canonical quote is absent from AGENTS.md section AGENTS.md > Binding safety rules at /u);
});

test("audit rejects a quote that occurs outside its claimed source section", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(
    "| REQ-PROD-001A | AGENTS.md | AGENTS.md > Binding safety rules |",
    "| REQ-PROD-001A | LOOP.md | LOOP.md > Product boundary |",
  );
  const result = runProjectAudit(alteredRequirements, documents.evidenceMatrix, documents.requiredLeaves);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-001A: canonical quote is absent from LOOP.md section LOOP.md > Product boundary at /u);
});

test("audit rejects invalid inventory and matrix status enums", () => {
  const documents = projectDocuments();
  const invalidInventory = documents.requirements.replace("| implemented |", "| complete |");
  const invalidMatrix = documents.evidenceMatrix.replace("| synthetic-tested |", "| complete |");
  const result = runProjectAudit(invalidInventory, invalidMatrix, documents.requiredLeaves);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-004A: invalid implementation status: complete/u);
  assert.match(result.stderr, /REQ-PROD-004A: invalid evidence level: complete/u);
});

test("audit rejects duplicate and unlinked requirement IDs", () => {
  const documents = projectDocuments();
  const inventoryLine = documents.requirements.match(/^\| REQ-PROD-001A \|.*\n/mu)?.[0];
  const matrixLine = documents.evidenceMatrix.match(/^\| REQ-PROD-001A \|.*\n/mu)?.[0];
  assert.ok(inventoryLine);
  assert.ok(matrixLine);
  const duplicate = runProjectAudit(documents.requirements.replace(inventoryLine, `${inventoryLine}${inventoryLine}`), documents.evidenceMatrix, documents.requiredLeaves);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /duplicate inventory ID: REQ-PROD-001A/u);

  const unlinked = runProjectAudit(documents.requirements, documents.evidenceMatrix.replace(matrixLine, matrixLine.replace("REQ-PROD-001A", "REQ-UNLINKED-001")), documents.requiredLeaves);
  assert.notEqual(unlinked.status, 0);
  assert.match(unlinked.stderr, /matrix ID has no inventory record: REQ-UNLINKED-001/u);
  assert.match(unlinked.stderr, /inventory ID has no matrix record: REQ-PROD-001A/u);
});

test("audit rejects a compound baseline that overlaps atomic requirement rows", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(
    documents.requirements.replace("| REQ-PROD-006A |", "| REQ-PROD-006 |"),
    documents.evidenceMatrix.replace("| REQ-PROD-006A |", "| REQ-PROD-006 |"),
    documents.requiredLeaves,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REQ-PROD-006: compound baseline overlaps atomic requirement rows/u);
});

test("audit rejects removal of a source-derived required leaf", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(
    documents.requirements.replace(/^\| REQ-PROD-001A \|.*\n/mu, ""),
    documents.evidenceMatrix.replace(/^\| REQ-PROD-001A \|.*\n/mu, ""),
    documents.requiredLeaves,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Binding safety rules: required leaf (count|digest) mismatch/u);
});

test("audit accepts the unmodified canonical repository documents", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(documents.requirements, documents.evidenceMatrix, documents.requiredLeaves);
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
      const result = runProjectAudit(mutation.requirements, mutation.evidenceMatrix, mutation.requiredLeaves);
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
  const result = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest);
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
  const result = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Product contract: canonical source domain (expected leaf count|leaf digest) mismatch/u);
});

test("audit rejects redirected inventory and manifest source revisions", () => {
  const documents = projectDocuments();
  const redirectedCommit = "1111111111111111111111111111111111111111";
  const alteredRequirements = documents.requirements.replace(canonicalSourceCommit, redirectedCommit);
  const alteredManifest = documents.requiredLeaves.replace(canonicalSourceCommit, redirectedCommit);
  const result = runProjectAudit(alteredRequirements, documents.evidenceMatrix, alteredManifest);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /stale inventory source commit: expected 761cba89b70c3da96f71cb84b3eaa4ef849438c5/u);
  assert.match(result.stderr, /stale manifest source commit: expected 761cba89b70c3da96f71cb84b3eaa4ef849438c5/u);
});

test("audit rejects the former fixture bypass during synchronized leaf removal", () => {
  const documents = projectDocuments();
  const alteredRequirements = documents.requirements.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredMatrix = documents.evidenceMatrix.replace(/^\| REQ-CONTRACT-001A \|.*\n/mu, "");
  const alteredManifest = documents.requiredLeaves.replace(
    "| Product contract | AGENTS.md | AGENTS.md > Product contract | REQ-CONTRACT- | 10 | f98c522fa3c58d205d330874768a6a0a0988543c6366bb5186ee8993e3918bb7 |",
    "| Product contract | AGENTS.md | AGENTS.md > Product contract | REQ-CONTRACT- | 9 | c7459f4ba8ab01f873fcac85b4cfbba9ec7fddae48192e6a7c8e4797fd9a4104 |",
  );
  const result = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest, ["--fixture", "--required-source-commit", canonicalSourceCommit]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported argument: --fixture/u);

  const revisionOverride = runProjectAudit(alteredRequirements, alteredMatrix, alteredManifest, ["--required-source-commit", canonicalSourceCommit]);
  assert.notEqual(revisionOverride.status, 0);
  assert.match(revisionOverride.stderr, /unsupported argument: --required-source-commit/u);
});

test("audit rejects a synthetic or local review claim that closes an external gate", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(
    documents.requirements,
    documents.evidenceMatrix.replace(/^\| #60 \|.*$/mu, "| #60 | owner | external proof | closed | synthetic-tested |"),
    documents.requiredLeaves,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /#60: external gate cannot close from synthetic-tested evidence/u);
});

test("audit requires every separate mandatory external gate", () => {
  const documents = projectDocuments();
  const result = runProjectAudit(
    documents.requirements,
    documents.evidenceMatrix.replace(/^\| #60 \|.*\n/mu, ""),
    documents.requiredLeaves,
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing mandatory gate row: #60/u);
});
