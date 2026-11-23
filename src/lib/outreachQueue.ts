import { fromZonedTime } from 'date-fns-tz';
import { nextTouch } from './outreachCadence';

/**
 * HubSpot-style task queue for the outreach cadence.
 *
 * Pure functions only: callers pass the rows they already loaded (the same
 * outreach_enrollments / outreach_touches / outreach_contacts rows the
 * CadenceWorkspace fetches) and get back an ordered list of tasks to work one
 * after another. Day boundaries are America/Chicago, matching ctDate().
 */

export const QUEUE_TIMEZONE = 'America/Chicago';

export type QueueChannel = 'email' | 'call' | 'linkedin';
export type QueueChannelFilter = QueueChannel | 'all';
export type QueueScope = 'mine' | 'team';
export type QueueWindow = 'due' | 'today' | 'overdue';

/** Minimal shapes so the functions accept full Supabase rows or test fixtures. */
export type QueueEnrollment = { id: string; status: string; assigned_user_id: string; contact_id: string };
export type QueueTouch = { id: string; enrollment_id: string; touch_number: number; status: string; channel: string; title: string; due_at: string };
export type QueueContact = { id: string; email: string; company: string | null; first_name: string | null; last_name: string | null };

export type QueueOptions = {
  userId: string | null | undefined;
  scope: QueueScope;
  now: Date;
  channel?: QueueChannelFilter;
  window: QueueWindow;
};

export type QueueItem = {
  enrollmentId: string;
  touchId: string;
  touchNumber: number;
  channel: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  company: string;
  contactName: string;
  email: string;
};

export type QueueCounts = {
  /** Tasks due now (due_at <= now). */
  due: number;
  /** Tasks due before the start of today in Chicago. */
  overdue: number;
  /** Tasks due by the end of today in Chicago (includes overdue). */
  today: number;
  /** Per-channel counts within the requested window, ignoring the channel filter. */
  byChannel: Record<QueueChannel, number>;
};

const ymdFormat = new Intl.DateTimeFormat('en-CA', { timeZone: QUEUE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Start of the current Chicago calendar day and start of the next one, as UTC instants. */
export function chicagoDayBounds(now: Date): { start: Date; end: Date } {
  const [y, m, d] = ymdFormat.format(now).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = fromZonedTime(`${y}-${pad(m)}-${pad(d)}T00:00:00`, QUEUE_TIMEZONE);
  const end = fromZonedTime(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00:00`, QUEUE_TIMEZONE);
  return { start, end };
}

function inWindow(dueMs: number, window: QueueWindow, nowMs: number, bounds: { start: Date; end: Date }) {
  if (window === 'due') return dueMs <= nowMs;
  if (window === 'overdue') return dueMs < bounds.start.getTime();
  return dueMs < bounds.end.getTime();
}

function contactName(c: QueueContact | undefined) {
  const name = [c?.first_name, c?.last_name].map(v => v?.trim()).filter(Boolean).join(' ');
  return name || c?.email || 'Unknown contact';
}

/** Every active enrollment's next pending touch, before window/channel filtering. */
function candidates(enrollments: QueueEnrollment[], touches: QueueTouch[], contacts: QueueContact[], opts: QueueOptions) {
  const byEnrollment = new Map<string, QueueTouch[]>();
  for (const t of touches) {
    const list = byEnrollment.get(t.enrollment_id);
    if (list) list.push(t); else byEnrollment.set(t.enrollment_id, [t]);
  }
  const contactById = new Map(contacts.map(c => [c.id, c]));
  const out: { touch: QueueTouch; enrollment: QueueEnrollment; contact: QueueContact | undefined; dueMs: number }[] = [];
  for (const e of enrollments) {
    if (e.status !== 'active') continue;
    if (opts.scope === 'mine' && (!opts.userId || e.assigned_user_id !== opts.userId)) continue;
    const touch = nextTouch(byEnrollment.get(e.id) || []);
    if (!touch) continue;
    const dueMs = new Date(touch.due_at).getTime();
    if (Number.isNaN(dueMs)) continue;
    out.push({ touch, enrollment: e, contact: contactById.get(e.contact_id), dueMs });
  }
  return out;
}

/** Ordered task list: overdue first, then due_at ascending, then company. */
export function buildQueue(enrollments: QueueEnrollment[], touches: QueueTouch[], contacts: QueueContact[], opts: QueueOptions): QueueItem[] {
  const nowMs = opts.now.getTime();
  const bounds = chicagoDayBounds(opts.now);
  const channel = opts.channel || 'all';
  const items = candidates(enrollments, touches, contacts, opts)
    .filter(c => inWindow(c.dueMs, opts.window, nowMs, bounds))
    .filter(c => channel === 'all' || c.touch.channel === channel)
    .map(({ touch, enrollment, contact, dueMs }) => ({
      item: {
        enrollmentId: enrollment.id,
        touchId: touch.id,
        touchNumber: touch.touch_number,
        channel: touch.channel,
        title: touch.title,
        dueAt: touch.due_at,
        overdue: dueMs < bounds.start.getTime(),
        company: contact?.company?.trim() || '',
        contactName: contactName(contact),
        email: contact?.email || '',
      } satisfies QueueItem,
      dueMs,
    }));
  items.sort((a, b) =>
    Number(b.item.overdue) - Number(a.item.overdue)
    || a.dueMs - b.dueMs
    || a.item.company.localeCompare(b.item.company)
    || a.item.touchId.localeCompare(b.item.touchId));
  return items.map(i => i.item);
}

/** Header counts for the queue. Respects scope; the channel filter is ignored so chips can show totals. */
export function queueCounts(enrollments: QueueEnrollment[], touches: QueueTouch[], contacts: QueueContact[], opts: QueueOptions): QueueCounts {
  const nowMs = opts.now.getTime();
  const bounds = chicagoDayBounds(opts.now);
  const counts: QueueCounts = { due: 0, overdue: 0, today: 0, byChannel: { email: 0, call: 0, linkedin: 0 } };
  for (const c of candidates(enrollments, touches, contacts, opts)) {
    if (inWindow(c.dueMs, 'due', nowMs, bounds)) counts.due++;
    if (inWindow(c.dueMs, 'overdue', nowMs, bounds)) counts.overdue++;
    if (inWindow(c.dueMs, 'today', nowMs, bounds)) counts.today++;
    if (inWindow(c.dueMs, opts.window, nowMs, bounds) && c.touch.channel in counts.byChannel) counts.byChannel[c.touch.channel as QueueChannel]++;
  }
  return counts;
}

/**
 * Index of the task to show after the current one is completed, skipped or
 * snoozed. `queue` is the list as it stood when the session started;
 * `finished` holds touch ids that have since been completed or changed (the
 * current one included, if it was). Searches forward from the current task,
 * then wraps to pick up tasks passed over earlier. If only the current task
 * is left unfinished, it is returned again. Returns -1 when nothing is left.
 */
export function advance(queue: Pick<QueueItem, 'touchId'>[], currentTouchId: string | null | undefined, finished: Iterable<string>): number {
  const done = new Set(finished);
  const current = currentTouchId ? queue.findIndex(q => q.touchId === currentTouchId) : -1;
  const n = queue.length;
  if (!n) return -1;
  for (let step = 1; step <= n; step++) {
    const i = ((current < 0 ? -1 : current) + step) % n;
    if (i === current) continue;
    if (!done.has(queue[i].touchId)) return i;
  }
  return current >= 0 && !done.has(queue[current].touchId) ? current : -1;
}
