import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookMarked,
  Building2,
  Users,
  FileText,
  BarChart3,
  BookOpen,
  Wrench,
  Calculator,
  Activity,
  Sparkles,
  GraduationCap,
  ClipboardList,
  ListChecks,
  FileSpreadsheet,
  Download,
  Briefcase,
  Globe,
  CreditCard,
  BadgeDollarSign,
  Cloud,
  Send,
  UserPlus,
  FileSignature,
  LifeBuoy,
  MessageSquarePlus,
  ScanSearch,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAcceptedQuotesCount } from "@/hooks/useAcceptedQuotesCount";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  description?: string;
  external?: boolean;
}

interface NavGroup {
  title: string;
  url: string;
  icon: LucideIcon;
  items?: NavItem[];
}

const navMain: NavGroup[] = [
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: LayoutDashboard,
    items: [
      { title: "Pipeline Board", url: "/pipeline", icon: LayoutDashboard, description: "Opportunity kanban board" },
      { title: "All Opportunities", url: "/opportunities", icon: Briefcase, description: "Browse & search all opportunities" },
      { title: "Quotes & Contracts", url: "/quotes-contracts", icon: FileSignature, description: "Quote & signature status" },
      { title: "Tasks", url: "/tasks", icon: ListChecks, description: "Manage your tasks" },
      { title: "Email Outreach", url: "/outreach", icon: Send, description: "Campaign tracker & email sender" },
      { title: "Web Submissions", url: "/admin/web-submissions", icon: Globe, description: "Incoming merchant applications" },
    ],
  },
  {
    title: "CRM",
    url: "/leads",
    icon: UserPlus,
    items: [
      { title: "Leads", url: "/leads", icon: UserPlus, description: "New prospects & account list" },
      { title: "Contacts", url: "/contacts", icon: Users, description: "Manage contacts" },
      { title: "Calendar", url: "/calendar", icon: Calculator, description: "Team calendar & meetings" },
      { title: "Documents", url: "/documents", icon: FileText, description: "View uploaded documents" },
    ],
  },
  {
    title: "Merchants",
    url: "/live-billing",
    icon: Building2,
    items: [
      { title: "Live & Billing", url: "/live-billing", icon: BadgeDollarSign, description: "Live accounts & billing" },
      { title: "Transactions", url: "/reports/transactions", icon: CreditCard, description: "NMI gateway transactions" },
      { title: "Commissions", url: "/commissions", icon: BadgeDollarSign, description: "Partner commission reports" },
      { title: "Pricing", url: "/pricing", icon: Calculator, description: "Pricing tiers & buy rates" },
      { title: "Supported Processors", url: "/supported-processors", icon: Globe, description: "Processor compatibility reference" },
    ],
  },
  {
    title: "Support",
    url: "/support",
    icon: LifeBuoy,
    items: [
      { title: "Support Triage", url: "/support", icon: LifeBuoy, description: "Live ticket queue" },
      { title: "Client Request Form", url: "/support-request", icon: MessageSquarePlus, description: "Public support request page", external: true },
    ],
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
    items: [
      { title: "Analytics", url: "/reports", icon: BarChart3, description: "Performance & pipeline analytics" },
      { title: "System Status", url: "https://statusgator.com/services/nmi", icon: Activity, description: "Live NMI & platform status", external: true },
    ],
  },
  {
    title: "Tools",
    url: "/tools/nmi-boarding",
    icon: Wrench,
    items: [
      { title: "Board Merchant", url: "/tools/nmi-boarding", icon: BadgeDollarSign, description: "Board merchants via NMI gateway" },
      { title: "Kurv / MyPortfolio", url: "/tools/kurv", icon: BadgeDollarSign, description: "EMS boarding, roster & transactions" },
      { title: "Pre-Qualification Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
      { title: "Statement Analyzer", url: "/tools/statement-analysis", icon: ScanSearch, description: "Analyze a statement & build a savings proposal" },
      { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
      { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
      { title: "Quote Builder", url: "/tools/quote-builder", icon: FileSignature, description: "Generate gateway quotes" },
    ],
  },
  {
    title: "Admin",
    url: "/sop",
    icon: BookOpen,
    items: [
      { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
      { title: "Training", url: "/training", icon: GraduationCap, description: "Onboarding guide" },
      { title: "CRM Updates", url: "/tools/terminal-updates", icon: Sparkles, description: "Latest changes & features" },
      { title: "Administration", url: "/admin/administration", icon: Activity, description: "Agenda, popups & sessions" },
      { title: "Team Roster", url: "/admin/team-roster", icon: Users, description: "Manage the internal team roster" },
      { title: "Gateway Accounts", url: "/admin/gateway-accounts", icon: BadgeDollarSign, description: "NMI partner gateway inventory" },
      { title: "Integrations", url: "/integrations", icon: Cloud, description: "Connected services & API providers" },
      { title: "Affiliates", url: "/admin/affiliates", icon: UserPlus, description: "External affiliate partners" },
      { title: "Data Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
      { title: "Merchant Portal Guide", url: "/tools/gateway-guide", icon: BookMarked, description: "Interactive portal walkthrough" },
      { title: "Deployment", url: "/tools/netlify", icon: Cloud, description: "Deployment audit & fix prompts" },
    ],
  },
];

const STORAGE_KEY = "iconRailCollapsed";

export function IconRailSidebar() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const location = useLocation();
  const { data: acceptedQuotesCount = 0 } = useAcceptedQuotesCount();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "1";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const isGroupActive = (group: NavGroup) => {
    if (location.pathname === group.url) return true;
    return group.items?.some((i) => !i.external && location.pathname.startsWith(i.url)) ?? false;
  };

  return (
    <aside
      role="navigation"
      aria-label="Primary"
      className={cn(
        "hidden lg:flex flex-col shrink-0 border-r border-border/40 transition-[width] duration-200 ease-out",
        collapsed ? "w-14" : "w-56",
        isDark
          ? "bg-[hsl(217_33%_11%/0.92)] text-white backdrop-blur-[20px]"
          : "bg-background/85 text-foreground backdrop-blur-xl"
      )}
    >

      <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {navMain.map((group) => {
          const active = isGroupActive(group);
          const showBadge = group.title === "Tools" && acceptedQuotesCount > 0;

          const trigger = (
            <NavLink
              to={group.url}
              aria-label={group.title}
              title={collapsed ? group.title : undefined}

              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors",
                  collapsed ? "h-10 w-10 mx-auto justify-center" : "h-9 px-2.5",
                  (isActive || active)
                    ? isDark
                      ? "bg-white/10 text-white"
                      : "bg-accent text-accent-foreground"
                    : isDark
                    ? "text-white/70 hover:text-white hover:bg-white/8"
                    : "text-foreground/70 hover:text-foreground hover:bg-accent"
                )
              }
            >
              <div className="relative shrink-0">
                <group.icon className="h-4 w-4" />
                {showBadge && (
                  <span
                    className="absolute -top-1.5 -right-2 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#c81030] px-1 text-[9px] font-bold leading-none text-white"
                    aria-label={`${acceptedQuotesCount} accepted quotes ready for contract`}
                  >
                    {acceptedQuotesCount > 99 ? "99+" : acceptedQuotesCount}
                  </span>
                )}
              </div>
              {!collapsed && <span className="truncate">{group.title}</span>}
            </NavLink>
          );

          // Items groups → hover flyout with sub-items.
          if (group.items && group.items.length > 0) {
            const hoverCard = (
              <HoverCard openDelay={80} closeDelay={120}>
                <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
                <HoverCardContent
                  side="right"
                  align="start"
                  sideOffset={8}
                  className="w-64 p-2"
                >

                  <div className="px-2 py-1.5 mb-1 border-b border-border/50">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {group.title}
                    </p>
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map((sub) =>
                      sub.external ? (
                        <li key={sub.title}>
                          <a
                            href={sub.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-2.5 rounded-md p-2 hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <sub.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium leading-tight">{sub.title}</div>
                              {sub.description && (
                                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1 mt-0.5">
                                  {sub.description}
                                </p>
                              )}
                            </div>
                          </a>
                        </li>
                      ) : (
                        <li key={sub.title}>
                          <NavLink
                            to={sub.url}
                            className={({ isActive }) =>
                              cn(
                                "flex items-start gap-2.5 rounded-md p-2 transition-colors",
                                isActive
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent hover:text-accent-foreground"
                              )
                            }
                          >
                            <sub.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-medium leading-tight flex items-center gap-1.5">
                                <span>{sub.title}</span>
                                {sub.url === "/tools/quote-builder" && acceptedQuotesCount > 0 && (
                                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#c81030] px-1 text-[10px] font-bold leading-none text-white">
                                    {acceptedQuotesCount > 99 ? "99+" : acceptedQuotesCount}
                                  </span>
                                )}
                              </div>
                              {sub.description && (
                                <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1 mt-0.5">
                                  {sub.description}
                                </p>
                              )}
                            </div>
                          </NavLink>
                        </li>
                      )
                    )}
                  </ul>
                </HoverCardContent>
              </HoverCard>
            );
          }

          // Plain item — tooltip when collapsed.
          if (collapsed) {
            return (
              <Tooltip key={group.title}>
                <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                <TooltipContent side="right">{group.title}</TooltipContent>
              </Tooltip>
            );
          }
          return <div key={group.title}>{trigger}</div>;
        })}
      </nav>

      <div className="border-t border-border/40 p-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "w-full h-9 rounded-md",
                collapsed ? "justify-center px-0" : "justify-start px-2.5",
                isDark
                  ? "text-white/60 hover:text-white hover:bg-white/8"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4 mr-2" />
                  <span className="text-xs">Collapse</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Expand sidebar</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}
