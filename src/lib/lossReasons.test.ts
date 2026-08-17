import { describe, it, expect } from "vitest";
import {
  aggregateLossReasons,
  lossesByStage,
  lossesByTier,
  isLoss,
  reasonLabel,
  UNSPECIFIED,
  type LossOpp,
} from "./lossReasons";

const opps: LossOpp[] = [
  { outcome_status: "closed_won", outcome_reason: "faster_underwriting", stage: "go_live_ready", gateway_tier: "pro" },
  { outcome_status: "closed_lost", outcome_reason: "lost_iso_price", stage: "discovery", gateway_tier: "pro" },
  { outcome_status: "closed_lost", outcome_reason: "lost_iso_price", stage: "underwriting_review", gateway_tier: "starter" },
  { outcome_status: "disqualified", outcome_reason: "prohibited_mcc", stage: "discovery", gateway_tier: "starter" },
  { outcome_status: "no_decision", outcome_reason: null, stage: "application_prep", gateway_tier: null },
  { outcome_status: null, outcome_reason: null, stage: "discovery", gateway_tier: "pro" },
];

describe("isLoss", () => {
  it("counts lost, disqualified, no-decision and declined — never won or open", () => {
    expect(opps.filter(isLoss)).toHaveLength(4);
    expect(isLoss({ outcome_status: "closed_won" })).toBe(false);
    expect(isLoss({ outcome_status: null })).toBe(false);
    expect(isLoss({ outcome_status: "underwriting_declined" })).toBe(true);
  });
});

describe("aggregateLossReasons", () => {
  it("ranks reasons by count and splits by stage and tier", () => {
    const rows = aggregateLossReasons(opps);
    expect(rows[0].reason).toBe("lost_iso_price");
    expect(rows[0].count).toBe(2);
    expect(rows[0].share).toBe(50); // 2 of 4 losses
    expect(rows[0].byStage).toEqual({ discovery: 1, underwriting_review: 1 });
    expect(rows[0].byTier).toEqual({ pro: 1, starter: 1 });
  });

  it("labels reasons from the outcome-reason catalogue", () => {
    const rows = aggregateLossReasons(opps);
    expect(rows[0].label).toBe("Lost to another ISO / processor on price");
    expect(reasonLabel("prohibited_mcc")).toBe("Prohibited MCC / product category");
  });

  it("buckets losses with no reason under unspecified rather than dropping them", () => {
    const rows = aggregateLossReasons(opps);
    const unspecified = rows.find((r) => r.reason === UNSPECIFIED);
    expect(unspecified?.count).toBe(1);
    expect(unspecified?.label).toBe("No reason recorded");
  });

  it("excludes closed_won reasons entirely", () => {
    const rows = aggregateLossReasons(opps);
    expect(rows.some((r) => r.reason === "faster_underwriting")).toBe(false);
  });

  it("returns an empty list when nothing is lost", () => {
    expect(aggregateLossReasons([{ outcome_status: "closed_won" }])).toEqual([]);
  });
});

describe("lossesByStage / lossesByTier", () => {
  it("groups by the stage the deal died in", () => {
    expect(lossesByStage(opps)).toEqual([
      { key: "discovery", count: 2, share: 50 },
      { key: "application_prep", count: 1, share: 25 },
      { key: "underwriting_review", count: 1, share: 25 },
    ]);
  });

  it("groups by tier and labels missing tiers", () => {
    const tiers = lossesByTier(opps);
    expect(tiers).toEqual([
      { key: "starter", count: 2, share: 50 },
      { key: "pro", count: 1, share: 25 },
      { key: "untiered", count: 1, share: 25 },
    ]);
  });
});
