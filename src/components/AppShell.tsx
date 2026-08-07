import { useRef, useCallback, lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";
import { IconRailSidebar } from "@/components/IconRailSidebar";
import FloatingChat from "@/components/FloatingChat";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActionItemsWidget } from "@/components/ActionItemsWidget";
import { PersistentTriTabDock } from "@/components/PersistentTriTabDock";
import { BroadcastPopup } from "@/components/BroadcastPopup";
import { ComplianceBroadcast } from "@/components/ComplianceBroadcast";
import { AtriaBroadcast } from "@/components/AtriaBroadcast";
import { NMIBoardingBroadcast } from "@/components/NMIBoardingBroadcast";
import { BroadcastQueueProvider } from "@/components/BroadcastQueue";
import { MobileAppDock } from "@/components/MobileAppDock";
import { PageTransition } from "@/components/PageTransition";
import { OfficeSimulatorOverlay } from "@/components/chat/OfficeSimulatorOverlay";
import { GmailReconnectBanner } from "@/components/GmailReconnectBanner";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageChromeProvider, usePageChrome } from "@/contexts/PageChromeContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
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
  const isMobile = useIsMobile();
  const location = useLocation();
  const { theme, variant } = useTheme();
  const queryClient = useQueryClient();
  const chrome = usePageChrome();

  const isDark = theme === "dark";
  const isDoom = variant === "dark-doom";
  const isChatRoute = location.pathname === "/chat";

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
  const handleNewApplication = useCallback(() => {
    chrome?.newApplicationRef.current?.();
  }, [chrome]);

  return (
    <div className="h-screen h-dvh min-h-0 flex flex-col w-full overflow-hidden relative">
      {isDark && (
        <>
          <Suspense fallback={null}>
            <Starfield />
          </Suspense>
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
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <MegaMenuHeader onNewApplication={handleNewApplication} />
      <GmailReconnectBanner />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <IconRailSidebar />
        <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
            className="flex-1 min-h-0 overflow-y-auto scroll-smooth pb-16 lg:pb-0"
          >
            {/* No key on PageTransition: keying it on pathname remounted the
                whole page subtree on every navigation. */}
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>

      <MobileBottomNav />
      <FloatingChat />
      <ActionItemsWidget />
      <PersistentTriTabDock />
      <BroadcastQueueProvider>
        <ComplianceBroadcast />
        <BroadcastPopup />
        <NMIBoardingBroadcast />
        <AtriaBroadcast />
      </BroadcastQueueProvider>
      {isMobile && !isChatRoute && <MobileAppDock />}
      <OfficeSimulatorOverlay />
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
