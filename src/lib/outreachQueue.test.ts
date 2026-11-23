import { describe, it, expect } from 'vitest';
import { buildQueue, queueCounts, advance, chicagoDayBounds, type QueueEnrollment, type QueueTouch, type QueueContact, type QueueOptions } from './outreachQueue';

const ME = 'user-me';
const OTHER = 'user-other';

function enrollment(id: string, over: Partial<QueueEnrollment> = {}): QueueEnrollment {
  return { id, status: 'active', assigned_user_id: ME, contact_id: `c-${id}`, ...over };
}
function contact(id: string, company: string | null, first = 'Ada', last: string | null = 'Lovelace'): QueueContact {
  return { id, email: `${id}@example.com`, company, first_name: first, last_name: last };
}
function touch(enrollmentId: string, n: number, due: string, over: Partial<QueueTouch> = {}): QueueTouch {
  return { id: `${enrollmentId}-t${n}`, enrollment_id: enrollmentId, touch_number: n, status: 'pending', channel: 'email', title: `Touch ${n}`, due_at: due, ...over };
}

// 23 Nov 2026, 09:00 CST (UTC-6). Chicago day runs 06:00Z 23 Nov to 06:00Z 24 Nov.
const NOW = new Date('2026-11-23T15:00:00Z');
const opts = (over: Partial<QueueOptions> = {}): QueueOptions => ({ userId: ME, scope: 'mine', now: NOW, window: 'due', channel: 'all', ...over });

describe('chicagoDayBounds', () => {
  it('uses CST offsets on an ordinary winter day', () => {
    const { start, end } = chicagoDayBounds(NOW);
    expect(start.toISOString()).toBe('2026-11-23T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-24T06:00:00.000Z');
  });
  it('handles the 25-hour day when DST ends (1 Nov 2026)', () => {
    const { start, end } = chicagoDayBounds(new Date('2026-11-01T20:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-02T06:00:00.000Z');
  });
  it('handles the 23-hour day when DST starts (8 Mar 2026)', () => {
    const { start, end } = chicagoDayBounds(new Date('2026-03-08T18:00:00Z'));
    expect(start.toISOString()).toBe('2026-03-08T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-09T05:00:00.000Z');
  });
  it('treats late evening Chicago time as the same Chicago day even when UTC has rolled over', () => {
    const { start } = chicagoDayBounds(new Date('2026-11-24T05:30:00Z')); // 23:30 CST on 23 Nov
    expect(start.toISOString()).toBe('2026-11-23T06:00:00.000Z');
  });
});

describe('buildQueue', () => {
  it('returns an empty queue for no data', () => {
    expect(buildQueue([], [], [], opts())).toEqual([]);
  });

  it('only includes the next pending touch per enrollment', () => {
    const e = enrollment('a');
    const touches = [
      touch('a', 1, '2026-11-20T15:00:00Z', { status: 'completed' }),
      touch('a', 3, '2026-11-23T14:00:00Z'),
      touch('a', 2, '2026-11-23T13:00:00Z'),
    ];
    const q = buildQueue([e], touches, [contact('c-a', 'Acme')], opts());
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ enrollmentId: 'a', touchId: 'a-t2', touchNumber: 2, channel: 'email', title: 'Touch 2', company: 'Acme', contactName: 'Ada Lovelace', email: 'c-a@example.com', overdue: false });
  });

  it('does not reach past the next touch when the next one is not yet due', () => {
    const touches = [touch('a', 2, '2026-11-25T15:00:00Z'), touch('a', 3, '2026-11-22T15:00:00Z', { status: 'skipped' })];
    expect(buildQueue([enrollment('a')], touches, [], opts())).toEqual([]);
  });

  it('excludes paused, replied and completed enrollments', () => {
    const enrollments = [enrollment('a', { status: 'paused' }), enrollment('b', { status: 'replied' }), enrollment('c', { status: 'completed' }), enrollment('d')];
    const touches = ['a', 'b', 'c', 'd'].map(id => touch(id, 1, '2026-11-23T10:00:00Z'));
    expect(buildQueue(enrollments, touches, [], opts()).map(i => i.enrollmentId)).toEqual(['d']);
  });

  it('scopes to the signed-in user for mine and to everyone for team', () => {
    const enrollments = [enrollment('a'), enrollment('b', { assigned_user_id: OTHER })];
    const touches = [touch('a', 1, '2026-11-23T10:00:00Z'), touch('b', 1, '2026-11-23T09:00:00Z')];
    expect(buildQueue(enrollments, touches, [], opts()).map(i => i.enrollmentId)).toEqual(['a']);
    expect(buildQueue(enrollments, touches, [], opts({ scope: 'team' })).map(i => i.enrollmentId)).toEqual(['b', 'a']);
    expect(buildQueue(enrollments, touches, [], opts({ userId: null }))).toEqual([]);
  });

  it('filters by channel', () => {
    const enrollments = [enrollment('a'), enrollment('b'), enrollment('c')];
    const touches = [touch('a', 1, '2026-11-23T10:00:00Z', { channel: 'call' }), touch('b', 1, '2026-11-23T10:00:00Z', { channel: 'linkedin' }), touch('c', 1, '2026-11-23T10:00:00Z')];
    expect(buildQueue(enrollments, touches, [], opts({ channel: 'call' })).map(i => i.enrollmentId)).toEqual(['a']);
    expect(buildQueue(enrollments, touches, [], opts({ channel: 'linkedin' })).map(i => i.enrollmentId)).toEqual(['b']);
    expect(buildQueue(enrollments, touches, [], opts({ channel: 'all' }))).toHaveLength(3);
  });

  it('orders overdue first, then due time, then company', () => {
    const enrollments = ['a', 'b', 'c', 'd', 'e'].map(id => enrollment(id));
    const contacts = [contact('c-a', 'Zed Co'), contact('c-b', 'Beta'), contact('c-c', 'Acme'), contact('c-d', 'Acme'), contact('c-e', 'Old')];
    const touches = [
      touch('a', 1, '2026-11-23T12:00:00Z'), // today, 06:00 CST
      touch('b', 1, '2026-11-23T12:00:00Z'),
      touch('c', 1, '2026-11-23T08:00:00Z'),
      touch('d', 1, '2026-11-23T12:00:00Z'),
      touch('e', 1, '2026-11-22T20:00:00Z'), // yesterday in Chicago -> overdue
    ];
    const q = buildQueue(enrollments, touches, contacts, opts());
    expect(q.map(i => i.enrollmentId)).toEqual(['e', 'c', 'd', 'b', 'a']);
    expect(q.map(i => i.overdue)).toEqual([true, false, false, false, false]);
  });

  it('applies due / today / overdue windows on Chicago day boundaries', () => {
    const enrollments = ['past', 'early', 'later', 'tomorrow'].map(id => enrollment(id));
    const touches = [
      touch('past', 1, '2026-11-23T05:59:00Z'),     // 23:59 CST 22 Nov
      touch('early', 1, '2026-11-23T06:00:00Z'),    // 00:00 CST 23 Nov
      touch('later', 1, '2026-11-24T05:59:00Z'),    // 23:59 CST 23 Nov
      touch('tomorrow', 1, '2026-11-24T06:00:00Z'), // 00:00 CST 24 Nov
    ];
    const ids = (window: QueueOptions['window']) => buildQueue(enrollments, touches, [], opts({ window })).map(i => i.enrollmentId);
    expect(ids('due')).toEqual(['past', 'early']);
    expect(ids('today')).toEqual(['past', 'early', 'later']);
    expect(ids('overdue')).toEqual(['past']);
  });

  it('uses the long DST-end day for today and overdue', () => {
    const now = new Date('2026-11-01T20:00:00Z'); // 14:00 CST, 1 Nov 2026
    const enrollments = ['prev', 'start', 'late', 'next'].map(id => enrollment(id));
    const touches = [
      touch('prev', 1, '2026-11-01T04:59:00Z'),  // 23:59 CDT 31 Oct
      touch('start', 1, '2026-11-01T05:00:00Z'), // 00:00 CDT 1 Nov
      touch('late', 1, '2026-11-02T05:59:00Z'),  // 23:59 CST 1 Nov
      touch('next', 1, '2026-11-02T06:00:00Z'),  // 00:00 CST 2 Nov
    ];
    const today = buildQueue(enrollments, touches, [], opts({ now, window: 'today' }));
    expect(today.map(i => i.enrollmentId)).toEqual(['prev', 'start', 'late']);
    expect(today.map(i => i.overdue)).toEqual([true, false, false]);
  });

  it('falls back to email for the contact name and blank company when the contact is missing details', () => {
    const q = buildQueue([enrollment('a'), enrollment('b')], [touch('a', 1, '2026-11-23T10:00:00Z'), touch('b', 1, '2026-11-23T11:00:00Z')], [{ id: 'c-a', email: 'x@example.com', company: null, first_name: null, last_name: null }], opts());
    expect(q[0]).toMatchObject({ contactName: 'x@example.com', company: '', email: 'x@example.com' });
    expect(q[1]).toMatchObject({ contactName: 'Unknown contact', company: '', email: '' });
  });
});

describe('queueCounts', () => {
  it('counts due, overdue, today and per-channel within the window', () => {
    const enrollments = ['a', 'b', 'c', 'd', 'e'].map(id => enrollment(id)).concat(enrollment('x', { assigned_user_id: OTHER }));
    const touches = [
      touch('a', 1, '2026-11-22T20:00:00Z', { channel: 'call' }),     // overdue
      touch('b', 1, '2026-11-23T10:00:00Z', { channel: 'linkedin' }), // due today
      touch('c', 1, '2026-11-23T14:59:00Z'),                          // due today
      touch('d', 1, '2026-11-23T20:00:00Z', { channel: 'call' }),     // later today
      touch('e', 1, '2026-11-25T20:00:00Z'),                          // future
      touch('x', 1, '2026-11-22T20:00:00Z'),                          // someone else's
    ];
    expect(queueCounts(enrollments, touches, [], opts())).toEqual({ due: 3, overdue: 1, today: 4, byChannel: { email: 1, call: 1, linkedin: 1 } });
    expect(queueCounts(enrollments, touches, [], opts({ window: 'today', channel: 'call' })).byChannel).toEqual({ email: 1, call: 2, linkedin: 1 });
    expect(queueCounts(enrollments, touches, [], opts({ scope: 'team' }))).toMatchObject({ due: 4, overdue: 2 });
  });
  it('is all zero for an empty queue', () => {
    expect(queueCounts([], [], [], opts())).toEqual({ due: 0, overdue: 0, today: 0, byChannel: { email: 0, call: 0, linkedin: 0 } });
  });
});

describe('advance', () => {
  const q = ['t1', 't2', 't3', 't4'].map(touchId => ({ touchId }));
  it('moves to the next task after the current one is completed', () => {
    expect(advance(q, 't2', ['t2'])).toBe(2);
  });
  it('skips tasks already finished', () => {
    expect(advance(q, 't1', ['t1', 't2', 't3'])).toBe(3);
  });
  it('wraps around to tasks passed over earlier', () => {
    expect(advance(q, 't4', ['t4', 't2'])).toBe(0);
  });
  it('returns the current task if it is the only one left unfinished', () => {
    expect(advance(q, 't3', ['t1', 't2', 't4'])).toBe(2);
  });
  it('returns -1 when every task is finished', () => {
    expect(advance(q, 't4', ['t1', 't2', 't3', 't4'])).toBe(-1);
  });
  it('starts from the top when the current task is unknown', () => {
    expect(advance(q, 'missing', ['t1'])).toBe(1);
    expect(advance(q, null, [])).toBe(0);
  });
  it('returns -1 for an empty queue', () => {
    expect(advance([], 't1', [])).toBe(-1);
  });
});
