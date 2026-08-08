import { useEffect, useRef } from "react";

/**
 * Makes the Android hardware back button (and browser Back) close an overlay
 * instead of navigating away from it (#137).
 *
 * With no history entry pushed and no back handler, pressing Back with the
 * mobile launcher open navigated the app underneath it — or, on the first
 * screen of the Capacitor build, exited the app outright. That is the most
 * jarring bug on the mobile list, and it needs no native plugin: pushing a
 * same-URL history entry when the overlay opens gives Back something to pop.
 *
 * The URL is deliberately unchanged, so react-router recomputes the same
 * location on popstate and no navigation occurs.
 */
export function useHistoryDismiss(open: boolean, onDismiss: () => void) {
  // Read the latest callback without re-running the effect and thrashing
  // history entries.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Tracks whether the entry we pushed is still on the stack, so closing via
  // the UI can pop it rather than leaving a dead entry behind.
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      // Closed by the UI (tap outside, Escape, drag-to-dismiss, picking an
      // item) while our entry is still current — take it back off the stack so
      // Back doesn't need two presses.
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
      return;
    }

    window.history.pushState({ overlay: true }, "", window.location.href);
    pushedRef.current = true;

    const onPopState = () => {
      // The entry is gone — this pop consumed it.
      pushedRef.current = false;
      dismissRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);
}
