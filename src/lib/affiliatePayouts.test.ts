import { describe, it, expect } from "vitest";
import {
  payableOnFor,
  isPayableOn,
  summariseLedger,
  clearsMinimum,
  bonusesDue,
  commissionShare,
  gatewayShare,
  monthKey,
  selectRunEntries,
  reconcilePayoutRun,



} from "./affiliatePayouts";

describe("payableOnFor", () => {
  it("adds a 30-day hold to the month end", () => {
    expect(payableOnFor("2026-08-31")).toBe("2026-09-30");
    expect(payableOnFor("2026-02-28")).toBe("2026-03-30");
  });

  it("returns an empty string for junk input", () => {
    expect(payableOnFor("not-a-date")).toBe("");
  });
});

describe("isPayableOn", () => {
  it("holds credits until the 30 days have elapsed", () => {
    expect(isPayableOn("2026-08-31", "2026-09-29")).toBe(false);
    expect(isPayableOn("2026-08-31", "2026-09-30")).toBe(true);
    expect(isPayableOn("2026-08-31", "2026-10-05")).toBe(true);
  });
});

describe("summariseLedger", () => {
  it("splits pending, payable and paid and owes pending + payable", () => {
    const s = summariseLedger([
      { amount: 100, status: "pending" },
      { amount: "250.5", status: "payable" },
      { amount: 400, status: "paid" },
      { amount: -50, status: "payable", entry_type: "clawback" },
      { amount: 9999, status: "void" },
    ]);
    expect(s.pending).toBe(100);
    expect(s.payable).toBe(200.5);
    expect(s.paid).toBe(400);
    expect(s.balance).toBe(300.5);
    expect(s.lifetime).toBe(700.5);
  });

  it("returns zeros for an empty ledger", () => {
    expect(summariseLedger([])).toEqual({ pending: 0, payable: 0, paid: 0, balance: 0, lifetime: 0 });
  });
});

describe("clearsMinimum", () => {
  it("requires the payable balance to reach the minimum", () => {
    expect(clearsMinimum(49.99, 50)).toBe(false);
    expect(clearsMinimum(50, 50)).toBe(true);
    expect(clearsMinimum(0, 50)).toBe(false);
    expect(clearsMinimum(-10, 50)).toBe(false);
  });
});

describe("bonusesDue", () => {
  it("awards one bonus per completed milestone, minus those already given", () => {
    expect(bonusesDue(4, 0, 5)).toBe(0);
    expect(bonusesDue(5, 0, 5)).toBe(1);
    expect(bonusesDue(12, 1, 5)).toBe(1);
    expect(bonusesDue(12, 2, 5)).toBe(0);
    expect(bonusesDue(3, 5, 5)).toBe(0);
  });

  it("is safe when the milestone is misconfigured", () => {
    expect(bonusesDue(10, 0, 0)).toBe(0);
  });
});

describe("commissionShare", () => {
  it("applies the rate and the per-account monthly cap", () => {
    expect(commissionShare(1000, 0.5, 1000)).toBe(500);
    expect(commissionShare(4000, 0.5, 1000)).toBe(1000);
    expect(commissionShare(4000, 0.5, 0)).toBe(2000);
  });
});

describe("gatewayShare", () => {
  it("pays on the gateway margin only, ignoring processing residuals", () => {
    // Gateway billed $59, our cost $25 → margin $34 → partner gets $17.
    expect(gatewayShare(34, 0.5, 1000)).toBe(17);
    // A big processing residual is irrelevant: the base is the margin.
    expect(gatewayShare(0, 0.5, 1000)).toBe(0);
  });

  it("respects the per-merchant monthly cap", () => {
    expect(gatewayShare(3000, 0.5, 1000)).toBe(1000);
  });
});

describe("monthKey", () => {
  it("groups entries by the month they were earned in", () => {
    expect(monthKey("2026-07-31")).toBe("2026-07");
    expect(monthKey(null)).toBe("");
  });
});

describe("selectRunEntries", () => {
  const entries = [
    { id: "a", referrer_id: "p1", amount: 40, payable_on: "2026-08-30" },
    { id: "b", referrer_id: "p1", amount: 30, payable_on: "2026-09-30" },
    { id: "c", referrer_id: "p2", amount: 20, payable_on: "2026-08-30" },
    { id: "d", referrer_id: "p3", amount: 900, payable_on: "2026-12-30" },
  ];

  it("includes only credits released by the pay date", () => {
    const sel = selectRunEntries(entries, new Map(), "2026-09-30");
    expect(sel.entryIds.sort()).toEqual(["a", "b"]);
    expect(sel.total).toBe(70);
  });

  it("holds back a partner under their minimum", () => {
    const sel = selectRunEntries(entries, new Map([["p2", 50]]), "2026-09-30");
    expect(sel.entryIds).not.toContain("c");
    expect(sel.heldBack.find((h) => h.referrerId === "p2")?.amount).toBe(20);
  });

  it("respects a partner's own lower minimum", () => {
    const sel = selectRunEntries(entries, new Map([["p2", 10]]), "2026-08-31");
    expect(sel.entryIds).toEqual(["c"]);
    expect(sel.perPartner.get("p2")).toBe(20);
  });
});

describe("reconcilePayoutRun", () => {
  const minimums = new Map([["p1", 50]]);

  it("reports a match when the run released everything that was due", () => {
    const report = reconcilePayoutRun(
      [
        { id: "a", referrer_id: "p1", amount: 100, status: "paid", payable_on: "2026-07-30", payout_run_id: "run1" },
        { id: "b", referrer_id: "p1", amount: 50, status: "paid", payable_on: "2026-08-30", payout_run_id: "run1" },
      ],
      "run1",
      "2026-08-31",
      minimums,
    );
    expect(report.totals.released).toBe(150);
    expect(report.totals.variance).toBe(0);
    expect(report.mismatches).toHaveLength(0);
    expect(report.rows[0].verdict).toBe("match");
  });

  it("flags a month that was due but left out of the run", () => {
    const report = reconcilePayoutRun(
      [
        { id: "a", referrer_id: "p1", amount: 100, status: "paid", payable_on: "2026-07-30", payout_run_id: "run1" },
        { id: "b", referrer_id: "p1", amount: 60, status: "payable", payable_on: "2026-08-01", payout_run_id: null },
      ],
      "run1",
      "2026-08-31",
      minimums,
    );
    const row = report.rows[0];
    expect(row.due).toBe(160);
    expect(row.released).toBe(100);
    expect(row.variance).toBe(-60);
    expect(row.verdict).toBe("short");
    expect(row.missingEntryIds).toEqual(["b"]);
    expect(report.mismatches).toHaveLength(1);
  });

  it("flags a credit released before its hold expired", () => {
    const report = reconcilePayoutRun(
      [
        { id: "a", referrer_id: "p1", amount: 80, status: "paid", payable_on: "2026-09-30", payout_run_id: "run1" },
      ],
      "run1",
      "2026-08-31",
      minimums,
    );
    const row = report.rows[0];
    expect(row.due).toBe(0);
    expect(row.released).toBe(80);
    expect(row.verdict).toBe("over");
    expect(row.earlyEntryIds).toEqual(["a"]);
  });

  it("treats a below-minimum balance as held rather than a mismatch", () => {
    const report = reconcilePayoutRun(
      [{ id: "a", referrer_id: "p1", amount: 20, status: "payable", payable_on: "2026-08-01", payout_run_id: null }],
      "run1",
      "2026-08-31",
      minimums,
    );
    expect(report.rows[0].verdict).toBe("held");
    expect(report.rows[0].heldBack).toBe(20);
    expect(report.mismatches).toHaveLength(0);
  });

  it("ignores credits settled by an earlier run", () => {
    const report = reconcilePayoutRun(
      [
        { id: "old", referrer_id: "p1", amount: 500, status: "paid", payable_on: "2026-06-30", payout_run_id: "run0" },
        { id: "a", referrer_id: "p1", amount: 100, status: "paid", payable_on: "2026-07-30", payout_run_id: "run1" },
      ],
      "run1",
      "2026-08-31",
      minimums,
    );
    expect(report.totals.due).toBe(100);
    expect(report.totals.variance).toBe(0);
  });
});
