import { dealBucket } from "@/lib/dealBucket";
import { monthlyRevenueEstimate } from "@/lib/pipelineValue";
import type { Opportunity } from "@/types/opportunity";

/**
 * Pure figures for the Operations home screen. Kept out of the hook so each
 * can be tested against the shapes the database actually returns — the last
 * version of this screen showed numbers nobody had checked against data.
 *
 * Everything here is internal (rep / admin facing). Our revenue figures are
 * MerchantHaus's own residual + gateway margin and must never reach a
 * merchant-facing document (CLAUDE.md).
 */

// ── Book of business, from commission_sync_logs ─────────────────────────────

/** A commission_sync_logs row as selected by the hook. */
export interface SyncLogRow {
  period_year: number;
  period_month: number;
  created_at: string;
  merchant_count: number | null;
  raw_response: {
    summary?: {
      total_volume?: number;
      total_transactions?: number;
      total_revenue?: number;
      merchant_count?: number;
    };
  } | null;
}

export interface BookMonth {
  year: number;
  month: number; // 1–12
  /** First day of the month, local, for labels. */
  start: Date;
  volume: number;
  transactions: number;
  /** Merchants that processed in the month. */
  merchants: number;
  /** Our residual + gateway margin for the month. */
  revenue: number;
  syncedAt: string;
  /** False when the freshest sync ran before the month ended. */
  complete: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * One row per month — the freshest successful sync for it — oldest first.
 *
 * The sync log is the freshest record of the book: `nmi-commissions` writes a
 * log row on every run, but writes commission_periods/records only when the
 * caller asks it to persist, so those tables can be weeks behind.
 */
export function bookMonthsFromSyncLogs(logs: SyncLogRow[]): BookMonth[] {
  const latest = new Map<string, SyncLogRow>();
  for (const row of logs) {
    const key = `${row.period_year}-${row.period_month}`;
    const prev = latest.get(key);
    if (!prev || row.created_at > prev.created_at) latest.set(key, row);
  }
  return [...latest.values()]
    .map((row) => {
      const s = row.raw_response?.summary ?? {};
      const start = new Date(row.period_year, row.period_month - 1, 1);
      const nextMonth = new Date(row.period_year, row.period_month, 1);
      return {
        year: row.period_year,
        month: row.period_month,
        start,
        volume: num(s.total_volume),
        transactions: num(s.total_transactions),
        merchants: num(s.merchant_count ?? row.merchant_count),
        revenue: num(s.total_revenue),
        syncedAt: row.created_at,
        complete: new Date(row.created_at) >= nextMonth,
      };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

/** Percentage change, or null when there is no base to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * The month to headline, and the one to compare it with. Prefers the latest
 * complete month; the month in progress is returned separately so it is never
 * compared like-for-like with a full month.
 */
export function headlineMonths(months: BookMonth[]): {
  current: BookMonth | null;
  previous: BookMonth | null;
  inProgress: BookMonth | null;
} {
  const complete = months.filter((m) => m.complete);
  const last = months[months.length - 1] ?? null;
  return {
    current: complete[complete.length - 1] ?? null,
    previous: complete[complete.length - 2] ?? null,
    inProgress: last && !last.complete ? last : null,
  };
}

// ── Per-merchant change, from persisted commission_records ──────────────────

export interface CommissionPeriodRow {
  id: string;
  period_start: string; // yyyy-mm-dd
  period_end: string;
  fetched_at: string | null;
}

export interface CommissionRecordRow {
  period_id: string;
  account_id: string | null;
  company_name: string | null;
  transaction_count: number | null;
  transaction_volume: number | null;
}

export type MerchantTrend = "quiet" | "down" | "up" | "steady" | "new";

export interface MerchantRow {
  accountId: string | null;
  name: string;
  volume: number;
  transactions: number;
  previousVolume: number;
  change: number | null;
  trend: MerchantTrend;
}

/** A persisted period counts only if it was saved after the month ended. */
export const isCompletePeriod = (p: CommissionPeriodRow): boolean =>
  !!p.fetched_at && new Date(p.fetched_at) > new Date(`${p.period_end}T23:59:59Z`);

/** Volume falling by at least this share month on month is flagged. */
export const VOLUME_DROP_FLAG = 0.5;

/**
 * Each merchant in the latest complete saved period, against the complete
 * period before it. A merchant that processed last time and not this time is
 * "quiet" — the earliest sign of an account going elsewhere.
 */
export function merchantChanges(
  periods: CommissionPeriodRow[],
  records: CommissionRecordRow[],
): { period: CommissionPeriodRow | null; rows: MerchantRow[] } {
  const complete = periods.filter(isCompletePeriod).sort((a, b) => a.period_start.localeCompare(b.period_start));
  const period = complete[complete.length - 1] ?? null;
  const prior = complete[complete.length - 2] ?? null;
  if (!period) return { period: null, rows: [] };

  const keyOf = (r: CommissionRecordRow) => r.account_id ?? r.company_name ?? "";
  const prev = new Map<string, CommissionRecordRow>();
  if (prior) for (const r of records) if (r.period_id === prior.id) prev.set(keyOf(r), r);

  const seen = new Set<string>();
  const rows: MerchantRow[] = [];
  const push = (cur: CommissionRecordRow | null, before: CommissionRecordRow | null) => {
    const ref = cur ?? before!;
    const volume = num(cur?.transaction_volume);
    const transactions = num(cur?.transaction_count);
    const previousVolume = num(before?.transaction_volume);
    const prevTx = num(before?.transaction_count);
    let trend: MerchantTrend = "steady";
    if (prior && prevTx > 0 && transactions === 0) trend = "quiet";
    else if (prior && !before && transactions > 0) trend = "new";
    else if (previousVolume > 0 && volume <= previousVolume * (1 - VOLUME_DROP_FLAG)) trend = "down";
    else if (previousVolume > 0 && volume >= previousVolume * (1 + VOLUME_DROP_FLAG)) trend = "up";
    rows.push({
      accountId: ref.account_id,
      name: ref.company_name || "Unnamed merchant",
      volume,
      transactions,
      previousVolume,
      change: pctChange(volume, previousVolume),
      trend,
    });
  };

  for (const r of records) {
    if (r.period_id !== period.id) continue;
    const key = keyOf(r);
    seen.add(key);
    push(r, prev.get(key) ?? null);
  }
  // Merchants that processed last time and have no row at all this time.
  for (const [key, r] of prev) if (!seen.has(key) && num(r.transaction_count) > 0) push(null, r);

  const order: Record<MerchantTrend, number> = { quiet: 0, down: 1, new: 2, up: 3, steady: 4 };
  rows.sort((a, b) => order[a.trend] - order[b.trend] || b.volume - a.volume);
  return { period, rows };
}

// ── Funnel ──────────────────────────────────────────────────────────────────

export type FunnelOpportunity = Pick<
  Opportunity,
  "status" | "outcome_status" | "outcome_closed_at" | "created_at" | "account_id"
>;

export interface LossReason {
  outcome: string;
  count: number;
}

export interface FunnelStats {
  windowDays: number;
  created: number;
  won: number;
  lost: number;
  /** Won ÷ decided, decided in the window. Null when nothing was decided. */
  winRate: number | null;
  lossReasons: LossReason[];
  allTime: { won: number; decided: number; winRate: number | null };
}

/**
 * Deals created in the window, deals decided in the window (by
 * outcome_closed_at, falling back to created_at), and why the lost ones died.
 */
export function funnelStats(opps: FunnelOpportunity[], now: Date, windowDays = 90): FunnelStats {
  const since = now.getTime() - windowDays * 86_400_000;
  const inWindow = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= since;

  const created = opps.filter((o) => inWindow(o.created_at)).length;
  const decided = opps.filter((o) => dealBucket(o) !== "open");
  const decidedInWindow = decided.filter((o) => inWindow(o.outcome_closed_at ?? o.created_at));
  const won = decidedInWindow.filter((o) => dealBucket(o) === "won").length;
  const lostDeals = decidedInWindow.filter((o) => dealBucket(o) === "lost");

  const reasons = new Map<string, number>();
  for (const o of lostDeals) {
    const key = o.outcome_status || "no_outcome";
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }

  const allWon = decided.filter((o) => dealBucket(o) === "won").length;
  return {
    windowDays,
    created,
    won,
    lost: lostDeals.length,
    winRate: decidedInWindow.length ? won / decidedInWindow.length : null,
    lossReasons: [...reasons.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count),
    allTime: { won: allWon, decided: decided.length, winRate: decided.length ? allWon / decided.length : null },
  };
}

// ── Live merchants & pipeline coverage ──────────────────────────────────────

/**
 * Merchants we have won, counted once per account — the same set Live &
 * billing lists (outcome_status = closed_won). The previous tile counted the
 * `merchants` table, which holds merchant *applications*.
 */
export function liveMerchantCount(opps: Pick<Opportunity, "outcome_status" | "account_id">[]): number {
  return new Set(opps.filter((o) => o.outcome_status === "closed_won").map((o) => o.account_id)).size;
}

/** How many open deals carry a monthly volume, i.e. contribute to the estimate. */
export function pipelineCoverage(open: Opportunity[]): { valued: number; total: number } {
  return { valued: open.filter((o) => monthlyRevenueEstimate(o) > 0).length, total: open.length };
}

// ── Team activity, from activities ──────────────────────────────────────────

export interface ActivityRow {
  type: string;
  user_email: string | null;
  created_at: string;
}

export type ActivityKind = "emails" | "tasks" | "moves" | "notes";

/** Rep-authored work only; inbound mail and automated notifications are not effort. */
export const ACTIVITY_KIND: Record<string, ActivityKind> = {
  email_sent: "emails",
  email_docs_request: "emails",
  task_completed: "tasks",
  stage_change: "moves",
  outcome_set: "moves",
  assignment_change: "moves",
  note_added: "notes",
};

export interface RepActivity {
  actor: string;
  thisWeek: Record<ActivityKind, number>;
  thisWeekTotal: number;
  lastWeekTotal: number;
}

const zero = (): Record<ActivityKind, number> => ({ emails: 0, tasks: 0, moves: 0, notes: 0 });

/** Per rep: the last 7 days by kind, and the 7 days before as one total. */
export function teamActivity(rows: ActivityRow[], now: Date): RepActivity[] {
  const day = 86_400_000;
  const t = now.getTime();
  const reps = new Map<string, RepActivity>();
  for (const r of rows) {
    const kind = ACTIVITY_KIND[r.type];
    if (!kind || !r.user_email) continue;
    const age = t - new Date(r.created_at).getTime();
    if (age < 0 || age >= 14 * day) continue;
    const actor = r.user_email.toLowerCase();
    const rep = reps.get(actor) ?? { actor, thisWeek: zero(), thisWeekTotal: 0, lastWeekTotal: 0 };
    if (age < 7 * day) {
      rep.thisWeek[kind] += 1;
      rep.thisWeekTotal += 1;
    } else {
      rep.lastWeekTotal += 1;
    }
    reps.set(actor, rep);
  }
  return [...reps.values()].sort((a, b) => b.thisWeekTotal - a.thisWeekTotal || b.lastWeekTotal - a.lastWeekTotal);
}
