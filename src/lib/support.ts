import { LifeBuoy, CreditCard, Plug, Wrench, type LucideIcon } from "lucide-react";

export type TicketCategory = "support" | "billing" | "integration" | "technical";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "closed";

interface CategoryMeta {
  value: TicketCategory;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  description: string;
  badgeClass: string;
}

export const TICKET_CATEGORIES: CategoryMeta[] = [
  {
    value: "support",
    label: "Support Ticket",
    shortLabel: "Support",
    icon: LifeBuoy,
    description: "General support request",
    badgeClass: "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10",
  },
  {
    value: "billing",
    label: "Billing Query",
    shortLabel: "Billing",
    icon: CreditCard,
    description: "Invoices, charges, refunds & statements",
    badgeClass: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  {
    value: "integration",
    label: "Integration Assistance",
    shortLabel: "Integration",
    icon: Plug,
    description: "API, webhooks, plugins & SDKs",
    badgeClass: "border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-500/10",
  },
  {
    value: "technical",
    label: "Technical Assistance",
    shortLabel: "Technical",
    icon: Wrench,
    description: "Errors, outages & technical issues",
    badgeClass: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
];

interface PriorityMeta {
  value: TicketPriority;
  label: string;
  badgeClass: string;
}

export const TICKET_PRIORITIES: PriorityMeta[] = [
  { value: "low", label: "Low", badgeClass: "border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-400/10" },
  { value: "normal", label: "Normal", badgeClass: "border-sky-500/40 text-sky-600 dark:text-sky-400 bg-sky-500/10" },
  { value: "high", label: "High", badgeClass: "border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/10" },
  { value: "urgent", label: "Urgent", badgeClass: "border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10" },
];

interface StatusMeta {
  value: TicketStatus;
  label: string;
  badgeClass: string;
}

export const TICKET_STATUSES: StatusMeta[] = [
  { value: "open", label: "Open", badgeClass: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
  { value: "in_progress", label: "In Progress", badgeClass: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  { value: "closed", label: "Closed", badgeClass: "border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-400/10" },
];

export const categoryMeta = (value: string): CategoryMeta =>
  TICKET_CATEGORIES.find((c) => c.value === value) ?? TICKET_CATEGORIES[0];

export const priorityMeta = (value: string): PriorityMeta =>
  TICKET_PRIORITIES.find((p) => p.value === value) ?? TICKET_PRIORITIES[1];

export const statusMeta = (value: string): StatusMeta =>
  TICKET_STATUSES.find((s) => s.value === value) ?? TICKET_STATUSES[0];

/**
 * Split an email-style message into what the person wrote and the quoted
 * history underneath it ("On … wrote:", "-----Original Message-----", a
 * forwarded "From:" header, or a run of ">"-prefixed lines). Intake already
 * trims most of this, but replies that slip through can be thousands of
 * characters of repeated thread, which pushes the reply box off screen.
 */
export const splitQuotedText = (body: string): { main: string; quoted: string } => {
  const text = String(body ?? "");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startsQuote =
      /^\s*On .+wrote:\s*$/.test(line) ||
      /^\s*-{2,}\s*(Original|Forwarded) Message\s*-{2,}/i.test(line) ||
      (/^\s*From:\s.+/i.test(line) && i > 0) ||
      (/^\s*>/.test(line) && lines.slice(i).every((l) => /^\s*(>|$)/.test(l)));
    if (startsQuote) {
      const main = lines.slice(0, i).join("\n").trim();
      // Nothing above the quote: show it all rather than an empty message.
      if (!main) return { main: text.trim(), quoted: "" };
      return { main, quoted: lines.slice(i).join("\n").trim() };
    }
  }
  return { main: text.trim(), quoted: "" };
};

/** One line of plain text for a collapsed message. */
export const messagePreview = (body: string, max = 140): string => {
  const flat = splitQuotedText(body).main.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
