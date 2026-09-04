/**
 * Affiliate payout programme — pure calculation helpers.
 *
 * Programme rules (see project memory):
 *   • Partners earn on the GATEWAY side only: a QUARTER of the gateway net
 *     (what the merchant is billed for the gateway, less our underlying cost)
 *     for each referred account, month on month, capped at $1,000 per account
 *     per month. See PARTNER_SHARE_DIVISOR / GATEWAY_BASIS below.
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

/**
 * Entry types that represent something the partner EARNED. A `payout` row is
 * the disbursement itself — the money leaving, already reflected by its
 * credits flipping to `paid` — so counting it as well would double the
 * partner's lifetime figure and hide it from their balance.
 */
const EARNING_TYPES = new Set(["commission", "bonus", "clawback", "adjustment"]);

const isEarning = (e: LedgerEntryLike): boolean =>
  e.entry_type == null || EARNING_TYPES.has(String(e.entry_type));

export const summariseLedger = (entries: LedgerEntryLike[]): BalanceSummary => {
  const summary: BalanceSummary = { pending: 0, payable: 0, paid: 0, balance: 0, lifetime: 0 };
  for (const e of entries) {
    if (e.status === "void" || !isEarning(e)) continue;
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
        continue; // unknown status — counted nowhere
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

/* ------------------------------------------------------------------ *
 * Programme basis — the single source of truth for partner earnings
 *
 * A partner earns a quarter of what the gateway actually nets us on the
 * merchants they referred:
 *
 *     partner share = (gateway billed − gateway cost) ÷ 4
 *
 * "billed" and "cost" are the internal gateway figures for that merchant in
 * that month. Only the resulting share is ever shown to a partner; the two
 * inputs and the net between them are internal.
 *
 * These constants exist because the same numbers were previously written out
 * by hand in a migration, in two UI fallbacks and in three different default
 * values, and they had drifted apart. Anything that needs the programme basis
 * reads it from here.
 * ------------------------------------------------------------------ */

/** Partner takes one quarter of the monthly gateway net. */
export const PARTNER_SHARE_DIVISOR = 4;

/** The same rule expressed as a rate, for anything that multiplies. */
export const PARTNER_SHARE_RATE = 1 / PARTNER_SHARE_DIVISOR;

/** Cap on a partner's share for one merchant in one month. */
export const DEFAULT_MONTHLY_CAP = 1000;

/**
 * Gateway billing and cost basis per merchant per month, in dollars.
 * Mirrors the foundation tier in `src/config/quoteSchedule.ts`
 * (`TIER_PLATFORM_FEE.foundation` = cost 25 / resale 59) plus the per-
 * authorisation fees. Internal figures — never rendered to a merchant.
 */
export const GATEWAY_BASIS = {
  monthlyBilled: 59,
  monthlyCost: 25,
  perTxnBilled: 0.4,
  perTxnCost: 0.15,
} as const;

/** What the merchant is billed for the gateway in a month. */
export const gatewayBilled = (txnCount: number | string | null | undefined): number =>
  Math.round((GATEWAY_BASIS.monthlyBilled + Math.max(0, num(txnCount)) * GATEWAY_BASIS.perTxnBilled) * 100) / 100;

/** What that month costs us. */
export const gatewayCost = (txnCount: number | string | null | undefined): number =>
  Math.round((GATEWAY_BASIS.monthlyCost + Math.max(0, num(txnCount)) * GATEWAY_BASIS.perTxnCost) * 100) / 100;

/** Gateway net for the month — billed less cost, never negative. */
export const gatewayNet = (txnCount: number | string | null | undefined): number =>
  Math.round(Math.max(0, gatewayBilled(txnCount) - gatewayCost(txnCount)) * 100) / 100;

/**
 * The partner's share of one month's gateway net for one merchant:
 * net ÷ 4, capped. Pass `cap = 0` for an uncapped partner.
 */
export const partnerShare = (
  net: number | string | null | undefined,
  cap: number = DEFAULT_MONTHLY_CAP,
): number => {
  const uncapped = Math.max(0, num(net)) / PARTNER_SHARE_DIVISOR;
  const capValue = num(cap);
  const capped = capValue > 0 ? Math.min(uncapped, capValue) : uncapped;
  return Math.round(capped * 100) / 100;
};

/** Partner share derived straight from a month's transaction count. */
export const partnerShareForMonth = (
  txnCount: number | string | null | undefined,
  cap: number = DEFAULT_MONTHLY_CAP,
): number => partnerShare(gatewayNet(txnCount), cap);

/* ------------------------------------------------------------------ *
 * Programme audit
 *
 * Recomputes every commission credit from first principles — the merchant's
 * own gateway month, billed less cost, divided by four — and compares it to
 * what the ledger actually credited. Its job is to catch the two failures a
 * balance total cannot show you: a credit worked out on the wrong rate or the
 * wrong cost basis, and a billed month that never accrued at all.
 * ------------------------------------------------------------------ */

/** One merchant-month of gateway activity, from `commission_records`. */
export interface AuditBasisRecord {
  account_id: string | null;
  company_name?: string | null;
  period_start: string | null;
  period_end?: string | null;
  transaction_count?: number | string | null;
  /** Stored gateway figures, used to cross-check the derived basis. */
  gateway_invoiced?: number | string | null;
  gateway_margin?: number | string | null;
}

/** One credit on the ledger, as loaded by the admin panel. */
export interface AuditLedgerEntry {
  id: string;
  referrer_id: string;
  account_id: string | null;
  amount: number | string | null;
  status: LedgerStatus | string;
  entry_type: LedgerEntryType | string;
  period_start: string | null;
  period_end?: string | null;
  description?: string | null;
}

export type AuditVerdict = "match" | "over" | "under" | "missing" | "orphan";

export interface AuditRow {
  /** Null when the month was billed but never accrued. */
  entryId: string | null;
  referrerId: string;
  accountId: string | null;
  merchant: string;
  periodStart: string;
  periodEnd: string;
  txnCount: number;
  /** Internal figures — admin surface only, never shown to a partner. */
  billed: number;
  cost: number;
  net: number;
  /** What (billed − cost) ÷ 4 says the partner should have, after the cap. */
  expected: number;
  /** What the ledger actually credited. */
  credited: number;
  /** credited − expected. */
  variance: number;
  /** The expected share was trimmed by the per-merchant monthly cap. */
  capped: boolean;
  status: string;
  verdict: AuditVerdict;
}

export interface AuditReport {
  rows: AuditRow[];
  totals: { expected: number; credited: number; variance: number };
  /** Rows whose credited amount does not equal the programme figure. */
  exceptions: AuditRow[];
  /** Billed months with no credit at all. */
  missing: AuditRow[];
  /** Credits with no gateway month behind them. */
  orphans: AuditRow[];
}

const auditKey = (referrerId: string, accountId: string | null, periodStart: string | null) =>
  `${referrerId}|${accountId ?? ""}|${(periodStart ?? "").slice(0, 10)}`;

export const AUDIT_VERDICT_LABEL: Record<AuditVerdict, string> = {
  match: "Correct",
  over: "Over-credited",
  under: "Under-credited",
  missing: "Billed, never accrued",
  orphan: "No gateway month",
};

/**
 * Audit a partner's commission credits against the programme basis.
 *
 * `basisByReferrer` maps a referrer id to the gateway months belonging to the
 * merchants they referred. `caps` is the per-merchant monthly cap for each
 * partner; anything missing falls back to the programme default.
 */
export const auditCommissionLedger = (
  entries: AuditLedgerEntry[],
  basis: (AuditBasisRecord & { referrer_id: string })[],
  caps: Map<string, number> = new Map(),
): AuditReport => {
  const capFor = (referrerId: string) => {
    const c = caps.get(referrerId);
    return c === undefined ? DEFAULT_MONTHLY_CAP : num(c);
  };

  const basisByKey = new Map<string, AuditBasisRecord & { referrer_id: string }>();
  for (const b of basis) {
    basisByKey.set(auditKey(b.referrer_id, b.account_id, b.period_start), b);
  }

  const rows: AuditRow[] = [];
  const seenKeys = new Set<string>();

  const commissions = entries.filter(
    (e) => e.entry_type === "commission" && e.status !== "void",
  );

  for (const e of commissions) {
    const key = auditKey(e.referrer_id, e.account_id, e.period_start);
    seenKeys.add(key);
    const record = basisByKey.get(key);
    const credited = Math.round(num(e.amount) * 100) / 100;

    if (!record) {
      rows.push({
        entryId: e.id,
        referrerId: e.referrer_id,
        accountId: e.account_id,
        merchant: (e.description ?? "").replace(/^.*—\s*/, "") || "Unknown merchant",
        periodStart: (e.period_start ?? "").slice(0, 10),
        periodEnd: (e.period_end ?? "").slice(0, 10),
        txnCount: 0,
        billed: 0,
        cost: 0,
        net: 0,
        expected: 0,
        credited,
        variance: credited,
        capped: false,
        status: String(e.status),
        verdict: "orphan",
      });
      continue;
    }

    const txnCount = Math.max(0, num(record.transaction_count));
    const cap = capFor(e.referrer_id);
    const billed = gatewayBilled(txnCount);
    const cost = gatewayCost(txnCount);
    const net = gatewayNet(txnCount);
    const expected = partnerShare(net, cap);
    const variance = Math.round((credited - expected) * 100) / 100;

    rows.push({
      entryId: e.id,
      referrerId: e.referrer_id,
      accountId: e.account_id,
      merchant: record.company_name ?? "Merchant",
      periodStart: (record.period_start ?? "").slice(0, 10),
      periodEnd: (record.period_end ?? e.period_end ?? "").slice(0, 10),
      txnCount,
      billed,
      cost,
      net,
      expected,
      credited,
      variance,
      capped: cap > 0 && net / PARTNER_SHARE_DIVISOR > cap,
      status: String(e.status),
      verdict: variance === 0 ? "match" : variance > 0 ? "over" : "under",
    });
  }

  // Gateway months that were billed but never turned into a credit.
  for (const b of basis) {
    const key = auditKey(b.referrer_id, b.account_id, b.period_start);
    if (seenKeys.has(key)) continue;
    const txnCount = Math.max(0, num(b.transaction_count));
    const cap = capFor(b.referrer_id);
    const net = gatewayNet(txnCount);
    const expected = partnerShare(net, cap);
    rows.push({
      entryId: null,
      referrerId: b.referrer_id,
      accountId: b.account_id,
      merchant: b.company_name ?? "Merchant",
      periodStart: (b.period_start ?? "").slice(0, 10),
      periodEnd: (b.period_end ?? "").slice(0, 10),
      txnCount,
      billed: gatewayBilled(txnCount),
      cost: gatewayCost(txnCount),
      net,
      expected,
      credited: 0,
      variance: Math.round(-expected * 100) / 100,
      capped: cap > 0 && net / PARTNER_SHARE_DIVISOR > cap,
      status: "—",
      verdict: "missing",
    });
  }

  rows.sort(
    (a, b) =>
      Math.abs(b.variance) - Math.abs(a.variance) || a.periodStart.localeCompare(b.periodStart),
  );

  const totals = rows.reduce(
    (acc, r) => ({
      expected: Math.round((acc.expected + r.expected) * 100) / 100,
      credited: Math.round((acc.credited + r.credited) * 100) / 100,
      variance: Math.round((acc.variance + r.variance) * 100) / 100,
    }),
    { expected: 0, credited: 0, variance: 0 },
  );

  return {
    rows,
    totals,
    exceptions: rows.filter((r) => r.verdict !== "match"),
    missing: rows.filter((r) => r.verdict === "missing"),
    orphans: rows.filter((r) => r.verdict === "orphan"),
  };
};

/* ------------------------------------------------------------------ *
 * Milestone bonus progress
 *
 * The admin side awards bonuses off boarded merchants and the portal used to
 * display them off merchants with earnings — two different denominators, so
 * the portal could promise a bonus the ledger never paid. Both now read this.
 * ------------------------------------------------------------------ */

export interface BonusProgress {
  /** Merchants counted towards the milestone. */
  boarded: number;
  /** Bonuses the boarded count has earned. */
  earned: number;
  /** Bonuses actually credited on the ledger. */
  credited: number;
  /** Dollar value of the credited bonuses. */
  creditedValue: number;
  /** Merchants still needed for the next bonus. */
  toNext: number;
  /** Boarded-merchant count at which the next bonus lands. */
  nextAt: number;
  amount: number;
  milestone: number;
}

export const bonusProgress = (
  boardedMerchants: number,
  creditedBonusEntries: LedgerEntryLike[] = [],
  amount = DEFAULT_BONUS_AMOUNT,
  milestone = DEFAULT_BONUS_MILESTONE,
): BonusProgress => {
  const boarded = Math.max(0, Math.floor(num(boardedMerchants)));
  const step = Math.max(1, Math.floor(num(milestone)) || DEFAULT_BONUS_MILESTONE);
  const bonuses = creditedBonusEntries.filter(
    (e) => e.entry_type === "bonus" && e.status !== "void",
  );
  const earned = Math.floor(boarded / step);
  const nextAt = (earned + 1) * step;
  return {
    boarded,
    earned,
    credited: bonuses.length,
    creditedValue: Math.round(bonuses.reduce((s, e) => s + num(e.amount), 0) * 100) / 100,
    toNext: nextAt - boarded,
    nextAt,
    amount: num(amount) || DEFAULT_BONUS_AMOUNT,
    milestone: step,
  };
};

/* ------------------------------------------------------------------ *
 * Ledger corrections
 *
 * Everything above only ever ADDS credits. A programme also has to be able to
 * take money back — a merchant that churns inside their clawback window — and
 * to correct a credit raised in error. The schema has modelled `clawback` and
 * `adjustment` entries from the start and the partner statement renders them;
 * these helpers are what finally lets an admin raise one.
 *
 * A correction is always a NEW entry, never an edit of the original: the
 * original credit stays on the statement and the reversal sits beside it, so
 * the partner can see what happened and the audit still reconciles. The one
 * exception is voiding, which is for a credit that should never have existed
 * and has not been paid or banked into a run.
 * ------------------------------------------------------------------ */

export type CorrectionType = "clawback" | "adjustment";

/**
 * The signed amount to write for a correction. A clawback is entered as a
 * positive figure ("claw back $40") and always stored negative; an adjustment
 * keeps whatever sign the admin gave it, so it can go either way.
 */
export const signedCorrectionAmount = (type: CorrectionType, magnitude: number | string): number => {
  const value = num(magnitude);
  const signed = type === "clawback" ? -Math.abs(value) : value;
  return Math.round(signed * 100) / 100;
};

/** Ledger fields a correction needs to reason about an existing credit. */
export interface CorrectableEntry extends LedgerEntryLike {
  id: string;
  account_id?: string | null;
  payout_run_id?: string | null;
}

/**
 * What a partner has been credited for one merchant, across every month.
 * This is the natural default when clawing a churned merchant back.
 */
export const clawbackTotalFor = (
  entries: CorrectableEntry[],
  accountId: string,
): number => {
  const total = entries
    .filter(
      (e) =>
        e.account_id === accountId &&
        e.status !== "void" &&
        (e.entry_type == null || e.entry_type === "commission"),
    )
    .reduce((sum, e) => sum + num(e.amount), 0);
  return Math.round(total * 100) / 100;
};

/**
 * A credit can be voided only while it is still ours to withdraw: not paid,
 * and not already banked into a payout run. Anything past that has to be
 * reversed with a clawback so the money movement stays on the record.
 */
export const canVoidEntry = (entry: CorrectableEntry): boolean =>
  entry.status !== "void" && entry.status !== "paid" && !entry.payout_run_id;

export interface CorrectionDraft {
  type: CorrectionType;
  /** As typed by the admin — a clawback is entered positive. */
  magnitude: number | string;
  reason: string;
}

export interface CorrectionValidation {
  ok: boolean;
  /** The signed amount that would be written. */
  amount: number;
  error: string | null;
  /** Non-blocking notes worth showing before the admin commits. */
  warnings: string[];
}

/**
 * Validate a correction before it is written. A reason is mandatory: these
 * entries show up on a partner's own statement, and "Adjustment" with no
 * explanation is how a support conversation starts.
 */
export const validateCorrection = (
  draft: CorrectionDraft,
  balance: BalanceSummary,
): CorrectionValidation => {
  const amount = signedCorrectionAmount(draft.type, draft.magnitude);
  const warnings: string[] = [];

  if (!draft.reason.trim()) {
    return { ok: false, amount, error: "Give a reason — the partner sees this on their statement.", warnings };
  }
  if (amount === 0) {
    return { ok: false, amount, error: "Enter an amount.", warnings };
  }

  if (amount < 0) {
    const owed = balance.balance;
    if (Math.abs(amount) > owed) {
      warnings.push(
        owed > 0
          ? `Larger than the ${fmtUsd(owed)} still owed — this will leave a negative balance carried against future earnings.`
          : "This partner has nothing owed — the clawback will sit as a negative balance until they earn again.",
      );
    }
    if (balance.paid > 0 && Math.abs(amount) > balance.balance) {
      warnings.push("Part of this was already paid out; recovering it is a separate bank transaction.");
    }
  }

  return { ok: true, amount, error: null, warnings };
};
