import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Briefcase,
  Building2,
  Users,
  FileText,
  BarChart3,
  Activity,
  BadgeDollarSign,
  Globe,
  BookOpen,
  BookMarked,
  ClipboardList,
  Calculator,
  Sparkles,
  FileSpreadsheet,
  Download,
  Cloud,
  Send,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  color: "primary" | "teal" | "gold" | "success" | "warning";
  external?: boolean;
}

interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const groups: ShortcutGroup[] = [
  {
    title: "Pipeline & Sales",
    items: [
      { title: "Pipeline Board", description: "Manage live opportunities", url: "/", icon: LayoutDashboard, color: "primary" },
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

const orbColors = {
  primary: "bg-primary/12 shadow-[0_0_20px_hsl(348_83%_47%/0.25)] group-hover:shadow-[0_0_30px_hsl(348_83%_47%/0.45)] group-hover:bg-primary/20",
  teal: "bg-teal/12 shadow-[0_0_20px_hsl(174_72%_46%/0.25)] group-hover:shadow-[0_0_30px_hsl(174_72%_46%/0.45)] group-hover:bg-teal/20",
  gold: "bg-gold/12 shadow-[0_0_20px_hsl(43_51%_58%/0.25)] group-hover:shadow-[0_0_30px_hsl(43_51%_58%/0.45)] group-hover:bg-gold/20",
  success: "bg-success/12 shadow-[0_0_20px_hsl(142_76%_36%/0.25)] group-hover:shadow-[0_0_30px_hsl(142_76%_36%/0.45)] group-hover:bg-success/20",
  warning: "bg-warning/12 shadow-[0_0_20px_hsl(38_92%_50%/0.25)] group-hover:shadow-[0_0_30px_hsl(38_92%_50%/0.45)] group-hover:bg-warning/20",
} as const;

const iconColors = {
  primary: "text-primary",
  teal: "text-teal",
  gold: "text-gold",
  success: "text-success",
  warning: "text-warning",
} as const;

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 24 } },
};

function ShortcutTile({ item, index }: { item: ShortcutItem; index: number }) {
  const navigate = useNavigate();

  return (
    <motion.button
      variants={itemVariants}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97 }}
      onClick={() => {
        if (item.external) {
          window.open(item.url, "_blank");
        } else {
          navigate(item.url);
        }
      }}
      className={cn(
        "group relative flex items-start gap-3.5 rounded-xl border border-border/50 p-4 text-left",
        "bg-card/60 backdrop-blur-sm",
        "transition-all duration-300 cursor-pointer",
        "hover:border-primary/30 hover:bg-card/90",
        "hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]",
        "shadow-[0_2px_8px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      )}
    >
      {/* Accent line */}
      <div className={cn(
        "absolute inset-x-0 top-0 h-px rounded-t-xl transition-opacity duration-300 opacity-0 group-hover:opacity-100",
        item.color === "primary" && "bg-gradient-to-r from-transparent via-primary/60 to-transparent",
        item.color === "teal" && "bg-gradient-to-r from-transparent via-teal/60 to-transparent",
        item.color === "gold" && "bg-gradient-to-r from-transparent via-gold/60 to-transparent",
        item.color === "success" && "bg-gradient-to-r from-transparent via-success/60 to-transparent",
        item.color === "warning" && "bg-gradient-to-r from-transparent via-warning/60 to-transparent",
      )} />

      {/* Icon orb */}
      <div className={cn(
        "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300",
        orbColors[item.color]
      )}>
        <item.icon className={cn("h-5 w-5 transition-transform duration-300 group-hover:scale-110", iconColors[item.color])} />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground font-display leading-tight mb-0.5">
          {item.title}
        </div>
        <p className="text-xs text-muted-foreground leading-snug line-clamp-1">
          {item.description}
        </p>
      </div>
    </motion.button>
  );
}

export default function Home() {
  const { user } = useAuth();
  const userEmail = user?.email?.toLowerCase() || "";
  const displayName = EMAIL_TO_USER[userEmail] || user?.email?.split("@")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* Hero greeting */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-8 lg:mb-12"
        >
          <h1 className="text-2xl lg:text-3xl font-bold font-display text-foreground mb-1">
            {greeting}, <span className="text-primary">{displayName}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick access to everything you need.
          </p>
        </motion.div>

        {/* Shortcut groups */}
        <div className="space-y-8">
          {groups.map((group, groupIdx) => (
            <motion.section
              key={group.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: groupIdx * 0.08 }}
            >
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 pl-1">
                {group.title}
              </h2>
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              >
                {group.items.map((item, i) => (
                  <ShortcutTile key={item.url} item={item} index={i} />
                ))}
              </motion.div>
            </motion.section>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
