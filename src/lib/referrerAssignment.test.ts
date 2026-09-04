import { describe, expect, it } from "vitest";
import { isLiveStage, shouldAssignAccountReferrer } from "./referrerAssignment";

describe("isLiveStage", () => {
  it("treats closed_won as live", () => {
    expect(isLiveStage("closed_won")).toBe(true);
  });
  it("treats everything else as not live", () => {
    expect(isLiveStage("discovery")).toBe(false);
    expect(isLiveStage(null)).toBe(false);
    expect(isLiveStage(undefined)).toBe(false);
  });
});

describe("shouldAssignAccountReferrer", () => {
  it("assigns when a live deal has a partner and the account has none", () => {
    expect(
      shouldAssignAccountReferrer({ stage: "closed_won", opportunityReferrerId: "p1", accountReferrerId: null }),
    ).toBe(true);
  });

  it("does not assign before the deal is live", () => {
    expect(
      shouldAssignAccountReferrer({ stage: "underwriting_review", opportunityReferrerId: "p1", accountReferrerId: null }),
    ).toBe(false);
  });

  it("does not assign when the deal has no partner", () => {
    expect(
      shouldAssignAccountReferrer({ stage: "closed_won", opportunityReferrerId: null, accountReferrerId: null }),
    ).toBe(false);
  });

  it("never overwrites a partner already on the account", () => {
    expect(
      shouldAssignAccountReferrer({ stage: "closed_won", opportunityReferrerId: "p1", accountReferrerId: "p2" }),
    ).toBe(false);
  });
});
