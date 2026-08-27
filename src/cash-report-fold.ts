import type {
  CashDepositSource,
  CashDrawerSource,
  CashEntrySource,
  NoSaleReasonSource,
  PayoutReasonSource,
} from "./cash-report-source.js";
import {
  MAX_CASH_ENTRY_TYPES,
  MAX_CASH_REFERENCE_KEYS,
  MAX_CASH_SOURCE_RECORDS,
} from "./cash-report-limits.js";
import { addMinorUnits, moneyToMinorUnits, ReportComputationError } from "./report-core.js";

export interface CashEntryTypeTotal {
  readonly type: string;
  readonly entryCount: number;
  readonly amountMinor: number;
}

export interface CashDrawerReference {
  readonly drawerGuid: string;
  readonly entryCount: number;
  readonly resolved: boolean;
}

export interface CashReasonReference {
  readonly reasonGuid: string;
  readonly entryCount: number;
  readonly resolved: boolean;
}

export interface CashSummaryFold {
  readonly businessDate: number;
  readonly cashEntryCount: number;
  readonly depositCount: number;
  readonly cashEntryAmountMinor: number;
  readonly depositAmountMinor: number;
  readonly noSaleCount: number;
  readonly cashEntriesWithoutDrawerCount: number;
  readonly cashInCount: number;
  readonly cashOutCount: number;
  readonly cashCollectedCount: number;
  readonly tipOutCount: number;
  readonly payoutCount: number;
  readonly reimbursementCount: number;
  readonly closeoutCount: number;
  readonly observedReversalCount: number;
  readonly unresolvedCrossDateReversalCount: number;
  readonly observedDepositReversalCount: number;
  readonly unresolvedCrossDateDepositReversalCount: number;
  readonly cashEntryTotalsByType: readonly CashEntryTypeTotal[];
  readonly cashDrawerReferences: readonly CashDrawerReference[];
  readonly noSaleReasonReferences: readonly CashReasonReference[];
  readonly payoutReasonReferences: readonly CashReasonReference[];
}

export interface CashSummaryFoldInput {
  readonly businessDate: number;
  readonly entries: readonly CashEntrySource[];
  readonly deposits: readonly CashDepositSource[];
  readonly cashDrawers: readonly CashDrawerSource[];
  readonly noSaleReasons: readonly NoSaleReasonSource[];
  readonly payoutReasons: readonly PayoutReasonSource[];
}

interface MutableTypeTotal { entryCount: number; amountMinor: number; }
interface MutableReference { entryCount: number; }

interface FoldState {
  cashEntryAmountMinor: number;
  depositAmountMinor: number;
  noSaleCount: number;
  cashEntriesWithoutDrawerCount: number;
  cashInCount: number;
  cashOutCount: number;
  cashCollectedCount: number;
  tipOutCount: number;
  payoutCount: number;
  reimbursementCount: number;
  closeoutCount: number;
  observedReversalCount: number;
  unresolvedCrossDateReversalCount: number;
  observedDepositReversalCount: number;
  unresolvedCrossDateDepositReversalCount: number;
  readonly typeTotals: Map<string, MutableTypeTotal>;
  readonly drawerReferences: Map<string, MutableReference>;
  readonly noSaleReasonReferences: Map<string, MutableReference>;
  readonly payoutReasonReferences: Map<string, MutableReference>;
}

/** This pure fold reports observed Cash Management facts only. */
export function foldCashSummary(input: CashSummaryFoldInput): CashSummaryFold {
  assertValidBusinessDate(input.businessDate);
  assertRecordLimits(input);
  const state = createFoldState();
  const entryGuids = collectUniqueGuids(input.entries, "cash entry");
  const depositGuids = collectUniqueGuids(input.deposits, "cash deposit");
  foldEntries(input.entries, entryGuids, state);
  foldDeposits(input.deposits, depositGuids, state);
  return freezeFold(input, state);
}

function createFoldState(): FoldState {
  return {
    cashEntryAmountMinor: 0, depositAmountMinor: 0, noSaleCount: 0,
    cashEntriesWithoutDrawerCount: 0, cashInCount: 0, cashOutCount: 0,
    cashCollectedCount: 0, tipOutCount: 0, payoutCount: 0, reimbursementCount: 0,
    closeoutCount: 0, observedReversalCount: 0, unresolvedCrossDateReversalCount: 0,
    observedDepositReversalCount: 0, unresolvedCrossDateDepositReversalCount: 0,
    typeTotals: new Map(), drawerReferences: new Map(), noSaleReasonReferences: new Map(),
    payoutReasonReferences: new Map(),
  };
}

function collectUniqueGuids(
  records: readonly { readonly guid: string }[],
  entity: string,
): ReadonlySet<string> {
  const guids = new Set<string>();
  for (const record of records) {
    const guid = canonicalGuid(record.guid);
    if (guids.has(guid)) throw duplicateSource(entity);
    guids.add(guid);
  }
  return guids;
}

function foldEntries(
  entries: readonly CashEntrySource[],
  entryGuids: ReadonlySet<string>,
  state: FoldState,
): void {
  for (const entry of entries) {
    assertNotSelfReference(entry.guid, entry.undoes);
    const amountMinor = moneyToMinorUnits(entry.amount, "cashEntry.amount");
    state.cashEntryAmountMinor = addMinorUnits(state.cashEntryAmountMinor, amountMinor);
    incrementTypeTotal(state.typeTotals, entry.type, amountMinor);
    incrementEntryKind(entry.type, state);
    if (entry.cashDrawer == null) state.cashEntriesWithoutDrawerCount += 1;
    else incrementReference(state.drawerReferences, entry.cashDrawer.guid);
    if (entry.noSaleReason != null) incrementReference(state.noSaleReasonReferences, entry.noSaleReason.guid);
    if (entry.payoutReason != null) incrementReference(state.payoutReasonReferences, entry.payoutReason.guid);
    if (entry.undoes != null) {
      state.observedReversalCount += 1;
      if (!entryGuids.has(canonicalGuid(entry.undoes))) state.unresolvedCrossDateReversalCount += 1;
    }
  }
}

function foldDeposits(
  deposits: readonly CashDepositSource[],
  depositGuids: ReadonlySet<string>,
  state: FoldState,
): void {
  for (const deposit of deposits) {
    assertNotSelfReference(deposit.guid, deposit.undoes);
    const amountMinor = moneyToMinorUnits(deposit.amount, "cashDeposit.amount");
    const undoneDepositGuid = deposit.undoes;
    const isReversal = undoneDepositGuid != null;
    state.depositAmountMinor = addMinorUnits(
      state.depositAmountMinor,
      isReversal ? -amountMinor : amountMinor,
    );
    if (isReversal) {
      state.observedDepositReversalCount += 1;
      if (!depositGuids.has(canonicalGuid(undoneDepositGuid))) {
        state.unresolvedCrossDateDepositReversalCount += 1;
      }
    }
  }
}

function freezeFold(input: CashSummaryFoldInput, state: FoldState): CashSummaryFold {
  return Object.freeze({
    businessDate: input.businessDate, cashEntryCount: input.entries.length,
    depositCount: input.deposits.length, cashEntryAmountMinor: state.cashEntryAmountMinor,
    depositAmountMinor: state.depositAmountMinor, noSaleCount: state.noSaleCount,
    cashEntriesWithoutDrawerCount: state.cashEntriesWithoutDrawerCount,
    cashInCount: state.cashInCount, cashOutCount: state.cashOutCount,
    cashCollectedCount: state.cashCollectedCount, tipOutCount: state.tipOutCount,
    payoutCount: state.payoutCount, reimbursementCount: state.reimbursementCount,
    closeoutCount: state.closeoutCount, observedReversalCount: state.observedReversalCount,
    unresolvedCrossDateReversalCount: state.unresolvedCrossDateReversalCount,
    observedDepositReversalCount: state.observedDepositReversalCount,
    unresolvedCrossDateDepositReversalCount: state.unresolvedCrossDateDepositReversalCount,
    cashEntryTotalsByType: freezeTypeTotals(state.typeTotals),
    cashDrawerReferences: freezeDrawerReferences(state.drawerReferences, input.cashDrawers),
    noSaleReasonReferences: freezeReasonReferences(state.noSaleReasonReferences, input.noSaleReasons),
    payoutReasonReferences: freezeReasonReferences(state.payoutReasonReferences, input.payoutReasons),
  });
}

function incrementTypeTotal(
  totals: Map<string, MutableTypeTotal>, type: string, amountMinor: number,
): void {
  if (!totals.has(type) && totals.size >= MAX_CASH_ENTRY_TYPES) throw cashSourceLimitExceeded();
  const current = totals.get(type) ?? { entryCount: 0, amountMinor: 0 };
  current.entryCount += 1;
  current.amountMinor = addMinorUnits(current.amountMinor, amountMinor);
  totals.set(type, current);
}

function incrementReference(references: Map<string, MutableReference>, guid: string): void {
  const canonical = canonicalGuid(guid);
  if (!references.has(canonical) && references.size >= MAX_CASH_REFERENCE_KEYS) {
    throw cashSourceLimitExceeded();
  }
  const current = references.get(canonical) ?? { entryCount: 0 };
  current.entryCount += 1;
  references.set(canonical, current);
}

function incrementEntryKind(type: string, state: FoldState): void {
  switch (type) {
    case "NO_SALE": state.noSaleCount += 1; break;
    case "CASH_IN": state.cashInCount += 1; break;
    case "CASH_OUT": state.cashOutCount += 1; break;
    case "CASH_COLLECTED": state.cashCollectedCount += 1; break;
    case "TIP_OUT": state.tipOutCount += 1; break;
    case "PAY_OUT":
    case "UNDO_PAY_OUT": state.payoutCount += 1; break;
    case "DRIVER_REIMBURSEMENT": state.reimbursementCount += 1; break;
    case "CLOSE_OUT_EXACT":
    case "CLOSE_OUT_OVERAGE":
    case "CLOSE_OUT_SHORTAGE": state.closeoutCount += 1; break;
    default: break;
  }
}

function freezeTypeTotals(totals: Map<string, MutableTypeTotal>): readonly CashEntryTypeTotal[] {
  return Object.freeze([...totals.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([type, value]) => Object.freeze({ type, ...value })));
}

function freezeDrawerReferences(
  references: Map<string, MutableReference>, known: readonly { readonly guid: string }[],
): readonly CashDrawerReference[] {
  const knownGuids = new Set(known.map((value) => canonicalGuid(value.guid)));
  return Object.freeze([...references.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([guid, value]) => Object.freeze({ drawerGuid: guid, ...value, resolved: knownGuids.has(guid) })));
}

function freezeReasonReferences(
  references: Map<string, MutableReference>, known: readonly { readonly guid: string }[],
): readonly CashReasonReference[] {
  const knownGuids = new Set(known.map((value) => canonicalGuid(value.guid)));
  return Object.freeze([...references.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([guid, value]) => Object.freeze({ reasonGuid: guid, ...value, resolved: knownGuids.has(guid) })));
}

function canonicalGuid(value: string): string { return value.toLowerCase(); }

function assertRecordLimits(input: CashSummaryFoldInput): void {
  for (const records of [
    input.entries, input.deposits, input.cashDrawers, input.noSaleReasons, input.payoutReasons,
  ]) if (records.length > MAX_CASH_SOURCE_RECORDS) throw cashSourceLimitExceeded();
}

function assertNotSelfReference(recordGuid: string, undoneGuid: string | null | undefined): void {
  if (undoneGuid != null && canonicalGuid(recordGuid) === canonicalGuid(undoneGuid)) {
    throw cashSourceInvalid();
  }
}

export function assertValidBusinessDate(value: number): void {
  const text = String(value);
  const date = new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
  if (!/^\d{8}$/u.test(text) || date.getUTCFullYear() !== Number(text.slice(0, 4)) || date.getUTCMonth() !== Number(text.slice(4, 6)) - 1 || date.getUTCDate() !== Number(text.slice(6, 8))) throw cashSourceInvalid();
}

function duplicateSource(entity: string): ReportComputationError {
  return new ReportComputationError("cash_source_duplicate", `Toast cash source contained a duplicate canonical ${entity} GUID.`);
}

function cashSourceLimitExceeded(): ReportComputationError {
  return new ReportComputationError(
    "cash_source_limit_exceeded",
    "Toast cash source exceeded a deterministic reporting limit.",
  );
}

export function cashSourceInvalid(): ReportComputationError {
  return new ReportComputationError(
    "cash_source_invalid",
    "Toast cash source data was not usable for deterministic reporting.",
  );
}
