import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Users,
  Plus,
  Briefcase,
  Sun,
  Moon,
  ChevronDown,
  Maximize,
  Minimize,
  Search,
  UserPlus,
  LifeBuoy,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/contexts/ThemeContext";
import { NotificationBell } from "@/components/NotificationBell";
import { HeaderBreadcrumb } from "@/components/HeaderBreadcrumb";
import { isPathWithin } from "@/lib/routeMatch";
import { emitAppEvent } from "@/lib/appEvents";
import { isAutoFullscreenEnabled } from "@/lib/uiPreferences";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import sidebarIcon from "@/assets/sidebar-icon.webp";

interface MegaMenuHeaderProps {
  onNewApplication?: () => void;
  onNewAccount?: () => void;
  onNewContact?: () => void;
}

/**
 * The persistent application header.
 *
 * The name is a leftover: the mega menu it was built around moved to
 * IconRailSidebar, and this component carried its whole 90-line navigation
 * tree, the NavigationMenu primitive and thirty icon imports for months after
 * it stopped rendering any of them (#114). The nav tree now lives in one place
 * — src/config/navigation.ts — and this is a logo, a context pill and the
 * right-hand action cluster.
 *
 * The accepted-quotes badge went with it: the hook was still being called here
 * to badge "the Tools dropdown", which no longer exists. The rail and the
 * mobile nav both still show it.
 */
export function MegaMenuHeader({ onNewApplication, onNewAccount, onNewContact }: MegaMenuHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const autoFullscreen = isAutoFullscreenEnabled();

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
        // Not sticky (#133): the header is a flex child of an overflow-hidden
        // column, so it never scrolls and `sticky` was inert. z-chrome rather
        // than z-50, which put it in the same band as dialogs and the mobile
        // sheet backdrop.
        // #128: the surface colour is a token derived from the active variant's
        // own palette, not a literal blue-grey applied to all six dark themes.
        "z-chrome w-full border-b border-border/40 chrome-surface backdrop-blur-[20px] backdrop-saturate-[180%]",
        isDark
          ? "shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.4)]"
          : "shadow-sm"
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex h-12 items-center px-3 lg:px-5 gap-2 overflow-visible">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0 mr-1 hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all duration-300">
          <img src={sidebarIcon} alt="Ops Terminal" className="h-7 w-7 object-contain" />
        </Link>

        {/* Ops ⇄ Support context toggle */}
        <ContextTogglePill />


        {/* Desktop primary navigation lives in the collapsible IconRailSidebar;
            this space carries orientation instead (#119). */}
        <HeaderBreadcrumb className="flex-1 ml-1" />


        {/* Right side actions */}
        <div className="flex items-center shrink-0 overflow-visible gap-1 ml-auto">
          {/* Search trigger.
              Was `hidden lg:inline-flex`, so on a phone there was no way to
              find a merchant by name from anywhere in the app — you had to
              navigate to Opportunities and use its in-page filter (#158). Now
              it shows everywhere, collapsing to an icon below lg.

              It also emits a named event rather than synthesising a fake ⌘K
              KeyboardEvent, which coupled it to whatever the palette happened
              to bind (#116). */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => emitAppEvent("openCommandPalette")}
            aria-label="Search"
            className={cn(
              "h-8 gap-1.5 rounded-md text-xs px-2 lg:px-2.5",
              isDark
                ? "text-white/45 hover:text-white/70 hover:bg-white/8"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Search className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            <span className="hidden lg:inline text-muted-foreground/60">Search…</span>
            <kbd className="hidden lg:inline text-[10px] font-mono bg-muted/50 px-1 py-0.5 rounded border border-border/50">Ctrl+K</kbd>
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
                    // Both APIs reject rather than throw. Unhandled, that
                    // surfaces as an uncaught promise rejection every time the
                    // browser blocks the request — which it does inside an
                    // iframe, i.e. exactly how the Lovable preview runs (#126).
                    void document.exitFullscreen().catch(() => {});
                  } else {
                    void document.documentElement.requestFullscreen().catch(() => {
                      toast.error("Fullscreen isn't available here");
                    });
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
            {/* #125: auto-fullscreen is an opt-in Settings preference with no
                presence anywhere near the control it affects, so a user who
                turned it on had no way to tell why the app kept going
                fullscreen. Surfaced here, where the behaviour is. */}
            <TooltipContent side="bottom">
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              {autoFullscreen && (
                <span className="block text-[10px] opacity-70">
                  Auto-fullscreen is on (Settings)
                </span>
              )}
            </TooltipContent>
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
  // Segment match, not startsWith: `/support-request` is the public client
  // form, not the Support context (#109).
  const inSupport = isPathWithin(pathname, "/support");
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
