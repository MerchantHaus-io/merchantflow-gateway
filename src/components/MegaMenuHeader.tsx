import { useState, useEffect } from "react";
import { Link, NavLink as RouterNavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BookMarked,
  Building2,
  Users,
  FileText,
  BarChart3,
  Plus,
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
  Sun,
  Moon,
  ChevronDown,
  Globe,
  CreditCard,
  BadgeDollarSign,
  Maximize,
  Minimize,
  Cloud,
  Send,
  Search,
  UserPlus,
  FileSignature,
  LifeBuoy,
  MessageSquarePlus,
  LayoutGrid,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAcceptedQuotesCount } from "@/hooks/useAcceptedQuotesCount";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";
import sidebarIcon from "@/assets/sidebar-icon.webp";

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
      { title: "Quotes & Contracts", url: "/quotes-contracts", icon: FileSignature, description: "Quote & signature status across every opportunity" },
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
      { title: "Support Triage", url: "/support", icon: LifeBuoy, description: "Live ticket queue — claim & resolve client tickets" },
      { title: "Client Request Form", url: "/support-request", icon: MessageSquarePlus, description: "Public support request page to share with clients", external: true },
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
      { title: "Statement Analyzer", url: "/tools/statement-analysis", icon: ScanSearch, description: "Analyze a statement, benchmark fees & build a savings proposal" },
      { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
      { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
      { title: "Quote Builder", url: "/tools/quote-builder", icon: FileSignature, description: "Generate gateway quotes from an opportunity" },
    ],
  },
  {
    title: "Admin",
    url: "/sop",
    icon: BookOpen,
    items: [
      { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
      { title: "Training", url: "/training", icon: GraduationCap, description: "Onboarding guide for the Ops Terminal" },
      { title: "CRM Updates", url: "/tools/terminal-updates", icon: Sparkles, description: "Latest changes & features" },
      { title: "Administration", url: "/admin/administration", icon: Activity, description: "Agenda, popups & session tracking" },
      { title: "Team Roster", url: "/admin/team-roster", icon: Users, description: "Manage the internal team roster" },
      { title: "Gateway Accounts", url: "/admin/gateway-accounts", icon: BadgeDollarSign, description: "NMI partner gateway account inventory" },
      { title: "Integrations", url: "/integrations", icon: Cloud, description: "Connected services & API providers" },
      { title: "Affiliates", url: "/admin/affiliates", icon: UserPlus, description: "External affiliate partners & commissions" },
      { title: "Data Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
      { title: "Merchant Portal Guide", url: "/tools/gateway-guide", icon: BookMarked, description: "Interactive portal walkthrough" },
      { title: "Deployment", url: "/tools/netlify", icon: Cloud, description: "Deployment audit & fix prompts" },
    ],
  },
];

interface MegaMenuHeaderProps {
  onNewApplication?: () => void;
  onNewAccount?: () => void;
  onNewContact?: () => void;
}

export function MegaMenuHeader({ onNewApplication, onNewAccount, onNewContact }: MegaMenuHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  // Surfaces accepted-but-not-yet-contracted quotes as a badge on the
  // Tools dropdown and the Quote Builder sub-item.
  const { data: acceptedQuotesCount = 0 } = useAcceptedQuotesCount();

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleNewClick = (type: "opportunity" | "account" | "contact") => {
    switch (type) {
      case "opportunity":
        if (onNewApplication) onNewApplication();
        else navigate("/opportunities?new=true");
        break;
      case "account":
        if (onNewAccount) onNewAccount();
        else navigate("/leads?new=true");
        break;
      case "contact":
        if (onNewContact) onNewContact();
        else navigate("/contacts?new=true");
        break;
    }
  };

  const isDark = theme === 'dark';

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-border/40",
        isDark
          ? "bg-[hsl(217_33%_13%/0.92)] text-white backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.4)]"
          : "bg-background/80 text-foreground backdrop-blur-xl shadow-sm"
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex h-12 items-center px-3 lg:px-5 gap-2 overflow-visible overflow-visible">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 mr-1 hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all duration-300">
          <img src={sidebarIcon} alt="Ops Terminal" className="h-7 w-7 object-contain" />
        </Link>

        {/* Ops ⇄ Support context toggle */}
        <ContextTogglePill />


        {/* Desktop primary navigation now lives in the collapsible IconRailSidebar */}
        <div className="hidden lg:block flex-1" />


        {/* Right side actions */}
        <div className="flex items-center shrink-0 overflow-visible gap-1 ml-auto">
          {/* ⌘K search trigger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className={cn(
              "hidden lg:inline-flex h-8 gap-1.5 px-2.5 rounded-md text-xs",
              isDark
                ? "text-white/45 hover:text-white/70 hover:bg-white/8"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="text-muted-foreground/60">Search…</span>
            <kbd className="text-[10px] font-mono bg-muted/50 px-1 py-0.5 rounded border border-border/50">Ctrl+K</kbd>
          </Button>

          {/* +New dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 transition-all rounded-md px-3 text-xs font-semibold shadow-sm overflow-visible shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="hidden sm:inline">New</span>
                <ChevronDown className="h-3 w-3 ml-0.5 opacity-70 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleNewClick("opportunity")}>
                <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
                New Opportunity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleNewClick("account")}>
                <UserPlus className="h-4 w-4 mr-2 text-muted-foreground" />
                New Lead
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleNewClick("contact")}>
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                New Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationBell />

          {/* Fullscreen toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  } else {
                    document.documentElement.requestFullscreen();
                  }
                }}
                className={cn(
                  "h-8 w-8 rounded-md",
                  isDark
                    ? "text-white/55 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
          </Tooltip>

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className={cn(
                  "h-8 w-8 rounded-md",
                  isDark
                    ? "text-white/55 hover:text-white hover:bg-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{isDark ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>

        </div>
      </div>
    </header>
  );
}

function ContextTogglePill() {
  const { pathname } = useLocation();
  const inSupport = pathname.startsWith("/support");
  const target = inSupport ? "/" : "/support";
  const opsActive = !inSupport;
  return (
    <Link
      to={target}
      title={inSupport ? "Back to Ops Terminal" : "Go to Support Triage"}
      className="hidden sm:inline-flex items-center gap-0.5 h-8 rounded-full border border-border/60 bg-muted/40 p-0.5 mr-1 shrink-0 hover:border-primary/40 transition-colors"
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all",
          opsActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Ops
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-semibold transition-all",
          inSupport ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <LifeBuoy className="h-3.5 w-3.5" />
        Support
      </span>
    </Link>
  );
}
