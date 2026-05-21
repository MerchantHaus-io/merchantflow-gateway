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
