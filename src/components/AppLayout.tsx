import { ReactNode, useRef, useCallback, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";
import { IconRailSidebar } from "@/components/IconRailSidebar";
import FloatingChat from "@/components/FloatingChat";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActionItemsWidget } from "@/components/ActionItemsWidget";
import { BroadcastPopup } from "@/components/BroadcastPopup";
import { ComplianceBroadcast } from "@/components/ComplianceBroadcast";
import { AtriaBroadcast } from "@/components/AtriaBroadcast";
import { NMIBoardingBroadcast } from "@/components/NMIBoardingBroadcast";
import { SharedTodoPopup } from "@/components/SharedTodoPopup";
import { BroadcastQueueProvider } from "@/components/BroadcastQueue";
import { MobileAppDock } from "@/components/MobileAppDock";
import { PageTransition } from "@/components/PageTransition";
import { OfficeSimulatorOverlay } from "@/components/chat/OfficeSimulatorOverlay";
import { GmailReconnectBanner } from "@/components/GmailReconnectBanner";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const Starfield = lazy(() => import("@/components/Starfield"));

interface AppLayoutProps {
  children: ReactNode;
  onNewApplication?: () => void;
  /** Optional page title for the header area */
  pageTitle?: string;
  /** Optional header actions slot */
  headerActions?: ReactNode;
}

export function AppLayout({
  children,
  onNewApplication,
  pageTitle,
  headerActions,
}: AppLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, variant } = useTheme();
  const isDark = theme === "dark";
  const isDoom = variant === "dark-doom";
  const isChatRoute = location.pathname === "/chat";
  const isTopLevel = location.pathname === "/" || location.pathname === "/dashboard";

  const handleGoBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);
  const handleRefresh = useCallback(async () => {
    window.location.reload();
  }, []);

  const { pullDistance, isRefreshing } = usePullToRefresh({
    containerRef: scrollRef,
    onRefresh: handleRefresh,
  });

  const showIndicator = pullDistance > 0 || isRefreshing;

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
      <MegaMenuHeader onNewApplication={onNewApplication} />
      <GmailReconnectBanner />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <IconRailSidebar />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {(pageTitle || headerActions) && (
          <div className="gradient-header px-4 lg:px-6 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {pageTitle && (
                <div className="flex items-center gap-2">
                  {!isTopLevel && (
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleGoBack}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <h1 className="text-lg font-semibold text-foreground border-l-4 border-primary pl-3">{pageTitle}</h1>
                </div>
              )}
              {headerActions && <div className="flex items-center gap-2 ml-auto flex-wrap">{headerActions}</div>}
            </div>
          </div>
        )}

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
          <PageTransition key={location.pathname}>
            {children}
          </PageTransition>
        </div>
        </main>
      </div>

      <MobileBottomNav />
      <FloatingChat />
      <ActionItemsWidget />
      <BroadcastQueueProvider>
        <ComplianceBroadcast />
        <BroadcastPopup />
        <NMIBoardingBroadcast />
        <AtriaBroadcast />
        <SharedTodoPopup />
      </BroadcastQueueProvider>
      {/* AtriaFAB removed — AI is now a tab inside FloatingChat */}
      {isMobile && !isChatRoute && <MobileAppDock />}
      <OfficeSimulatorOverlay />
    </div>
  );
}
