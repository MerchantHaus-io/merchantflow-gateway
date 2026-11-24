import { fromZonedTime } from 'date-fns-tz';
import type { Tables } from '@/integrations/supabase/types';

// Pure: derives a contact's cadence activity timeline from rows that are already stored.
// Nothing here is invented — every event maps to a column on outreach_enrollments,
// outreach_touches or outreach_contacts.

export type ActivityKind = 'email_sent' | 'call' | 'linkedin' | 'skipped' | 'snoozed' | 'reply' | 'research' | 'enrolled' | 'stopped';
export type ActivityEvent = { at: string; kind: ActivityKind; title: string; detail: string; outcome?: string; by?: string };

export type TimelineEnrollment = Pick<Tables<'outreach_enrollments'>, 'created_at' | 'updated_at' | 'status' | 'assigned_email' | 'start_on' | 'researched_at' | 'research_status' | 'research_error'>;
export type TimelineTouch = Pick<Tables<'outreach_touches'>, 'id' | 'touch_number' | 'channel' | 'title' | 'status' | 'completed_at' | 'completed_by' | 'updated_at' | 'outcome' | 'notes' | 'reply_word_for_word' | 'provider_message_id' | 'provider_thread_id' | 'subject'>;
export type TimelineContact = Pick<Tables<'outreach_contacts'>, 'replied_at' | 'reply_snippet' | 'bounced_at' | 'bounce_reason'>;

const TOTAL_TOUCHES = 12;

export const OUTCOME_LABELS: Record<string, string> = {
  no_answer: 'No answer',
  voicemail: 'Voicemail left',
  connected: 'Connected',
  meeting_booked: 'Meeting booked',
  positive: 'Positive reply',
  maybe: 'Maybe / later',
  not_interested: 'Not interested',
  replied: 'Replied',
  sent: 'Sent',
};

export function outcomeLabel(outcome: string | null | undefined): string | undefined {
  if (!outcome) return undefined;
  return OUTCOME_LABELS[outcome] || outcome.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// CadenceWorkspace appends `${ctDate(now)} — Skipped: reason` / `— Snoozed: reason` lines to touch.notes.
// ctDate renders e.g. "Nov 23, 4:00 PM CT" (ICU may use a narrow no-break space before AM/PM).
const ACTION_LINE = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d{2})\s?(AM|PM) CT — (Skipped|Snoozed): (.*)$/;

/**
 * ctDate omits the year, so the year is taken from a reference instant the line cannot be later
 * than (the touch's updated_at). If that would put the note in the future, it belongs to the prior year.
 */
export function parseCtStamp(month: string, day: number, hour12: number, minute: number, meridiem: 'AM' | 'PM', notAfter: string): string | null {
  const m = MONTHS.indexOf(month);
  if (m < 0 || day < 1 || day > 31 || hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const ref = new Date(notAfter);
  if (Number.isNaN(ref.getTime())) return null;
  const refYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(ref));
  const hour = (hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  const local = (year: number) => `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  let at = fromZonedTime(local(refYear), 'America/Chicago');
  // Allow a minute of slack: ctDate drops seconds.
  if (at.getTime() > ref.getTime() + 60_000) at = fromZonedTime(local(refYear - 1), 'America/Chicago');
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

type ActionLine = { kind: 'skipped' | 'snoozed'; at: string | null; reason: string };
export function splitNotes(notes: string | null | undefined, notAfter: string): { text: string; actions: ActionLine[] } {
  const actions: ActionLine[] = [];
  const kept: string[] = [];
  for (const line of (notes || '').split('\n')) {
    const match = line.trim().match(ACTION_LINE);
    if (!match) { kept.push(line); continue; }
    const [, month, day, hour, minute, meridiem, action, reason] = match;
    actions.push({ kind: action === 'Skipped' ? 'skipped' : 'snoozed', at: parseCtStamp(month, Number(day), Number(hour), Number(minute), meridiem as 'AM' | 'PM', notAfter), reason: reason.trim() });
  }
  return { text: kept.join('\n').trim(), actions };
}

const label = (t: TimelineTouch) => `Touch ${t.touch_number}/${TOTAL_TOUCHES} · ${t.title || t.channel}`;

export function buildTimeline(enrollment: TimelineEnrollment, touches: TimelineTouch[], contact: TimelineContact | null | undefined, names: Record<string, string> = {}): ActivityEvent[] {
  const events: (ActivityEvent & { order: number })[] = [];
  const push = (event: ActivityEvent, order = 0) => events.push({ ...event, order });

  push({ at: enrollment.created_at, kind: 'enrolled', title: 'Enrolled in 12-touch cadence', detail: [enrollment.assigned_email && `Assigned to ${enrollment.assigned_email}`, enrollment.start_on && `starts ${enrollment.start_on}`].filter(Boolean).join(' · ') }, -1);

  if (enrollment.researched_at) {
    const failed = Boolean(enrollment.research_error);
    push({ at: enrollment.researched_at, kind: 'research', title: failed ? 'AI research needs attention' : 'AI research and drafts ready', detail: failed ? String(enrollment.research_error) : `Research ${enrollment.research_status}` });
  }

  const replyTexts = new Set<string>();
  for (const touch of touches) {
    const { text, actions } = splitNotes(touch.notes, touch.updated_at);
    const by = touch.completed_by ? names[touch.completed_by] : undefined;
    actions.forEach((a, i) => push({ at: a.at || touch.updated_at, kind: a.kind, title: `${label(touch)} ${a.kind === 'skipped' ? 'skipped' : 'snoozed'}`, detail: a.reason }, touch.touch_number + i / 100));

    if (touch.status === 'skipped' && !actions.some(a => a.kind === 'skipped')) {
      push({ at: touch.completed_at || touch.updated_at, kind: 'skipped', title: `${label(touch)} skipped`, detail: text, ...(by ? { by } : {}) }, touch.touch_number);
    }
    if (touch.status !== 'completed') continue;
    const at = touch.completed_at || touch.updated_at;
    const outcome = outcomeLabel(touch.outcome);
    if (touch.channel === 'email') {
      push({ at, kind: 'email_sent', title: `${label(touch)} · email sent`, detail: touch.subject || '', ...(outcome ? { outcome } : {}), ...(by ? { by } : {}) }, touch.touch_number);
    } else {
      const ref = touch.provider_message_id ? `Ref: ${touch.provider_message_id}` : '';
      push({ at, kind: touch.channel === 'linkedin' ? 'linkedin' : 'call', title: label(touch), detail: [text, ref].filter(Boolean).join('\n'), ...(outcome ? { outcome } : {}), ...(by ? { by } : {}) }, touch.touch_number);
    }
    if (touch.reply_word_for_word?.trim()) {
      replyTexts.add(touch.reply_word_for_word.trim());
      push({ at, kind: 'reply', title: `Reply recorded on touch ${touch.touch_number}`, detail: touch.reply_word_for_word.trim(), ...(outcome ? { outcome } : {}) }, touch.touch_number + 0.5);
    }
  }

  if (contact?.replied_at && !(contact.reply_snippet && replyTexts.has(contact.reply_snippet.trim()))) {
    push({ at: contact.replied_at, kind: 'reply', title: 'Reply received', detail: contact.reply_snippet || '' }, 50);
  }
  if (contact?.bounced_at) push({ at: contact.bounced_at, kind: 'stopped', title: 'Email bounced', detail: contact.bounce_reason || '' }, 51);

  if (enrollment.status !== 'active') {
    const titles: Record<string, string> = { paused: 'Cadence paused', replied: 'Cadence stopped — contact replied', completed: 'Cadence completed' };
    // updated_at is the last change to the enrollment row, the closest stored time for its current status.
    push({ at: enrollment.updated_at, kind: 'stopped', title: titles[enrollment.status] || `Cadence ${enrollment.status}`, detail: '' }, 100);
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || b.order - a.order)
    .map(({ at, kind, title, detail, outcome, by }) => ({ at, kind, title, detail, ...(outcome ? { outcome } : {}), ...(by ? { by } : {}) }));
}
