import { LifeBuoy, CreditCard, Plug, Wrench, type LucideIcon } from "lucide-react";

export type TicketCategory = "support" | "billing" | "integration" | "technical";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketStatus = "open" | "in_progress" | "closed" | "spam";

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

/**
 * The statuses a person picks from (status select, filters). Spam is not one of
 * them: moving a ticket to or from spam is its own action ("Mark as spam" /
 * "Restore"), so it can't be chosen by accident, and the requester is never
 * emailed about it.
 */
export const TICKET_STATUSES: StatusMeta[] = [
  { value: "open", label: "Open", badgeClass: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
  { value: "in_progress", label: "In Progress", badgeClass: "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  { value: "closed", label: "Closed", badgeClass: "border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-400/10" },
];

export const SPAM_STATUS: StatusMeta = {
  value: "spam",
  label: "Spam",
  badgeClass: "border-rose-500/40 text-rose-600 dark:text-rose-400 bg-rose-500/10",
};

const ALL_STATUSES: StatusMeta[] = [...TICKET_STATUSES, SPAM_STATUS];

export const categoryMeta = (value: string): CategoryMeta =>
  TICKET_CATEGORIES.find((c) => c.value === value) ?? TICKET_CATEGORIES[0];

export const priorityMeta = (value: string): PriorityMeta =>
  TICKET_PRIORITIES.find((p) => p.value === value) ?? TICKET_PRIORITIES[1];

export const statusMeta = (value: string): StatusMeta =>
  ALL_STATUSES.find((s) => s.value === value) ?? TICKET_STATUSES[0];

/** Why a ticket is spam: `support_tickets.spam_reason`, set by the DB trigger. */
export const spamReasonLabel = (reason: string | null | undefined): string =>
  reason === "blocked_domain" ? "Blocked domain" : "Marked manually";

// ── Blocked sender domains ────────────────────────────────────────────────

/**
 * Lower-case domain of an address or a From header ("Name <a@b.com>"), or null.
 * Mirrors `public.support_email_domain()`.
 */
export const emailDomain = (email: string | null | undefined): string | null => {
  const m = String(email ?? "").match(/@([^@\s<>,;"]+)/);
  if (!m) return null;
  const d = m[1].toLowerCase().replace(/\.+$/, "");
  return d || null;
};

/**
 * What the database will store for a typed domain. Mirrors
 * `support_blocked_domains_normalise()`: trimmed, lower-cased, a pasted address
 * reduced to its domain, a leading "@" or "*." and a trailing "." dropped.
 */
export const normaliseBlockedDomain = (input: string): string => {
  let d = String(input ?? "").trim().toLowerCase();
  if (d.includes("@")) d = emailDomain(d) ?? d;
  d = d.replace(/^(\*\.)+/, "").replace(/\.+$/, "");
  return d;
};

/** Same shape the `support_blocked_domains_domain_format` CHECK enforces. */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Our own domains — blocking one would send the team's own mail to spam. */
export const INTERNAL_DOMAINS = ["merchanthaus.io"];

/**
 * Shared mailbox providers. Blocking one would spam every real customer who
 * writes in from that provider, so the UI refuses it. Regional variants of the
 * big providers (yahoo.co.uk, hotmail.fr, …) are matched by pattern below.
 */
export const FREE_MAIL_DOMAINS = [
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "ymail.com", "rocketmail.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.net", "mail.com", "zoho.com", "yandex.com",
  "btinternet.com", "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
];

const FREE_MAIL_PATTERNS = [/^(yahoo|hotmail|outlook|live|gmx|yandex)\.[a-z]{2,3}(\.[a-z]{2})?$/];

/**
 * Registry suffixes that pass the domain-format CHECK but are not one
 * organisation: blocking "co.uk" would block every .co.uk sender.
 */
const PUBLIC_SUFFIX_RE = /^(co|com|org|net|gov|ac|edu|ltd|plc|me)\.[a-z]{2}$/;

const isOrUnder = (domain: string, parent: string) =>
  domain === parent || domain.endsWith(`.${parent}`);

export type BlockDomainCheck =
  | { ok: true; domain: string; reason?: undefined; message?: undefined }
  | { ok: false; domain: string; reason: "empty" | "invalid" | "internal" | "free_mail" | "public_suffix"; message: string };

/**
 * Whether a domain may be blocked, on the normalised value. Refuses our own
 * domain, shared free-mail providers and bare registry suffixes, because
 * blocking any of them would move real customers' mail to spam.
 */
export const checkBlockableDomain = (input: string): BlockDomainCheck => {
  const domain = normaliseBlockedDomain(input);
  if (!domain) return { ok: false, domain, reason: "empty", message: "Enter a domain, e.g. example.com." };
  if (!DOMAIN_RE.test(domain)) {
    return { ok: false, domain, reason: "invalid", message: `"${domain}" is not a valid domain.` };
  }
  if (INTERNAL_DOMAINS.some((d) => isOrUnder(domain, d))) {
    return {
      ok: false,
      domain,
      reason: "internal",
      message: `${domain} is our own domain — blocking it would send the team's own mail to spam.`,
    };
  }
  if (FREE_MAIL_DOMAINS.includes(domain) || FREE_MAIL_PATTERNS.some((re) => re.test(domain))) {
    return {
      ok: false,
      domain,
      reason: "free_mail",
      message: `${domain} is a shared mail provider — blocking it would send every customer who uses it to spam. Mark the individual tickets as spam instead.`,
    };
  }
  if (PUBLIC_SUFFIX_RE.test(domain)) {
    return {
      ok: false,
      domain,
      reason: "public_suffix",
      message: `${domain} is a registry suffix, not one organisation — blocking it would catch every sender under it.`,
    };
  }
  return { ok: true, domain };
};

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
