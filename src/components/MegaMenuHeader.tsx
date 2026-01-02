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
  { title: "Pipeline", url: "/", icon: LayoutDashboard },
  { title: "Opportunities", url: "/opportunities", icon: Briefcase },
  { title: "Tasks", url: "/tasks", icon: ListChecks },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  {
    title: "Tools",
    url: "#",
    icon: Wrench,
    items: [
      { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
      { title: "Preboarding Wizard", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
      { title: "Revenue Calculator", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
      { title: "CSV Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
      { title: "Data Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
      { title: "NMI Status", url: "https://statusgator.com/services/nmi", icon: Activity, description: "System status page", external: true },
    ],
  },
];

interface MegaMenuHeaderProps {
  onNewApplication?: () => void;
}

export function MegaMenuHeader({ onNewApplication }: MegaMenuHeaderProps) {
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNewClick = () => {
    if (onNewApplication) {
      onNewApplication();
    } else {
      navigate("/opportunities?new=true");
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
                          "bg-transparent",
                          isActive && "bg-accent text-accent-foreground"
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 mr-2" />
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
          {/* +New button */}
          <Button
            onClick={handleNewClick}
            size="sm"
            className="gradient-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">New</span>
          </Button>

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
              <Button variant="ghost" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="hidden md:inline">{displayName}</span>
                <ChevronDown className="h-3 w-3 hidden md:inline" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
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
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
