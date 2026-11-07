import { describe, expect, it } from "vitest";
import {
  bookMonthsFromSyncLogs,
  funnelStats,
  headlineMonths,
  isCompletePeriod,
  liveMerchantCount,
  merchantChanges,
  pctChange,
  teamActivity,
  type CommissionPeriodRow,
  type CommissionRecordRow,
  type SyncLogRow,
} from "./opsMetrics";

const log = (y: number, m: number, at: string, vol: number, tx = 1, rev = 0, merchants = 4): SyncLogRow => ({
  period_year: y,
  period_month: m,
  created_at: at,
  merchant_count: merchants,
  raw_response: { summary: { total_volume: vol, total_transactions: tx, total_revenue: rev, merchant_count: merchants } },
});

describe("bookMonthsFromSyncLogs", () => {
  it("keeps the freshest sync per month, oldest month first", () => {
    const months = bookMonthsFromSyncLogs([
      log(2026, 10, "2026-10-13T17:00:00Z", 43055),
      log(2026, 10, "2026-11-07T01:14:00Z", 104026, 59, 2.28),
      log(2026, 9, "2026-09-15T19:06:00Z", 94319),
    ]);
    expect(months.map((m) => m.month)).toEqual([9, 10]);
    expect(months[1].volume).toBe(104026);
    expect(months[1].transactions).toBe(59);
    expect(months[1].revenue).toBe(2.28);
  });

  it("marks a month complete only when its freshest sync ran after it ended", () => {
    const [sep, oct, nov] = bookMonthsFromSyncLogs([
      log(2026, 9, "2026-09-15T19:06:00Z", 1),
      log(2026, 10, "2026-11-07T01:14:00Z", 1),
      log(2026, 11, "2026-11-07T01:13:00Z", 1),
    ]);
    expect(sep.complete).toBe(false);
    expect(oct.complete).toBe(true);
    expect(nov.complete).toBe(false);
  });

  it("tolerates a missing summary", () => {
    const [m] = bookMonthsFromSyncLogs([{ ...log(2026, 2, "2026-04-26T00:00:00Z", 0), raw_response: null, merchant_count: 0 }]);
    expect(m).toMatchObject({ volume: 0, transactions: 0, revenue: 0, merchants: 0 });
  });
});

describe("headlineMonths", () => {
  it("headlines the latest complete month and keeps the month in progress apart", () => {
    const months = bookMonthsFromSyncLogs([
      log(2026, 8, "2026-09-04T19:06:00Z", 75017),
      log(2026, 9, "2026-09-15T19:06:00Z", 94319), // saved mid-month: partial
      log(2026, 10, "2026-11-07T01:14:00Z", 104026),
      log(2026, 11, "2026-11-07T01:13:00Z", 14667),
    ]);
    const h = headlineMonths(months);
    expect(h.current?.month).toBe(10);
    expect(h.previous?.month).toBe(8); // the partial September is skipped
    expect(h.inProgress?.month).toBe(11);
  });

  it("returns nulls for an empty book", () => {
    expect(headlineMonths([])).toEqual({ current: null, previous: null, inProgress: null });
  });
});

describe("pctChange", () => {
  it("is null without a base", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
  });
});

describe("merchantChanges", () => {
  const periods: CommissionPeriodRow[] = [
    { id: "jul", period_start: "2026-07-01", period_end: "2026-07-31", fetched_at: "2026-08-17T01:32:00Z" },
    { id: "aug", period_start: "2026-08-01", period_end: "2026-08-31", fetched_at: "2026-09-04T19:06:00Z" },
    { id: "oct", period_start: "2026-10-01", period_end: "2026-10-31", fetched_at: "2026-10-07T16:07:00Z" }, // partial
  ];
  const rec = (period_id: string, account_id: string, tx: number, vol: number): CommissionRecordRow => ({
    period_id,
    account_id,
    company_name: account_id.toUpperCase(),
    transaction_count: tx,
    transaction_volume: vol,
  });

  it("compares the two latest complete periods and ignores a partial save", () => {
    const { period, rows } = merchantChanges(periods, [
      rec("jul", "a", 5, 1000), rec("aug", "a", 0, 0),        // quiet
      rec("jul", "b", 5, 1000), rec("aug", "b", 2, 300),      // down
      rec("jul", "c", 5, 1000), rec("aug", "c", 6, 1100),     // steady
      rec("aug", "d", 3, 500),                                  // new
      rec("jul", "e", 4, 800),                                  // no row at all this time → quiet
      rec("oct", "a", 9, 9999),                                 // partial period, ignored
    ]);
    expect(period?.id).toBe("aug");
    const byId = Object.fromEntries(rows.map((r) => [r.accountId, r.trend]));
    expect(byId).toEqual({ a: "quiet", b: "down", c: "steady", d: "new", e: "quiet" });
    expect(rows[0].trend).toBe("quiet");
  });

  it("has nothing to show without a complete period", () => {
    expect(merchantChanges([periods[2]], []).period).toBeNull();
  });

  it("treats a period saved before its month ended as partial", () => {
    expect(isCompletePeriod(periods[2])).toBe(false);
    expect(isCompletePeriod(periods[1])).toBe(true);
    expect(isCompletePeriod({ ...periods[1], fetched_at: null })).toBe(false);
  });
});

describe("funnelStats", () => {
  const now = new Date("2026-11-07T00:00:00Z");
  type F = Parameters<typeof funnelStats>[0][number];
  const opp = (o: Partial<F>): F => ({
    status: "active",
    outcome_status: null,
    outcome_closed_at: null,
    created_at: "2026-11-01T00:00:00Z",
    account_id: "x",
    ...o,
  });

  it("counts created, won and lost in the window, with loss reasons", () => {
    const s = funnelStats(
      [
        opp({}),
        opp({ status: "won", outcome_status: "closed_won", outcome_closed_at: "2026-10-01T00:00:00Z" }),
        opp({ status: "dead", outcome_status: "disqualified", outcome_closed_at: "2026-10-02T00:00:00Z" }),
        opp({ status: "dead", outcome_status: "disqualified", outcome_closed_at: "2026-10-03T00:00:00Z" }),
        opp({ status: "dead", outcome_status: "closed_lost", outcome_closed_at: "2026-10-04T00:00:00Z" }),
        // Decided long ago: outside the window, but in all-time.
        opp({ created_at: "2026-01-01T00:00:00Z", status: "dead", outcome_status: "closed_lost", outcome_closed_at: "2026-02-01T00:00:00Z" }),
      ],
      now,
    );
    expect(s.created).toBe(5);
    expect(s.won).toBe(1);
    expect(s.lost).toBe(3);
    expect(s.winRate).toBeCloseTo(0.25);
    expect(s.lossReasons).toEqual([
      { outcome: "disqualified", count: 2 },
      { outcome: "closed_lost", count: 1 },
    ]);
    expect(s.allTime).toEqual({ won: 1, decided: 5, winRate: 0.2 });
  });

  it("has no win rate when nothing was decided", () => {
    expect(funnelStats([opp({})], now).winRate).toBeNull();
  });
});

describe("liveMerchantCount", () => {
  it("counts each won account once, ignoring everything else", () => {
    expect(
      liveMerchantCount([
        { outcome_status: "closed_won", account_id: "a" },
        { outcome_status: "closed_won", account_id: "a" },
        { outcome_status: "closed_won", account_id: "b" },
        { outcome_status: "closed_lost", account_id: "c" },
        { outcome_status: null, account_id: "d" },
      ]),
    ).toBe(2);
  });
});

describe("teamActivity", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  it("counts rep-authored work this week by kind, and last week as a total", () => {
    const reps = teamActivity(
      [
        { type: "email_sent", user_email: "Jo@x.io", created_at: "2026-11-06T10:00:00Z" },
        { type: "task_completed", user_email: "jo@x.io", created_at: "2026-11-05T10:00:00Z" },
        { type: "stage_change", user_email: "jo@x.io", created_at: "2026-11-01T10:00:00Z" },
        { type: "email_sent", user_email: "jo@x.io", created_at: "2026-10-28T10:00:00Z" }, // last week
        { type: "email_received", user_email: "jo@x.io", created_at: "2026-11-06T10:00:00Z" }, // inbound: ignored
        { type: "note_added", user_email: null, created_at: "2026-11-06T10:00:00Z" }, // no actor: ignored
        { type: "note_added", user_email: "al@x.io", created_at: "2026-10-01T10:00:00Z" }, // too old
      ],
      now,
    );
    expect(reps).toEqual([
      {
        actor: "jo@x.io",
        thisWeek: { emails: 1, tasks: 1, moves: 1, notes: 0 },
        thisWeekTotal: 3,
        lastWeekTotal: 1,
      },
    ]);
  });
});
