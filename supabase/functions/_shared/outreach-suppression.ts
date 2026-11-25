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
    .replace(/[‘’'`]/g, '')
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
  'unsubscribe me from your mailing list',
  'remove me',
  'remove me from your list',
  'remove me from this list',
  'remove me from your mailing list',
  'remove me from your email list',
  'stop',
  'stop emailing me',
  'stop emailing',
  'stop sending me emails',
  'take me off your list',
  'take me off this list',
  'take me off your mailing list',
  'take me off your email list',
  'opt out',
  'opt me out',
]);

const NEGATION = /\b(dont|do not|not|never|doesnt|isnt|wont|cant)\b/;

function isOptOutPhrase(phrase: string, allowed: Set<string>): boolean {
  if (!phrase || NEGATION.test(phrase)) return false;
  let core = phrase.replace(/\s*\b(thanks|thank you|thx|cheers)$/, '').trim();
  core = core.replace(/^please\s+/, '').replace(/\s+please$/, '').trim();
  return allowed.has(core);
}

/** Cuts quoted reply text: from the first line starting with '>' or an "On … wrote:" marker. */
function stripQuoted(body: string): string {
  const kept: string[] = [];
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*>/.test(line)) break;
    const marker = line.search(/\bOn\s.{0,200}?wrote:/i);
    if (marker >= 0) { kept.push(line.slice(0, marker)); break; }
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * True only when the reply is essentially nothing but an opt-out request: the
 * subject (minus Re:/Fwd: prefixes) is exactly an opt-out word, or the body,
 * once quoted text is cut, is a whole-message opt-out phrase from the
 * allow-list. Anything negated, longer, or merely containing the word is false.
 */
export function isUnsubscribeRequest(subject?: string | null, snippet?: string | null): boolean {
  if (typeof subject === 'string' && subject.trim()) {
    let s = decodeEntities(subject).trim();
    let previous = '';
    while (previous !== s) { previous = s; s = s.replace(/^\s*(re|fwd?|fw)\s*(\[\d+\])?\s*:\s*/i, ''); }
    if (isOptOutPhrase(normalizePhrase(s), SUBJECT_PHRASES)) return true;
  }
  if (typeof snippet === 'string' && snippet.trim()) {
    const body = normalizePhrase(stripQuoted(decodeEntities(snippet)));
    if (isOptOutPhrase(body, BODY_CORE_PHRASES)) return true;
  }
  return false;
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
