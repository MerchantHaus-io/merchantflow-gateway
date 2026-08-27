/**
 * Horizontal auto-scroll velocity for a pointer dragging near a scroller's edge.
 *
 * The pipeline board is ~2,550px of columns behind a viewport around 1,176px on
 * a 1440px laptop. Without this, `dragOver` only called `preventDefault`, so
 * reaching a late stage meant scrolling the board by hand — which put the card
 * you were holding off-screen. A drag from Discovery to Testing was not slow,
 * it was impossible.
 *
 * Extracted from the board so the geometry is testable: the sign convention and
 * the narrow-container case are exactly the parts that fail silently in a drag.
 */

/** How close to an edge the pointer must get before the scroller follows it. */
export const EDGE_SCROLL_ZONE = 96;

/** Peak speed in px per frame, reached at the outer limit of the zone. */
export const EDGE_SCROLL_MAX = 18;

/**
 * Returns px to add to `scrollLeft` this frame. Negative scrolls left, positive
 * right, `0` means the pointer is in the dead zone and the board holds still.
 *
 * @param clientX viewport x of the pointer
 * @param left    scroller's left edge, viewport coordinates
 * @param right   scroller's right edge, viewport coordinates
 */
export function edgeScrollVelocity(
  clientX: number,
  left: number,
  right: number,
  zone: number = EDGE_SCROLL_ZONE,
  max: number = EDGE_SCROLL_MAX,
): number {
  const width = right - left;
  if (!(width > 0) || !(zone > 0)) return 0;

  // Below ~192px wide the two zones would overlap and both tests would pass for
  // the same pointer, making the direction depend on statement order. Half the
  // width keeps a dead zone in the middle at every size — the board renders
  // 110px columns on a phone, so this is a real case, not a defensive one.
  const z = Math.min(zone, width / 2);

  if (clientX < left + z) {
    return -max * Math.min(1, (left + z - clientX) / z);
  }
  if (clientX > right - z) {
    return max * Math.min(1, (clientX - (right - z)) / z);
  }
  return 0;
}
