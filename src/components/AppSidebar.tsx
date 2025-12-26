import { LayoutDashboard, Building2, Users, FileText, BarChart3, Settings, Plus, ChevronLeft, ChevronRight, BookOpen, Wrench, ChevronDown, Calculator, Activity, User, LogOut, ClipboardList, ListChecks, FileSpreadsheet, Trash2, type LucideIcon, Download } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useNavigate } from "react-router-dom";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { useTheme } from "@/contexts/ThemeContext";
import logoDark from "@/assets/logo-dark.png";
import logoLight from "@/assets/logo-light.png";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

// Define the Navigation Tree Structure
interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean; // For default open state of collapsibles
  items?: {
    title: string;
    url: string;
    icon: LucideIcon;
    external?: boolean;
  }[];
}

// Main navigation items
const navMain: NavItem[] = [
  {
    title: "Pipeline",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Tasks",
    url: "/tasks",
    icon: ListChecks,
  },
  {
    title: "Accounts",
    url: "/accounts",
    icon: Building2,
  },
  {
    title: "Contacts",
    url: "/contacts",
    icon: Users,
  },
  {
    title: "Documents",
    url: "/documents",
    icon: FileText,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
  },
  {
    title: "Tools",
    url: "#",
    icon: Wrench,
    isActive: true,
    items: [
      {
        title: "SOP",
        url: "/sop",
        icon: BookOpen,
      },
      {
        title: "Preboarding Wizard",
        url: "/tools/preboarding-wizard",
        icon: ClipboardList,
      },
      {
        title: "Revenue Calc",
        url: "/tools/revenue-calculator",
        icon: Calculator,
      },
      {
        title: "CSV Import",
        url: "/tools/csv-import",
        icon: FileSpreadsheet,
      },
      {
        title: "Data Export",
        url: "/admin/data-export",
        icon: Download,
      },
      {
        title: "NMI Status",
        url: "https://statusgator.com/services/nmi",
        icon: Activity,
        external: true,
      },
    ],
  },
];

const bottomMenuItems = [
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

interface AppSidebarProps {
  onNewApplication?: () => void;
}

export function AppSidebar({ onNewApplication }: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { unreadCount: unreadMessages } = useUnreadMessages();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const isCollapsed = state === "collapsed";

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  // Get display name from email mapping or use email prefix
  const userEmail = user?.email?.toLowerCase() || '';
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split('@')[0] || 'User';

  return (
    <Sidebar collapsible="icon" variant="floating" className="border-0">
      <SidebarHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground">
            <img src={theme === 'dark' ? logoDark : logoLight} alt="Ops Terminal" className="h-8 w-auto" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* New Application Button + Notifications */}
              <SidebarMenuItem>
                <div className="flex items-center gap-1 mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        onClick={onNewApplication}
                        className="gradient-primary text-primary-foreground hover:opacity-90 transition-opacity flex-1"
                      >
                        <Plus className="h-4 w-4" />
                        {!isCollapsed && <span className="font-semibold">New</span>}
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    {isCollapsed && <TooltipContent side="right">New Application</TooltipContent>}
                  </Tooltip>
                  {!isCollapsed && <NotificationBell />}
                </div>
              </SidebarMenuItem>

              {/* Dynamic Navigation Loop */}
              {navMain.map((item) => {
                // Render Collapsible Menu (Tools)
                if (item.items && item.items.length > 0) {
                  return (
                    <Collapsible key={item.title} asChild defaultOpen={item.isActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.title}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton asChild>
                                  {subItem.external ? (
                                    <a href={subItem.url} target="_blank" rel="noopener noreferrer">
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </a>
                                  ) : (
                                    <NavLink to={subItem.url}>
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </NavLink>
                                  )}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                // Render Standard Menu Item
                return (
                  <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end={item.url === "/"}
                            className="hover:bg-sidebar-accent relative"
                            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                          >
                            <div className="relative">
                              <item.icon className="h-4 w-4" />
                              {/* Unread message badge for Chat */}
                              {item.title === 'Chat' && unreadMessages > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">
                                  {unreadMessages > 9 ? '9+' : unreadMessages}
                                </span>
                              )}
                            </div>
                            {!isCollapsed && (
                              <span className="flex items-center gap-2">
                                {item.title}
                                {/* Expanded badge */}
                                {item.title === 'Chat' && unreadMessages > 0 && (
                                  <span className="ml-auto h-5 min-w-[20px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-medium">
                                    {unreadMessages > 99 ? '99+' : unreadMessages}
                                  </span>
                                )}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isCollapsed && (
                        <TooltipContent side="right">
                          {item.title}
                          {item.title === 'Chat' && unreadMessages > 0 && (
                            <span className="ml-2 text-destructive font-medium">
                              ({unreadMessages} unread)
                            </span>
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/* Admin: Deletion Requests */}
          {isAdmin && (
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin/deletion-requests"
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Trash2 className="h-4 w-4" />
                      {!isCollapsed && <span>Deletion Requests</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </TooltipTrigger>
                {isCollapsed && <TooltipContent side="right">Deletion Requests</TooltipContent>}
              </Tooltip>
            </SidebarMenuItem>
          )}
          {/* Profile Menu */}
          <SidebarMenuItem>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton className="hover:bg-sidebar-accent">
                      <User className="h-4 w-4" />
                      {!isCollapsed && <span>{displayName}</span>}
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                {isCollapsed && <TooltipContent side="right">{displayName}</TooltipContent>}
              </Tooltip>
              <DropdownMenuContent side="right" align="end" className="w-48">
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          {bottomMenuItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </TooltipTrigger>
                {isCollapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
              </Tooltip>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}