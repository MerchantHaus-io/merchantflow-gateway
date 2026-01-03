import { ReactNode } from "react";
import { MegaMenuHeader } from "@/components/MegaMenuHeader";

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
  return (
    <div className="h-screen h-dvh min-h-0 flex flex-col w-full overflow-hidden">
      <MegaMenuHeader onNewApplication={onNewApplication} />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {(pageTitle || headerActions) && (
          <div className="border-b border-border bg-background/50 px-4 lg:px-6 py-3">
            <div className="flex items-center justify-between gap-4">
              {pageTitle && (
                <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>
              )}
              {headerActions && <div className="flex items-center gap-2 ml-auto">{headerActions}</div>}
            </div>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth">
          {children}
        </div>
      </main>
    </div>
  );
}
