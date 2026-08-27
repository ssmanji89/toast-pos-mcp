import type {
  CashDepositSource,
  CashDrawerSource,
  CashEntrySource,
  NoSaleReasonSource,
  PayoutReasonSource,
} from "./cash-report-source.js";
import {
  addMinorUnits,
  moneyToMinorUnits,
  ReportComputationError,
} from "./report-core.js";

export interface CashEntryTypeTotal {
  readonly type: string;
  readonly entryCount: number;
  readonly amountMinor: number;
}

export interface CashDrawerReference {
  readonly drawerGuid: string;
  readonly entryCount: number;
  readonly depositCount: number;
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
  readonly cashInCount: number;
  readonly cashOutCount: number;
  readonly cashCollectedCount: number;
  readonly tipOutCount: number;
  readonly payoutCount: number;
  readonly reimbursementCount: number;
  readonly closeoutCount: number;
  readonly observedReversalCount: number;
  readonly unresolvedCrossDateReversalCount: number;
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

interface MutableTypeTotal {
  entryCount: number;
  amountMinor: number;
}

interface MutableDrawerReference {
  entryCount: number;
  depositCount: number;
}

interface MutableReasonReference {
  entryCount: number;
}

/**
 * This pure fold reports observed cash-management facts. It deliberately does
 * not use Orders, infer guest cash payments, or calculate expected deposits.
 */
export function foldCashSummary(input: CashSummaryFoldInput): CashSummaryFold {
  assertValidBusinessDate(input.businessDate);
  const entryGuids = new Set<string>();
  const typeTotals = new Map<string, MutableTypeTotal>();
  const drawerReferences = new Map<string, MutableDrawerReference>();
  const noSaleReasonReferences = new Map<string, MutableReasonReference>();
  const payoutReasonReferences = new Map<string, MutableReasonReference>();
  const cashDrawerGuids = new Set(input.cashDrawers.map((drawer) => drawer.guid));
  const noSaleReasonGuids = new Set(input.noSaleReasons.map((reason) => reason.guid));
  const payoutReasonGuids = new Set(input.payoutReasons.map((reason) => reason.guid));
  let cashEntryAmountMinor = 0;
  let depositAmountMinor = 0;
  let noSaleCount = 0;
  let cashInCount = 0;
  let cashOutCount = 0;
  let cashCollectedCount = 0;
  let tipOutCount = 0;
  let payoutCount = 0;
  let reimbursementCount = 0;
  let closeoutCount = 0;
  let observedReversalCount = 0;
  let unresolvedCrossDateReversalCount = 0;

  for (const entry of input.entries) entryGuids.add(entry.guid);
  for (const entry of input.entries) {
    const amountMinor = moneyToMinorUnits(entry.amount, "cashEntry.amount");
    cashEntryAmountMinor = addMinorUnits(cashEntryAmountMinor, amountMinor);
    const typeTotal = typeTotals.get(entry.type) ?? {
      entryCount: 0,
      amountMinor: 0,
    };
    typeTotal.entryCount += 1;
    typeTotal.amountMinor = addMinorUnits(typeTotal.amountMinor, amountMinor);
    typeTotals.set(entry.type, typeTotal);
    incrementDrawer(drawerReferences, entry.cashDrawer.guid, "entryCount");
    incrementEntryKind(entry.type, {
      noSale: () => { noSaleCount += 1; },
      cashIn: () => { cashInCount += 1; },
      cashOut: () => { cashOutCount += 1; },
      cashCollected: () => { cashCollectedCount += 1; },
      tipOut: () => { tipOutCount += 1; },
      payout: () => { payoutCount += 1; },
      reimbursement: () => { reimbursementCount += 1; },
      closeout: () => { closeoutCount += 1; },
    });
    if (entry.noSaleReason !== undefined && entry.noSaleReason !== null) {
      incrementReason(noSaleReasonReferences, entry.noSaleReason.guid);
    }
    if (entry.payoutReason !== undefined && entry.payoutReason !== null) {
      incrementReason(payoutReasonReferences, entry.payoutReason.guid);
    }
    if (entry.undoes !== undefined && entry.undoes !== null) {
      observedReversalCount += 1;
      if (!entryGuids.has(entry.undoes)) unresolvedCrossDateReversalCount += 1;
    }
  }

  for (const deposit of input.deposits) {
    depositAmountMinor = addMinorUnits(
      depositAmountMinor,
      moneyToMinorUnits(deposit.amount, "cashDeposit.amount"),
    );
  }

  return Object.freeze({
    businessDate: input.businessDate,
    cashEntryCount: input.entries.length,
    depositCount: input.deposits.length,
    cashEntryAmountMinor,
    depositAmountMinor,
    noSaleCount,
    cashInCount,
    cashOutCount,
    cashCollectedCount,
    tipOutCount,
    payoutCount,
    reimbursementCount,
    closeoutCount,
    observedReversalCount,
    unresolvedCrossDateReversalCount,
    cashEntryTotalsByType: Object.freeze([...typeTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, value]) => Object.freeze({ type, ...value }))),
    cashDrawerReferences: freezeDrawerReferences(drawerReferences, cashDrawerGuids),
    noSaleReasonReferences: freezeReasonReferences(
      noSaleReasonReferences,
      noSaleReasonGuids,
    ),
    payoutReasonReferences: freezeReasonReferences(
      payoutReasonReferences,
      payoutReasonGuids,
    ),
  });
}

function incrementDrawer(
  references: Map<string, MutableDrawerReference>,
  drawerGuid: string,
  field: keyof MutableDrawerReference,
): void {
  const reference = references.get(drawerGuid) ?? { entryCount: 0, depositCount: 0 };
  reference[field] += 1;
  references.set(drawerGuid, reference);
}

function incrementReason(
  references: Map<string, MutableReasonReference>,
  reasonGuid: string,
): void {
  const reference = references.get(reasonGuid) ?? { entryCount: 0 };
  reference.entryCount += 1;
  references.set(reasonGuid, reference);
}

function incrementEntryKind(
  type: string,
  increment: {
    readonly noSale: () => void;
    readonly cashIn: () => void;
    readonly cashOut: () => void;
    readonly cashCollected: () => void;
    readonly tipOut: () => void;
    readonly payout: () => void;
    readonly reimbursement: () => void;
    readonly closeout: () => void;
  },
): void {
  switch (type) {
    case "NO_SALE": increment.noSale(); break;
    case "CASH_IN": increment.cashIn(); break;
    case "CASH_OUT": increment.cashOut(); break;
    case "CASH_COLLECTED": increment.cashCollected(); break;
    case "TIP_OUT": increment.tipOut(); break;
    case "PAY_OUT":
    case "UNDO_PAY_OUT": increment.payout(); break;
    case "DRIVER_REIMBURSEMENT": increment.reimbursement(); break;
    case "CLOSE_OUT_EXACT":
    case "CLOSE_OUT_OVERAGE":
    case "CLOSE_OUT_SHORTAGE": increment.closeout(); break;
    default: break;
  }
}

function freezeDrawerReferences(
  references: Map<string, MutableDrawerReference>,
  knownGuids: ReadonlySet<string>,
): readonly CashDrawerReference[] {
  return Object.freeze([...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([drawerGuid, value]) => Object.freeze({
      drawerGuid,
      ...value,
      resolved: knownGuids.has(drawerGuid),
    })));
}

function freezeReasonReferences(
  references: Map<string, MutableReasonReference>,
  knownGuids: ReadonlySet<string>,
): readonly CashReasonReference[] {
  return Object.freeze([...references.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reasonGuid, value]) => Object.freeze({
      reasonGuid,
      ...value,
      resolved: knownGuids.has(reasonGuid),
    })));
}

function assertValidBusinessDate(value: number): void {
  const text = String(value);
  if (!/^\d{8}$/u.test(text)) throw cashSourceInvalid();
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) throw cashSourceInvalid();
}

export function cashSourceInvalid(): ReportComputationError {
  return new ReportComputationError(
    "cash_source_invalid",
    "Toast cash source data was not usable for deterministic reporting.",
  );
}
