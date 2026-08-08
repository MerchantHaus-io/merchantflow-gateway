import { describe, expect, it } from "vitest";
import { isPathWithin, pathMatchDepth } from "./routeMatch";

describe("isPathWithin", () => {
  it("matches the base path exactly", () => {
    expect(isPathWithin("/support", "/support")).toBe(true);
  });

  it("matches descendants", () => {
    expect(isPathWithin("/support/123", "/support")).toBe(true);
    expect(isPathWithin("/reports/transactions", "/reports")).toBe(true);
  });

  // The regressions this helper exists to prevent. Each of these was a real
  // bug caused by a bare startsWith().
  it("does not match a sibling that merely shares a prefix", () => {
    expect(isPathWithin("/support-request", "/support")).toBe(false);
    expect(isPathWithin("/contacts", "/contact")).toBe(false);
    expect(isPathWithin("/quotes-contracts", "/q")).toBe(false);
    expect(isPathWithin("/leads", "/lead")).toBe(false);
  });

  it("does not treat a longer base as contained in a shorter path", () => {
    expect(isPathWithin("/support", "/support/123")).toBe(false);
  });
});

describe("pathMatchDepth", () => {
  it("returns -1 when the path does not match", () => {
    expect(pathMatchDepth("/support-request", "/support")).toBe(-1);
  });

  it("scores a more specific match higher", () => {
    const specific = pathMatchDepth("/reports/transactions", "/reports/transactions");
    const general = pathMatchDepth("/reports/transactions", "/reports");
    expect(specific).toBeGreaterThan(general);
    expect(general).toBeGreaterThan(-1);
  });
});
