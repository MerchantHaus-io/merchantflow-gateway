/**
 * Affiliate payout programme — pure calculation helpers.
 *
 * Programme rules (see project memory):
 *   • Partners earn on the GATEWAY side only: 50% of our gateway margin
 *     (what the merchant is billed less our underlying cost), capped at
 *     $1,000 per referred account per month.
 *   • Processing residuals earn a partner nothing and never enter the payout.
 *   • Earnings run from the month of the merchant's first gateway invoice.
 *   • A $500 bonus for every 5 merchants boarded.
 *   • Credits earned in a month become payable 30 days after that month ends.
 *   • A partner is paid only once their payable balance reaches the minimum
 *     (default $50); anything below rolls into the next run.
 *
 * Cost and margin figures are internal: never surface them to a partner or a
 * merchant, only the partner's own share.
 *
 * Nothing here touches the database, so it is unit-testable and shared by the
 * admin dashboard and the partner portal.
 */


export const DEFAULT_MINIMUM_PAYOUT = 50;
export const DEFAULT_BONUS_AMOUNT = 500;
export const DEFAULT_BONUS_MILESTONE = 5;
export const PAYABLE_HOLD_DAYS = 30;

export type LedgerStatus = "pending" | "payable" | "paid" | "void";
export type LedgerEntryType = "commission" | "bonus" | "clawback" | "adjustment" | "payout";

export interface LedgerEntryLike {
  amount: number | string | null;
  status: LedgerStatus | string;
  entry_type?: LedgerEntryType | string;
}

export interface BalanceSummary {
  pending: number;
  payable: number;
  paid: number;
  /** Everything still owed: pending + payable. */
  balance: number;
  /** Everything ever earned, excluding voided entries. */
  lifetime: number;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

/** Credits for a month become payable 30 days after the month ends. */
export const payableOnFor = (periodEnd: string | Date): string => {
  const base = typeof periodEnd === "string" ? new Date(`${periodEnd.slice(0, 10)}T00:00:00Z`) : new Date(periodEnd);
  if (Number.isNaN(base.getTime())) return "";
  const due = new Date(base.getTime() + PAYABLE_HOLD_DAYS * 24 * 60 * 60 * 1000);
  return due.toISOString().slice(0, 10);
};

/** True once the hold period has elapsed relative to `today`. */
export const isPayableOn = (periodEnd: string | Date, today: string | Date = new Date()): boolean => {
  const due = payableOnFor(periodEnd);
  if (!due) return false;
  const ref = typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return due <= ref;
};

export const summariseLedger = (entries: LedgerEntryLike[]): BalanceSummary => {
  const summary: BalanceSummary = { pending: 0, payable: 0, paid: 0, balance: 0, lifetime: 0 };
  for (const e of entries) {
    const amount = num(e.amount);
    switch (e.status) {
      case "pending":
        summary.pending += amount;
        break;
      case "payable":
        summary.payable += amount;
        break;
      case "paid":
        summary.paid += amount;
        break;
      default:
        continue; // void
    }
    summary.lifetime += amount;
  }
  summary.balance = summary.pending + summary.payable;
  return round2(summary);
};

const round2 = (s: BalanceSummary): BalanceSummary => ({
  pending: Math.round(s.pending * 100) / 100,
  payable: Math.round(s.payable * 100) / 100,
  paid: Math.round(s.paid * 100) / 100,
  balance: Math.round(s.balance * 100) / 100,
  lifetime: Math.round(s.lifetime * 100) / 100,
});

/** A partner is paid only when their payable balance clears the minimum. */
export const clearsMinimum = (payable: number, minimum = DEFAULT_MINIMUM_PAYOUT): boolean =>
  num(payable) > 0 && num(payable) >= num(minimum);

/**
 * How many milestone bonuses a partner has newly earned.
 * `alreadyAwarded` is the count of bonus credits already on their ledger.
 */
export const bonusesDue = (
  boardedMerchants: number,
  alreadyAwarded: number,
  milestone = DEFAULT_BONUS_MILESTONE,
): number => {
  if (milestone <= 0) return 0;
  const earned = Math.floor(Math.max(0, boardedMerchants) / milestone);
  return Math.max(0, earned - Math.max(0, alreadyAwarded));
};

/**
 * Partner share for one referred account in one month, capped per account.
 * The base is always our GATEWAY margin — never the processing residual and
 * never the gross amount billed to the merchant.
 */
export const commissionShare = (
  gatewayMargin: number,
  rate: number,
  monthlyCap: number,
): number => {
  const uncapped = num(gatewayMargin) * num(rate);
  const capped = num(monthlyCap) > 0 ? Math.min(uncapped, num(monthlyCap)) : uncapped;
  return Math.round(Math.max(0, capped) * 100) / 100;
};

/** Explicit alias making the gateway-only basis obvious at call sites. */
export const gatewayShare = commissionShare;

/** Month key (YYYY-MM) a ledger entry belongs to. */
export const monthKey = (periodEnd: string | null | undefined): string =>
  periodEnd ? periodEnd.slice(0, 7) : "";


export const fmtUsd = (v: number | string | null | undefined): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(num(v));

export const LEDGER_LABEL: Record<string, string> = {
  commission: "Referral commission",
  bonus: "Milestone bonus",
  clawback: "Clawback",
  adjustment: "Adjustment",
  payout: "Payment",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "On hold",
  payable: "Ready to pay",
  paid: "Paid",
  void: "Void",
};

export interface RunCandidateEntry {
  id: string;
  referrer_id: string;
  amount: number | string | null;
  payable_on?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

export interface RunSelection {
  /** Ledger entry ids that belong in the run. */
  entryIds: string[];
  /** Partner id -> amount included for that partner. */
  perPartner: Map<string, number>;
  total: number;
  /** Partners held back because they have not reached their minimum. */
  heldBack: { referrerId: string; amount: number; minimum: number }[];
}

/**
 * Pick which ready-to-pay credits go into a payout run paid on `payDate`.
 * A credit joins the run once its release date has arrived, and a partner is
 * only included once their included total clears their own minimum.
 */
export const selectRunEntries = (
  entries: RunCandidateEntry[],
  minimums: Map<string, number>,
  payDate: string,
): RunSelection => {
  const cutoff = payDate.slice(0, 10);
  const buckets = new Map<string, { ids: string[]; amount: number }>();
  for (const e of entries) {
    const due = (e.payable_on ?? "").slice(0, 10);
    if (due && due > cutoff) continue;
    const bucket = buckets.get(e.referrer_id) ?? { ids: [], amount: 0 };
    bucket.ids.push(e.id);
    bucket.amount += num(e.amount);
    buckets.set(e.referrer_id, bucket);
  }

  const selection: RunSelection = { entryIds: [], perPartner: new Map(), total: 0, heldBack: [] };
  for (const [referrerId, bucket] of buckets) {
    const minimum = num(minimums.get(referrerId)) || DEFAULT_MINIMUM_PAYOUT;
    const amount = Math.round(bucket.amount * 100) / 100;
    if (!clearsMinimum(amount, minimum)) {
      selection.heldBack.push({ referrerId, amount, minimum });
      continue;
    }
    selection.entryIds.push(...bucket.ids);
    selection.perPartner.set(referrerId, amount);
    selection.total += amount;
  }
  selection.total = Math.round(selection.total * 100) / 100;
  return selection;
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  draft: "Scheduled",
  approved: "Approved",
  paid: "Paid",
  void: "Cancelled",
};

/* ------------------------------------------------------------------ *
 * Payout-run reconciliation
 *
 * Compares what a partner's month-by-month earnings say they were owed at a
 * run's pay date against what the run actually released to them. A clean
 * programme reconciles to zero for every partner; anything else means a month
 * was missed, double-counted, or released before its 30-day hold expired.
 * ------------------------------------------------------------------ */

export interface ReconcileEntry {
  id: string;
  referrer_id: string;
  amount: number | string | null;
  status: LedgerStatus | string;
  payable_on?: string | null;
  period_end?: string | null;
  payout_run_id?: string | null;
}

export type ReconcileVerdict = "match" | "short" | "over" | "held";

export interface ReconcilePartnerRow {
  referrerId: string;
  /** Released and due by the pay date, before the minimum is applied. */
  due: number;
  /** Due amount the minimum allows to be paid in this run. */
  expected: number;
  /** What the run actually attached to this partner. */
  released: number;
  /** released − expected. Positive = overpaid, negative = underpaid. */
  variance: number;
  /** Held under the partner's minimum, so it rolls to the next run. */
  heldBack: number;
  minimum: number;
  verdict: ReconcileVerdict;
  /** Credits that were due but did not make the run. */
  missingEntryIds: string[];
  /** Credits in the run whose release date had not arrived yet. */
  earlyEntryIds: string[];
}

export interface ReconcileReport {
  runId: string;
  payDate: string;
  rows: ReconcilePartnerRow[];
  totals: { due: number; expected: number; released: number; variance: number; heldBack: number };
  /** Partners whose released amount differs from what was expected. */
  mismatches: ReconcilePartnerRow[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Reconcile one payout run against the earnings ledger.
 *
 * A credit counts as due when its release date has arrived on or before the
 * run's pay date and it is not already settled by a different run.
 */
export const reconcilePayoutRun = (
  entries: ReconcileEntry[],
  runId: string,
  payDate: string,
  minimums: Map<string, number> = new Map(),
): ReconcileReport => {
  const cutoff = (payDate ?? "").slice(0, 10);
  const byPartner = new Map<string, ReconcileEntry[]>();

  for (const e of entries) {
    if (e.status === "void") continue;
    const inThisRun = e.payout_run_id === runId;
    const settledElsewhere = !!e.payout_run_id && !inThisRun;
    if (settledElsewhere) continue;
    if (!inThisRun && e.status === "paid") continue;
    const list = byPartner.get(e.referrer_id) ?? [];
    list.push(e);
    byPartner.set(e.referrer_id, list);
  }

  const rows: ReconcilePartnerRow[] = [];
  for (const [referrerId, list] of byPartner) {
    const minimum = num(minimums.get(referrerId)) || DEFAULT_MINIMUM_PAYOUT;
    let due = 0;
    let released = 0;
    const missingEntryIds: string[] = [];
    const earlyEntryIds: string[] = [];

    for (const e of list) {
      const amount = num(e.amount);
      const release = (e.payable_on ?? e.period_end ?? "").slice(0, 10);
      const isDue = !!cutoff && (!release || release <= cutoff);
      const inRun = e.payout_run_id === runId;
      if (isDue) due += amount;
      if (inRun) released += amount;
      if (isDue && !inRun) missingEntryIds.push(e.id);
      if (!isDue && inRun) earlyEntryIds.push(e.id);
    }

    due = r2(due);
    released = r2(released);
    const clears = clearsMinimum(due, minimum);
    const expected = clears ? due : 0;
    const heldBack = clears ? 0 : due;
    const variance = r2(released - expected);
    const verdict: ReconcileVerdict =
      variance === 0 ? (heldBack > 0 ? "held" : "match") : variance < 0 ? "short" : "over";

    rows.push({
      referrerId,
      due,
      expected,
      released,
      variance,
      heldBack,
      minimum,
      verdict,
      missingEntryIds,
      earlyEntryIds,
    });
  }

  rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totals = rows.reduce(
    (acc, r) => ({
      due: r2(acc.due + r.due),
      expected: r2(acc.expected + r.expected),
      released: r2(acc.released + r.released),
      variance: r2(acc.variance + r.variance),
      heldBack: r2(acc.heldBack + r.heldBack),
    }),
    { due: 0, expected: 0, released: 0, variance: 0, heldBack: 0 },
  );

  return {
    runId,
    payDate: cutoff,
    rows,
    totals,
    mismatches: rows.filter((r) => r.variance !== 0),
  };
};

export const RECONCILE_VERDICT_LABEL: Record<ReconcileVerdict, string> = {
  match: "Matches",
  short: "Underpaid",
  over: "Overpaid",
  held: "Held (below minimum)",
};
