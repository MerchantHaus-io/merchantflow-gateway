import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import {
  APP_NAME,
  getPageTitleEntry,
  getPageTitleServerEntry,
  subscribePageTitle,
} from "@/lib/pageTitle";

/**
 * Keeps document.title in step with the current page (#111) and announces
 * navigations to screen readers (#104).
 *
 * The tab used to read "Merchant Haus Onboarding Portal" — a merchant-facing
 * title — on every internal page, because nothing set it after the initial
 * HTML. For a CRM people keep open in five tabs that is a daily papercut.
 *
 * This is deliberately a leaf component subscribing to an external store: a
 * title change re-renders this <div> and nothing else, so the persistent shell
 * (and the routed page inside it) are untouched.
 */
export function RouteTitle() {
  const { pathname } = useLocation();
  const entry = useSyncExternalStore(
    subscribePageTitle,
    getPageTitleEntry,
    getPageTitleServerEntry,
  );

  // A title published by the page we've since navigated away from is stale.
  const title = entry.path === pathname ? entry.title : "";

  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {title ? `${title}, page loaded` : ""}
    </div>
  );
}
