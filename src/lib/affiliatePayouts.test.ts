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
    expect(sel.entryIds.sort()).toEqual(["a", "c"]);
    expect(sel.perPartner.get("p2")).toBe(20);
  });
});
