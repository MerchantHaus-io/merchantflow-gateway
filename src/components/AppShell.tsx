import { useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";
import { IconRailSidebar } from "@/components/IconRailSidebar";
import FloatingChat from "@/components/FloatingChat";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActionItemsWidget } from "@/components/ActionItemsWidget";
import { PersistentTriTabDock } from "@/components/PersistentTriTabDock";
import { Broadcasts } from "@/components/Broadcasts";
import { MobileAppDock } from "@/components/MobileAppDock";
import { PageSkeleton } from "@/components/PageSkeleton";
import { RouteTitle } from "@/components/RouteTitle";
import { OfficeSimulatorOverlay } from "@/components/chat/OfficeSimulatorOverlay";
import { GmailReconnectBanner } from "@/components/GmailReconnectBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageChromeProvider, usePageChrome } from "@/contexts/PageChromeContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useIsCompactNav } from "@/hooks/use-compact-nav";
import { recordPageVisit } from "@/lib/recentPages";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/contexts/ThemeContext";
import { useReducedMotion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const Starfield = lazy(() => import("@/components/Starfield"));

/**
 * The persistent application chrome, mounted ONCE as a layout route.
 *
 * Previously each of the 47 internal pages rendered its own <AppLayout>, so
 * navigating tore down and rebuilt the header, icon rail, FloatingChat and the
 * (ironically named) PersistentTriTabDock every time. That is what made a
 * menu click feel like a full page reload, and it destroyed any state those
 * components held — an open chat conversation did not survive a navigation.
 *
 * Now the chrome mounts once for the session and only <Outlet /> swaps.
 * Pages still supply their header via AppLayout, which portals it into the
 * slot below (see PageChromeContext).
 */
function ShellChrome() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  // The same threshold the `lg:` classes use, so the dock can't fall into the
  // gap between "no icon rail" and "no dock" (#134).
  const isCompactNav = useIsCompactNav();
  const prefersReducedMotion = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, variant } = useTheme();
  const queryClient = useQueryClient();
  const chrome = usePageChrome();

  const isDark = theme === "dark";
  const isDoom = variant === "dark-doom";
  const isChatRoute = location.pathname === "/chat";

  // The scroll container no longer unmounts on navigation, so nothing resets
  // it for us any more. See the hook for the POP/PUSH split.
  useScrollRestoration(scrollRef);

  // Move focus to the content region on navigation (#104). Without this, focus
  // stays on the rail link that was clicked: keyboard users tab past the whole
  // nav again on every page, and screen readers announce nothing at all.
  // The initial render is skipped — stealing focus on first paint is hostile.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // preventScroll, or the browser scrolls the region into view and undoes
    // the scroll reset that just ran.
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Feeds the mobile launcher's "Recent" row (#156).
  useEffect(() => {
    recordPageVisit(location.pathname);
  }, [location.pathname]);

  // Refetch data rather than reloading the document. A full reload throws away
  // all page state, re-downloads the bundle and shows a white flash.
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);

  // No touch-device gate needed: usePullToRefresh binds touchstart/touchmove/
  // touchend only, so trackpad overscroll (a wheel event) can't trigger it.
  const { pullDistance, isRefreshing } = usePullToRefresh({
    containerRef: scrollRef,
    onRefresh: handleRefresh,
  });

  const showIndicator = pullDistance > 0 || isRefreshing;

  // Stable identity, so MegaMenuHeader never re-renders just because a page
  // re-created its handler.
  //
  // The fallback lives here rather than in MegaMenuHeader (#105): the header's
  // `onNewApplication` prop is always defined — it's this callback — so its own
  // `if (onNewApplication)` fallback could never fire. Now that AppLayout
  // clears the ref on unmount, +New → New Opportunity from a page that doesn't
  // handle it lands on Opportunities instead of doing nothing at all.
  const handleNewApplication = useCallback(() => {
    const handler = chrome?.newApplicationRef.current;
    if (handler) handler();
    else navigate("/opportunities?new=true");
  }, [chrome, navigate]);

  return (
    <div data-shell="root" className="h-screen h-dvh min-h-0 flex flex-col w-full overflow-hidden relative">
      {/* #173: Starfield was gated on the theme alone, so a phone rendered a
          full-viewport animated canvas behind every page. It is decoration —
          skip it on the compact layout and whenever the user has asked for
          less motion. */}
      {isDark && (
        <>
          {!isCompactNav && !prefersReducedMotion && (
            <Suspense fallback={null}>
              <Starfield />
            </Suspense>
          )}
          {/* Earth / Hell horizon glow */}
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[1]"
            style={{
              height: "40%",
              background: isDoom
                ? "radial-gradient(ellipse 120% 60% at 50% 110%, hsla(0, 85%, 35%, 0.35) 0%, hsla(0, 85%, 35%, 0.12) 40%, transparent 70%)"
                : "radial-gradient(ellipse 120% 60% at 50% 110%, hsla(200, 80%, 35%, 0.25) 0%, hsla(200, 80%, 35%, 0.08) 40%, transparent 70%)",
            }}
            aria-hidden="true"
          />
        </>
      )}
      {/* #99: first tab stop, so keyboard users can jump straight to content
          instead of tabbing the header and rail on every page. */}
      <a href="#main-content" className="skip-to-content" data-app-chrome>
        Skip to content
      </a>
      <MegaMenuHeader onNewApplication={handleNewApplication} />
      <div data-app-chrome style={{ display: "contents" }}>
        <GmailReconnectBanner />
      </div>
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <IconRailSidebar />
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          data-shell="main"
          className="flex-1 flex flex-col min-h-0 overflow-hidden focus:outline-none"
        >
          {/* Page header slot. AppLayout portals the title/actions bar in here;
              when no page supplies one this div stays empty and collapses. */}
          <div ref={chrome?.setHeaderSlot} />

          {/* Pull-to-refresh indicator */}
          {showIndicator && (
            <div
              className="flex-shrink-0 flex items-center justify-center overflow-hidden transition-all duration-200"
              style={{ height: isRefreshing ? 40 : Math.min(pullDistance, 60) }}
            >
              <RefreshCw
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform",
                  isRefreshing && "animate-spin"
                )}
                style={{ transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}
              />
            </div>
          )}

          <div
            ref={scrollRef}
            data-shell="scroll"
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
            // pb-16 was a magic 64px standing in for a 56px tab bar plus an
            // inset that varies by device, so it was wrong on every notched
            // phone (#166). Derived instead, and zero once the tab bar is gone.
            style={{
              paddingBottom: isCompactNav
                ? "calc(56px + env(safe-area-inset-bottom, 0px))"
                : undefined,
            }}
          >
            {/* Suspense belongs HERE, not around <Routes> (#102).
                Wrapping the router meant the first visit to any route
                suspended the whole tree — shell included — and replaced it
                with a full-screen spinner. Header, rail and chat vanished and
                then remounted, so every cold navigation still looked exactly
                like the full page reload this refactor set out to remove.
                Scoped to the outlet, only the content area waits.

                No PageTransition wrapper any more (#107): with the shell
                persistent there is no key and no AnimatePresence, so `initial`
                ran once on mount and `exit` never ran at all — framer-motion
                on the critical path for no animation. Re-triggering it would
                need either a key (which remounts the page, the very thing this
                refactor removed) or an imperative class reflow; neither is
                worth 200ms of fade. */}
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* data-app-chrome marks the floating furniture so @media print can hide
          it. Most of these render a <div>, so the print rule's
          `nav, aside, header` selector never matched them — which is why the
          tri-tab dock and chat were appearing on printed pages.
          display:contents means this wrapper generates no box at all, so it
          has zero effect on layout. */}
      {/* Sets document.title and announces the new page to screen readers. */}
      <RouteTitle />

      <div data-app-chrome style={{ display: "contents" }}>
        <MobileBottomNav />
        <FloatingChat />
        <ActionItemsWidget />
        <PersistentTriTabDock />
        <Broadcasts />
        {isCompactNav && !isChatRoute && <MobileAppDock />}
        <OfficeSimulatorOverlay />
      </div>
    </div>
  );
}

/**
 * Layout route for every authenticated internal page.
 *
 * ProtectedRoute sits here rather than around each individual route, so the
 * auth check runs once for the whole section instead of remounting on every
 * navigation (audit item #2).
 */
export function AppShell() {
  return (
    <ProtectedRoute>
      <PageChromeProvider>
        <ShellChrome />
      </PageChromeProvider>
    </ProtectedRoute>
  );
}
