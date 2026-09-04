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
  PARTNER_SHARE_DIVISOR,
  PARTNER_SHARE_RATE,
  DEFAULT_MONTHLY_CAP,
  GATEWAY_BASIS,
  gatewayBilled,
  gatewayCost,
  gatewayNet,
  partnerShare,
  partnerShareForMonth,
  auditCommissionLedger,
  bonusProgress,
  signedCorrectionAmount,
  clawbackTotalFor,
  canVoidEntry,
  validateCorrection,



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

describe("gateway basis", () => {
  it("bills the monthly fee plus the per-transaction fee", () => {
    expect(gatewayBilled(0)).toBe(GATEWAY_BASIS.monthlyBilled);
    expect(gatewayBilled(6)).toBe(61.4);
    expect(gatewayBilled(25)).toBe(69);
  });

  it("costs the monthly platform cost plus the per-transaction cost", () => {
    expect(gatewayCost(0)).toBe(GATEWAY_BASIS.monthlyCost);
    expect(gatewayCost(6)).toBe(25.9);
    expect(gatewayCost(25)).toBe(28.75);
  });

  it("nets billed less cost and never goes negative", () => {
    expect(gatewayNet(0)).toBe(34);
    expect(gatewayNet(6)).toBe(35.5);
    expect(gatewayNet(25)).toBe(40.25);
    expect(gatewayNet(-100)).toBe(34);
  });

  it("matches the production gateway figures month for month", () => {
    // The three referred merchants' real Jul–Sep 2026 months.
    const observed: [number, number, number][] = [
      // txn count, gateway_invoiced, gateway_margin
      [6, 61.4, 35.5],
      [3, 60.2, 34.75],
      [1, 59.4, 34.25],
      [19, 66.6, 38.75],
      [25, 69.0, 40.25],
      [7, 61.8, 35.75],
      [13, 64.2, 37.25],
    ];
    for (const [txns, billed, net] of observed) {
      expect(gatewayBilled(txns)).toBe(billed);
      expect(gatewayNet(txns)).toBe(net);
    }
  });
});

describe("partnerShare", () => {
  it("is a quarter of the gateway net", () => {
    expect(PARTNER_SHARE_DIVISOR).toBe(4);
    expect(PARTNER_SHARE_RATE).toBe(0.25);
    expect(partnerShare(100)).toBe(25);
    expect(partnerShare(35.5)).toBe(8.88);
    expect(partnerShare(34.25)).toBe(8.56);
  });

  it("applies the per-merchant monthly cap", () => {
    expect(partnerShare(8000, DEFAULT_MONTHLY_CAP)).toBe(1000);
    expect(partnerShare(8000, 0)).toBe(2000); // 0 = uncapped
    expect(partnerShare(400, DEFAULT_MONTHLY_CAP)).toBe(100);
  });

  it("never pays out on a negative net", () => {
    expect(partnerShare(-500)).toBe(0);
  });

  it("derives the share straight from a transaction count", () => {
    expect(partnerShareForMonth(6)).toBe(8.88);
    expect(partnerShareForMonth(25)).toBe(10.06);
  });
});

describe("summariseLedger — entry types", () => {
  it("ignores payout rows so disbursement is not counted as earnings", () => {
    const summary = summariseLedger([
      { amount: 100, status: "paid", entry_type: "commission" },
      { amount: 100, status: "paid", entry_type: "payout" },
      { amount: 20, status: "payable", entry_type: "bonus" },
    ]);
    expect(summary.paid).toBe(100);
    expect(summary.payable).toBe(20);
    expect(summary.lifetime).toBe(120);
  });

  it("nets clawbacks and adjustments out of the balance", () => {
    const summary = summariseLedger([
      { amount: 100, status: "payable", entry_type: "commission" },
      { amount: -30, status: "payable", entry_type: "clawback" },
    ]);
    expect(summary.payable).toBe(70);
    expect(summary.balance).toBe(70);
  });
});

describe("auditCommissionLedger", () => {
  const basis = [
    {
      referrer_id: "p1",
      account_id: "a1",
      company_name: "the masque skin",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      transaction_count: 6,
    },
    {
      referrer_id: "p1",
      account_id: "a2",
      company_name: "Exotic Car Trader",
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      transaction_count: 13,
    },
  ];

  it("flags a credit worked out on the wrong share", () => {
    // 17.75 is (billed − cost) ÷ 2 — the old 50% rate on a $35.50 net.
    const report = auditCommissionLedger(
      [
        {
          id: "e1",
          referrer_id: "p1",
          account_id: "a1",
          amount: 17.75,
          status: "payable",
          entry_type: "commission",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
        },
      ],
      [basis[0]],
    );
    const row = report.rows[0];
    expect(row.net).toBe(35.5);
    expect(row.expected).toBe(8.88);
    expect(row.credited).toBe(17.75);
    expect(row.variance).toBe(8.87);
    expect(row.verdict).toBe("over");
    expect(report.exceptions).toHaveLength(1);
  });

  it("passes a credit that matches the programme", () => {
    const report = auditCommissionLedger(
      [
        {
          id: "e1",
          referrer_id: "p1",
          account_id: "a1",
          amount: 8.88,
          status: "payable",
          entry_type: "commission",
          period_start: "2026-07-01",
          period_end: "2026-07-31",
        },
      ],
      [basis[0]],
    );
    expect(report.rows[0].verdict).toBe("match");
    expect(report.totals.variance).toBe(0);
    expect(report.exceptions).toHaveLength(0);
  });

  it("reports a billed month that never accrued", () => {
    const report = auditCommissionLedger([], basis);
    expect(report.missing).toHaveLength(2);
    expect(report.missing.map((r) => r.merchant).sort()).toEqual([
      "Exotic Car Trader",
      "the masque skin",
    ]);
    // 6 txns -> 8.88, 13 txns -> 9.31
    expect(report.totals.expected).toBe(18.19);
    expect(report.totals.credited).toBe(0);
  });

  it("reports a credit with no gateway month behind it", () => {
    const report = auditCommissionLedger(
      [
        {
          id: "ghost",
          referrer_id: "p1",
          account_id: "a9",
          amount: 40,
          status: "pending",
          entry_type: "commission",
          period_start: "2026-07-01",
          description: "Gateway referral commission — Ghost Merchant",
        },
      ],
      [],
    );
    expect(report.orphans).toHaveLength(1);
    expect(report.orphans[0].merchant).toBe("Ghost Merchant");
    expect(report.orphans[0].variance).toBe(40);
  });

  it("ignores bonuses, voids and payouts", () => {
    const report = auditCommissionLedger(
      [
        {
          id: "b1",
          referrer_id: "p1",
          account_id: null,
          amount: 500,
          status: "payable",
          entry_type: "bonus",
          period_start: "2026-07-01",
        },
        {
          id: "v1",
          referrer_id: "p1",
          account_id: "a1",
          amount: 17.75,
          status: "void",
          entry_type: "commission",
          period_start: "2026-07-01",
        },
      ],
      [basis[0]],
    );
    // Only the un-accrued gateway month survives.
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].verdict).toBe("missing");
  });

  it("honours a partner's own cap", () => {
    const report = auditCommissionLedger(
      [
        {
          id: "e1",
          referrer_id: "p1",
          account_id: "a1",
          amount: 5,
          status: "payable",
          entry_type: "commission",
          period_start: "2026-07-01",
        },
      ],
      [basis[0]],
      new Map([["p1", 5]]),
    );
    expect(report.rows[0].expected).toBe(5);
    expect(report.rows[0].capped).toBe(true);
    expect(report.rows[0].verdict).toBe("match");
  });
});

describe("bonusProgress", () => {
  it("counts earned bonuses off boarded merchants", () => {
    const p = bonusProgress(7, []);
    expect(p.earned).toBe(1);
    expect(p.credited).toBe(0);
    expect(p.nextAt).toBe(10);
    expect(p.toNext).toBe(3);
  });

  it("separates what was earned from what was actually credited", () => {
    const p = bonusProgress(10, [
      { amount: 500, status: "payable", entry_type: "bonus" },
      { amount: 500, status: "void", entry_type: "bonus" },
      { amount: 25, status: "paid", entry_type: "commission" },
    ]);
    expect(p.earned).toBe(2);
    expect(p.credited).toBe(1);
    expect(p.creditedValue).toBe(500);
  });

  it("lands the next milestone correctly on an exact multiple", () => {
    expect(bonusProgress(5).nextAt).toBe(10);
    expect(bonusProgress(5).toNext).toBe(5);
    expect(bonusProgress(0).nextAt).toBe(5);
  });
});

describe("signedCorrectionAmount", () => {
  it("always stores a clawback negative, however it was typed", () => {
    expect(signedCorrectionAmount("clawback", 40)).toBe(-40);
    expect(signedCorrectionAmount("clawback", -40)).toBe(-40);
    expect(signedCorrectionAmount("clawback", "17.75")).toBe(-17.75);
  });

  it("lets an adjustment go either way", () => {
    expect(signedCorrectionAmount("adjustment", 25)).toBe(25);
    expect(signedCorrectionAmount("adjustment", -25)).toBe(-25);
  });
});

describe("clawbackTotalFor", () => {
  const entries = [
    { id: "a", account_id: "m1", amount: 8.88, status: "payable", entry_type: "commission" },
    { id: "b", account_id: "m1", amount: 9.31, status: "paid", entry_type: "commission" },
    { id: "c", account_id: "m1", amount: 9.69, status: "void", entry_type: "commission" },
    { id: "d", account_id: "m2", amount: 10.06, status: "payable", entry_type: "commission" },
    { id: "e", account_id: null, amount: 500, status: "payable", entry_type: "bonus" },
  ];

  it("totals every live commission credit for one merchant", () => {
    expect(clawbackTotalFor(entries, "m1")).toBe(18.19);
  });

  it("does not reach across merchants or into bonuses", () => {
    expect(clawbackTotalFor(entries, "m2")).toBe(10.06);
    expect(clawbackTotalFor(entries, "nope")).toBe(0);
  });
});

describe("canVoidEntry", () => {
  it("allows voiding a credit still on hold or ready to pay", () => {
    expect(canVoidEntry({ id: "a", amount: 10, status: "pending" })).toBe(true);
    expect(canVoidEntry({ id: "a", amount: 10, status: "payable" })).toBe(true);
  });

  it("refuses once the money is paid or banked into a run", () => {
    expect(canVoidEntry({ id: "a", amount: 10, status: "paid" })).toBe(false);
    expect(canVoidEntry({ id: "a", amount: 10, status: "payable", payout_run_id: "run1" })).toBe(false);
    expect(canVoidEntry({ id: "a", amount: 10, status: "void" })).toBe(false);
  });
});

describe("validateCorrection", () => {
  const balance = { pending: 20, payable: 30, paid: 100, balance: 50, lifetime: 150 };

  it("insists on a reason", () => {
    const v = validateCorrection({ type: "clawback", magnitude: 10, reason: "  " }, balance);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/reason/i);
  });

  it("rejects a zero amount", () => {
    const v = validateCorrection({ type: "adjustment", magnitude: 0, reason: "goodwill" }, balance);
    expect(v.ok).toBe(false);
    expect(v.error).toMatch(/amount/i);
  });

  it("passes a clawback within the balance without warnings", () => {
    const v = validateCorrection({ type: "clawback", magnitude: 40, reason: "churned in window" }, balance);
    expect(v.ok).toBe(true);
    expect(v.amount).toBe(-40);
    expect(v.warnings).toEqual([]);
  });

  it("warns when a clawback exceeds what is still owed", () => {
    const v = validateCorrection({ type: "clawback", magnitude: 90, reason: "churned" }, balance);
    expect(v.ok).toBe(true);
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings.join(" ")).toMatch(/negative balance/i);
  });

  it("warns when nothing is owed at all", () => {
    const v = validateCorrection(
      { type: "clawback", magnitude: 10, reason: "churned" },
      { pending: 0, payable: 0, paid: 0, balance: 0, lifetime: 0 },
    );
    expect(v.warnings.join(" ")).toMatch(/nothing owed/i);
  });

  it("accepts a positive adjustment", () => {
    const v = validateCorrection({ type: "adjustment", magnitude: 15, reason: "goodwill credit" }, balance);
    expect(v.ok).toBe(true);
    expect(v.amount).toBe(15);
    expect(v.warnings).toEqual([]);
  });
});
