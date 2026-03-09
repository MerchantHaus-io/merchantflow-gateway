import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Briefcase, Building2, Users, FileText, BarChart3,
  Activity, BadgeDollarSign, Globe, BookOpen, BookMarked, ClipboardList,
  Calculator, Sparkles, FileSpreadsheet, Download, Cloud, Send, ListChecks,
  Settings,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { Carousel3D, type CarouselItem } from "@/components/home/Carousel3D";
import { cn } from "@/lib/utils";

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

export default function Home() {
  const { user } = useAuth();
  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [activeGroup, setActiveGroup] = useState(0);
  const currentItems = groups[activeGroup].items;

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
          <h1 className="text-2xl lg:text-3xl font-bold font-display text-foreground mb-1">
            {greeting}, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick access to everything you need.
          </p>
        </motion.div>

        {/* Category tabs */}
        <div className="flex justify-center gap-2 mb-2 flex-wrap">
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
        </div>

        {/* 3D Carousel */}
        <Carousel3D key={activeGroup} items={currentItems} />
      </div>
    </AppLayout>
  );
}
