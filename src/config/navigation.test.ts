import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALL_NAV_ITEMS,
  MOBILE_PRIMARY,
  NAV_GROUPS,
  activeGroupFor,
  activeItemFor,
  groupsForSurface,
} from "./navigation";

const APP_TSX = fileURLToPath(new URL("../App.tsx", import.meta.url));

/**
 * Every routable nav destination must correspond to a real route.
 *
 * This is the guard the three drifted copies of the nav tree never had: a
 * renamed or deleted route used to leave a dead menu entry behind, and there
 * was nothing to catch it.
 */
const declaredRoutes = new Set(
  [...readFileSync(APP_TSX, "utf8").matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]),
);

describe("navigation config", () => {
  it("parsed the route table", () => {
    expect(declaredRoutes.size).toBeGreaterThan(40);
  });

  it("points every internal item at a declared route", () => {
    const orphans = ALL_NAV_ITEMS.filter(
      (i) => !i.external && !declaredRoutes.has(i.url),
    ).map((i) => `${i.title} → ${i.url}`);
    expect(orphans).toEqual([]);
  });

  it("points every group at a declared route", () => {
    const orphans = NAV_GROUPS.filter((g) => !declaredRoutes.has(g.url)).map(
      (g) => `${g.title} → ${g.url}`,
    );
    expect(orphans).toEqual([]);
  });

  /**
   * The icon rail turns each group into a dropdown menu rather than a link
   * (#121), which is only lossless because a group's landing page is also the
   * first entry in its own menu. Break this and that page becomes unreachable
   * from the rail.
   */
  it("makes every group's landing page its own first menu item", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items[0]?.url, `${group.title} group`).toBe(group.url);
    }
  });

  it("marks off-site destinations as external", () => {
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) {
      if (item.url.startsWith("http")) expect(item.external).toBe(true);
    }
  });

  it("has no duplicate group titles", () => {
    const titles = NAV_GROUPS.map((g) => g.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  // #135: the first tab was titled "Pipeline" but pointed at "/", which renders
  // Home, while the launcher carried a separate "Pipeline Board" entry pointing
  // at the actual board.
  it("does not give two different destinations the same label", () => {
    const byTitle = new Map<string, Set<string>>();
    for (const item of [...MOBILE_PRIMARY, ...NAV_GROUPS.flatMap((g) => g.items)]) {
      const urls = byTitle.get(item.title) ?? new Set();
      urls.add(item.url);
      byTitle.set(item.title, urls);
    }
    const collisions = [...byTitle.entries()]
      .filter(([, urls]) => urls.size > 1)
      .map(([title, urls]) => `${title}: ${[...urls].join(", ")}`);
    expect(collisions).toEqual([]);
  });

  it("keeps mobile labels short enough for a launcher tile", () => {
    const tooLong = ALL_NAV_ITEMS.map((i) => i.mobileTitle ?? i.title).filter(
      (label) => label.length > 14,
    );
    expect(tooLong).toEqual([]);
  });

  // Shortening a label for the grid must not make two tiles indistinguishable
  // — "Board" fit both Pipeline Board and Board Merchant on the first pass.
  it("keeps mobile labels unique", () => {
    const byLabel = new Map<string, Set<string>>();
    for (const item of ALL_NAV_ITEMS) {
      const label = item.mobileTitle ?? item.title;
      const urls = byLabel.get(label) ?? new Set();
      urls.add(item.url);
      byLabel.set(label, urls);
    }
    const collisions = [...byLabel.entries()]
      .filter(([, urls]) => urls.size > 1)
      .map(([label, urls]) => `${label}: ${[...urls].join(", ")}`);
    expect(collisions).toEqual([]);
  });
});

describe("activeGroupFor", () => {
  // #108: /reports/transactions used to match Merchants AND Reports at once.
  it("resolves an overlapping path to its most specific owner", () => {
    expect(activeGroupFor("/reports/transactions")?.title).toBe("Merchants");
    expect(activeGroupFor("/reports")?.title).toBe("Reports");
  });

  it("resolves a detail route to its section", () => {
    expect(activeGroupFor("/opportunities/abc-123")?.title).toBe("Pipeline");
  });

  // #109: /support-request is the public client form, not the Support section.
  it("does not claim a sibling path that merely shares a prefix", () => {
    expect(activeGroupFor("/support-request")).toBeNull();
  });

  it("returns null for an unknown path", () => {
    expect(activeGroupFor("/nowhere")).toBeNull();
  });
});

describe("activeItemFor", () => {
  it("prefers the deepest matching item", () => {
    expect(activeItemFor("/reports/transactions")?.title).toBe("Transactions");
  });
});

describe("groupsForSurface", () => {
  it("keeps the launcher-only group off the icon rail", () => {
    expect(groupsForSurface("rail").map((g) => g.title)).not.toContain("System");
    expect(groupsForSurface("launcher").map((g) => g.title)).toContain("System");
  });
});
