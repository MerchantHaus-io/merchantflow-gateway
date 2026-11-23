import { describe, it, expect } from 'vitest';
import { sequenceMetrics, attributeReply, rate, CADENCE_STEPS, type AnalyticsEnrollment, type AnalyticsTouch, type AnalyticsContact } from './outreachAnalytics';

const NOW = new Date('2026-11-23T15:00:00Z');

function enrollment(id: string, status = 'active'): AnalyticsEnrollment {
  return { id, status, contact_id: `c-${id}` };
}
function touch(enrollmentId: string, n: number, over: Partial<AnalyticsTouch> = {}): AnalyticsTouch {
  return {
    id: `${enrollmentId}-t${n}`, enrollment_id: enrollmentId, touch_number: n,
    channel: n % 3 === 2 ? 'call' : n % 3 === 0 ? 'linkedin' : 'email', title: `Touch ${n}`, working_day: n,
    status: 'pending', due_at: '2026-12-01T15:00:00Z', completed_at: null, outcome: null, reply_word_for_word: null, ...over,
  };
}
const done = (e: string, n: number, at: string, over: Partial<AnalyticsTouch> = {}) =>
  touch(e, n, { status: 'completed', completed_at: at, outcome: 'sent', due_at: at, ...over });

describe('rate', () => {
  it('guards divide-by-zero', () => {
    expect(rate(0, 0)).toBe(0);
    expect(rate(5, 0)).toBe(0);
    expect(rate(1, 4)).toBe(0.25);
  });
});

describe('sequenceMetrics — empty data', () => {
  it('returns zeros and twelve empty steps without NaN', () => {
    const m = sequenceMetrics([], [], NOW);
    expect(m).toMatchObject({ enrolled: 0, active: 0, paused: 0, finished: 0, stopped: 0, replied: 0, replyRate: 0, meetingsBooked: 0, meetingRate: 0, positiveOrMaybe: 0, notInterested: 0, overdueTasks: 0, unattributedReplies: 0 });
    expect(m.steps).toHaveLength(CADENCE_STEPS);
    expect(m.steps.map(s => s.touchNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const s of m.steps) {
      expect(s).toMatchObject({ channel: null, workingDay: null, completed: 0, skipped: 0, pending: 0, cancelled: 0, completionRate: 0, repliesAfterThisStep: 0, outcomes: {} });
    }
  });
  it('handles enrollments with no touches', () => {
    const m = sequenceMetrics([enrollment('a')], [], NOW);
    expect(m).toMatchObject({ enrolled: 1, active: 1, replied: 0, replyRate: 0, overdueTasks: 0 });
  });
});

describe('sequenceMetrics — counts', () => {
  it('counts enrollment statuses, outcomes and rates', () => {
    const enrollments = [enrollment('a'), enrollment('b', 'paused'), enrollment('c', 'completed'), enrollment('d', 'replied')];
    const touches = [
      done('a', 1, '2026-11-10T15:00:00Z'),
      done('a', 2, '2026-11-11T15:00:00Z', { outcome: 'voicemail' }),
      touch('a', 3),
      done('b', 1, '2026-11-10T15:00:00Z'),
      touch('b', 2, { status: 'skipped' }),
      done('c', 1, '2026-11-10T15:00:00Z'),
      done('d', 1, '2026-11-10T15:00:00Z'),
      done('d', 2, '2026-11-11T15:00:00Z', { outcome: 'meeting_booked' }),
      touch('d', 3, { status: 'cancelled' }),
    ];
    const m = sequenceMetrics(enrollments, touches, NOW);
    expect(m).toMatchObject({ enrolled: 4, active: 1, paused: 1, finished: 1, replied: 1, replyRate: 0.25, meetingsBooked: 1, meetingRate: 0.25 });
    expect(m.steps[0]).toMatchObject({ channel: 'email', title: 'Touch 1', workingDay: 1, completed: 4, completionRate: 1, outcomes: { sent: 4 } });
    expect(m.steps[1]).toMatchObject({ completed: 2, skipped: 1, pending: 0, outcomes: { voicemail: 1, meeting_booked: 1 } });
    expect(m.steps[1].completionRate).toBeCloseTo(2 / 3);
    // Cancelled touches (stopped by a reply) are excluded from the completion denominator.
    expect(m.steps[2]).toMatchObject({ pending: 1, cancelled: 1, completed: 0, completionRate: 0 });
  });

  it('counts positive/maybe and not interested once per enrollment', () => {
    const touches = [
      done('a', 2, '2026-11-11T15:00:00Z', { outcome: 'maybe' }),
      done('a', 5, '2026-11-14T15:00:00Z', { outcome: 'positive' }),
      done('b', 2, '2026-11-11T15:00:00Z', { outcome: 'not_interested', reply_word_for_word: 'No thanks' }),
    ];
    const m = sequenceMetrics([enrollment('a', 'replied'), enrollment('b', 'replied'), enrollment('c')], touches, NOW);
    expect(m).toMatchObject({ positiveOrMaybe: 1, notInterested: 1, replied: 2 });
    expect(m.replyRate).toBeCloseTo(2 / 3);
  });

  it('counts a status-only not_interested enrollment (opted out via the reply-stop trigger)', () => {
    // No touch carries a not_interested outcome; only the enrollment status says so.
    const m = sequenceMetrics([enrollment('a', 'not_interested'), enrollment('b')], [done('a', 1, '2026-11-10T15:00:00Z'), touch('a', 2, { status: 'cancelled' })], NOW);
    expect(m.notInterested).toBe(1);
    expect(m.active).toBe(1);
  });

  it('does not double-count an enrollment with both not_interested status and outcome', () => {
    const m = sequenceMetrics([enrollment('a', 'not_interested')], [done('a', 2, '2026-11-11T15:00:00Z', { outcome: 'not_interested', reply_word_for_word: 'Remove me' })], NOW);
    expect(m.notInterested).toBe(1);
  });

  it('counts cancelled (bounced/converted) enrollments as stopped so status buckets add up', () => {
    const enrollments = [enrollment('a'), enrollment('b', 'paused'), enrollment('c', 'completed'), enrollment('d', 'cancelled'), enrollment('e', 'cancelled'), enrollment('f', 'replied'), enrollment('g', 'not_interested')];
    const m = sequenceMetrics(enrollments, [], NOW);
    expect(m).toMatchObject({ enrolled: 7, active: 1, paused: 1, finished: 1, stopped: 2, notInterested: 1, replied: 1 });
    expect(m.active + m.paused + m.finished + m.stopped + m.replied + m.notInterested).toBe(m.enrolled);
  });

  it('ignores touches belonging to enrollments outside scope', () => {
    const m = sequenceMetrics([enrollment('a')], [done('zzz', 1, '2026-11-10T15:00:00Z')], NOW);
    expect(m.steps[0].completed).toBe(0);
  });

  it('only outcome counts on completed touches', () => {
    const m = sequenceMetrics([enrollment('a')], [touch('a', 1, { status: 'skipped', outcome: 'sent' })], NOW);
    expect(m.steps[0].outcomes).toEqual({});
  });
});

describe('sequenceMetrics — overdue tasks', () => {
  it('counts only the next pending touch of active enrollments that is past due at now', () => {
    const enrollments = [enrollment('a'), enrollment('b'), enrollment('c', 'paused'), enrollment('d')];
    const touches = [
      touch('a', 1, { due_at: '2026-11-20T15:00:00Z' }),
      touch('a', 2, { due_at: '2026-11-21T15:00:00Z' }), // later overdue step of same enrollment: not double-counted
      touch('b', 1, { due_at: '2026-11-30T15:00:00Z' }), // future
      touch('c', 1, { due_at: '2026-11-20T15:00:00Z' }), // paused: not a task
      done('d', 1, '2026-11-10T15:00:00Z'),
      touch('d', 2, { due_at: '2026-11-23T14:59:00Z' }),
    ];
    expect(sequenceMetrics(enrollments, touches, NOW).overdueTasks).toBe(2);
    // Same data, earlier clock: nothing overdue. The function reads only `now`.
    expect(sequenceMetrics(enrollments, touches, new Date('2026-11-01T00:00:00Z')).overdueTasks).toBe(0);
  });
});

describe('attributeReply', () => {
  it('prefers the touch that captured the reply text or outcome', () => {
    const list = [done('a', 1, '2026-11-10T15:00:00Z'), done('a', 2, '2026-11-11T15:00:00Z', { reply_word_for_word: 'Call me Friday' }), done('a', 4, '2026-11-13T15:00:00Z')];
    expect(attributeReply(list, '2026-11-14T00:00:00Z')).toBe(2);
    const byOutcome = [done('a', 1, '2026-11-10T15:00:00Z'), done('a', 3, '2026-11-12T15:00:00Z', { outcome: 'positive' })];
    expect(attributeReply(byOutcome, null)).toBe(3);
  });

  it('uses the last completed touch at or before replied_at for detected email replies', () => {
    const list = [
      done('a', 1, '2026-11-10T15:00:00Z'),
      done('a', 2, '2026-11-11T15:00:00Z', { outcome: 'no_answer' }),
      done('a', 4, '2026-11-13T15:00:00Z'),
    ];
    expect(attributeReply(list, '2026-11-12T09:00:00Z')).toBe(2);
    expect(attributeReply(list, '2026-11-11T15:00:00Z')).toBe(2); // "at" is inclusive
    expect(attributeReply(list, '2026-11-20T00:00:00Z')).toBe(4);
  });

  it('falls back to the highest completed touch when replied_at is unknown', () => {
    expect(attributeReply([done('a', 1, '2026-11-10T15:00:00Z'), done('a', 4, '2026-11-13T15:00:00Z'), touch('a', 5)], null)).toBe(4);
  });

  it('is unattributed with no completed touch, or when the reply predates every touch', () => {
    expect(attributeReply([touch('a', 1, { status: 'cancelled' })], '2026-11-12T00:00:00Z')).toBeNull();
    expect(attributeReply([done('a', 1, '2026-11-10T15:00:00Z')], '2026-11-09T00:00:00Z')).toBeNull();
  });

  it('feeds repliesAfterThisStep and unattributedReplies in sequenceMetrics', () => {
    const enrollments = [enrollment('a', 'replied'), enrollment('b', 'replied'), enrollment('c', 'replied')];
    const contacts: AnalyticsContact[] = [
      { id: 'c-a', replied_at: '2026-11-12T09:00:00Z' },
      { id: 'c-b', replied_at: '2026-11-12T09:00:00Z' },
      { id: 'c-c', replied_at: '2026-11-12T09:00:00Z' },
    ];
    const touches = [
      done('a', 1, '2026-11-10T15:00:00Z'), touch('a', 2, { status: 'cancelled' }),
      done('b', 1, '2026-11-10T15:00:00Z'), done('b', 2, '2026-11-11T15:00:00Z', { outcome: 'no_answer' }),
      touch('c', 1, { status: 'cancelled' }),
    ];
    const m = sequenceMetrics(enrollments, touches, NOW, contacts);
    expect(m.replied).toBe(3);
    expect(m.steps[0].repliesAfterThisStep).toBe(1);
    expect(m.steps[1].repliesAfterThisStep).toBe(1);
    expect(m.unattributedReplies).toBe(1);
  });

  it('treats contact.replied_at as a reply even before the enrollment status catches up', () => {
    const m = sequenceMetrics([enrollment('a')], [done('a', 1, '2026-11-10T15:00:00Z')], NOW, [{ id: 'c-a', replied_at: '2026-11-11T00:00:00Z' }]);
    expect(m.replied).toBe(1);
    expect(m.steps[0].repliesAfterThisStep).toBe(1);
  });
});

describe('sequenceMetrics — completion rate counts only executed or due work', () => {
  it('leaves pending touches that are not yet due out of the denominator', () => {
    const enrollments = [enrollment('a'), enrollment('b'), enrollment('c')];
    const touches = [
      done('a', 4, '2026-11-20T15:00:00Z'),
      touch('b', 4, { due_at: '2026-11-22T15:00:00Z' }), // overdue pending: counts against completion
      touch('c', 4, { due_at: '2026-11-30T15:00:00Z' }), // not yet due: excluded
      touch('a', 5, { due_at: '2026-12-01T15:00:00Z' }),
      touch('b', 5, { due_at: '2026-12-01T15:00:00Z' }),
    ];
    const m = sequenceMetrics(enrollments, touches, NOW);
    expect(m.steps[3]).toMatchObject({ completed: 1, pending: 2 });
    expect(m.steps[3].completionRate).toBeCloseTo(1 / 2);
    // Future step mid-sequence: nothing executed or due, so 0 with no NaN.
    expect(m.steps[4]).toMatchObject({ pending: 2, completionRate: 0 });
    // Once the clock passes both due dates the step is fully counted.
    expect(sequenceMetrics(enrollments, touches, new Date('2026-12-05T00:00:00Z')).steps[3].completionRate).toBeCloseTo(1 / 3);
  });
});
