import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { LogOut, Search, X, ChevronRight, Clock } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAcceptedQuotesCount } from "@/hooks/useAcceptedQuotesCount";
import { useHistoryDismiss } from "@/hooks/useHistoryDismiss";
import { openExternal } from "@/lib/openExternal";
import { getRecentPages } from "@/lib/recentPages";
import { isPathWithin } from "@/lib/routeMatch";
import {
  ALL_NAV_ITEMS,
  MOBILE_PRIMARY,
  groupsForSurface,
  type NavItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * The mobile tab bar and its full-screen launcher.
 *
 * Nav data comes from src/config/navigation.ts (#115) — this file used to hold
 * a third, drifted copy of the tree, missing Statement Analyzer and carrying a
 * Notifications entry desktop didn't have.
 */

const isItemActive = (pathname: string, item: NavItem) =>
  item.url === "/" ? pathname === "/" : isPathWithin(pathname, item.url);

function NavBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className="absolute -top-1.5 -right-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-badge-alert px-1 text-[10px] font-bold leading-none text-white shrink-0 ring-2 ring-background"
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { signOut } = useAuth();
  const { isAdmin } = useUserRole();
  const { data: acceptedQuotesCount = 0 } = useAcceptedQuotesCount();

  // Android hardware back / browser Back closes the sheet rather than
  // navigating out from under it.
  useHistoryDismiss(open, () => setOpen(false));

  const groups = useMemo(
    () =>
      groupsForSurface("launcher").map((g) => ({
        ...g,
        items: g.items.filter((i) => !i.adminOnly || isAdmin),
      })),
    [isAdmin],
  );

  const searchable = useMemo(
    () => ALL_NAV_ITEMS.filter((i) => !i.adminOnly || isAdmin),
    [isAdmin],
  );

  // Read once per open, not on every render — the list only changes as a
  // result of navigating, which closes the sheet anyway.
  const recents = useMemo(() => {
    if (!open) return [];
    const byUrl = new Map(searchable.map((i) => [i.url, i]));
    return getRecentPages()
      .map((url) => byUrl.get(url))
      .filter((i): i is NavItem => Boolean(i));
  }, [open, searchable]);

  const isMoreActive = groups
    .flatMap((g) => g.items)
    .some((i) => !i.external && isItemActive(location.pathname, i));

  const handleNav = useCallback(
    (item: NavItem) => {
      setOpen(false);
      setSearch("");
      if (item.external) openExternal(item.url);
      else navigate(item.url);
    },
    [navigate],
  );

  const handleSignOut = async () => {
    setConfirmSignOut(false);
    setOpen(false);
    await signOut();
    navigate("/auth");
  };

  // Titles and descriptions both, so "statement" finds the Statement Analyzer
  // and "residuals" finds Commissions via its description (#157).
  const query = search.trim().toLowerCase();
  const filtered = query
    ? searchable.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.description?.toLowerCase().includes(query),
      )
    : null;

  const tabs: (NavItem & { key: string })[] = MOBILE_PRIMARY.map((t) => ({ ...t, key: t.url }));

  return (
    <>
      {/* ── FIXED TAB BAR ── */}
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-chrome lg:hidden bg-background/95 border-t border-border/40"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch h-[56px]">
          {tabs.map((tab) => {
            const active = isItemActive(location.pathname, tab);
            return (
              <NavLink
                key={tab.key}
                to={tab.url}
                // NavLink gives link semantics, aria-current="page" and
                // long-press-to-copy for free; these were <button onClick>
                // before, so assistive tech saw no current-page state (#177).
                end={tab.url === "/"}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 gap-[3px] text-xs font-medium relative",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
                <tab.icon className={cn("h-[22px] w-[22px]", active && "stroke-[2.2px]")} />
                <span className={cn("leading-none", active && "font-semibold")}>{tab.title}</span>
              </NavLink>
            );
          })}

          {/* Launcher */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              "flex flex-col items-center justify-center flex-1 gap-[3px] text-xs font-medium relative",
              isMoreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            {/* Shares the layoutId with the tabs so the indicator slides
                between More and a primary tab instead of teleporting (#168). */}
            {isMoreActive && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute top-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
            )}
            <div className="relative grid grid-cols-2 gap-[3px] h-[22px] w-[22px]">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-[2px]",
                    isMoreActive ? "bg-primary/70" : "bg-current opacity-60",
                    open && "opacity-100",
                  )}
                />
              ))}
              {acceptedQuotesCount > 0 && (
                <NavBadge
                  count={acceptedQuotesCount}
                  label={`${acceptedQuotesCount} accepted quote${acceptedQuotesCount === 1 ? "" : "s"} ready for contract`}
                />
              )}
            </div>
            <span>More</span>
          </button>
        </div>
      </nav>

      {/* ── LAUNCHER ──
          A real drawer (vaul), not the hand-rolled motion div this was (#136).
          That version had no focus trap, no role="dialog", no Escape handler,
          and left the page behind it tabbable and scrollable. Drag-to-dismiss
          comes free with the primitive.

          dvh, not vh (#139): 82vh overflows under Safari's dynamic toolbar,
          and the grid was squeezed to nothing when the keyboard opened. The
          full-height switch under 500px covers phone landscape (#178). */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="lg:hidden max-h-[82dvh] mobile-landscape:max-h-[96dvh]">
          <DrawerTitle className="sr-only">All pages</DrawerTitle>
          <DrawerDescription className="sr-only">
            Search or browse every page in the Ops Terminal
          </DrawerDescription>

          <div className="px-4 pt-2 pb-3 shrink-0">
            <div className="flex items-center gap-2 px-3 h-11 rounded-xl bg-muted border border-border">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              {/* No programmatic autofocus (#138): focus outside the
                  user-gesture window is ignored by iOS Safari anyway, so the
                  200ms setTimeout only ever moved the caret without raising
                  the keyboard. */}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered?.length) handleNav(filtered[0]);
                }}
                placeholder="Search all pages…"
                aria-label="Search all pages"
                className="flex-1 bg-transparent text-base outline-none text-foreground placeholder:text-muted-foreground/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="-mr-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div
            className="overflow-y-auto overscroll-contain flex-1"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            {filtered ? (
              <div className="px-4 space-y-1">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No results for “{search}”
                  </p>
                ) : (
                  filtered.map((item) => (
                    <LauncherRow
                      key={item.url}
                      item={item}
                      active={!item.external && isItemActive(location.pathname, item)}
                      onSelect={handleNav}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="px-4 space-y-5">
                {recents.length > 0 && (
                  <LauncherGroup label="Recent" icon={Clock}>
                    {recents.map((item) => (
                      <LauncherTile
                        key={item.url}
                        item={item}
                        active={isItemActive(location.pathname, item)}
                        badge={0}
                        onSelect={handleNav}
                      />
                    ))}
                  </LauncherGroup>
                )}

                {groups.map((group) => (
                  <LauncherGroup key={group.title} label={group.title}>
                    {group.items.map((item) => (
                      <LauncherTile
                        key={item.url}
                        item={item}
                        active={!item.external && isItemActive(location.pathname, item)}
                        badge={item.url === "/tools/quote-builder" ? acceptedQuotesCount : 0}
                        onSelect={handleNav}
                      />
                    ))}
                  </LauncherGroup>
                ))}

                <div className="pt-1 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => setConfirmSignOut(true)}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm text-destructive"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10">
                      <LogOut className="h-4 w-4" />
                    </div>
                    <span className="font-medium">Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Sign Out sat unguarded at the bottom of a scrolling grid, which is
          easy to hit with a thumb on the way past (#167). */}
      <AlertDialog open={confirmSignOut} onOpenChange={setConfirmSignOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll need to sign in again to get back into the Ops Terminal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * A labelled section of the launcher.
 *
 * The label is a real heading and the tiles a real list (#176): they were
 * styled <p>s over a bare grid, so a screen reader met forty undifferentiated
 * buttons with no structure to skim.
 */
function LauncherGroup({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: NavItem["icon"];
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`launcher-${label}`}>
      <h2
        id={`launcher-${label}`}
        className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.12em] text-muted-foreground/70 mb-2 px-1"
      >
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </h2>
      <ul className="grid grid-cols-4 gap-1.5">{children}</ul>
    </section>
  );
}

function LauncherTile({
  item,
  active,
  badge,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
  onSelect: (item: NavItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-xs font-medium transition-transform active:scale-95",
          active ? "bg-primary/10 text-primary" : "text-foreground",
        )}
      >
        <span
          className={cn(
            "relative flex h-11 w-11 items-center justify-center rounded-xl",
            active ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <item.icon className="h-5 w-5" />
          {badge > 0 && (
            <NavBadge
              count={badge}
              label={`${badge} accepted quote${badge === 1 ? "" : "s"} ready for contract`}
            />
          )}
        </span>
        <span className="leading-tight text-center line-clamp-2">
          {item.mobileTitle ?? item.title}
        </span>
      </button>
    </li>
  );
}

function LauncherRow({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (item: NavItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm",
        active ? "bg-primary/10 text-primary font-medium" : "text-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
          active ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        <item.icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-left">{item.title}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
    </button>
  );
}
