import { readFileSync } from "node:fs";

const mandatoryGates = [
  "#60",
  "#28",
  "T5-003-G01",
  "PR #55 review",
  "PR #58 review",
  "Merchant consent and live Analytics",
  "Terms and brand approval",
  "Signing and publication",
];

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required argument: ${name}`);
  }

  return process.argv[index + 1];
}

function table(markdown, expectedFirstColumn) {
  const lines = markdown.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => line.startsWith(`| ${expectedFirstColumn} |`));
  if (headerIndex < 0) {
    throw new Error(`missing table with first column: ${expectedFirstColumn}`);
  }

  const headers = lines[headerIndex].split("|").slice(1, -1).map((value) => value.trim());
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) {
      break;
    }

    const values = line.split("|").slice(1, -1).map((value) => value.trim());
    if (values.length !== headers.length) {
      throw new Error(`malformed ${expectedFirstColumn} table row: ${line}`);
    }

    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  }

  return rows;
}

function missing(value) {
  return !value || value === "unverified";
}

function audit(inventoryMarkdown, matrixMarkdown, requiredSourceCommit) {
  const diagnostics = [];
  const inventoryCommit = inventoryMarkdown.match(/^\*\*Canonical source commit:\*\* `([^`]+)`/mu)?.[1];
  if (inventoryCommit !== requiredSourceCommit) {
    diagnostics.push(`stale source commit: expected ${requiredSourceCommit}, found ${inventoryCommit ?? "missing"}`);
  }

  const inventoryRows = table(inventoryMarkdown, "ID");
  const matrixRows = table(matrixMarkdown, "Requirement ID");
  const gateRows = table(matrixMarkdown.slice(matrixMarkdown.indexOf("## Mandatory external gates")), "Gate ID");
  const inventoryIds = new Set();
  const matrixIds = new Set();

  for (const row of inventoryRows) {
    const id = row.ID;
    if (inventoryIds.has(id)) {
      diagnostics.push(`duplicate inventory ID: ${id}`);
      continue;
    }

    inventoryIds.add(id);
    for (const [column, diagnosticName] of [
      ["Canonical source", "canonical source"],
      ["Source anchor", "source anchor"],
      ["Canonical quote", "canonical quote"],
    ]) {
      if (missing(row[column])) {
        diagnostics.push(`${id}: missing ${diagnosticName}`);
      }
    }
    for (const [column, diagnosticName] of [
      ["Implementation status", "implementation status"],
      ["Evidence status", "evidence status"],
      ["External-gate disposition", "gate disposition"],
    ]) {
      if (!row[column]) {
        diagnostics.push(`${id}: missing ${diagnosticName}`);
      }
    }
  }

  const evidenceLevels = new Set(["implemented", "synthetic-tested", "independent-review", "production-wired", "live-proven", "unverified", "external"]);
  for (const row of matrixRows) {
    const id = row["Requirement ID"];
    if (matrixIds.has(id)) {
      diagnostics.push(`duplicate matrix ID: ${id}`);
      continue;
    }

    matrixIds.add(id);
    if (!inventoryIds.has(id)) {
      diagnostics.push(`matrix ID has no inventory record: ${id}`);
    }
    if (!evidenceLevels.has(row["Evidence level"])) {
      diagnostics.push(`${id}: invalid evidence level: ${row["Evidence level"]}`);
    }
    for (const column of ["Implementation links", "Local evidence", "Review evidence", "Production reachability", "Gate disposition"]) {
      if (!row[column]) {
        diagnostics.push(`${id}: missing matrix ${column.toLowerCase()}`);
      }
    }
  }

  for (const id of inventoryIds) {
    if (!matrixIds.has(id)) {
      diagnostics.push(`inventory ID has no matrix record: ${id}`);
    }
  }

  const gates = new Map();
  for (const row of gateRows) {
    const id = row["Gate ID"];
    if (gates.has(id)) {
      diagnostics.push(`duplicate mandatory gate row: ${id}`);
      continue;
    }

    gates.set(id, row);
    if (!["open", "pending", "external"].includes(row.State)) {
      diagnostics.push(`${id}: invalid external gate state: ${row.State}`);
    }
    if (row.State === "closed" && /synthetic|merged|local|review/iu.test(row["Evidence basis"])) {
      diagnostics.push(`${id}: external gate cannot close from ${row["Evidence basis"]} evidence`);
    }
  }

  for (const gate of mandatoryGates) {
    if (!gates.has(gate)) {
      diagnostics.push(`missing mandatory gate row: ${gate}`);
    }
  }

  return diagnostics;
}

try {
  const diagnostics = audit(
    readFileSync(argument("--inventory"), "utf8"),
    readFileSync(argument("--matrix"), "utf8"),
    argument("--required-source-commit"),
  );
  if (diagnostics.length > 0) {
    process.stderr.write(`${diagnostics.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write("requirements traceability audit: passed\n");
  }
} catch (error) {
  process.stderr.write(`requirements traceability audit: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
