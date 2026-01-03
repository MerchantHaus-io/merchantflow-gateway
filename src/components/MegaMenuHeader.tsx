import { useState } from "react";
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
  User,
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
  Menu,
  X,
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
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/NotificationBell";
import { EMAIL_TO_USER } from "@/types/opportunity";
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
    url: "/",
    icon: LayoutDashboard,
    items: [
      { title: "Pipeline Board", url: "/", icon: LayoutDashboard, description: "View opportunity pipeline" },
      { title: "Tasks", url: "/tasks", icon: ListChecks, description: "Manage your tasks" },
      { title: "My Tasks", url: "/my-tasks", icon: ClipboardList, description: "Tasks assigned to you" },
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
    ],
  },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Reports", url: "/reports", icon: BarChart3 },
];

const toolsItems: NavItem[] = [
  { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
  { title: "Preboarding Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
  { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
  { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
  { title: "Data Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
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
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNewClick = (type: "opportunity" | "account" | "contact") => {
    switch (type) {
      case "opportunity":
        if (onNewApplication) {
          onNewApplication();
        } else {
          navigate("/opportunities?new=true");
        }
        break;
      case "account":
        if (onNewAccount) {
          onNewAccount();
        } else {
          navigate("/accounts?new=true");
        }
        break;
      case "contact":
        if (onNewContact) {
          onNewContact();
        } else {
          navigate("/contacts?new=true");
        }
        break;
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "User";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 lg:px-6 gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src={sidebarIcon} alt="Ops Terminal" className="h-8 w-8 object-contain" />
          <span className="font-display font-semibold text-foreground hidden sm:inline">Ops Terminal</span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden lg:flex flex-1">
          <NavigationMenuList>
            {navMain.map((item) => {
              if (item.items) {
                return (
                  <NavigationMenuItem key={item.title}>
                    <NavigationMenuTrigger className="bg-transparent">
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
                          "bg-transparent flex items-center",
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
          </NavigationMenuList>
        </NavigationMenu>

        {/* Right side actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* +New dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
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

          <NotificationBell />

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
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
              <Button variant="ghost" size="sm" className="gap-2 pl-1">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.user_metadata?.avatar_url} alt={displayName} />
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

          {/* Mobile menu trigger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[350px] p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <span className="font-semibold">Menu</span>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon">
                      <X className="h-5 w-5" />
                    </Button>
                  </SheetClose>
                </div>
                <nav className="flex-1 overflow-auto p-4 space-y-1">
                  {navMain.map((item) => {
                    if (item.items) {
                      return (
                        <div key={item.title} className="space-y-1">
                          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
                            <item.icon className="h-4 w-4" />
                            {item.title}
                          </div>
                          <div className="pl-6 space-y-1">
                            {item.items.map((subItem) =>
                              subItem.external ? (
                                <a
                                  key={subItem.title}
                                  href={subItem.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent"
                                  onClick={() => setMobileOpen(false)}
                                >
                                  <subItem.icon className="h-4 w-4" />
                                  {subItem.title}
                                </a>
                              ) : (
                                <SheetClose key={subItem.title} asChild>
                                  <RouterNavLink
                                    to={subItem.url}
                                    className={({ isActive }) =>
                                      cn(
                                        "flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent",
                                        isActive && "bg-accent text-accent-foreground"
                                      )
                                    }
                                  >
                                    <subItem.icon className="h-4 w-4" />
                                    {subItem.title}
                                  </RouterNavLink>
                                </SheetClose>
                              )
                            )}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <SheetClose key={item.title} asChild>
                        <RouterNavLink
                          to={item.url}
                          end={item.url === "/"}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent",
                              isActive && "bg-accent text-accent-foreground font-medium"
                            )
                          }
                        >
                          <item.icon className="h-4 w-4" />
                          {item.title}
                        </RouterNavLink>
                      </SheetClose>
                    );
                  })}
                  
                  {/* Tools section in mobile */}
                  <div className="space-y-1 pt-4 border-t border-border mt-4">
                    <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
                      <Wrench className="h-4 w-4" />
                      Tools
                    </div>
                    <div className="pl-6 space-y-1">
                      {toolsItems.map((tool) =>
                        tool.external ? (
                          <a
                            key={tool.title}
                            href={tool.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent"
                            onClick={() => setMobileOpen(false)}
                          >
                            <tool.icon className="h-4 w-4" />
                            {tool.title}
                          </a>
                        ) : (
                          <SheetClose key={tool.title} asChild>
                            <RouterNavLink
                              to={tool.url}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-accent",
                                  isActive && "bg-accent text-accent-foreground"
                                )
                              }
                            >
                              <tool.icon className="h-4 w-4" />
                              {tool.title}
                            </RouterNavLink>
                          </SheetClose>
                        )
                      )}
                    </div>
                  </div>
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
