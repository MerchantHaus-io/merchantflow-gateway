// Automated checks for one AI research result, from section 7 ("universal
// automated checks") of the outreach logic research, 24 Nov 2026.
//
// Pure TypeScript (no npm:/jsr:/Deno imports) so vitest can import it. It is an
// evaluation harness for the logic in outreach-prompt.ts: run it over real or
// recorded model output to see whether the prompt is being followed. It is
// stricter than emailIssue() (it also rejects rate/fee/save/guarantee), so it is
// deliberately NOT a send-time gate; emailIssue() remains the gate.

export const EMAIL_TOUCHES = [2, 5, 8, 11, 12] as const;

export interface CheckedDraft { touch_number: number; subject: string; text: string }
export interface CheckedFact { detail: string; source: string; about?: string }
export interface CheckedResult { summary: string; facts: CheckedFact[]; drafts: CheckedDraft[] }

export interface CheckOptions {
  /** Company website hostname, without www. Every fact URL must be on it. */
  host: string;
  /** Extra case-specific terms that must not appear anywhere (e.g. personal details on a team page). */
  forbidden?: string[];
}

const BANNED = /\d+(?:\.\d+)?\s*%|\bpercent\b|[$€£]|\bpricing\b|\bwholesale\b|\bmarkup\b|\bpartner cost\b|\bbasis points\b|\brates?\b|\bfees?\b|\bsav(?:e|es|ing|ings)\b|\bguarantee/i;
const STOCK_OPENERS = /came across|caught my eye/i;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

/** Returns a list of human-readable problems; an empty list means every check passed. */
export function draftIssues(result: CheckedResult, { host, forbidden = [] }: CheckOptions): string[] {
  const issues: string[] = [];
  const site = host.toLowerCase().replace(/^www\./, '');
  const numbers = result.drafts.map(d => d.touch_number).sort((a, b) => a - b);
  if (result.drafts.length !== 12 || numbers.some((n, i) => n !== i + 1)) issues.push('Expected exactly 12 drafts numbered 1 to 12');

  for (const d of result.drafts) {
    const label = `Touch ${d.touch_number}`;
    const all = `${d.subject}\n${d.text}`;
    if (EMAIL_TOUCHES.includes(d.touch_number as typeof EMAIL_TOUCHES[number])) {
      if (wordCount(d.text) >= 90) issues.push(`${label}: ${wordCount(d.text)} words (must be fewer than 90)`);
      const questions = (d.text.match(/\?/g) || []).length;
      if (questions !== 1) issues.push(`${label}: ${questions} question marks (must be exactly 1)`);
      if (!d.subject.trim() || /[\r\n]/.test(d.subject)) issues.push(`${label}: subject must be a single non-empty line`);
      if ([5, 11].includes(d.touch_number) && !/^Re: /.test(d.subject)) issues.push(`${label}: reply-thread subject must start with "Re: "`);
      if (/https?:\/\//i.test(d.text)) issues.push(`${label}: emails must not contain links`);
    }
    const banned = all.match(BANNED);
    if (banned) issues.push(`${label}: banned term "${banned[0]}"`);
    if (STOCK_OPENERS.test(all)) issues.push(`${label}: stock opener`);
    if (/[—–]/.test(all)) issues.push(`${label}: long dash`);
    for (const term of forbidden) if (all.toLowerCase().includes(term.toLowerCase())) issues.push(`${label}: forbidden term "${term}"`);
  }

  const t4 = result.drafts.find(d => d.touch_number === 4);
  if (t4 && !t4.text.includes('REP:')) issues.push('Touch 4: missing the "REP:" gate');
  // Rule 28 allows a skip-and-like recommendation instead of a comment.
  if (t4 && !t4.text.includes('Comment:') && !/like a (?:recent )?company post/i.test(t4.text)) issues.push('Touch 4: missing the "Comment:" label before the paste-ready comment');
  const t6 = result.drafts.find(d => d.touch_number === 6);
  if (t6 && !t6.text.includes('DO NOT LEAVE A VOICEMAIL')) issues.push('Touch 6: missing "DO NOT LEAVE A VOICEMAIL"');

  for (const f of result.facts) {
    const factHost = hostOf(f.source);
    // Exact match after stripping www, as outreach-ai does when it keeps sources.
    if (!factHost || factHost !== site) issues.push(`Fact source not on ${site}: ${f.source}`);
    if (/linkedin/i.test(f.source)) issues.push(`Fact sourced from LinkedIn: ${f.source}`);
    for (const term of forbidden) if (f.detail.toLowerCase().includes(term.toLowerCase())) issues.push(`Fact contains forbidden term "${term}"`);
  }
  if (!result.facts.length && !/low personali[sz]ation/i.test(result.summary)) issues.push('No facts, but the summary does not flag low personalisation');
  return issues;
}
