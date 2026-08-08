import { ReactNode, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { usePageChrome } from "@/contexts/PageChromeContext";
import { setPageTitle } from "@/lib/pageTitle";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
  onNewApplication?: () => void;
  /** Optional page title for the header area */
  pageTitle?: string;
  /** Optional header actions slot */
  headerActions?: ReactNode;
}

/**
 * Per-page header registrar.
 *
 * This used to render the entire application chrome — header, icon rail,
 * FloatingChat, docks, background layers — and all 47 internal pages rendered
 * their own copy. Navigating therefore unmounted and rebuilt every one of
 * those components, which is why clicking a menu item felt like a full page
 * reload, and why an open chat conversation never survived a navigation.
 *
 * The chrome now lives in AppShell, mounted once as a layout route. This
 * component is deliberately kept with the same name and props so that no page
 * had to change: it simply portals the title/actions bar into the slot the
 * shell exposes, and renders its children in place.
 *
 * Rendering the header through a portal (rather than syncing it into shell
 * state) means it updates naturally as the page re-renders — no effect that
 * could loop on a `headerActions` ReactNode whose identity changes every time.
 */
export function AppLayout({
  children,
  onNewApplication,
  pageTitle,
  headerActions,
}: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const chrome = usePageChrome();

  const isTopLevel = location.pathname === "/" || location.pathname === "/dashboard";

  const handleGoBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  // Ref, not state: publishing the handler must not re-render the shell.
  //
  // In an effect rather than during render (#105). Assigning in the render body
  // is a side effect — it double-fires under StrictMode and is not safe under
  // concurrent rendering — but the real bug was the missing cleanup. Nothing
  // cleared the ref on unmount, so after navigating Opportunities → Reports the
  // header's +New → New Opportunity still called Opportunities' modal setter on
  // a component that no longer existed: nothing happened, and dev logged a
  // state-update-on-unmounted warning. Clearing it lets the shell fall back to
  // navigating to /opportunities?new=true.
  useEffect(() => {
    if (!chrome) return;
    chrome.newApplicationRef.current = onNewApplication;
    return () => {
      chrome.newApplicationRef.current = undefined;
    };
  }, [chrome, onNewApplication]);

  // Publish the page title for document.title and the route announcer (#111,
  // #104). Keyed on pathname as well as the title so that navigating between
  // two pages that happen to share a title still re-publishes, and so a page
  // supplying no title clears the previous one.
  useEffect(() => {
    setPageTitle(location.pathname, pageTitle ?? "");
  }, [location.pathname, pageTitle]);

  const headerBar =
    pageTitle || headerActions ? (
      <div className="gradient-header px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {pageTitle && (
            <div className="flex items-center gap-2">
              {!isTopLevel && (
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleGoBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <h1 className="text-lg font-semibold text-foreground border-l-4 border-primary pl-3">
                {pageTitle}
              </h1>
            </div>
          )}
          {headerActions && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">{headerActions}</div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {headerBar && chrome?.headerSlot ? createPortal(headerBar, chrome.headerSlot) : null}
      {children}
    </>
  );
}
