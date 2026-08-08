import { RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll position management for the shell's single scroll container (#103).
 *
 * The container used to be destroyed and rebuilt on every navigation, so the
 * browser reset scrollTop for free. Now that the shell persists, it doesn't:
 * scrolling halfway down Opportunities and clicking into a deal opened the
 * detail page at the same offset.
 *
 * Forward navigations (PUSH/REPLACE) go to the top. Back/forward (POP) restore
 * the offset the user left, the way a normal document does.
 *
 * Restoring on POP is best-effort. Pages are lazily loaded and suspend, so the
 * container may still be empty in the commit where the path changes and there
 * is nothing to scroll to yet. We retry for a few frames, and stop as soon as
 * the offset sticks or the user scrolls themselves.
 */
const RESTORE_FRAMES = 10;

export function useScrollRestoration(ref: RefObject<HTMLElement>) {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const offsets = useRef(new Map<string, number>());
  // Read inside the scroll listener without re-binding it on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Record where the user is, coalesced to one write per frame.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        offsets.current.set(pathnameRef.current, el.scrollTop);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const target = navigationType === "POP" ? offsets.current.get(pathname) ?? 0 : 0;

    el.scrollTop = target;
    if (target === 0) return;

    // The page hasn't necessarily rendered yet — keep trying until the
    // container is tall enough to hold the offset.
    let frame = 0;
    let attempts = 0;
    const settle = () => {
      if (!ref.current || attempts >= RESTORE_FRAMES) return;
      attempts += 1;
      if (Math.abs(ref.current.scrollTop - target) > 1) {
        ref.current.scrollTop = target;
        frame = requestAnimationFrame(settle);
      }
    };
    frame = requestAnimationFrame(settle);

    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref, pathname, navigationType]);
}
