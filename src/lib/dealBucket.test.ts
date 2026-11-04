import { describe, expect, it } from "vitest";
import { dealBucket, isAssignedTo } from "./dealBucket";

describe("dealBucket", () => {
  it("treats an active deal with no outcome as open", () => {
    expect(dealBucket({ status: "active", outcome_status: null })).toBe("open");
  });

  it("counts closed_won as won even while status stays active after go-live", () => {
    expect(dealBucket({ status: "active", outcome_status: "closed_won" })).toBe("won");
    expect(dealBucket({ status: "won", outcome_status: null })).toBe("won");
  });

  it("counts any other outcome, or a dead status, as lost", () => {
    expect(dealBucket({ status: "dead", outcome_status: "disqualified" })).toBe("lost");
    expect(dealBucket({ status: "dead", outcome_status: null })).toBe("lost");
    expect(dealBucket({ status: "active", outcome_status: "closed_lost" })).toBe("lost");
  });
});

describe("isAssignedTo", () => {
  const darryn = { email: "darryn@merchanthaus.io", name: "Darryn" };

  it("matches an assignee stored as the user's email, case-insensitively", () => {
    expect(isAssignedTo("Darryn@MerchantHaus.io", darryn)).toBe(true);
  });

  it("matches an assignee stored as the user's display name", () => {
    expect(isAssignedTo("Darryn", darryn)).toBe(true);
    expect(isAssignedTo("darryn", { email: "darryn@merchanthaus.io" })).toBe(true);
  });

  it("matches a roster alias of the same person", () => {
    expect(isAssignedTo("onboarding@merchanthaus.io", darryn)).toBe(true);
  });

  it("does not match someone else or an empty assignee", () => {
    expect(isAssignedTo("jessie@merchanthaus.io", darryn)).toBe(false);
    expect(isAssignedTo(null, darryn)).toBe(false);
    expect(isAssignedTo("", darryn)).toBe(false);
  });
});
