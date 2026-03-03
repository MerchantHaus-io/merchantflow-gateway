import { ReactNode, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";
import FloatingChat from "@/components/FloatingChat";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActionItemsWidget } from "@/components/ActionItemsWidget";
import { BroadcastPopup } from "@/components/BroadcastPopup";
import { MobileAppDock } from "@/components/MobileAppDock";
import { PageTransition } from "@/components/PageTransition";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useIsMobile } from "@/hooks/use-mobile";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
  onNewApplication?: () => void;
  /** Optional page title for the header area */
  pageTitle?: string;
  /** Optional header actions slot */
  headerActions?: ReactNode;
  /** When true, all chrome (header, footer, widgets) is hidden for focus mode */
  focusMode?: boolean;
}

export function AppLayout({
  children,
  onNewApplication,
  pageTitle,
  headerActions,
  focusMode = false,
}: AppLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const location = useLocation();
  const isChatRoute = location.pathname === "/chat";
  const handleRefresh = useCallback(async () => {
    window.location.reload();
  }, []);

  const { pullDistance, isRefreshing } = usePullToRefresh({
    containerRef: scrollRef,
    onRefresh: handleRefresh,
    disabled: focusMode,
  });

  const showIndicator = pullDistance > 0 || isRefreshing;

  return (
    <div className="h-screen h-dvh min-h-0 flex flex-col w-full overflow-hidden">
      {!focusMode && <MegaMenuHeader onNewApplication={onNewApplication} />}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!focusMode && (pageTitle || headerActions) && (
          <div className="border-b border-border bg-background/50 px-4 lg:px-6 py-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {pageTitle && (
                <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
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
          className={focusMode ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto scroll-smooth pb-16 lg:pb-0"}
        >
          <PageTransition key={location.pathname}>
            {children}
          </PageTransition>
        </div>
      </main>
      {!focusMode && <MobileBottomNav />}
      {!focusMode && <FloatingChat />}
      {!focusMode && <ActionItemsWidget />}
      {!focusMode && <BroadcastPopup />}
      {!focusMode && isMobile && !isChatRoute && <MobileAppDock />}
    </div>
  );
}
