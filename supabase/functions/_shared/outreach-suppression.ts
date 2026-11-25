// Outreach suppression helpers: address normalisation, a conservative
// "this reply is an unsubscribe request" classifier, and the service-role
// suppression lookup (public.outreach_email_suppressed, drizzle migration 0006).
//
// Pure TypeScript (no npm:/jsr:/Deno imports) so vitest can import it.
// The RPC client is structural so any supabase-js client satisfies it.

/** trim + lower-case; null when empty or there is no '@' after the first character. */
export function normalizeOutreachEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase();
  if (!email || email.indexOf('@') <= 0) return null;
  return email;
}

const decodeEntities = (value: string) =>
  value
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');

/** Lower-case, drop apostrophes (don't -> dont), turn other punctuation into spaces, collapse. */
function normalizePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUBJECT_PHRASES = new Set(['unsubscribe', 'unsubscribe me', 'remove me', 'stop']);

const BODY_CORE_PHRASES = new Set([
  'unsubscribe',
  'unsubscribe me',
  'unsubscribe me from your list',
  'unsubscribe me from this list',
  'unsubscribe me from the list',
  'unsubscribe me from your mailing list',
  'remove me',
  'remove me from list',
  'remove me from your list',
  'remove me from this list',
  'remove me from the list',
  'remove me from your mailing list',
  'remove me from your email list',
  'stop',
  'stop emailing me',
  'stop emailing',
  'stop sending me emails',
  'stop sending me these',
  'stop sending me these emails',
  'stop sending these',
  'stop sending these emails',
  'stop sending emails',
  'stop contacting me',
  'take me off your list',
  'take me off this list',
  'take me off the list',
  'take me off your mailing list',
  'take me off your email list',
  'opt out',
  'opt me out',
]);

const NEGATION = /\b(dont|do not|not|never|doesnt|isnt|wont|cant)\b/;
const TRAILING_COURTESY = /(?:\s|^)(?:thanks|thank you|thx|cheers)$/;
// Courtesy that may precede the request: "No thanks, remove me", "Not interested, please
// remove me", "Thanks, but please remove me".
const LEADING_COURTESY = /^(?:(?:no|not interested)(?: thanks| thank you)?|(?:thanks|thank you|thx)(?: but)?)\s+/;
const COURTESY_ONLY = /^(?:(?:ok|okay|no|thanks|thank you|thx|cheers|no thanks|no thank you)\s*)*$/;

/**
 * Strips courtesy around the phrase (trailing thanks, a leading "no thanks" /
 * "not interested", "please"), THEN applies the negation guard to what is left,
 * so "not interested, remove me" passes and "do not remove me" does not.
 */
function isOptOutPhrase(phrase: string, allowed: Set<string>): boolean {
  let core = phrase;
  let previous = '';
  while (previous !== core) {
    previous = core;
    core = core.replace(TRAILING_COURTESY, '').trim();
    core = core.replace(LEADING_COURTESY, '').trim();
    core = core.replace(/^please\s+/, '').replace(/\s+please$/, '').trim();
  }
  if (!core || NEGATION.test(core)) return false;
  return allowed.has(core);
}

/**
 * Cuts quoted reply text and mail-client tails: from the first line starting with
 * '>', or the earliest of an "On … wrote:" marker, "Sent from my …", "Get Outlook
 * for …", "--Original Message" (any run of 2+ dashes), Outlook's long rule of 10+
 * underscores, or a forwarded "From: … Sent:" header. A short free-text dash run
 * ("Unsubscribe ---- just kidding") deliberately does NOT cut, and there is no
 * "-- Name" signature rule: "Unsubscribe -- Jane" stays false (falls back to 'replied'). Snippets are one line, so markers are
 * matched anywhere in a line, not only at its start.
 */
const TAIL_MARKERS = [/\bOn\s.{0,200}?wrote:/i, /\bSent from my\b/i, /\bGet Outlook for\b/i, /-{2,}\s*original message/i, /_{10,}/, /\bFrom:\s[\s\S]{0,300}?\bSent:/i];
function stripQuoted(body: string): string {
  const kept: string[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*>/.test(line)) break;
    const cuts = TAIL_MARKERS.map(re => line.search(re)).filter(i => i >= 0);
    if (cuts.length) { kept.push(line.slice(0, Math.min(...cuts))); break; }
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * True only when the reply is essentially nothing but an opt-out request.
 *  - Body: once quoted text and client signatures are cut, the whole message is an
 *    allow-listed opt-out phrase (with optional courtesy around it).
 *  - Subject: exactly an opt-out word (after Re:/Fwd: prefixes) counts only when the
 *    cleaned body is empty, courtesy-only, or itself an opt-out. Any other body
 *    vetoes it: our List-Unsubscribe mailto pre-fills the subject "unsubscribe",
 *    so a contact can send that subject with "Actually I'm interested, call me".
 *  - A question ("Unsubscribe?", "remove me?") is never an opt-out: missing one
 *    only falls back to 'replied', a false opt-out loses a lead.
 * Anything negated, longer, or merely containing the word is false.
 */
export function isUnsubscribeRequest(subject?: string | null, snippet?: string | null): boolean {
  const rawBody = typeof snippet === 'string' ? stripQuoted(decodeEntities(snippet)).trim() : '';
  const body = normalizePhrase(rawBody);
  const bodyOptOut = Boolean(body) && !rawBody.includes('?') && isOptOutPhrase(body, BODY_CORE_PHRASES);
  if (bodyOptOut) return true;
  if (typeof subject !== 'string' || !subject.trim()) return false;
  let s = decodeEntities(subject).trim();
  let previous = '';
  while (previous !== s) { previous = s; s = s.replace(/^\s*(re|fwd?|fw)\s*(\[\d+\])?\s*:\s*/i, ''); }
  if (s.includes('?') || !isOptOutPhrase(normalizePhrase(s), SUBJECT_PHRASES)) return false;
  return COURTESY_ONLY.test(body);
}

export type RpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/**
 * Asks public.outreach_email_suppressed (service_role only). Fails closed:
 * a missing tenant, an unusable address, or an RPC error all throw, so the
 * caller refuses to send/enrol rather than treating the address as clear.
 */
export async function isAddressSuppressed(client: RpcClient, tenant: string | null | undefined, email: unknown): Promise<boolean> {
  if (!tenant) throw new Error('Suppression check needs an organisation');
  const normalized = normalizeOutreachEmail(email);
  if (!normalized) throw new Error('Suppression check needs a valid email address');
  const { data, error } = await client.rpc('outreach_email_suppressed', { p_tenant: tenant, p_email: normalized });
  if (error) {
    const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : String(error);
    throw new Error(`Suppression check failed: ${message}`);
  }
  return data === true;
}

/** Postgres unique_violation — an existing suppression row, which is the outcome we wanted. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}
