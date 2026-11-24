/**
 * Client helpers for the outreach-ai edge function: per-contact research that
 * populates the 12 cadence drafts, and a HubSpot-style bulk action that runs it
 * over the uploaded list one contact at a time.
 *
 * The research logic itself lives server-side in
 * supabase/functions/_shared/outreach-prompt.ts (the swap point).
 */

export type ResearchStatus = number | 'denied';

/** Error thrown by streamResearch. status is 'denied' for 402/403 (provider/credit denial). */
export class ResearchError extends Error {
  status: ResearchStatus;
  constructor(message: string, status: ResearchStatus) {
    super(message);
    this.name = 'ResearchError';
    this.status = status;
  }
}

export interface ResearchEnrollment {
  id: string;
  status: string;
  research_status?: string | null;
  website_url?: string | null;
}

export interface StreamResearchOptions {
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface StreamResearchResult {
  saved: number;
  /** 'low' when the site gave nothing citable (logic rule 26); drafts need a rep-added detail. */
  personalisation?: 'low' | 'normal';
}

const toStatus = (status: unknown, fallback: number): ResearchStatus => {
  const n = typeof status === 'number' ? status : fallback;
  return n === 402 || n === 403 ? 'denied' : n;
};

function httpsUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** Shared eligibility rule for single and bulk research. */
export function eligibleForResearch(enrollment: ResearchEnrollment): { ok: true } | { ok: false; reason: string } {
  if (!['active', 'paused'].includes(enrollment.status)) return { ok: false, reason: 'Cadence is not active or paused' };
  if (enrollment.research_status === 'ready') return { ok: false, reason: 'Already researched' };
  if (enrollment.research_status === 'running') return { ok: false, reason: 'Research already running' };
  if (!httpsUrl(enrollment.website_url)) return { ok: false, reason: 'No public HTTPS website' };
  return { ok: true };
}

/**
 * Calls outreach-ai for one enrollment and consumes its SSE stream
 * (progress / reasoning / done / error / denied events).
 */
export async function streamResearch(enrollmentId: string, { signal, onProgress }: StreamResearchOptions = {}): Promise<StreamResearchResult> {
  const { supabase } = await import('@/integrations/supabase/client');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new ResearchError('Sign in to continue', 401);
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/outreach-ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollment_id: enrollmentId }),
    signal,
  });
  if (!response.headers.get('Content-Type')?.includes('text/event-stream')) {
    let message = 'AI research unavailable';
    try { const error = await response.json(); message = error.error || message; } catch { /* non-JSON body */ }
    throw new ResearchError(message, toStatus(response.status, response.status || 500));
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ResearchError('AI response is empty', 500);
  let buffer = '';
  const decoder = new TextDecoder();
  let saved: number | null = null;
  let personalisation: StreamResearchResult['personalisation'];
  while (true) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      const item = JSON.parse(line.slice(6));
      if (item.type === 'denied') throw new ResearchError(item.message, 'denied');
      if (item.type === 'error') throw new ResearchError(item.message, toStatus(item.status, 500));
      if (item.type === 'progress') onProgress?.(item.message);
      if (item.type === 'done') { saved = typeof item.saved === 'number' ? item.saved : 0; if (item.personalisation === 'low' || item.personalisation === 'normal') personalisation = item.personalisation; }
    }
  }
  if (saved === null) throw new ResearchError('Research did not finish; no messages were sent', 500);
  return { saved, personalisation };
}

export interface ResearchBatchOptions {
  run?: (enrollmentId: string, options: StreamResearchOptions) => Promise<StreamResearchResult>;
  limit?: number;
  signal?: AbortSignal;
  onItem?: (event: { id: string; outcome: 'done' | 'failed' | 'skipped' | 'running'; message?: string; saved?: number }) => void;
}

export interface ResearchBatchResult {
  done: { id: string; saved: number; personalisation?: 'low' | 'normal' }[];
  failed: { id: string; message: string }[];
  skipped: { id: string; reason: string }[];
  /** Eligible enrollments not processed (cap reached or batch stopped). */
  remaining: number;
  stoppedReason?: 'denied' | 'aborted';
  stoppedMessage?: string;
}

const isAbort = (e: unknown) => e instanceof Error && e.name === 'AbortError';

/**
 * Researches an uploaded list one contact at a time. Ineligible rows are
 * skipped with a reason; a denial or abort stops the batch; any other
 * per-contact failure is recorded and the batch continues. At most `limit`
 * contacts are run and the rest are counted in `remaining`.
 */
export async function researchBatch(enrollments: ResearchEnrollment[], { run = streamResearch, limit = 25, signal, onItem }: ResearchBatchOptions = {}): Promise<ResearchBatchResult> {
  const result: ResearchBatchResult = { done: [], failed: [], skipped: [], remaining: 0 };
  const queue: ResearchEnrollment[] = [];
  for (const enrollment of enrollments) {
    const check = eligibleForResearch(enrollment);
    if (check.ok === false) { result.skipped.push({ id: enrollment.id, reason: check.reason }); onItem?.({ id: enrollment.id, outcome: 'skipped', message: check.reason }); }
    else queue.push(enrollment);
  }
  const cap = Math.max(0, Math.floor(limit));
  let processed = 0;
  for (const enrollment of queue) {
    if (processed >= cap) break;
    if (signal?.aborted) { result.stoppedReason = 'aborted'; break; }
    onItem?.({ id: enrollment.id, outcome: 'running' });
    try {
      const { saved, personalisation } = await run(enrollment.id, { signal });
      processed += 1;
      result.done.push({ id: enrollment.id, saved, personalisation });
      onItem?.({ id: enrollment.id, outcome: 'done', saved });
    } catch (e) {
      if (isAbort(e) || signal?.aborted) { result.stoppedReason = 'aborted'; break; }
      const message = e instanceof Error ? e.message : 'Research failed';
      const status = (e as { status?: unknown })?.status;
      if (status === 'denied' || status === 402 || status === 403) {
        result.stoppedReason = 'denied';
        result.stoppedMessage = message;
        processed += 1;
        result.failed.push({ id: enrollment.id, message });
        onItem?.({ id: enrollment.id, outcome: 'failed', message });
        break;
      }
      processed += 1;
      result.failed.push({ id: enrollment.id, message });
      onItem?.({ id: enrollment.id, outcome: 'failed', message });
    }
  }
  result.remaining = queue.length - processed;
  return result;
}
