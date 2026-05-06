import { useState, useEffect } from "react";
import { Link, NavLink as RouterNavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BookMarked,
  Building2,
  Users,
  FileText,
  BarChart3,
  Settings,
  Plus,
  BookOpen,
  Wrench,
  Calculator,
  Activity,
  Sparkles,
  LogOut,
  ClipboardList,
  ListChecks,
  FileSpreadsheet,
  Trash2,
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/NotificationBell";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
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
      { title: "Supported Processors", url: "/supported-processors", icon: Globe, description: "Processor compatibility reference" },
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
      { title: "Pre-Qualification Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
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
      { title: "CRM Updates", url: "/tools/terminal-updates", icon: Sparkles, description: "Latest changes & features" },
      { title: "Administration", url: "/admin/administration", icon: Activity, description: "Agenda, popups & session tracking" },
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
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (data) {
        setAvatarUrl(data.avatar_url);
        setProfileName(data.full_name);
      }
    };

    fetchProfile();

    const channel = supabase
      .channel("header-profile-sync")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as { avatar_url: string | null; full_name: string | null };
          setAvatarUrl(updated.avatar_url);
          setProfileName(updated.full_name);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = profileName || EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "User";

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

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden lg:flex flex-1">
          <NavigationMenuList className="gap-0">
            {navMain.map((item) => {
              if (item.items) {
                const isTools = item.title === "Tools";
                return (
                  <NavigationMenuItem key={item.title}>
                    <NavigationMenuTrigger
                      className={cn(
                        "h-9 px-3 text-sm bg-transparent rounded-md font-medium",
                        isDark
                          ? "text-white/75 hover:text-white hover:bg-white/8 data-[state=open]:bg-white/10 data-[state=open]:text-white"
                          : "text-foreground/65 hover:text-foreground hover:bg-accent data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      {item.title}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul
                        className={cn(
                          "gap-1 p-2 glass-card",
                          isTools ? "grid w-[500px] md:grid-cols-2" : "grid w-[340px] md:w-[420px] md:grid-cols-2"
                        )}
                      >
                        {item.items.map((subItem) => (
                          <li key={subItem.title}>
                            {subItem.external ? (
                              <a
                                href={subItem.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-2.5 rounded-lg p-2.5 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/80">
                                  <subItem.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium leading-none mb-0.5 text-[13px]">{subItem.title}</div>
                                  {subItem.description && (
                                    <p className="text-[11px] leading-snug text-muted-foreground line-clamp-1">
                                      {subItem.description}
                                    </p>
                                  )}
                                </div>
                              </a>
                            ) : (
                              <NavigationMenuLink asChild>
                                <RouterNavLink
                                  to={subItem.url}
                                  className={({ isActive }) =>
                                    cn(
                                      "flex items-start gap-2.5 rounded-lg p-2.5 text-sm leading-none no-underline outline-none transition-colors",
                                      isActive
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-accent hover:text-accent-foreground"
                                    )
                                  }
                                >
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/80">
                                    <subItem.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-medium leading-none mb-0.5 text-[13px]">{subItem.title}</div>
                                    {subItem.description && (
                                      <p className="text-[11px] leading-snug text-muted-foreground line-clamp-1">
                                        {subItem.description}
                                      </p>
                                    )}
                                  </div>
                                </RouterNavLink>
                              </NavigationMenuLink>
                            )}
                          </li>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                );
              }

              return (
                <NavigationMenuItem key={item.title}>
                  <NavigationMenuLink asChild>
                    <RouterNavLink
                      to={item.url}
                      end={item.url === "/"}
                      className={({ isActive }) =>
                        cn(
                          navigationMenuTriggerStyle(),
                          "h-9 px-3 bg-transparent flex items-center text-sm rounded-md font-medium",
                          isDark
                            ? "text-white/75 hover:text-white hover:bg-white/8"
                            : "text-foreground/65 hover:text-foreground hover:bg-accent",
                          isActive && (isDark ? "bg-white/10 text-white" : "bg-accent text-accent-foreground")
                        )
                      }
                    >
                      <item.icon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      {item.title}
                    </RouterNavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

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

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-9 gap-2 pl-1.5 pr-2.5 rounded-md",
                  isDark
                    ? "text-white/75 hover:text-white hover:bg-white/10"
                    : "text-foreground/75 hover:text-foreground hover:bg-accent"
                )}
              >
                <Avatar className="h-7 w-7 ring-1 ring-border/50 shrink-0">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName} className="object-cover" />
                  <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-sm">{displayName}</span>
                <ChevronDown className="h-3 w-3 hidden md:inline opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* User info header */}
              <div className="px-3 py-2.5 border-b border-border/50 mb-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold">{displayName}</p>
                  <span className="live-dot shrink-0" />
                </div>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
              </div>
              <DropdownMenuItem asChild>
                <RouterNavLink to="/settings" className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
                  Settings
                </RouterNavLink>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <RouterNavLink to="/admin/deletion-requests" className="cursor-pointer">
                    <Trash2 className="h-4 w-4 mr-2 text-muted-foreground" />
                    Deletion Requests
                  </RouterNavLink>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
