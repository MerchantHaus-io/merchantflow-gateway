import { useEffect, useState } from "react";
import { NAV_BREAKPOINT } from "@/lib/breakpoints";

const QUERY = `(max-width: ${NAV_BREAKPOINT - 1}px)`;

/**
 * True when the app is showing the compact (mobile) navigation — tab bar and
 * launcher — rather than the icon rail.
 *
 * Matches the `lg:` breakpoint exactly, so JS-gated chrome and CSS-gated
 * chrome agree about which layout is on screen (#134).
 */
export function useIsCompactNav(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return compact;
}
