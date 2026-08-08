import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  ClipboardList,
  Cloud,
  CreditCard,
  Download,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Globe,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MessageSquarePlus,
  ScanSearch,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { pathMatchDepth } from "@/lib/routeMatch";

/**
 * The application's navigation tree — one definition, every surface (#115).
 *
 * There used to be three copies: MegaMenuHeader.navMain (dead since the mega
 * menu was replaced by the icon rail, but still shipping ~90 lines and thirty
 * icon imports), IconRailSidebar.navMain, and MobileBottomNav.GROUPS. They had
 * already drifted — mobile was missing Statement Analyzer from Tools and had a
 * Notifications entry desktop didn't, and desktop's Calendar entry carried a
 * Calculator icon. Both real pages, so this file is their union; the icon is
 * fixed.
 *
 * Adding a page is now one entry here rather than three edits and a guess about
 * which surfaces you forgot.
 */

/** Where an entry should appear. Defaults to every surface. */
export type NavSurface = "rail" | "launcher";

export interface NavItem {
  title: string;
  /**
   * Label for the mobile launcher grid, where a tile is ~78px wide and
   * anything longer than about twelve characters clamps to two truncated
   * lines (#156). Falls back to `title`.
   */
  mobileTitle?: string;
  url: string;
  icon: LucideIcon;
  description?: string;
  /** Opens in a new tab / the system browser rather than routing. */
  external?: boolean;
  /** Hidden unless the signed-in user is an admin. */
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  url: string;
  icon: LucideIcon;
  items: NavItem[];
  /** Omit to show everywhere. */
  surfaces?: NavSurface[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Pipeline",
    url: "/pipeline",
    icon: LayoutDashboard,
    items: [
      { title: "Pipeline Board", mobileTitle: "Board", url: "/pipeline", icon: LayoutDashboard, description: "Opportunity kanban board" },
      { title: "All Opportunities", mobileTitle: "Deals", url: "/opportunities", icon: Briefcase, description: "Browse & search all opportunities" },
      { title: "Quotes & Contracts", mobileTitle: "Quotes", url: "/quotes-contracts", icon: FileSignature, description: "Quote & signature status across every opportunity" },
      { title: "Tasks", url: "/tasks", icon: ListChecks, description: "Manage your tasks" },
      { title: "Email Outreach", mobileTitle: "Outreach", url: "/outreach", icon: Send, description: "Campaign tracker & email sender" },
      { title: "Web Submissions", mobileTitle: "Web Subs", url: "/admin/web-submissions", icon: Globe, description: "Incoming merchant applications" },
    ],
  },
  {
    title: "CRM",
    url: "/leads",
    icon: UserPlus,
    items: [
      { title: "Leads", url: "/leads", icon: UserPlus, description: "New prospects & account list" },
      { title: "Contacts", url: "/contacts", icon: Users, description: "Manage contacts" },
      // Calendar carried a Calculator icon on the rail — a copy-paste from the
      // Tools group that survived into both desktop copies.
      { title: "Calendar", url: "/calendar", icon: Calendar, description: "Team calendar & meetings" },
      { title: "Documents", mobileTitle: "Docs", url: "/documents", icon: FileText, description: "View uploaded documents" },
      // Was mobile-only before this file existed.
      { title: "Notifications", mobileTitle: "Alerts", url: "/notifications", icon: Bell, description: "Your notification history" },
    ],
  },
  {
    title: "Merchants",
    url: "/live-billing",
    icon: Building2,
    items: [
      { title: "Live & Billing", mobileTitle: "Billing", url: "/live-billing", icon: BadgeDollarSign, description: "Live accounts & billing" },
      { title: "Transactions", mobileTitle: "Txns", url: "/reports/transactions", icon: CreditCard, description: "NMI gateway transactions" },
      { title: "Commissions", mobileTitle: "Comms", url: "/commissions", icon: BadgeDollarSign, description: "Partner commission reports" },
      { title: "Pricing", url: "/pricing", icon: Calculator, description: "Pricing tiers & buy rates" },
      { title: "Supported Processors", mobileTitle: "Processors", url: "/supported-processors", icon: Globe, description: "Processor compatibility reference" },
    ],
  },
  {
    title: "Support",
    url: "/support",
    icon: LifeBuoy,
    items: [
      { title: "Support Triage", mobileTitle: "Triage", url: "/support", icon: LifeBuoy, description: "Live ticket queue — claim & resolve client tickets" },
      { title: "Client Request Form", mobileTitle: "Request Form", url: "/support-request", icon: MessageSquarePlus, description: "Public support request page to share with clients", external: true },
    ],
  },
  {
    title: "Reports",
    url: "/reports",
    icon: BarChart3,
    items: [
      { title: "Analytics", url: "/reports", icon: BarChart3, description: "Performance & pipeline analytics" },
      { title: "System Status", mobileTitle: "Status", url: "https://statusgator.com/services/nmi", icon: Activity, description: "Live NMI & platform status", external: true },
    ],
  },
  {
    title: "Tools",
    url: "/tools/nmi-boarding",
    icon: Wrench,
    items: [
      { title: "Board Merchant", mobileTitle: "Boarding", url: "/tools/nmi-boarding", icon: BadgeDollarSign, description: "Board merchants via NMI gateway" },
      { title: "Kurv / MyPortfolio", mobileTitle: "Kurv", url: "/tools/kurv", icon: BadgeDollarSign, description: "EMS boarding, roster & transactions" },
      { title: "Pre-Qualification Wizard", mobileTitle: "Pre-Qual", url: "/tools/preboarding-wizard", icon: ClipboardList, description: "Application readiness form" },
      // Was desktop-only before this file existed.
      { title: "Statement Analyzer", mobileTitle: "Statements", url: "/tools/statement-analysis", icon: ScanSearch, description: "Analyze a statement, benchmark fees & build a savings proposal" },
      { title: "Revenue Calculator", mobileTitle: "Revenue", url: "/tools/revenue-calculator", icon: Calculator, description: "Estimate processing revenue" },
      { title: "CSV Import", mobileTitle: "Import", url: "/tools/csv-import", icon: FileSpreadsheet, description: "Bulk import data" },
      { title: "Quote Builder", mobileTitle: "Builder", url: "/tools/quote-builder", icon: FileSignature, description: "Generate gateway quotes from an opportunity" },
    ],
  },
  {
    title: "Admin",
    url: "/sop",
    icon: BookOpen,
    items: [
      { title: "SOP", url: "/sop", icon: BookOpen, description: "Standard operating procedures" },
      { title: "Training", url: "/training", icon: GraduationCap, description: "Onboarding guide for the Ops Terminal" },
      { title: "CRM Updates", mobileTitle: "Updates", url: "/tools/terminal-updates", icon: Activity, description: "Latest changes & features" },
      { title: "Administration", mobileTitle: "Admin", url: "/admin/administration", icon: Activity, description: "Agenda, popups & session tracking" },
      { title: "Team Roster", mobileTitle: "Roster", url: "/admin/team-roster", icon: Users, description: "Manage the internal team roster" },
      { title: "Gateway Accounts", mobileTitle: "Gateways", url: "/admin/gateway-accounts", icon: BadgeDollarSign, description: "NMI partner gateway account inventory" },
      { title: "Integrations", mobileTitle: "Integrate", url: "/integrations", icon: Cloud, description: "Connected services & API providers" },
      { title: "Affiliates", url: "/admin/affiliates", icon: Handshake, description: "External affiliate partners & commissions" },
      { title: "Data Export", mobileTitle: "Export", url: "/admin/data-export", icon: Download, description: "Export opportunity data" },
      { title: "Merchant Portal Guide", mobileTitle: "Portal Guide", url: "/tools/gateway-guide", icon: BookMarked, description: "Interactive portal walkthrough" },
      { title: "Deployment", mobileTitle: "Deploy", url: "/tools/netlify", icon: Cloud, description: "Deployment audit & fix prompts" },
      { title: "Deletion Requests", mobileTitle: "Deletions", url: "/admin/deletion-requests", icon: Trash2, description: "Review pending record deletions", adminOnly: true },
    ],
  },
  {
    // The rail reaches Settings through the profile menu at its foot; the
    // launcher has no equivalent, so this group is launcher-only rather than
    // an eighth rail icon.
    title: "System",
    url: "/settings",
    icon: Settings,
    surfaces: ["launcher"],
    items: [{ title: "Settings", url: "/settings", icon: Settings, description: "Preferences & integrations" }],
  },
];

/**
 * The four tabs pinned to the mobile bottom bar.
 *
 * The first tab was titled "Pipeline" but pointed at "/", which renders Home —
 * while the launcher carried a separate "Pipeline Board" entry pointing at the
 * actual board. Two items, same name, different pages (#135).
 */
export const MOBILE_PRIMARY: NavItem[] = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Deals", url: "/opportunities", icon: Briefcase },
  { title: "Tasks", url: "/tasks", icon: ListChecks },
  { title: "Leads", url: "/leads", icon: UserPlus },
];

export function groupsForSurface(surface: NavSurface): NavGroup[] {
  return NAV_GROUPS.filter((g) => !g.surfaces || g.surfaces.includes(surface));
}

/** Every routable (non-external) destination, deduplicated by URL. */
export const ALL_NAV_ITEMS: NavItem[] = (() => {
  const seen = new Map<string, NavItem>();
  for (const item of [...MOBILE_PRIMARY, ...NAV_GROUPS.flatMap((g) => g.items)]) {
    if (!seen.has(item.url)) seen.set(item.url, item);
  }
  return [...seen.values()];
})();

/**
 * The single group that owns a path, or null.
 *
 * Most specific wins: /reports/transactions belongs to Merchants (which lists
 * that exact URL), not Reports (which lists /reports) — see #108.
 */
export function activeGroupFor(pathname: string): NavGroup | null {
  let best: { group: NavGroup; depth: number } | null = null;

  for (const group of NAV_GROUPS) {
    const urls = [group.url, ...group.items.filter((i) => !i.external).map((i) => i.url)];
    for (const url of urls) {
      const depth = pathMatchDepth(pathname, url);
      if (depth > (best?.depth ?? -1)) best = { group, depth };
    }
  }

  return best?.group ?? null;
}

/** The most specific nav item owning a path, or null. */
export function activeItemFor(pathname: string): NavItem | null {
  let best: { item: NavItem; depth: number } | null = null;

  for (const item of ALL_NAV_ITEMS) {
    if (item.external) continue;
    const depth = pathMatchDepth(pathname, item.url);
    if (depth > (best?.depth ?? -1)) best = { item, depth };
  }

  return best?.item ?? null;
}
