#!/usr/bin/env node

/**
 * Prove that each named PR #34 normalization guard has a test that rejects a
 * one-at-a-time source regression. This script never edits the caller's tree.
 */
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const nodeModules = path.join(root, "node_modules");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "toast-pr34-mutations-"));
const test = (file) => `dist-test/test/${file}.js`;
const guards = [];

function guard(id, file, find, replace, testFile) {
  guards.push({ id, file, find, replace, testFile: test(testFile) });
}

// N: source/query, normalization, privacy, and provenance guards.
guard("N01b", "src/orders-normalization-helpers.ts", "if (!isValidBusinessDate(query.businessDate))", "if (false)", "orders-normalization.test");
guard("N02b", "src/orders-normalization-traversal.ts", "if (query.mode === \"business_date\" && parsed.data.businessDate !== query.businessDate)", "if (false)", "orders-normalization-r3-fixes.test");
guard("N03", "src/orders-normalization-helpers.ts", "Date.parse(query.endDate) <= Date.parse(query.startDate)", "false", "orders-normalization.test");
guard("N04", "src/orders-normalization-traversal.ts", "!CURRENCY_CODE_PATTERN.test(options.location.currencyCode)", "false", "orders-normalization.test");
guard("N05", "src/orders-normalization-traversal.ts", "options.pages.length === 0", "false", "orders-normalization.test");
guard("N06", "src/orders-normalization-helpers.ts", "page.retrievedAtEpochMs < 0", "false", "orders-normalization.test");
guard("N07", "src/orders-normalization-helpers.ts", "page.upstreamRequestId.length === 0", "false", "orders-normalization-pr34-remediation.test");
guard("N08", "src/orders-normalization-traversal.ts", "if (!parsed.success) throw sourceInvalid();\n      if (query.mode", "if (!parsed.success) continue;\n      if (query.mode", "orders-normalization.test");
guard("N09", "src/orders-normalization-helpers.ts", "const parsed = guidSchema.safeParse(value);", "const parsed = { success: true, data: value };", "orders-normalization-pr34-remediation.test");
guard("N10", "src/orders-normalization-source.ts", "z.number().int().min(0).optional()", "z.number().int().optional()", "orders-normalization-review-fixes.test");
guard("N11", "src/orders-normalization-helpers.ts", "return ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value));", "return !Number.isNaN(Date.parse(value));", "orders-normalization-review-fixes.test");
guard("N12", "src/orders-normalization-source.ts", "taxExempt: z.boolean().default(false)", "taxExempt: z.boolean().default(true)", "orders-normalization-r3-fixes.test");
guard("N13", "src/orders-normalization-helpers.ts", "Number(value.toFixed(2)) !== value", "false", "orders-normalization.test");
guard("N14", "src/orders-normalization-helpers.ts", "if (!Number.isSafeInteger(hundredths))", "if (false)", "orders-normalization-pr34-remediation.test");
guard("N15", "src/orders-normalization-traversal.ts", "while (stack.length > 0)", "while (stack.length > 1)", "orders-normalization.test");
guard("N16", "src/orders-normalization-traversal.ts", "assertUnique(seenOrderGuids, guid, \"order\");", "void guid;", "orders-normalization-pr34-remediation.test");
guard("N17", "src/orders-normalization-traversal.ts", "assertUnique(guards.checkGuids, guid, \"check\");", "void guid;", "orders-normalization-r3-fixes.test");
guard("N18", "src/orders-normalization-traversal.ts", "assertUnique(seen, source.guid.toLowerCase(), \"selection\");", "void source.guid;", "orders-normalization-r3-fixes.test");
guard("N19", "src/orders-normalization-traversal.ts", "assertUnique(guards.paymentGuids, guid, \"payment\");", "void guid;", "orders-normalization-pr34-remediation.test");
guard("N20", "src/orders-normalization-traversal.ts", "assertUnique(guards.serviceChargeGuids, guid, \"service charge\");", "void guid;", "orders-normalization-pr34-remediation.test");
guard("N21", "src/orders-normalization-traversal.ts", "assertUnique(discounts, guid, \"discount\");", "void guid;", "orders-normalization-pr34-remediation.test");
guard("N22", "src/orders-normalization-traversal.ts", "assertUnique(discounts, discount.guid.toLowerCase(), \"selection discount\");", "void discount.guid;", "orders-normalization-pr34-remediation.test");
guard("N23", "src/orders-normalization-source.ts", "const openEnumSchema = z.string().min(1);", "const openEnumSchema = z.enum([\"APPROVED\"]);", "orders-normalization.test");
guard("N24", "src/orders-normalization-source.ts", "const openEnumSchema = z.string().min(1);", "const openEnumSchema = z.enum([\"CLOSED\"]);", "orders-normalization.test");
guard("N25", "src/orders-normalization-source.ts", "const openEnumSchema = z.string().min(1);", "const openEnumSchema = z.enum([\"NONE\"]);", "orders-normalization.test");
guard("N26", "src/orders-normalization-source.ts", "const openEnumSchema = z.string().min(1);", "const openEnumSchema = z.enum([\"CASH\"]);", "orders-normalization.test");
guard("N27", "src/orders-normalization-traversal.ts", "numberOfGuests: source.numberOfGuests,", "numberOfGuests: undefined,", "orders-normalization-review-fixes.test");
guard("N28", "src/orders-normalization-traversal.ts", "numberOfGuests: source.numberOfGuests, diningOption: normalizeReference(source.diningOption),", "numberOfGuests: source.numberOfGuests, diningOption: undefined,", "orders-normalization-review-fixes.test");
guard("N29", "src/orders-normalization-traversal.ts", "salesCategory: normalizeReference(source.salesCategory), diningOption: normalizeReference(source.diningOption),", "salesCategory: normalizeReference(source.salesCategory), diningOption: source.diningOption as never,", "orders-normalization-review-fixes.test");
guard("N30", "src/orders-normalization-traversal.ts", "taxRate: normalizeReference(source.taxRate),", "taxRate: source.taxRate as never,", "orders-tax-normalization.test");
guard("N31", "src/orders-normalization-traversal.ts", "source: \"standard_api\"", "source: \"analytics_api\" as never", "orders-normalization.test");
guard("N32", "src/orders-normalization-traversal.ts", "taxAmount: exactDecimalFromNumber(source.taxAmount)", "taxAmount: exactDecimalFromNumber(Math.round(source.taxAmount * 100) / 100)", "orders-tax-normalization.test");
guard("N33", "src/orders-normalization-traversal.ts", "scheduled: source.promisedDate != null", "scheduled: false", "orders-normalization.test");
guard("N34", "src/orders-normalization-traversal.ts", "return guid === undefined && multiLocationId === undefined ? undefined : Object.freeze({ guid, multiLocationId });", "return guid === undefined ? undefined : Object.freeze({ guid, multiLocationId });", "orders-normalization.test");
guard("N35", "src/orders-normalization-source.ts", "quantity: z.number().finite()", "quantity: z.number().int()", "orders-normalization.test");
guard("N36", "src/orders-normalization-traversal.ts", "return Object.freeze({ source: \"standard_api\"", "return { source: \"standard_api\"", "orders-normalization.test");
guard("N37", "src/orders-normalization-traversal.ts", "refund: source.refund == null ? undefined", "refund: undefined", "orders-normalization.test");
guard("N38", "src/orders-normalization-traversal.ts", "serviceChargeCategory: source.serviceChargeCategory ?? \"SERVICE_CHARGE\"", "serviceChargeCategory: \"SERVICE_CHARGE\"", "orders-normalization-pr34-remediation.test");
guard("N39", "src/orders-normalization-traversal.ts", "recordCount: rawOrders.data.length", "recordCount: 0", "orders-normalization.test");
guard("N40", "src/orders-normalization-traversal.ts", "pageNumber: pageIndex + 1", "pageNumber: pageIndex", "orders-normalization.test");
guard("N41", "src/orders-normalization-traversal.ts", "upstreamRequestId: page.upstreamRequestId", "upstreamRequestId: undefined", "orders-normalization.test");
guard("N42", "src/orders-normalization-traversal.ts", "timezone: options.location.timezone", "timezone: \"UTC\"", "orders-normalization-pr34-remediation.test");
guard("N43", "src/orders-normalization-traversal.ts", "closeoutHour: options.location.closeoutHour", "closeoutHour: 4", "orders-normalization-pr34-remediation.test");

// D: exact decimal arithmetic guards.
guard("D01", "src/exact-decimal.ts", "let scale = fractionalDigits.length - exponent;", "let scale = fractionalDigits.length;", "orders-normalization-pr34-remediation.test");
guard("D02", "src/exact-decimal.ts", "total += BigInt(value.coefficient) * multiplier;", "total -= BigInt(value.coefficient) * multiplier;", "orders-normalization-pr34-remediation.test");
guard("D03", "src/exact-decimal.ts", "const multiplier = 10n ** BigInt(maxScale - value.scale);", "const multiplier = 1n;", "orders-normalization-pr34-remediation.test");
guard("D04", "src/exact-decimal.ts", "while (currentScale > 0 && current % 10n === 0n)", "while (false)", "orders-normalization-pr34-remediation.test");
guard("D05", "src/exact-decimal.ts", "const padded = unsigned.padStart(value.scale + 1, \"0\");", "const padded = unsigned;", "orders-normalization-pr34-remediation.test");
guard("D06", "src/exact-decimal.ts", "const sign = match[1] === \"-\" ? \"-\" : \"\";", "const sign = \"\";", "orders-normalization-pr34-remediation.test");
guard("D07", "src/exact-decimal.ts", "if (/^0+$/u.test(digits))", "if (false)", "orders-normalization-pr34-remediation.test");
guard("D08", "src/exact-decimal.ts", "if (values.length === 0) {\n    return Object.freeze({ coefficient: \"0\", scale: 0 });", "if (values.length === 0) {\n    return { coefficient: \"0\", scale: 0 };", "orders-normalization-pr34-remediation.test");
guard("D09", "src/exact-decimal.ts", "!COEFFICIENT_PATTERN.test(value.coefficient)", "false", "orders-normalization-pr34-remediation.test");
guard("D10", "src/exact-decimal.ts", "if (values.length === 0)", "if (false)", "orders-normalization-pr34-remediation.test");
guard("D11", "src/exact-decimal.ts", "if (!Number.isFinite(value))", "if (false)", "orders-normalization-pr34-remediation.test");

// S: source scope guards. A: applied-tax guards. C: canonical decimal guards.
guard("S01", "src/orders-normalization-helpers.ts", "page.apiFamily !== \"standard\"", "false", "orders-normalization-pr34-remediation.test");
guard("S02", "src/orders-normalization-helpers.ts", "page.scope.kind !== \"restaurant\"", "false", "orders-normalization-pr34-remediation.test");
guard("S03", "src/orders-normalization-helpers.ts", "normalizeRestaurantGuid(page.scope.restaurantGuid) !== restaurantGuid", "false", "orders-normalization-pr34-remediation.test");
guard("A01", "src/orders-normalization-source.ts", "guid: guidSchema, taxRate", "guid: guidSchema.optional(), taxRate", "orders-normalization-pr34-remediation.test");
guard("A02", "src/orders-normalization-traversal.ts", "assertUnique(seen, guid, \"applied tax\");", "void guid;", "orders-normalization-pr34-remediation.test");
guard("A03", "src/orders-normalization-traversal.ts", "serviceChargeCategory: source.serviceChargeCategory ?? \"SERVICE_CHARGE\", appliedTaxes: normalizeAppliedTaxes(source.appliedTaxes, taxes)", "serviceChargeCategory: source.serviceChargeCategory ?? \"SERVICE_CHARGE\", appliedTaxes: normalizeAppliedTaxes(source.appliedTaxes, new Set())", "orders-normalization-pr34-remediation.test");
guard("C01", "src/exact-decimal.ts", "/^-?0\\d/u.test(value.coefficient)", "false", "orders-normalization-pr34-remediation.test");
guard("C02", "src/exact-decimal.ts", "value.coefficient === \"-0\"", "false", "orders-normalization-pr34-remediation.test");
guard("C03", "src/exact-decimal.ts", "value.scale > 0 && value.coefficient.endsWith(\"0\")", "false", "orders-normalization-pr34-remediation.test");
guard("H01", "src/orders-normalization-types.ts", "amountHundredths", "amountMinor", "orders-normalization-pr34-remediation.test");

if (guards.length !== 64) throw new Error(`guard map has ${guards.length} entries, expected 64`);
if (!process.versions.node.startsWith("22.22.2")) throw new Error(`Node 22.22.2 is required; found ${process.version}`);
if (!readFileSync(path.join(root, "package.json"), "utf8")) throw new Error("repository root is not readable");
const requestedIds = process.env.PR34_MUTATION_IDS?.split(",").filter(Boolean);
const selectedGuards = requestedIds === undefined
  ? guards
  : guards.filter((entry) => requestedIds.includes(entry.id));
if (selectedGuards.length === 0) throw new Error("No requested guard IDs exist.");
if (requestedIds !== undefined && selectedGuards.length !== requestedIds.length) {
  throw new Error("One or more requested guard IDs do not exist.");
}

function mutateCase(entry) {
  const caseDir = mkdtempSync(path.join(tempRoot, `${entry.id}-`));
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: root });
  const unpack = spawnSync("tar", ["-xf", "-", "-C", caseDir], { input: archive });
  if (unpack.status !== 0) throw new Error(`${entry.id}: could not unpack HEAD archive`);
  symlinkSync(nodeModules, path.join(caseDir, "node_modules"), "dir");
  const target = path.join(caseDir, entry.file);
  const source = readFileSync(target, "utf8");
  const occurrences = source.split(entry.find).length - 1;
  if (occurrences !== 1) throw new Error(`${entry.id}: target is ${occurrences === 0 ? "absent" : "ambiguous"} in ${entry.file}`);
  writeFileSync(target, source.replace(entry.find, entry.replace));
  return caseDir;
}

const caught = [];
const survivors = [];
const start = performance.now();
try {
  for (const entry of selectedGuards) {
    const caseDir = mutateCase(entry);
    const build = spawnSync(process.execPath, ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.test.json"], { cwd: caseDir, encoding: "utf8" });
    const run = build.status === 0
      ? spawnSync(process.execPath, ["--test", "--enable-source-maps", entry.testFile], { cwd: caseDir, encoding: "utf8" })
      : build;
    if (run.status === 0) survivors.push(entry.id);
    else caught.push(entry.id);
    rmSync(caseDir, { recursive: true, force: true });
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
const durationMs = Math.round(performance.now() - start);
console.log(JSON.stringify({ caught: caught.length, total: selectedGuards.length, survivors, caughtGuards: caught, durationMs }));
process.exitCode = survivors.length === 0 ? 0 : 1;
