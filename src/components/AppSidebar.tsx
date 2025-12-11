import { LayoutDashboard, Building2, Users, FileText, BarChart3, Settings, Plus, ChevronLeft, ChevronRight, BookOpen, Wrench, ChevronDown, Calculator, Activity, type LucideIcon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import brandLogo from "@/assets/brand-logo.png";

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
const navMain: NavItem[] = [{
  title: "Pipeline",
  url: "/",
  icon: LayoutDashboard
}, {
  title: "Accounts",
  url: "/accounts",
  icon: Building2
}, {
  title: "Contacts",
  url: "/contacts",
  icon: Users
}, {
  title: "Documents",
  url: "/documents",
  icon: FileText
}, {
  title: "Reports",
  url: "/reports",
  icon: BarChart3
}, {
  title: "Tools",
  url: "#",
  icon: Wrench,
  isActive: true,
  // Defaults to open
  items: [{
    title: "SOP",
    url: "/sop",
    icon: BookOpen
  }, {
    title: "Revenue Calc",
    url: "/tools/revenue-calculator",
    icon: Calculator
  }, {
    title: "NMI Status",
    url: "https://statusgator.com/services/nmi",
    icon: Activity,
    external: true
  }]
}];
const bottomMenuItems = [{
  title: "Settings",
  url: "/settings",
  icon: Settings
}];
interface AppSidebarProps {
  onNewApplication?: () => void;
}
export function AppSidebar({
  onNewApplication
}: AppSidebarProps) {
  const {
    state,
    toggleSidebar
  } = useSidebar();
  const isCollapsed = state === "collapsed";
  return <Sidebar collapsible="icon" variant="floating" className="border-0">
      <SidebarHeader className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground">
            {/* Logo already includes text; remove separate title/text */}
            <img src={brandLogo} alt="Merchant Haus" className="h-8 w-auto" />
          </div>
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent">
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
                    <SidebarMenuButton onClick={onNewApplication} className="gradient-primary text-primary-foreground hover:opacity-90 mb-2 transition-opacity">
                      <Plus className="h-4 w-4" />
                      {!isCollapsed && <span className="font-semibold">New Application</span>}
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  {isCollapsed && <TooltipContent side="right">New Application</TooltipContent>}
                </Tooltip>
              </SidebarMenuItem>

              {/* Dynamic Navigation Loop */}
              {navMain.map(item => {
              // Render Collapsible Menu (Tools)
              if (item.items && item.items.length > 0) {
                return <Collapsible key={item.title} asChild defaultOpen={item.isActive} className="group/collapsible">
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
                            {item.items.map(subItem => <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton asChild>
                                  {subItem.external ? <a href={subItem.url} target="_blank" rel="noopener noreferrer">
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </a> : <NavLink to={subItem.url}>
                                      <subItem.icon className="h-4 w-4" />
                                      <span>{subItem.title}</span>
                                    </NavLink>}
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>)}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>;
              }

              // Render Standard Menu Item
              return <SidebarMenuItem key={item.title}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink to={item.url} end={item.url === "/"} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                            <item.icon className="h-4 w-4" />
                            {!isCollapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {isCollapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
                    </Tooltip>
                  </SidebarMenuItem>;
            })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {bottomMenuItems.map(item => <SidebarMenuItem key={item.title}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} className="hover:bg-sidebar-accent" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </TooltipTrigger>
                {isCollapsed && <TooltipContent side="right">{item.title}</TooltipContent>}
              </Tooltip>
            </SidebarMenuItem>)}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>;
}
