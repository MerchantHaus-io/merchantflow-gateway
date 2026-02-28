import { useState, useEffect, useMemo } from "react";
import { Link, NavLink as RouterNavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
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
  BadgeDollarSign,
  Maximize,
  Minimize,
  Focus,
  CheckCircle2,
  CircleDot,
  Clock,
  ArrowUp,
  ArrowDown,
  Minus,
  CalendarClock,
  AlertTriangle,
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
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useTheme } from "@/contexts/ThemeContext";
import { useTasks } from "@/contexts/TasksContext";
import { NotificationBell } from "@/components/NotificationBell";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast, isToday, startOfDay } from "date-fns";
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
    url: "/",
    icon: LayoutDashboard,
    items: [
      { title: "Pipeline Board", url: "/", icon: LayoutDashboard, description: "View opportunity pipeline" },
      { title: "Web Submissions", url: "/admin/web-submissions", icon: Globe, description: "Incoming merchant applications" },
      { title: "Tasks", url: "/tasks", icon: ListChecks, description: "Manage your tasks" },
    ],
  },
  {
    title: "Opportunities",
    url: "/opportunities",
    icon: Briefcase,
    items: [
      { title: "All Opportunities", url: "/opportunities", icon: Briefcase, description: "Browse all opportunities" },
      { title: "Accounts", url: "/accounts", icon: Building2, description: "Manage business accounts" },
      { title: "Contacts", url: "/contacts", icon: Users, description: "Manage contacts" },
      { title: "Documents", url: "/documents", icon: FileText, description: "View uploaded documents" },
    ],
  },
  {
    title: "Reporting",
    url: "/reports",
    icon: BarChart3,
    items: [
      { title: "Reports", url: "/reports", icon: BarChart3, description: "Performance & analytics" },
      { title: "Analytics", url: "/admin/analytics", icon: Activity, description: "Login tracking & broadcasts" },
      { title: "Live & Billing", url: "/live-billing", icon: BadgeDollarSign, description: "Live accounts & billing" },
    ],
  },
];

const toolsItems: NavItem[] = [
  { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
  { title: "Preboarding Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
  { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
  { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
  { title: "Data Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
  { title: "Terminal Updates", url: "/tools/terminal-updates", icon: Sparkles, description: "Latest CRM changes & features" },
  { title: "NMI Status", url: "https://statusgator.com/services/nmi", icon: Activity, description: "System status page", external: true },
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
  const { tasks, updateTaskStatus } = useTasks();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [focusOpen, setFocusOpen] = useState(false);

  // Open user-created tasks (not SLA/auto)
  const focusTasks = useMemo(() => 
    tasks.filter(t => t.source !== 'sla' && t.status !== 'done')
      .sort((a, b) => {
        // Overdue first, then by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const aOverdue = a.dueAt && isPast(startOfDay(new Date(a.dueAt))) && !isToday(new Date(a.dueAt));
        const bOverdue = b.dueAt && isPast(startOfDay(new Date(b.dueAt))) && !isToday(new Date(b.dueAt));
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        return (priorityOrder[a.priority || 'medium'] - priorityOrder[b.priority || 'medium']);
      }),
    [tasks]
  );

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
        .single();

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
        else navigate("/accounts?new=true");
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

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-haus-charcoal text-white">
      <div className="flex h-14 items-center px-4 lg:px-6 gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <img src={sidebarIcon} alt="Ops Terminal" className="h-7 w-7 object-contain" />
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden lg:flex flex-1">
          <NavigationMenuList>
            {navMain.map((item) => {
              if (item.items) {
                return (
                  <NavigationMenuItem key={item.title}>
                    <NavigationMenuTrigger className="bg-transparent text-white/90 hover:text-white hover:bg-white/10 data-[state=open]:bg-white/10">
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.title}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[400px] gap-2 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                        {item.items.map((subItem) => (
                          <li key={subItem.title}>
                            {subItem.external ? (
                              <a
                                href={subItem.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                              >
                                <div className="flex items-center gap-2 text-sm font-medium leading-none">
                                  <subItem.icon className="h-4 w-4" />
                                  {subItem.title}
                                </div>
                                <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                  {subItem.description}
                                </p>
                              </a>
                            ) : (
                              <NavigationMenuLink asChild>
                                <RouterNavLink
                                  to={subItem.url}
                                  className="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                                >
                                  <div className="flex items-center gap-2 text-sm font-medium leading-none">
                                    <subItem.icon className="h-4 w-4" />
                                    {subItem.title}
                                  </div>
                                  <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                    {subItem.description}
                                  </p>
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
                          "bg-transparent text-white/90 hover:text-white hover:bg-white/10 flex items-center",
                          isActive && "bg-accent text-accent-foreground"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 mr-2 shrink-0" />
                      {item.title}
                    </RouterNavLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
            {/* Focus Mode - inline in nav */}
            <NavigationMenuItem>
              <Button
                variant="ghost"
                onClick={() => setFocusOpen(true)}
                className="bg-transparent text-white/90 hover:text-white hover:bg-white/10 flex items-center gap-2 h-10 px-4 relative"
              >
                <Focus className="h-4 w-4" />
                Focus Mode
                {focusTasks.length > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-[20px] text-[10px] font-bold px-1.5 bg-primary text-primary-foreground">
                    {focusTasks.length}
                  </Badge>
                )}
              </Button>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Right side actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* +New dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="bg-gold text-gold-foreground hover:bg-gold/90 transition-opacity rounded-none"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">New</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => handleNewClick("opportunity")}>
                <Briefcase className="h-4 w-4 mr-2" />
                Create Opportunity
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleNewClick("account")}>
                <Building2 className="h-4 w-4 mr-2" />
                Create Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleNewClick("contact")}>
                <Users className="h-4 w-4 mr-2" />
                Create Contact
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Focus Mode Sheet (triggered from nav) */}
          <Sheet open={focusOpen} onOpenChange={setFocusOpen}>
            <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0">
              <SheetHeader className="px-6 py-4 border-b">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Focus className="h-5 w-5 text-primary" />
                  Focus Mode
                  <Badge variant="secondary" className="text-xs ml-auto">{focusTasks.length} open</Badge>
                </SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-80px)]">
                <div className="p-4 space-y-2">
                  {focusTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500/50" />
                      <p className="text-sm font-medium">All caught up!</p>
                      <p className="text-xs">No open tasks remaining.</p>
                    </div>
                  ) : (
                    focusTasks.map((task) => {
                      const isOverdue = task.dueAt && isPast(startOfDay(new Date(task.dueAt))) && !isToday(new Date(task.dueAt));
                      const isDueToday = task.dueAt && isToday(new Date(task.dueAt));
                      const priorityIcons = { high: ArrowUp, medium: Minus, low: ArrowDown };
                      const priorityColors = { high: "text-red-500", medium: "text-amber-500", low: "text-blue-500" };
                      const PIcon = priorityIcons[task.priority || 'medium'];

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "rounded-lg border p-3 space-y-2 transition-colors",
                            isOverdue && "border-red-500/40 bg-red-500/5",
                            isDueToday && "border-orange-500/40 bg-orange-500/5",
                            !isOverdue && !isDueToday && "hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              onClick={() => updateTaskStatus(task.id, 'done')}
                              className="mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/20 transition-colors"
                              title="Mark as done"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isOverdue && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                                <p className="text-sm font-medium leading-tight">{task.title}</p>
                              </div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{task.description}</p>
                              )}
                            </div>
                            <PIcon className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", priorityColors[task.priority || 'medium'])} />
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground pl-6">
                            {task.source === 'notice' && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 border-purple-500/30 text-purple-500 bg-purple-500/10">Notice</Badge>
                            )}
                            <Badge variant="outline" className={cn("text-[9px] h-4 px-1", task.status === 'open' ? "border-blue-500/30 text-blue-500" : "border-amber-500/30 text-amber-500")}>
                              {task.status === 'open' ? 'Open' : 'In Progress'}
                            </Badge>
                            {task.assignee && <span>{task.assignee}</span>}
                            {task.dueAt && (
                              <span className={cn(
                                isOverdue && "text-red-500 font-medium",
                                isDueToday && "text-orange-500 font-medium"
                              )}>
                                {isOverdue ? 'Overdue' : isDueToday ? 'Due today' : format(new Date(task.dueAt), 'MMM d')}
                              </span>
                            )}
                            {task.accountName && <span className="truncate">{task.accountName}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

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
                className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</TooltipContent>
          </Tooltip>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 text-white/70 hover:text-white hover:bg-white/10"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 pl-1 text-white/90 hover:text-white hover:bg-white/10">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden md:inline">{displayName}</span>
                <ChevronDown className="h-3 w-3 hidden md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <RouterNavLink to="/settings" className="cursor-pointer">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </RouterNavLink>
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild>
                  <RouterNavLink to="/admin/deletion-requests" className="cursor-pointer">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deletion Requests
                  </RouterNavLink>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {/* Tools submenu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm">
                    <Wrench className="h-4 w-4" />
                    Tools
                    <ChevronDown className="h-3 w-3 ml-auto" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="left" align="start" className="w-56">
                  {toolsItems.map((tool) =>
                    tool.external ? (
                      <DropdownMenuItem key={tool.title} asChild>
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cursor-pointer"
                        >
                          <tool.icon className="h-4 w-4 mr-2" />
                          {tool.title}
                        </a>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem key={tool.title} asChild>
                        <RouterNavLink to={tool.url} className="cursor-pointer">
                          <tool.icon className="h-4 w-4 mr-2" />
                          {tool.title}
                        </RouterNavLink>
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>
    </header>
  );
}
