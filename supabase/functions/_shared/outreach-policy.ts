// Pure policy functions: safe for unit tests; no credentials or database calls.
export function emailIssue(subject: string, text: string): string | null {
  if (!subject.trim() || /[\r\n]/.test(subject)) return 'A single-line subject is required';
  if (!text.trim()) return 'A message is required';
  if (text.trim().split(/\s+/).length >= 90) return 'Emails must contain fewer than 90 words';
  if ((text.match(/\?/g) || []).length !== 1) return 'Include exactly one question';
  if (/[$€£]|\b(?:pricing|wholesale|markup|partner cost|basis points)\b|\d+(?:\.\d+)?\s*%/i.test(text)) return 'Remove prices, rates and internal costs';
  return null;
}
export function canSend(e: { status: string; assigned_user_id: string }, c: { status: string }, userId: string, pendingEarlier: boolean) {
  return e.status === 'active' && c.status === 'cadence_active' && e.assigned_user_id === userId && !pendingEarlier;
}
export function outreachWindow(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', hourCycle: 'h23' }).format(now));
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Johannesburg', weekday: 'short' }).format(now);
  return hour >= 16 && hour < 20 && !['Sat', 'Sun'].includes(day);
}
export function citationUrl(value: string): string | null {
  const safe = publicHttps(value.trim().replace(/^`+|`+$/g, ''));
  if (!safe) return null;
  const url = new URL(safe); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
  return url.href.replace(/\/$/, '');
}
export function withoutCitations(value: string) {
  return value.replace(/\s*\(?\[[^\]]+\]\(https:\/\/[^\s)]+\)\)?/g, '').trim();
}
export function manualOutcomeIssue(touchNumber: number, outcome: string, reply: string): string | null {
  if (touchNumber === 6 && outcome === 'voicemail') return 'Touch 6 is a different-slot call with no voicemail';
  if (['positive', 'maybe', 'not_interested', 'replied'].includes(outcome) && !reply.trim()) return 'Record the reply in the contact’s exact words';
  return null;
}
export function publicHttps(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || /^(?:\d+\.){3}\d+$/.test(h) || h.includes(':') || /(?:localhost|\.local|\.internal|\.test|\.invalid)$/.test(h)) return null;
    return u.href;
  } catch { return null; }
}
/**
 * Logic 2026-11-24.2, rule 26. A thin website (the model returned no facts) still
 * gets honest drafts, flagged so the rep adds a detail. Facts the model DID claim
 * but that could not be verified against the company site are a different case:
 * the drafts may lean on unverified claims, so nothing is saved.
 */
export function researchPersonalisation(modelFactCount: number, verifiedFactCount: number, summary: string): { error: string } | { personalisation: 'low' | 'normal'; summary: string } {
  if (modelFactCount > 0 && verifiedFactCount === 0) return { error: 'The AI’s company facts could not be verified against the company website; no drafts were saved' };
  if (modelFactCount > 0) return { personalisation: 'normal', summary };
  const flagged = /low personali[sz]ation/i.test(summary) ? summary : `Low personalisation: rep should add a detail. ${summary}`.trim();
  return { personalisation: 'low', summary: flagged };
}

export interface StoredAiDraft { subject: string; text: string }
/**
 * The previous AI output for one touch, as stored in research.ai_drafts. A re-run may
 * refresh a pending draft only when BOTH its subject and text still equal this, so any
 * rep edit (subject-only included) is preserved. Legacy string entries carry no subject
 * and are never refreshed.
 */
export function storedAiDraft(entry: unknown): StoredAiDraft | null {
  if (!entry || typeof entry !== 'object') return null;
  const { subject, text } = entry as Record<string, unknown>;
  return typeof subject === 'string' && typeof text === 'string' && text ? { subject, text } : null;
}

/**
 * Gmail search for ANY message from the contact since the cadence started. Catches
 * opt-outs that arrive outside the cadence thread, e.g. a List-Unsubscribe mailto
 * (a new message with subject "unsubscribe" and no In-Reply-To). Returns null when
 * the inputs cannot form a safe query.
 */
export function contactMailSearch(email: string, startOn: string | null | undefined): string | null {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@"'<>()]+@[^\s@"'<>()]+$/.test(address) || !startOn || !/^\d{4}-\d{2}-\d{2}$/.test(startOn)) return null;
  // Gmail's after: is day-granular; start one day early so a same-day opt-out is never missed.
  const day = new Date(`${startOn}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 1);
  return `from:${address} after:${day.toISOString().slice(0, 10).replace(/-/g, '/')}`;
}
