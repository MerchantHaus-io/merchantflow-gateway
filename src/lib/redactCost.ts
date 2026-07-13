// Last line of defense for the "never expose partner cost or markup" rule
// (see CLAUDE.md). The source line descriptions in src/config/quoteSchedule.ts
// are kept clean, but accepted quotes and drafts persist a *snapshot* of their
// line descriptions (lines_snapshot / extras_snapshot). A quote accepted before
// the source strings were cleaned still carries "NMI partner cost $…" text in
// its snapshot — and that snapshot is what the Merchant Services Agreement and
// re-rendered quote PDF are built from.
//
// To guarantee the rule holds for every generated/sent document — including
// subsequent contracts built from old snapshots — every merchant-facing PDF
// generator scrubs line descriptions through stripInternalCostRefs() at render
// time. This never touches the internal `cost`/`margin` fields; it only cleans
// the merchant-facing description string.

// "(partner cost $0.45)" / "(wholesale cost …)" parentheticals.
const PARENTHETICAL_COST =
  /\s*\([^)]*\b(?:partner|wholesale|underlying)\s+cost[^)]*\)/gi;

// A clause disclosing partner/wholesale cost — or an "NMI partner …" figure —
// running to the end of the string. These always trail the real description
// (e.g. "Pay-by-text payment links. NMI partner cost $5/mo + $0.18/txn.").
const TRAILING_COST_CLAUSE =
  /\s*(?:NMI\s+partner|(?:partner|wholesale|underlying)\s+cost)\b[\s\S]*$/gi;

/**
 * Remove any partner/wholesale cost or markup disclosure from a string before
 * it is rendered into a merchant-facing document. Idempotent — scrubbing an
 * already-clean string returns it unchanged. Returns "" for empty/undefined
 * input so callers can keep using a truthiness check.
 */
export function stripInternalCostRefs(text: string | null | undefined): string {
  if (!text) return "";
  let out = text.replace(PARENTHETICAL_COST, "").replace(TRAILING_COST_CLAUSE, "");
  // Tidy leftover double spaces and space-before-punctuation, then ensure the
  // remaining description still reads as a complete sentence.
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([.)])/g, "$1").trim();
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out;
}
