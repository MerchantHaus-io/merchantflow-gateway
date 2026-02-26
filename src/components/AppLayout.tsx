import { ReactNode } from "react";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";
import FloatingChat from "@/components/FloatingChat";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ActionItemsWidget } from "@/components/ActionItemsWidget";
import { BroadcastPopup } from "@/components/BroadcastPopup";

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
        <div className={focusMode ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto scroll-smooth pb-16 lg:pb-0"}>
          {children}
        </div>
      </main>
      {!focusMode && <MobileBottomNav />}
      {!focusMode && <FloatingChat />}
      {!focusMode && <ActionItemsWidget />}
      {!focusMode && <BroadcastPopup />}
    </div>
  );
}
