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