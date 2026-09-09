import { describe, expect, it } from "vitest";
import {
  REQUIRED_ONBOARDING_STEPS,
  isValidSlug,
  onboardingProgress,
  slugify,
  stepLabel,
} from "./tenantProvisioning";

describe("slugify / isValidSlug", () => {
  it("normalises a company name", () => {
    expect(slugify("  Acme Payments, Inc. ")).toBe("acme-payments-inc");
  });

  it("rejects malformed slugs", () => {
    expect(isValidSlug("acme-payments")).toBe(true);
    expect(isValidSlug("-acme")).toBe(false);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("Acme")).toBe(false);
    expect(isValidSlug("acme payments")).toBe(false);
  });
});

describe("onboardingProgress", () => {
  it("is incomplete with nothing done", () => {
    const p = onboardingProgress([]);
    expect(p.complete).toBe(false);
    expect(p.requiredDone).toBe(0);
    expect(p.missing).toEqual(REQUIRED_ONBOARDING_STEPS);
  });

  it("ignores optional steps when deciding readiness", () => {
    const p = onboardingProgress(["welcome", "integrations"]);
    expect(p.complete).toBe(false);
    expect(p.requiredDone).toBe(0);
  });

  it("completes once every required step is done", () => {
    const p = onboardingProgress([...REQUIRED_ONBOARDING_STEPS]);
    expect(p.complete).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.missing).toEqual([]);
  });
});

describe("stepLabel", () => {
  it("falls back to the raw key", () => {
    expect(stepLabel("create_tenant")).toBe("Create organisation");
    expect(stepLabel("something_new")).toBe("something_new");
  });
});
