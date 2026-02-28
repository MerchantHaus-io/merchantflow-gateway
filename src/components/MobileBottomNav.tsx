import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Briefcase,
  ListChecks,
  MoreHorizontal,
  Building2,
  Users,
  FileText,
  BarChart3,
  Settings,
  BookOpen,
  ClipboardList,
  Calculator,
  FileSpreadsheet,
  Download,
  CreditCard,
  Activity,
  Globe,
  Trash2,
  LogOut,
  ExternalLink,
  X,
  BadgeDollarSign,
  Cloud,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

interface TabItem {
  title: string;
  url: string;
  icon: LucideIcon;
  matchPaths?: string[];
}

const primaryTabs: TabItem[] = [
  { title: "Pipeline", url: "/", icon: LayoutDashboard },
  { title: "Deals", url: "/opportunities", icon: Briefcase },
  { title: "Tasks", url: "/tasks", icon: ListChecks },
];

interface MoreItem {
  title: string;
  url: string;
  icon: LucideIcon;
  external?: boolean;
}

const moreItems: MoreItem[] = [
  { title: "Web Submissions", url: "/admin/web-submissions", icon: Globe },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Live & Billing", url: "/live-billing", icon: BadgeDollarSign },
  { title: "Settings", url: "/settings", icon: Settings },
];

const toolItems: MoreItem[] = [
  { title: "SOP", url: "/sop", icon: BookOpen },
  { title: "Preboarding Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList },
  { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator },
  { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet },
  { title: "Data Export", url: "/admin/data-export", icon: Download },
  { title: "NMI Payments", url: "/tools/nmi-payments", icon: CreditCard },
  { title: "NMI Status", url: "https://statusgator.com/services/nmi", icon: Activity, external: true },
  { title: "Netlify", url: "/tools/netlify", icon: Cloud },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut } = useAuth();
  const { isAdmin } = useUserRole();

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  const isMoreActive = [...moreItems, ...toolItems].some(
    (item) => !item.external && isActive(item.url)
  );

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background border-t border-border safe-area-bottom">
        <div className="flex items-stretch justify-around h-14">
          {primaryTabs.map((tab) => {
            const active = isActive(tab.url);
            return (
              <button
                key={tab.title}
                onClick={() => navigate(tab.url)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors relative",
                  active
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
                <tab.icon className="h-5 w-5" />
                <span>{tab.title}</span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 gap-0.5 text-[10px] font-medium transition-colors relative",
              moreOpen || isMoreActive
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            {isMoreActive && !moreOpen && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
            )}
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* More sheet - slides up from bottom */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[80vh]">
          <div className="flex flex-col">
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <h3 className="text-sm font-semibold text-foreground">More</h3>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </SheetClose>
            </div>

            <div className="overflow-auto px-2 pb-6">
              {/* Main items as a grid */}
              <div className="grid grid-cols-3 gap-1 p-2">
                {moreItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SheetClose key={item.title} asChild>
                      <button
                        onClick={() => navigate(item.url)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-colors",
                          active
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted text-foreground"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-xl",
                            active ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                        </div>
                        <span className="leading-tight text-center">{item.title}</span>
                      </button>
                    </SheetClose>
                  );
                })}

                {isAdmin && (
                  <SheetClose asChild>
                    <button
                      onClick={() => navigate("/admin/deletion-requests")}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-colors",
                        isActive("/admin/deletion-requests")
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted text-foreground"
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl",
                          isActive("/admin/deletion-requests")
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <Trash2 className="h-5 w-5" />
                      </div>
                      <span className="leading-tight text-center">Deletions</span>
                    </button>
                  </SheetClose>
                )}
              </div>

              {/* Tools section */}
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Tools
                </p>
                <div className="grid grid-cols-3 gap-1 p-2">
                  {toolItems.map((tool) => {
                    if (tool.external) {
                      return (
                        <a
                          key={tool.title}
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMoreOpen(false)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs hover:bg-muted text-foreground transition-colors relative"
                        >
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            <tool.icon className="h-5 w-5" />
                          </div>
                          <span className="leading-tight text-center">{tool.title}</span>
                          <ExternalLink className="h-2.5 w-2.5 absolute top-2 right-2 text-muted-foreground" />
                        </a>
                      );
                    }
                    const active = isActive(tool.url);
                    return (
                      <SheetClose key={tool.title} asChild>
                        <button
                          onClick={() => navigate(tool.url)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl text-xs transition-colors",
                            active
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-muted text-foreground"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl",
                              active ? "bg-primary text-primary-foreground" : "bg-muted"
                            )}
                          >
                            <tool.icon className="h-5 w-5" />
                          </div>
                          <span className="leading-tight text-center">{tool.title}</span>
                        </button>
                      </SheetClose>
                    );
                  })}
                </div>
              </div>

              {/* Sign out */}
              <div className="mt-2 px-2">
                <Button
                  variant="outline"
                  className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
