// Lead intake: pure helpers for turning the extract-lead function's output into
// the account / contact / opportunity the Lead intake dialog saves.

export interface ExtractedLead {
  is_lead?: boolean;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  website?: string;
  city?: string;
  state?: string;
  business_type?: string;
  current_processor?: string;
  monthly_volume?: string;
  lead_source?: string;
  summary?: string;
  confidence?: "high" | "medium" | "low";
  email_subject?: string;
  email_body?: string;
}

/** The editable form the rep reviews before saving. */
export interface LeadForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  lead_source: string;
  notes: string;
  email_subject: string;
  email_body: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown, max = 200): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email.trim());

export const normaliseEmail = (email: string): string => email.trim().toLowerCase().replace(/^mailto:/, "");

/** Keep digits and the usual phone punctuation; drop anything else. */
export const normalisePhone = (phone: string): string =>
  phone.replace(/[^\d+()\-.\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);

/** Bare host, e.g. "https://www.Acme.com/about" -> "acme.com". Empty if it isn't a host. */
export function normaliseWebsite(website: string): string {
  const host = website
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

/** Context the AI found, kept on the lead as a note for whoever picks it up. */
export function buildLeadNotes(lead: ExtractedLead): string {
  const lines = [
    clean(lead.summary, 600),
    lead.title ? `Title: ${clean(lead.title)}` : "",
    lead.business_type ? `Business: ${clean(lead.business_type)}` : "",
    [lead.city, lead.state].some(Boolean) ? `Location: ${[clean(lead.city), clean(lead.state)].filter(Boolean).join(", ")}` : "",
    lead.current_processor ? `Current processor: ${clean(lead.current_processor)}` : "",
    lead.monthly_volume ? `Monthly volume: ${clean(lead.monthly_volume)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function leadToForm(lead: ExtractedLead): LeadForm {
  return {
    first_name: clean(lead.first_name, 100),
    last_name: clean(lead.last_name, 100),
    email: lead.email ? normaliseEmail(clean(lead.email, 255)) : "",
    phone: lead.phone ? normalisePhone(lead.phone) : "",
    company: clean(lead.company),
    website: lead.website ? normaliseWebsite(lead.website) : "",
    lead_source: clean(lead.lead_source, 100),
    notes: buildLeadNotes(lead),
    email_subject: clean(lead.email_subject, 200),
    email_body: typeof lead.email_body === "string" ? lead.email_body.replace(/\r\n/g, "\n").trim() : "",
  };
}

/** Company name, else the person's name, else the email. */
export function accountNameFor(form: Pick<LeadForm, "company" | "first_name" | "last_name" | "email">): string {
  return (
    form.company.trim() ||
    `${form.first_name.trim()} ${form.last_name.trim()}`.trim() ||
    normaliseEmail(form.email)
  );
}

/** What stops the lead being saved / the email being sent. Empty = good to go. */
export function leadProblems(form: LeadForm, { sending }: { sending: boolean }): string[] {
  const problems: string[] = [];
  if (!form.email.trim()) problems.push("Add the lead's email address.");
  else if (!isValidEmail(form.email)) problems.push("The email address doesn't look right.");
  else if (normaliseEmail(form.email).endsWith("@merchanthaus.io")) problems.push("That's a Merchant Haus address, not the lead's.");
  if (sending) {
    if (!form.email_subject.trim()) problems.push("Add a subject line.");
    if (!form.email_body.trim()) problems.push("The email body is empty.");
  }
  return problems;
}

/** Largest edge for a screenshot sent to the AI: plenty to read text, small to upload. */
export const MAX_IMAGE_EDGE = 1600;

export function scaledSize(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const k = maxEdge / longest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}
