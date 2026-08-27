import { describe, it, expect } from "vitest";
import { edgeScrollVelocity, EDGE_SCROLL_ZONE, EDGE_SCROLL_MAX } from "./edgeScroll";

// A board viewport roughly the size of the real one: 1176px starting at x=232,
// the width left over on a 1440px laptop with the icon rail expanded.
const LEFT = 232;
const RIGHT = 1408;

describe("edgeScrollVelocity", () => {
  it("holds still in the middle of the board", () => {
    expect(edgeScrollVelocity(800, LEFT, RIGHT)).toBe(0);
    expect(edgeScrollVelocity(LEFT + EDGE_SCROLL_ZONE, LEFT, RIGHT)).toBe(0);
    expect(edgeScrollVelocity(RIGHT - EDGE_SCROLL_ZONE, LEFT, RIGHT)).toBe(0);
  });

  it("scrolls left — negative — as the pointer nears the left edge", () => {
    const v = edgeScrollVelocity(LEFT + 20, LEFT, RIGHT);
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThan(-EDGE_SCROLL_MAX);
  });

  it("scrolls right — positive — as the pointer nears the right edge", () => {
    const v = edgeScrollVelocity(RIGHT - 20, LEFT, RIGHT);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(EDGE_SCROLL_MAX);
  });

  it("reaches full speed at each edge and never exceeds it beyond them", () => {
    expect(edgeScrollVelocity(LEFT, LEFT, RIGHT)).toBeCloseTo(-EDGE_SCROLL_MAX);
    expect(edgeScrollVelocity(RIGHT, LEFT, RIGHT)).toBeCloseTo(EDGE_SCROLL_MAX);
    // Dragging past the board — a finger off the side of a tablet — must not
    // accelerate without bound.
    expect(edgeScrollVelocity(LEFT - 400, LEFT, RIGHT)).toBeCloseTo(-EDGE_SCROLL_MAX);
    expect(edgeScrollVelocity(RIGHT + 400, LEFT, RIGHT)).toBeCloseTo(EDGE_SCROLL_MAX);
  });

  it("accelerates as the pointer gets closer to the edge", () => {
    const far = edgeScrollVelocity(LEFT + 80, LEFT, RIGHT);
    const near = edgeScrollVelocity(LEFT + 20, LEFT, RIGHT);
    expect(near).toBeLessThan(far);
  });

  it("keeps a dead zone in a container narrower than two zones", () => {
    // 120px wide: a naive implementation lets both zones claim the centre, so
    // the direction falls out of statement order rather than the pointer.
    const narrowLeft = 0;
    const narrowRight = 120;
    expect(edgeScrollVelocity(60, narrowLeft, narrowRight)).toBe(0);
    expect(edgeScrollVelocity(5, narrowLeft, narrowRight)).toBeLessThan(0);
    expect(edgeScrollVelocity(115, narrowLeft, narrowRight)).toBeGreaterThan(0);
  });

  it("returns 0 for a degenerate rect rather than dividing by zero", () => {
    expect(edgeScrollVelocity(50, 100, 100)).toBe(0);
    expect(edgeScrollVelocity(50, 200, 100)).toBe(0);
    expect(edgeScrollVelocity(50, 0, 500, 0)).toBe(0);
  });
});
