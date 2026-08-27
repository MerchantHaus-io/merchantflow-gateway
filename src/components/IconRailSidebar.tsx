import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Settings, LogOut, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAcceptedQuotesCount } from "@/hooks/useAcceptedQuotesCount";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useOwnProfile } from "@/hooks/useOwnProfile";
import { supabase } from "@/integrations/supabase/client";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { activeGroupFor, groupsForSurface, type NavItem } from "@/config/navigation";
import { openExternal } from "@/lib/openExternal";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "iconRailCollapsed";

/**
 * Below this width the expanded rail (232px) plus the content area is tight,
 * so a first-time user starts collapsed. Once they toggle it their choice is
 * stored and this no longer applies (#124).
 */
const AUTO_COLLAPSE_WIDTH = 1440;

function SubItemBody({ sub, badge }: { sub: NavItem; badge: number }) {
  return (
    <>
      <sub.icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="text-[13px] font-medium leading-tight flex items-center gap-1.5">
          {sub.title}
          {badge > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-badge-alert px-1 text-[10px] font-bold leading-none text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        {sub.description && (
          <span className="block text-[11px] text-muted-foreground leading-snug line-clamp-1 mt-0.5">
            {sub.description}
          </span>
        )}
      </span>
    </>
  );
}

export function IconRailSidebar() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { data: acceptedQuotesCount = 0 } = useAcceptedQuotesCount();

  // Stored preference wins; otherwise start collapsed on anything narrower
  // than a large desktop, where 232px of rail costs the content area real
  // room (#124).
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === "1";
    return window.innerWidth < AUTO_COLLAPSE_WIDTH;
  });
  // Don't write the auto-collapse default back to storage — that would freeze
  // a first-visit width guess into a permanent preference.
  const hasUserPreference = useRef(
    typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) !== null,
  );

  const toggleCollapsed = () => {
    hasUserPreference.current = true;
    setCollapsed((c) => !c);
  };

  // One fetch and one realtime channel for this row, shared with
  // NotificationBell rather than duplicated (#113).
  const { data: profile } = useOwnProfile();
  const avatarUrl = profile?.avatar_url ?? null;
  const profileName = profile?.full_name ?? null;

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = profileName || EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "User";

  // The single group that owns the current path (#108). Most specific wins, so
  // /reports/transactions highlights Merchants alone rather than Merchants AND
  // Reports, which is what a raw startsWith() per group produced.
  const activeGroupTitle = useMemo(
    () => activeGroupFor(location.pathname)?.title ?? null,
    [location.pathname],
  );

  const groups = useMemo(
    () =>
      groupsForSurface("rail").map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.adminOnly || isAdmin),
      })),
    [isAdmin],
  );

  return (
    <aside
      role="navigation"
      aria-label="Primary"
      style={{ width: collapsed ? 56 : 232 }}
      // No width transition (#123). The rail is a flex sibling of the content
      // area, so animating its width reflowed the whole page — including a
      // 14-column virtualised table — for 200ms on every toggle. An instant
      // snap is cheaper and reads as more responsive.
      // #128: token-driven, so the rail follows the active variant instead of
      // wearing the same blue-grey under DOOM, PS1, Forest, Charcoal and Mono.
      className="hidden lg:flex flex-col shrink-0 border-r border-border/40 chrome-rail-surface backdrop-blur-[20px]"
    >
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-3 px-2.5 space-y-3">
        {groups.map((group) => {
          const active = activeGroupTitle === group.title;
          const showBadge = group.title === "Tools" && acceptedQuotesCount > 0;

          /* A menu button, not a link (#121, #122).
             The flyout was a HoverCard, which does not open on tap — so on an
             iPad in landscape (1024px+, where the rail renders) tapping a group
             just navigated to its default page and six of seven sub-items were
             unreachable. It also gave no aria-expanded, no aria-controls, and
             no submenu semantics.

             Nothing is lost by making the icon open a menu instead of
             navigating: every group's landing page is also the first item in
             its own menu (asserted in navigation.test.ts). */
          const trigger = (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={group.title}
                className={cn(
                  "group relative flex items-center rounded-lg text-[13px] font-medium tracking-tight transition-colors w-full",
                  collapsed ? "h-11 justify-center px-0" : "h-10 gap-3 px-3",
                  active
                    ? isDark
                      ? "bg-white/10 text-white"
                      : "bg-accent text-accent-foreground"
                    : isDark
                    ? "text-white/75 hover:text-white hover:bg-white/10"
                    : "text-foreground/75 hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="relative shrink-0 flex items-center justify-center">
                  <group.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  {showBadge && (
                    <span
                      className="absolute -top-1.5 -right-2 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-badge-alert px-1 text-[9px] font-bold leading-none text-white"
                      aria-label={`${acceptedQuotesCount} accepted quotes ready for contract`}
                    >
                      {acceptedQuotesCount > 99 ? "99+" : acceptedQuotesCount}
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap leading-tight text-left">
                    {group.title}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
          );

          return (
            <DropdownMenu key={group.title}>
              {/* Collapsed, the rail is seven unlabelled icons. The flyout does
                  name the group, but only after opening a 256px panel — a plain
                  tooltip on the icon is the cheaper affordance (#120). */}
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="right">{group.title}</TooltipContent>
                </Tooltip>
              ) : (
                trigger
              )}

              <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-64 p-2">
                <DropdownMenuLabel className="px-2 py-1.5 mb-1 border-b border-border/50 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {group.title}
                </DropdownMenuLabel>

                {group.items.map((sub) => (
                  <DropdownMenuItem key={sub.url} asChild className="p-0 focus:bg-transparent">
                    {sub.external ? (
                      <button
                        type="button"
                        onClick={() => void openExternal(sub.url)}
                        className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                      >
                        <SubItemBody sub={sub} badge={0} />
                      </button>
                    ) : (
                      <NavLink
                        to={sub.url}
                        className={({ isActive }) =>
                          cn(
                            "flex items-start gap-2.5 rounded-md p-2 transition-colors cursor-pointer",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent hover:text-accent-foreground"
                          )
                        }
                      >
                        <SubItemBody
                          sub={sub}
                          badge={sub.url === "/tools/quote-builder" ? acceptedQuotesCount : 0}
                        />
                      </NavLink>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </nav>

      {/* Profile menu */}
      <div className="border-t border-border/40 p-2.5 space-y-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Profile menu"
              className={cn(
                "w-full rounded-lg transition-colors",
                collapsed ? "h-11 justify-center px-0" : "h-10 gap-3 px-3 justify-start",
                isDark
                  ? "text-white/75 hover:text-white hover:bg-white/10"
                  : "text-foreground/75 hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Avatar className={cn("ring-1 ring-border/50 shrink-0", collapsed ? "h-7 w-7" : "h-7 w-7")}>
                <AvatarImage src={avatarUrl || undefined} alt={displayName} className="object-cover" />
                <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-medium tracking-tight leading-tight text-left">
                    {displayName}
                  </span>
                  <ChevronsRight className="h-3 w-3 opacity-50 shrink-0 -rotate-90" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} className="w-52" sideOffset={8}>
            {/* User info header */}
            <div className="px-3 py-2.5 border-b border-border/50 mb-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold">{displayName}</p>
                <span className="live-dot shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
            </div>
            <DropdownMenuItem asChild>
              <NavLink to="/settings" className="cursor-pointer">
                <Settings className="h-4 w-4 mr-2 text-muted-foreground" />
                Settings
              </NavLink>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem asChild>
                <NavLink to="/admin/deletion-requests" className="cursor-pointer">
                  <Trash2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  Deletion Requests
                </NavLink>
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

      <div className="border-t border-border/40 p-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              className={cn(
                "w-full h-10 rounded-lg",
                collapsed ? "justify-center px-0" : "justify-start px-3",
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
                  <span className="text-xs font-medium">Collapse</span>
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
