import { nextTouch } from './outreachCadence';

/**
 * HubSpot-style sequence performance for the 12-touch outreach cadence.
 *
 * Built only from data the cadence really stores (outreach_enrollments,
 * outreach_touches, optionally outreach_contacts). There is no open or click
 * tracking anywhere in the outreach pipeline, so this module deliberately
 * reports none: the UI says "Opens not tracked" instead of inventing a number.
 *
 * Pure: `now` is always passed in; nothing here reads the clock.
 */

export const CADENCE_STEPS = 12;

/** Minimal row shapes so full Supabase rows and test fixtures both fit. */
export type AnalyticsEnrollment = { id: string; status: string; contact_id: string };
export type AnalyticsTouch = {
  id: string;
  enrollment_id: string;
  touch_number: number;
  channel: string;
  title: string;
  working_day: number;
  status: string;
  due_at: string;
  completed_at: string | null;
  outcome: string | null;
  reply_word_for_word: string | null;
};
export type AnalyticsContact = { id: string; replied_at: string | null };

export type StepMetrics = {
  touchNumber: number;
  /** null when no enrollment carries this step yet. */
  channel: string | null;
  title: string;
  /** Working day of the cadence (business days, from the generated touch). null when unknown. */
  workingDay: number | null;
  completed: number;
  skipped: number;
  pending: number;
  cancelled: number;
  /**
   * HubSpot-style: only executed or overdue work counts.
   * completed / (completed + skipped + pending touches already due at `now`).
   * Pending touches not yet due and cancelled touches are left out, so future
   * steps mid-sequence read 0 of 0 (rate 0) rather than a failing 0%.
   * 0 when the denominator is 0.
   */
  completionRate: number;
  /** Replied enrollments whose reply is attributed to this step (see attributeReply). */
  repliesAfterThisStep: number;
  /** Outcome counts on completed touches, e.g. { sent: 4, voicemail: 2 }. */
  outcomes: Record<string, number>;
};

export type SequenceMetrics = {
  enrolled: number;
  active: number;
  paused: number;
  /** Enrollments that ran every step (status 'completed'). */
  finished: number;
  /**
   * Enrollments stopped without a reply (status 'cancelled'): the
   * outreach_contact_reply_stop trigger sets this when the contact bounces or
   * is converted. HubSpot's "bounced" bucket.
   */
  stopped: number;
  /** Enrollments with any reply signal (see isReplied). */
  replied: number;
  replyRate: number;
  /** Enrollments with at least one touch logged as 'meeting_booked'. */
  meetingsBooked: number;
  meetingRate: number;
  /** Enrollments with at least one 'positive' or 'maybe' outcome. */
  positiveOrMaybe: number;
  /**
   * Enrollments with status 'not_interested' (set by the reply-stop trigger
   * when the contact is opted out, e.g. the "opted out" button on
   * OutreachDetail) or at least one completed 'not_interested' outcome.
   * Counted once per enrollment. HubSpot's "unsubscribed" bucket.
   */
  notInterested: number;
  /** Active enrollments whose next pending touch was due before `now`. */
  overdueTasks: number;
  /** Replied enrollments with no completed touch to attribute the reply to. */
  unattributedReplies: number;
  steps: StepMetrics[];
};

/**
 * Outcomes that mean the contact answered. Mirrors the 'complete' action in
 * supabase/functions/outreach-execute (manual call/LinkedIn outcomes) — a
 * booked meeting is a conversation with the contact, so it counts too.
 */
export const REPLY_OUTCOMES = new Set(['positive', 'maybe', 'replied', 'not_interested', 'meeting_booked']);

/** Safe ratio: 0 when the denominator is 0 (or not finite). */
export function rate(numerator: number, denominator: number): number {
  return denominator > 0 && Number.isFinite(denominator) ? numerator / denominator : 0;
}

function hasReplyText(t: AnalyticsTouch) {
  return !!t.reply_word_for_word?.trim();
}
function touchCarriesReply(t: AnalyticsTouch) {
  return t.status === 'completed' && (hasReplyText(t) || (!!t.outcome && REPLY_OUTCOMES.has(t.outcome)));
}
function ms(iso: string | null | undefined) {
  if (!iso) return NaN;
  return new Date(iso).getTime();
}

/**
 * An enrollment counts as replied when any of these is stored:
 *  - outreach_enrollments.status === 'replied' (set when the contact is marked replied)
 *  - outreach_contacts.replied_at (Gmail reply detection / "Record reply & stop")
 *  - a completed touch with reply_word_for_word or a reply outcome (call/LinkedIn log)
 */
function isReplied(e: AnalyticsEnrollment, touches: AnalyticsTouch[], contact: AnalyticsContact | undefined) {
  return e.status === 'replied' || !!contact?.replied_at || touches.some(touchCarriesReply);
}

/**
 * Reply attribution rule — which step "earned" the reply.
 *
 * 1. If a completed touch itself captured the reply (reply_word_for_word, or a
 *    reply outcome logged on a call/LinkedIn step via outreach-execute
 *    'complete'), the reply belongs to the lowest-numbered such touch.
 * 2. Otherwise the reply was detected outside a touch (Gmail thread check or
 *    "Record reply & stop", both of which only write outreach_contacts
 *    replied_at/reply_snippet). It belongs to the last completed touch whose
 *    completed_at is at or before contacts.replied_at.
 * 3. If replied_at is unknown (contacts not supplied, or the column is null),
 *    it belongs to the highest-numbered completed touch.
 * 4. With no completed touch at all, the reply is unattributed.
 *
 * Returns the touch_number, or null when unattributed.
 */
export function attributeReply(touches: AnalyticsTouch[], repliedAt: string | null | undefined): number | null {
  const completed = touches.filter(t => t.status === 'completed').sort((a, b) => a.touch_number - b.touch_number);
  const carrier = completed.find(touchCarriesReply);
  if (carrier) return carrier.touch_number;
  if (completed.length === 0) return null;
  const replyMs = ms(repliedAt);
  if (!Number.isNaN(replyMs)) {
    const before = completed.filter(t => {
      const at = ms(t.completed_at);
      return !Number.isNaN(at) && at <= replyMs;
    });
    if (before.length === 0) return null;
    // Latest by completion time; touch_number breaks ties.
    before.sort((a, b) => ms(a.completed_at) - ms(b.completed_at) || a.touch_number - b.touch_number);
    return before[before.length - 1].touch_number;
  }
  return completed[completed.length - 1].touch_number;
}

export function sequenceMetrics(
  enrollments: AnalyticsEnrollment[],
  touches: AnalyticsTouch[],
  now: Date,
  contacts: AnalyticsContact[] = [],
): SequenceMetrics {
  const nowMs = now.getTime();
  const enrollmentIds = new Set(enrollments.map(e => e.id));
  const byEnrollment = new Map<string, AnalyticsTouch[]>();
  for (const t of touches) {
    if (!enrollmentIds.has(t.enrollment_id)) continue; // only the enrollments in scope
    const list = byEnrollment.get(t.enrollment_id);
    if (list) list.push(t); else byEnrollment.set(t.enrollment_id, [t]);
  }
  const contactById = new Map(contacts.map(c => [c.id, c]));

  let maxStep = CADENCE_STEPS;
  for (const list of byEnrollment.values()) for (const t of list) if (Number.isInteger(t.touch_number) && t.touch_number > maxStep) maxStep = t.touch_number;
  const steps: StepMetrics[] = Array.from({ length: maxStep }, (_, i) => ({
    touchNumber: i + 1, channel: null, title: '', workingDay: null,
    completed: 0, skipped: 0, pending: 0, cancelled: 0, completionRate: 0, repliesAfterThisStep: 0, outcomes: {},
  }));
  /** Per step: pending touches whose due_at is before `now` (part of the completion denominator). */
  const pendingDue = new Array<number>(maxStep).fill(0);

  const m = {
    enrolled: enrollments.length, active: 0, paused: 0, finished: 0, stopped: 0, replied: 0,
    meetingsBooked: 0, positiveOrMaybe: 0, notInterested: 0, overdueTasks: 0, unattributedReplies: 0,
  };

  for (const e of enrollments) {
    const list = byEnrollment.get(e.id) || [];
    if (e.status === 'active') m.active++;
    else if (e.status === 'paused') m.paused++;
    else if (e.status === 'completed') m.finished++;
    else if (e.status === 'cancelled') m.stopped++;

    const outcomes = new Set(list.filter(t => t.status === 'completed' && t.outcome).map(t => t.outcome as string));
    if (outcomes.has('meeting_booked')) m.meetingsBooked++;
    if (outcomes.has('positive') || outcomes.has('maybe')) m.positiveOrMaybe++;
    if (e.status === 'not_interested' || outcomes.has('not_interested')) m.notInterested++;

    const contact = contactById.get(e.contact_id);
    if (isReplied(e, list, contact)) {
      m.replied++;
      const step = attributeReply(list, contact?.replied_at);
      if (step === null || step < 1 || step > maxStep) m.unattributedReplies++;
      else steps[step - 1].repliesAfterThisStep++;
    }

    if (e.status === 'active') {
      const next = nextTouch(list);
      const due = ms(next?.due_at);
      if (next && !Number.isNaN(due) && due < nowMs) m.overdueTasks++;
    }

    for (const t of list) {
      if (!Number.isInteger(t.touch_number) || t.touch_number < 1) continue;
      const s = steps[t.touch_number - 1];
      if (s.channel === null) { s.channel = t.channel; s.title = t.title; s.workingDay = t.working_day; }
      if (t.status === 'completed') {
        s.completed++;
        if (t.outcome) s.outcomes[t.outcome] = (s.outcomes[t.outcome] || 0) + 1;
      } else if (t.status === 'skipped') s.skipped++;
      else if (t.status === 'pending') {
        s.pending++;
        const due = ms(t.due_at);
        if (!Number.isNaN(due) && due < nowMs) pendingDue[t.touch_number - 1]++;
      }
      else if (t.status === 'cancelled') s.cancelled++;
    }
  }

  steps.forEach((s, i) => { s.completionRate = rate(s.completed, s.completed + s.skipped + pendingDue[i]); });

  return {
    ...m,
    replyRate: rate(m.replied, m.enrolled),
    meetingRate: rate(m.meetingsBooked, m.enrolled),
    steps,
  };
}
