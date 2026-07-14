import { useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Briefcase, ListChecks, Building2, Users, FileText,
  BarChart3, Settings, BookOpen, ClipboardList, Calculator, FileSpreadsheet,
  Download, CreditCard, Activity, Trash2, LogOut, BadgeDollarSign, Cloud,
  Send, Globe, Search, X, ChevronRight, UserPlus, FileSignature, Calendar,
  Bell, Handshake, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAcceptedQuotesCount } from "@/hooks/useAcceptedQuotesCount";
import { cn } from "@/lib/utils";

// ── NAV ITEMS ──────────────────────────────────────────────────────────────

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  external?: boolean;
  badge?: string;
}

// Primary 4 — always visible in tab bar
const PRIMARY: NavItem[] = [
  { title: "Pipeline", url: "/", icon: LayoutDashboard },
  { title: "Deals", url: "/opportunities", icon: Briefcase },
  { title: "Tasks", url: "/tasks", icon: ListChecks },
  { title: "Leads", url: "/leads", icon: UserPlus },
];

// Secondary — appear in the launcher sheet, grouped
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pipeline",
    items: [
      { title: "Pipeline Board", url: "/pipeline", icon: LayoutDashboard },
      { title: "All Opportunities", url: "/opportunities", icon: Briefcase },
      { title: "Quotes & Contracts", url: "/quotes-contracts", icon: FileSignature },
      { title: "Tasks", url: "/tasks", icon: ListChecks },
      { title: "Email Outreach", url: "/outreach", icon: Send },
      { title: "Web Submissions", url: "/admin/web-submissions", icon: Globe },
    ],
  },
  {
    label: "CRM",
    items: [
      { title: "Leads", url: "/leads", icon: UserPlus },
      { title: "Contacts", url: "/contacts", icon: Users },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "Documents", url: "/documents", icon: FileText },
      { title: "Notifications", url: "/notifications", icon: Bell },
    ],
  },
  {
    label: "Merchants",
    items: [
      { title: "Live & Billing", url: "/live-billing", icon: BadgeDollarSign },
      { title: "Transactions", url: "/reports/transactions", icon: CreditCard },
      { title: "Commissions", url: "/commissions", icon: BadgeDollarSign },
      { title: "Pricing", url: "/pricing", icon: Calculator },
      { title: "Supported Processors", url: "/supported-processors", icon: CreditCard },
    ],
  },
  {
    label: "Support",
    items: [
      { title: "Support Triage", url: "/support", icon: Activity },
      { title: "Client Request Form", url: "/support-request", icon: FileText, external: true },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Analytics", url: "/reports", icon: BarChart3 },
      { title: "System Status", url: "https://statusgator.com/services/nmi", icon: Activity, external: true },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "Board Merchant", url: "/tools/nmi-boarding", icon: BadgeDollarSign },
      { title: "Kurv / MyPortfolio", url: "/tools/kurv", icon: BadgeDollarSign },
      { title: "Pre-Qualification Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList },
      { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator },
      { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet },
      { title: "Quote Builder", url: "/tools/quote-builder", icon: FileSignature },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "SOP", url: "/sop", icon: BookOpen },
      { title: "Training", url: "/training", icon: BookOpen },
      { title: "CRM Updates", url: "/tools/terminal-updates", icon: Activity },
      { title: "Administration", url: "/admin/administration", icon: Activity },
      { title: "Team Roster", url: "/admin/team-roster", icon: Users },
      { title: "Gateway Accounts", url: "/admin/gateway-accounts", icon: BadgeDollarSign },
      { title: "Integrations", url: "/integrations", icon: Cloud },
      { title: "Affiliates", url: "/admin/affiliates", icon: Handshake },
      { title: "Data Export", url: "/admin/data-export", icon: Download },
      { title: "Merchant Portal Guide", url: "/tools/gateway-guide", icon: CreditCard },
      { title: "Deployment", url: "/tools/netlify", icon: Cloud },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

// ── COMPONENT ──────────────────────────────────────────────────────────────

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { data: acceptedQuotesCount = 0 } = useAcceptedQuotesCount();
  const searchRef = useRef<HTMLInputElement>(null);

  const isActive = useCallback((url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  }, [location.pathname]);

  // Is current page in the "more" group?
  const isMoreActive = GROUPS.flatMap(g => g.items).some(
    i => !i.external && isActive(i.url)
  );

  const handleNav = useCallback((url: string, external?: boolean) => {
    setOpen(false);
    setSearch("");
    if (external) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      navigate(url);
    }
  }, [navigate]);

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    navigate("/auth");
  };

  const handleOpenLauncher = () => {
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 200);
  };

  // Filter all items by search
  const allItems: NavItem[] = [
    ...PRIMARY,
    ...GROUPS.flatMap(g => g.items),
    ...(isAdmin ? [{ title: "Deletion Requests", url: "/admin/deletion-requests", icon: Trash2 }] : []),
  ];

  const filtered = search.trim()
    ? allItems.filter(i => i.title.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <>
      {/* ── FIXED TAB BAR ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden" style={{
        background: "hsl(var(--background) / 0.8)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid hsl(var(--border) / 0.4)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div className="flex items-stretch h-[56px]">
          {PRIMARY.map(tab => {
            const active = isActive(tab.url);
            return (
              <button
                key={tab.title}
                onClick={() => navigate(tab.url)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 gap-[3px] text-[10px] font-medium transition-all duration-200 relative",
                  active ? "text-teal" : "text-muted-foreground"
                )}
              >
                {/* Active indicator dot */}
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute top-0 left-1/2 h-[2px] w-8 rounded-full bg-teal"
                    style={{ transform: "translateX(-50%)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <motion.div
                  animate={{ scale: active ? 1.08 : 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <tab.icon className={cn("h-[22px] w-[22px]", active && "stroke-[2.2px]")} />
                </motion.div>
                <span className={cn("leading-none", active && "font-semibold")}>{tab.title}</span>
              </button>
            );
          })}

          {/* Grid launcher button */}
          <button
            onClick={handleOpenLauncher}
            className={cn(
              "flex flex-col items-center justify-center flex-1 gap-[3px] text-[10px] font-medium transition-all duration-200 relative",
              isMoreActive ? "text-teal" : "text-muted-foreground"
            )}
          >
            {isMoreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-teal" />
            )}
            {/* 2x2 grid icon */}
            <div className="relative grid grid-cols-2 gap-[3px] h-[22px] w-[22px]">
              {[0,1,2,3].map(i => (
                <div key={i} className={cn(
                  "rounded-[2px] transition-all",
                  isMoreActive ? "bg-teal/70" : "bg-current opacity-60",
                  open && "opacity-100"
                )} />
              ))}
              {acceptedQuotesCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#c81030] px-1 text-[9px] font-bold leading-none text-white shrink-0 ring-2 ring-background"
                  aria-label={`${acceptedQuotesCount} accepted quote${acceptedQuotesCount === 1 ? "" : "s"} ready for contract`}
                >
                  {acceptedQuotesCount > 99 ? "99+" : acceptedQuotesCount}
                </span>
              )}
            </div>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* ── LAUNCHER SHEET ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[60] md:hidden"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setOpen(false); setSearch(""); }}
            />

            {/* Sheet */}
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[70] md:hidden rounded-t-2xl overflow-hidden flex flex-col"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderBottom: "none",
                maxHeight: "82vh",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
            >
              {/* Handle + header */}
              <div className="flex flex-col gap-0 shrink-0">
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-9 h-1 rounded-full bg-muted-foreground/25" />
                </div>

                {/* Search bar */}
                <div className="px-4 pb-3">
                  <div className="flex items-center gap-2 px-3 h-10 rounded-xl"
                    style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      ref={searchRef}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search all pages…"
                      className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground/60"
                    />
                    {search && (
                      <button onClick={() => setSearch("")} className="text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto overscroll-contain flex-1 pb-6" style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
              }}>
                {filtered ? (
                  // Search results — list view
                  <div className="px-4 space-y-1">
                    {filtered.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-8">No results for "{search}"</p>
                    ) : filtered.map(item => {
                      const active = !item.external && isActive(item.url);
                      return (
                        <button
                          key={item.url}
                          onClick={() => handleNav(item.url, item.external)}
                          className={cn(
                            "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm transition-colors",
                            active ? "bg-teal/10 text-teal font-medium" : "hover:bg-muted text-foreground"
                          )}
                        >
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
                            active ? "bg-teal text-teal-foreground" : "bg-muted"
                          )}>
                            <item.icon className="h-4 w-4" />
                          </div>
                          <span className="flex-1 text-left">{item.title}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Browse mode — grouped grid
                  <div className="px-4 space-y-5">
                    {GROUPS.map(group => (
                      <div key={group.label}>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 mb-2 px-1">
                          {group.label}
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {group.items.map(item => {
                            const active = !item.external && isActive(item.url);
                            const showQuotesBadge =
                              item.url === "/tools/quote-builder" && acceptedQuotesCount > 0;
                            return (
                              <button
                                key={item.url}
                                onClick={() => handleNav(item.url, item.external)}
                                className={cn(
                                  "flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-[11px] font-medium transition-all active:scale-95",
                                  active ? "bg-teal/10 text-teal" : "text-foreground hover:bg-muted"
                                )}
                              >
                                <div className={cn(
                                  "relative flex h-11 w-11 items-center justify-center rounded-xl",
                                  active ? "bg-teal text-teal-foreground" : "bg-muted"
                                )}>
                                  <item.icon className="h-5 w-5" />
                                  {showQuotesBadge && (
                                    <span
                                      className="absolute -top-1 -right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#c81030] px-1 text-[9px] font-bold leading-none text-white shrink-0 ring-2 ring-background"
                                      aria-label={`${acceptedQuotesCount} accepted quote${acceptedQuotesCount === 1 ? "" : "s"} ready for contract`}
                                    >
                                      {acceptedQuotesCount > 99 ? "99+" : acceptedQuotesCount}
                                    </span>
                                  )}
                                </div>
                                <span className="leading-tight text-center line-clamp-2">{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Admin section */}
                    {isAdmin && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/60 mb-2 px-1">
                          Admin
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { title: "Deletions", url: "/admin/deletion-requests", icon: Trash2 },
                          ].map(item => {
                            const active = isActive(item.url);
                            return (
                              <button
                                key={item.url}
                                onClick={() => handleNav(item.url)}
                                className={cn(
                                  "flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-[11px] font-medium transition-all active:scale-95",
                                  active ? "bg-teal/10 text-teal" : "text-foreground hover:bg-muted"
                                )}
                              >
                                <div className={cn(
                                  "flex h-11 w-11 items-center justify-center rounded-xl",
                                  active ? "bg-teal text-teal-foreground" : "bg-muted"
                                )}>
                                  <item.icon className="h-5 w-5" />
                                </div>
                                <span className="leading-tight text-center">{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sign out */}
                    <div className="pt-1 border-t border-border/50">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/8 transition-colors"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10">
                          <LogOut className="h-4 w-4" />
                        </div>
                        <span className="font-medium">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
