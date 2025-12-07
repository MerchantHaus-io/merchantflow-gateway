import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  FileText, 
  BarChart3, 
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  BookOpen
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import brandLogo from "@/assets/brand-logo.png";

const mainMenuItems = [
  { title: "Pipeline", url: "/", icon: LayoutDashboard },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "SOP", url: "/sop", icon: BookOpen },
];

const bottomMenuItems = [
  { title: "Settings", url: "/settings", icon: Settings },
];

interface AppSidebarProps {
  onNewApplication?: () => void;
}

export function AppSidebar({ onNewApplication }: AppSidebarProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src={brandLogo} 
              alt="MerchantFlow" 
              className="h-8 w-8 rounded-md"
            />
            {!isCollapsed && (
              <span className="text-lg font-bold gradient-text tracking-tight">
                MerchantFlow
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* New Application Button */}
              <SidebarMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={onNewApplication}
                      className="gradient-primary text-primary-foreground hover:opacity-90 mb-2 transition-opacity"
                    >
                      <Plus className="h-4 w-4" />
                      {!isCollapsed && <span className="font-semibold">New Application</span>}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right">New Application</TooltipContent>
                  )}
                </Tooltip>
              </SidebarMenuItem>

              {/* Main Navigation */}
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton asChild>
                        <NavLink 
                          to={item.url} 
                          end={item.url === "/"}
                          className="hover:bg-sidebar-accent" 
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          {!isCollapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    {isCollapsed && (
                      <TooltipContent side="right">{item.title}</TooltipContent>
                    )}
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
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
                {isCollapsed && (
                  <TooltipContent side="right">{item.title}</TooltipContent>
                )}
              </Tooltip>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
