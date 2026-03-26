import { useState, useEffect, lazy, Suspense } from "react";
import { useTheme } from "@/contexts/ThemeContext";

const Starfield = lazy(() => import("@/components/Starfield"));

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Briefcase, Building2, Users, FileText, BarChart3,
  Activity, BadgeDollarSign, Globe, BookOpen, BookMarked, ClipboardList,
  Calculator, Sparkles, FileSpreadsheet, Download, Cloud, Send, ListChecks,
  Settings, LayoutGrid, Box, CircleDot, List, FolderOpen, UserPlus, CalendarDays,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { Carousel3D, type CarouselItem } from "@/components/home/Carousel3D";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UpcomingMeetingsWidget } from "@/components/UpcomingMeetingsWidget";

interface ShortcutGroup {
  title: string;
  items: CarouselItem[];
}

const groups: ShortcutGroup[] = [
  {
    title: "Pipeline & Sales",
    items: [
      { title: "Pipeline Board", description: "Manage live opportunities", url: "/pipeline", icon: LayoutDashboard, color: "primary" },
      { title: "All Opportunities", description: "Search & filter deals", url: "/opportunities", icon: Briefcase, color: "primary" },
      { title: "Email Outreach", description: "Campaign tracker & sender", url: "/outreach", icon: Send, color: "teal" },
      { title: "Web Submissions", description: "Incoming applications", url: "/admin/web-submissions", icon: Globe, color: "gold" },
      { title: "Tasks", description: "Team task board", url: "/tasks", icon: ListChecks, color: "success" },
      { title: "Calendar", description: "Meetings & events", url: "/calendar", icon: CalendarDays, color: "teal" },
    ],
  },
  {
    title: "CRM",
    items: [
      { title: "Accounts", description: "Business accounts", url: "/accounts", icon: Building2, color: "teal" },
      { title: "Contacts", description: "People & relationships", url: "/contacts", icon: Users, color: "teal" },
      { title: "Documents", description: "Uploaded files", url: "/documents", icon: FileText, color: "gold" },
    ],
  },
  {
    title: "Reports & Billing",
    items: [
      { title: "Reports", description: "Performance analytics", url: "/reports", icon: BarChart3, color: "primary" },
      { title: "Analytics", description: "Login & broadcast data", url: "/admin/analytics", icon: Activity, color: "teal" },
      { title: "Live & Billing", description: "Live accounts & billing", url: "/live-billing", icon: BadgeDollarSign, color: "gold" },
      { title: "Processors", description: "Compatibility list", url: "/supported-processors", icon: Globe, color: "success" },
    ],
  },
  {
    title: "Tools & Resources",
    items: [
      { title: "SOP", description: "Standard procedures", url: "/sop", icon: BookOpen, color: "primary" },
      { title: "Portal Guide", description: "Interactive NMI walkthrough", url: "/tools/gateway-guide", icon: BookMarked, color: "teal" },
      { title: "Preboarding", description: "Application readiness", url: "/tools/preboarding-wizard", icon: ClipboardList, color: "gold" },
      { title: "Revenue Calc", description: "Estimate processing rev", url: "/tools/revenue-calculator", icon: Calculator, color: "success" },
      { title: "NMI Boarding", description: "Board via NMI gateway", url: "/tools/nmi-boarding", icon: BadgeDollarSign, color: "warning" },
      { title: "Terminal Updates", description: "Latest CRM changes", url: "/tools/terminal-updates", icon: Sparkles, color: "primary" },
      { title: "CSV Import", description: "Bulk data import", url: "/tools/csv-import", icon: FileSpreadsheet, color: "teal" },
      { title: "Data Export", description: "Export opportunity data", url: "/admin/data-export", icon: Download, color: "gold" },
      { title: "Netlify", description: "Deployment audit", url: "/tools/netlify", icon: Cloud, color: "success" },
      { title: "Settings", description: "Profile & preferences", url: "/settings", icon: Settings, color: "primary" },
    ],
  },
];

const groupKeys = groups.map((g) => g.title);

type LayoutMode = "grid" | "carousel" | "icons";

const iconColorMap: Record<string, string> = {
  primary: "text-primary-foreground",
  teal: "text-teal-foreground",
  gold: "text-gold-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
};

const bgColorMap: Record<string, string> = {
  primary: "bg-primary",
  teal: "bg-teal",
  gold: "bg-gold",
  success: "bg-success",
  warning: "bg-warning",
};

const glowColorMap: Record<string, string> = {
  primary: "shadow-[0_0_20px_hsl(348_83%_47%/0.25)]",
  teal: "shadow-[0_0_20px_hsl(174_72%_46%/0.25)]",
  gold: "shadow-[0_0_20px_hsl(43_51%_58%/0.25)]",
  success: "shadow-[0_0_20px_hsl(142_76%_36%/0.25)]",
  warning: "shadow-[0_0_20px_hsl(38_92%_50%/0.25)]",
};

const borderColorMap: Record<string, string> = {
  primary: "border-primary",
  teal: "border-teal",
  gold: "border-gold",
  success: "border-success",
  warning: "border-warning",
};

// ── Grid View (card layout) ─────────────────────────────────
function GridView({ groups: g, activeGroup }: { groups: ShortcutGroup[]; activeGroup: number }) {
  const navigate = useNavigate();
  const items = g[activeGroup].items;

  return (
    <motion.div
      key={activeGroup}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-wrap justify-center gap-3 mt-4"
    >
      {items.map((item, i) => (
        <motion.button
          key={item.url}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          onClick={() => item.external ? window.open(item.url, "_blank") : navigate(item.url)}
          className={cn(
            "group relative flex flex-col items-center gap-2 p-4 rounded-xl border border-border/60",
            "bg-card dark:bg-card/90 hover:bg-card hover:border-border transition-all duration-200",
            "cursor-pointer text-center",
            "w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)] xl:w-[calc(20%-10px)]",
            glowColorMap[item.color],
          )}
        >
          <div className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center",
            bgColorMap[item.color],
          )}>
            <item.icon className={cn("h-5 w-5", iconColorMap[item.color])} strokeWidth={1.8} />
          </div>
          <span className="text-xs font-semibold text-foreground leading-tight">{item.title}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{item.description}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

// ── Icon View (large icons, minimal chrome) ──────────────────
function IconView({ groups: g, activeGroup }: { groups: ShortcutGroup[]; activeGroup: number }) {
  const navigate = useNavigate();
  const items = g[activeGroup].items;

  return (
    <motion.div
      key={activeGroup}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid grid-cols-3 sm:grid-cols-5 justify-items-center gap-x-4 gap-y-6 mt-6 max-w-3xl mx-auto"
    >
      {items.map((item, i) => (
        <motion.button
          key={item.url}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.035, duration: 0.3 }}
          onClick={() => item.external ? window.open(item.url, "_blank") : navigate(item.url)}
          className={cn(
            "group flex flex-col items-center gap-2.5 cursor-pointer focus:outline-none w-24 sm:w-28 p-3 rounded-2xl transition-all duration-200",
            "hover:bg-card/80 dark:hover:bg-card/40",
          )}
        >
          {/* Large icon orb */}
          <div
            className={cn(
              "w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl flex items-center justify-center",
              "transition-all duration-300",
              "group-hover:scale-110 group-hover:shadow-lg group-active:scale-95",
              bgColorMap[item.color],
              glowColorMap[item.color],
            )}
          >
            <item.icon
              className={cn("h-7 w-7 sm:h-8 sm:w-8 transition-transform duration-300", iconColorMap[item.color])}
              strokeWidth={1.6}
            />
          </div>

          {/* Title */}
          <span className="text-xs font-bold text-foreground leading-tight text-center font-display drop-shadow-sm">
            {item.title}
          </span>

          {/* Subtitle */}
          <span className="text-[10px] text-muted-foreground leading-tight text-center -mt-1 drop-shadow-sm">
            {item.description}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}

// ── Layout cycle order & icons ───────────────────────────────
const layoutCycle: LayoutMode[] = ["grid", "icons", "carousel"];
const layoutIcons: Record<LayoutMode, typeof LayoutGrid> = {
  grid: LayoutGrid,
  icons: CircleDot,
  carousel: Box,
};
const layoutLabels: Record<LayoutMode, string> = {
  grid: "Cards",
  icons: "Icons",
  carousel: "3D Carousel",
};

// ── Main Home ────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [activeGroup, setActiveGroup] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("icons");
  const [loaded, setLoaded] = useState(false);
  const [showToggleHint, setShowToggleHint] = useState(false);

  // Load preference from profile
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("home_layout")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const v = data?.home_layout;
        if (v === "carousel" || v === "grid" || v === "icons") {
          setLayout(v as LayoutMode);
        }
        // Show hint if user has never changed from default
        const hasSeenHint = localStorage.getItem("home_layout_hint_seen");
        if (!hasSeenHint && (!v || v === "icons")) {
          setShowToggleHint(true);
        }
        setLoaded(true);
      });
  }, [user?.id]);

  // Cycle layout & persist
  const cycleLayout = () => {
    const idx = layoutCycle.indexOf(layout);
    const next = layoutCycle[(idx + 1) % layoutCycle.length];
    setLayout(next);
    setShowToggleHint(false);
    localStorage.setItem("home_layout_hint_seen", "1");
    if (user?.id) {
      supabase.from("profiles").update({ home_layout: next } as any).eq("id", user.id).then();
    }
  };

  const dismissHint = () => {
    setShowToggleHint(false);
    localStorage.setItem("home_layout_hint_seen", "1");
  };

  const allItems = groups.flatMap((g) => g.items);
  const currentItems = showAll ? allItems : groups[activeGroup].items;
  const allGroup: ShortcutGroup = { title: "All", items: allItems };
  const CurrentIcon = layoutIcons[layout];
  const currentLabel = layoutLabels[layout];
  const NextIcon = layoutIcons[layoutCycle[(layoutCycle.indexOf(layout) + 1) % layoutCycle.length]];
  const nextLabel = layoutLabels[layoutCycle[(layoutCycle.indexOf(layout) + 1) % layoutCycle.length]];

  const isDark = theme === 'dark';

  return (
    <>
    {isDark && (
      <Suspense fallback={null}>
        <Starfield />
      </Suspense>
    )}
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* Hero greeting + next meeting */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-1 mb-4"
        >
          <div className="text-center sm:text-left">
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-0.5">
              {greeting}, <span className="text-primary">{displayName}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Quick access to everything you need.
            </p>
          </div>
          <NextMeetingChip />
        </motion.div>

        {/* Category tabs + layout toggle */}
        <div className="flex items-center justify-center gap-2 mb-2 flex-wrap overflow-visible">
          {/* Categorised / All toggle */}
          <div className="flex items-center rounded-full border border-border/40 bg-card/40 p-0.5 mr-1">
            <button
              onClick={() => setShowAll(false)}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all duration-200",
                !showAll
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FolderOpen className="h-3 w-3" />
              <span className="hidden sm:inline">Categories</span>
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-all duration-200",
                showAll
                  ? "bg-primary/15 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <List className="h-3 w-3" />
              <span className="hidden sm:inline">All</span>
            </button>
          </div>

          {/* Category tabs — only visible when not showing all */}
          {!showAll && groupKeys.map((title, idx) => (
            <button
              key={title}
              onClick={() => setActiveGroup(idx)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-300",
                "border",
                idx === activeGroup
                  ? "bg-primary/15 border-primary/40 text-primary shadow-[0_0_12px_hsl(348_83%_47%/0.2)]"
                  : "bg-card/40 border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {title}
            </button>
          ))}

          {/* View toggle — cycles icons → grid → carousel */}
          <div className="relative ml-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full border border-border/40 gap-1.5 px-3 overflow-visible shrink-0 min-w-fit"
              onClick={cycleLayout}
              title={`Switch to ${nextLabel}`}
            >
              <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline whitespace-nowrap">{currentLabel}</span>
            </Button>

            {/* First-time hint popover */}
            {showToggleHint && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1, duration: 0.3 }}
                className="absolute top-full mt-2 right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto z-50 w-56"
              >
                {/* Arrow */}
                <div className="absolute -top-1.5 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto w-3 h-3 rotate-45 bg-card border-l border-t border-border/60" />
                <div className="bg-card/95 dark:bg-card/90 backdrop-blur-xl border border-border/60 rounded-xl p-3 shadow-lg">
                  <p className="text-xs text-foreground font-semibold mb-1">Switch view style</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
                    Toggle between Icons, Cards, and 3D Carousel layouts.
                  </p>
                  <button
                    onClick={dismissHint}
                    className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Upcoming Meetings */}
        <div className="mt-4 mb-4">
          <UpcomingMeetingsWidget />
        </div>

        {/* Content */}
        {layout === "carousel" ? (
          <Carousel3D key={showAll ? "all" : activeGroup} items={currentItems} />
        ) : layout === "icons" ? (
          <IconView groups={showAll ? [allGroup] : groups} activeGroup={showAll ? 0 : activeGroup} key={showAll ? "all" : activeGroup} />
        ) : (
          <GridView groups={showAll ? [allGroup] : groups} activeGroup={showAll ? 0 : activeGroup} key={showAll ? "all" : activeGroup} />
        )}
      </div>
    </AppLayout>
    {isDark && (
      <Suspense fallback={null}>
        <Starfield />
      </Suspense>
    )}
    </>
  );
}