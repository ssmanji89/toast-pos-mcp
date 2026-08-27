import type {
  NormalizedOrder,
  NormalizedSelection,
} from "./orders-normalization.js";
import { ReportComputationError } from "./report-core.js";

/**
 * Bounded streaming replacement for T3-001's batch-global identity sets.
 *
 * T3-001 sees all raw pages at once and can keep entity GUID sets inside one
 * normalization call. T3-002 deliberately releases each raw page after it is
 * normalized, so the report fold carries only these small GUID sets across
 * pages. No raw body, normalized record, discount ID, or free-text field is
 * retained here.
 *
 * Applied-discount identity is intentionally NOT tracked globally: T3-001's
 * reviewed contract keeps discount GUID uniqueness order-local only.
 */
export class SalesCrossPageIdentityGuard {
  #orderGuids = new Set<string>();
  #checkGuids = new Set<string>();
  #selectionGuids = new Set<string>();
  #paymentGuids = new Set<string>();
  #serviceChargeGuids = new Set<string>();

  observeOrder(order: NormalizedOrder): void {
    assertUniqueAcrossPages(this.#orderGuids, order.guid, "order");

    for (const check of order.checks) {
      assertUniqueAcrossPages(this.#checkGuids, check.guid, "check");

      for (const payment of check.payments) {
        assertUniqueAcrossPages(
          this.#paymentGuids,
          payment.guid,
          "payment",
        );
      }
      for (const serviceCharge of check.appliedServiceCharges) {
        assertUniqueAcrossPages(
          this.#serviceChargeGuids,
          serviceCharge.guid,
          "service charge",
        );
      }

      observeSelections(check.selections, this.#selectionGuids);
    }
  }
}

function observeSelections(
  selections: readonly NormalizedSelection[],
  seen: Set<string>,
): void {
  const stack = [...selections];
  while (stack.length > 0) {
    const selection = stack.pop();
    if (selection === undefined) continue;
    assertUniqueAcrossPages(seen, selection.guid, "selection");
    stack.push(...selection.modifiers);
  }
}

function assertUniqueAcrossPages(
  seen: Set<string>,
  guid: string,
  entity: string,
): void {
  if (seen.has(guid)) {
    throw new ReportComputationError(
      "sales_duplicate_entity_across_pages",
      `The Orders traversal returned a repeated ${entity} GUID across pages.`,
    );
  }
  seen.add(guid);
}
