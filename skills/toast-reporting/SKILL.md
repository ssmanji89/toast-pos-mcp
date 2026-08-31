---
name: toast-reporting
description: Use the Toast POS reporting MCP public preview safely and interpret complete, incomplete, and denied report results without inventing missing data.
---

# Toast POS reporting public preview

Use this skill when an operator asks for Toast sales, payment, item, cash, labor, or Analytics reporting through the installed `toast-pos-mcp` plugin.

## Safety boundary

- Use only operator-owned Toast credentials that are authorized for the selected restaurant.
- Do not ask the operator to paste credentials, bearer tokens, raw API bodies, or Merchant Data into chat.
- Merchant consent must already be documented before an AI tool or service processes Toast Merchant Data.
- Apply a strict no training rule. Do not use Toast API data for training, fine-tuning, evaluation for model improvement, other model improvement, or API-derived synthetic training data without Toast prior written approval.
- The plugin is read-only and informational. Never describe results as GAAP, tax, payroll-filing, legal, or Toast-certified output.

## Tool selection

- `toast_sales_summary`: business-date Standard API sales summary.
- `toast_payment_summary`: paid, refunded, and voided payment-event summary.
- `toast_item_sales_summary`: item and dimension reporting, including category, revenue center, dining option, item tag, order source, and service period.
- `toast_cash_summary`: cash entries, deposits, reversals, reasons, and drawer context.
- `toast_labor_summary`: aggregate labor hours, breaks, wages, sales, and tips. This tool can return `incomplete` when active or unresolved facts prevent a final aggregate.
- `toast_analytics_metrics_day`: experimental Analytics report-job lifecycle only. It intentionally returns `incomplete` or `denied` while the completed-result schema remains vendor-unverified.

## Invocation sequence

1. Confirm the requested restaurant and Toast business date. A business date is `yyyyMMdd`, not necessarily a UTC calendar date.
2. Select the narrowest report tool that answers the question.
3. Read the structured result before summarizing it.
4. Preserve `source`, restaurant context, business date, timezone, freshness, provenance, exclusions, warnings, and formula notes.
5. Explain the result according to its status:
   - `complete`: summarize the validated report and retain its caveats.
   - `incomplete`: state what is unresolved or pending. Do not present partial totals as final.
   - `denied`: state the stable denial code and the operator action it implies. Do not convert denial into zero.
6. Keep Standard API and Analytics API results source-distinct. Never silently substitute one for the other.

## Reporting style

Lead with the operational answer, then the most important provenance or completeness caveat. Use currency minor units only after converting them to the report currency for human-readable display, while retaining the original structured values when precision matters.
