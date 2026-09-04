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
