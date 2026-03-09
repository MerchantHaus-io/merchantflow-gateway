import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Briefcase, Building2, Users, FileText, BarChart3,
  Activity, BadgeDollarSign, Globe, BookOpen, BookMarked, ClipboardList,
  Calculator, Sparkles, FileSpreadsheet, Download, Cloud, Send, ListChecks,
  Settings, LayoutGrid, Box, CircleDot,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { Carousel3D, type CarouselItem } from "@/components/home/Carousel3D";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

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
  primary: "text-primary",
  teal: "text-teal",
  gold: "text-gold",
  success: "text-success",
  warning: "text-warning",
};

const bgColorMap: Record<string, string> = {
  primary: "bg-primary/15",
  teal: "bg-teal/15",
  gold: "bg-gold/15",
  success: "bg-success/15",
  warning: "bg-warning/15",
};

const glowColorMap: Record<string, string> = {
  primary: "shadow-[0_0_20px_hsl(348_83%_47%/0.25)]",
  teal: "shadow-[0_0_20px_hsl(174_72%_46%/0.25)]",
  gold: "shadow-[0_0_20px_hsl(43_51%_58%/0.25)]",
  success: "shadow-[0_0_20px_hsl(142_76%_36%/0.25)]",
  warning: "shadow-[0_0_20px_hsl(38_92%_50%/0.25)]",
};

const borderColorMap: Record<string, string> = {
  primary: "border-primary/30",
  teal: "border-teal/30",
  gold: "border-gold/30",
  success: "border-success/30",
  warning: "border-warning/30",
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
            "group relative flex flex-col items-center gap-2 p-4 rounded-xl border border-border/40",
            "bg-card/90 dark:bg-card/70 backdrop-blur-sm hover:bg-card hover:border-border transition-all duration-200",
            "cursor-pointer text-center",
            "w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)] xl:w-[calc(20%-10px)]",
            glowColorMap[item.color],
          )}
        >
          <div className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center border border-white/10",
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
      className="flex flex-wrap justify-center gap-x-6 gap-y-6 mt-6"
    >
      {items.map((item, i) => (
        <motion.button
          key={item.url}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.035, duration: 0.3 }}
          onClick={() => item.external ? window.open(item.url, "_blank") : navigate(item.url)}
          className="group flex flex-col items-center gap-2.5 cursor-pointer focus:outline-none w-20 sm:w-24"
        >
          {/* Large icon orb */}
          <div
            className={cn(
              "w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl flex items-center justify-center",
              "border transition-all duration-300",
              "group-hover:scale-110 group-hover:shadow-lg group-active:scale-95",
              bgColorMap[item.color],
              borderColorMap[item.color],
              glowColorMap[item.color],
              "group-hover:brightness-110",
            )}
          >
            <item.icon
              className={cn("h-7 w-7 sm:h-8 sm:w-8 transition-transform duration-300", iconColorMap[item.color])}
              strokeWidth={1.6}
            />
          </div>

          {/* Title */}
          <span className="text-xs font-bold text-foreground leading-tight text-center font-display">
            {item.title}
          </span>

          {/* Subtitle */}
          <span className="text-[10px] text-muted-foreground leading-tight text-center -mt-1">
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
  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [activeGroup, setActiveGroup] = useState(0);
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [loaded, setLoaded] = useState(false);

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
        setLoaded(true);
      });
  }, [user?.id]);

  // Cycle layout & persist
  const cycleLayout = () => {
    const idx = layoutCycle.indexOf(layout);
    const next = layoutCycle[(idx + 1) % layoutCycle.length];
    setLayout(next);
    if (user?.id) {
      supabase.from("profiles").update({ home_layout: next } as any).eq("id", user.id).then();
    }
  };

  const currentItems = groups[activeGroup].items;
  const NextIcon = layoutIcons[layoutCycle[(layoutCycle.indexOf(layout) + 1) % layoutCycle.length]];
  const nextLabel = layoutLabels[layoutCycle[(layoutCycle.indexOf(layout) + 1) % layoutCycle.length]];

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* Hero greeting */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center mb-4"
        >
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-1">
            {greeting}, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick access to everything you need.
          </p>
        </motion.div>

        {/* Category tabs + layout toggle */}
        <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
          {groupKeys.map((title, idx) => (
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

          {/* View toggle — cycles grid → icons → carousel */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full border border-border/40 ml-1"
            onClick={cycleLayout}
            title={`Switch to ${nextLabel}`}
          >
            <NextIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>

        {/* Content */}
        {layout === "carousel" ? (
          <Carousel3D key={activeGroup} items={currentItems} />
        ) : layout === "icons" ? (
          <IconView groups={groups} activeGroup={activeGroup} />
        ) : (
          <GridView groups={groups} activeGroup={activeGroup} />
        )}
      </div>
    </AppLayout>
  );
}