import { useEffect, useRef } from "react";

/**
 * Makes the Android hardware back button (and browser Back) close an overlay
 * instead of navigating away from it (#137).
 *
 * With no history entry pushed and no back handler, pressing Back with the
 * mobile launcher open navigated the app underneath it — or, on the first
 * screen of the Capacitor build, exited the app outright. Pushing a same-URL
 * history entry when the overlay opens gives Back something to pop.
 *
 * The URL is deliberately unchanged, so react-router recomputes the same
 * location on popstate and no navigation occurs.
 */
export function useHistoryDismiss(open: boolean, onDismiss: () => void) {
  // Read the latest callback without re-running the effect and thrashing
  // history entries.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Identifies the entry we pushed, so cleanup can tell "our entry is still
  // the current one" from "the caller navigated somewhere else".
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Closed by the UI while our entry is still the current history entry
      // (tap outside, Escape, drag-to-dismiss) — pop it so Back doesn't need
      // two presses.
      //
      // Crucially, when the overlay closes *and* navigates in the same handler
      // (picking a page, a search result, Sign out), react-router has already
      // pushed the destination entry by the time this effect runs. Calling
      // history.back() then popped that destination and dumped the user back
      // on the page they started from. Checking the marker on the current
      // entry keeps the pop scoped to the entry we actually own.
      const token = tokenRef.current;
      tokenRef.current = null;
      if (token && (window.history.state as { overlayToken?: string } | null)?.overlayToken === token) {
        window.history.back();
      }
      return;
    }

    const token = Math.random().toString(36).slice(2);
    tokenRef.current = token;
    window.history.pushState({ overlay: true, overlayToken: token }, "", window.location.href);

    const onPopState = () => {
      // The entry is gone — this pop consumed it.
      tokenRef.current = null;
      dismissRef.current();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open]);
}
