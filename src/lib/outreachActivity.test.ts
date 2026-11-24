import { describe, expect, it } from 'vitest';
import { buildTimeline, outcomeLabel, parseCtStamp, splitNotes, type TimelineEnrollment, type TimelineTouch } from './outreachActivity';
import { ctDate } from './outreachCadence';

const enrollment = (over: Partial<TimelineEnrollment> = {}): TimelineEnrollment => ({
  created_at: '2026-11-02T14:00:00.000Z', updated_at: '2026-11-02T14:00:00.000Z', status: 'active', assigned_email: 'rep@example.com',
  start_on: '2026-11-03', researched_at: null, research_status: 'idle', research_error: null, ...over,
});
const touch = (over: Partial<TimelineTouch> = {}): TimelineTouch => ({
  id: 't1', touch_number: 1, channel: 'email', title: 'Intro email', status: 'pending', completed_at: null, completed_by: null,
  updated_at: '2026-11-02T14:00:00.000Z', outcome: null, notes: null, reply_word_for_word: null, provider_message_id: null, provider_thread_id: null, subject: '', ...over,
});

describe('outcomeLabel', () => {
  it('maps stored outcome codes to human labels', () => {
    expect(outcomeLabel('no_answer')).toBe('No answer');
    expect(outcomeLabel('voicemail')).toBe('Voicemail left');
    expect(outcomeLabel('meeting_booked')).toBe('Meeting booked');
    expect(outcomeLabel('not_interested')).toBe('Not interested');
    expect(outcomeLabel('sent')).toBe('Sent');
  });
  it('falls back to a readable form for unknown codes and undefined for empty', () => {
    expect(outcomeLabel('left_message_with_gatekeeper')).toBe('Left message with gatekeeper');
    expect(outcomeLabel(null)).toBeUndefined();
    expect(outcomeLabel('')).toBeUndefined();
  });
});

describe('skip / snooze note lines written by CadenceWorkspace', () => {
  it('round-trips a ctDate stamp back to the same minute', () => {
    const when = '2026-11-20T22:15:00.000Z';
    const { actions, text } = splitNotes(`Gatekeeper said call back\n${ctDate(when)} — Snoozed: out of office`, '2026-11-21T00:00:00.000Z');
    expect(text).toBe('Gatekeeper said call back');
    expect(actions).toEqual([{ kind: 'snoozed', at: when, reason: 'out of office' }]);
  });
  it('accepts a leading blank line (notes empty before the first action) and a regular space before AM/PM', () => {
    const { actions, text } = splitNotes('\nNov 20, 4:15 PM CT — Skipped: no LinkedIn profile', '2026-11-21T00:00:00.000Z');
    expect(text).toBe('');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'skipped', reason: 'no LinkedIn profile', at: '2026-11-20T22:15:00.000Z' });
  });
  it('accepts the narrow no-break space ICU puts before AM/PM', () => {
    expect(splitNotes('Nov 20, 4:15\u202fPM CT — Snoozed: busy', '2026-11-21T00:00:00.000Z').actions[0]).toMatchObject({ kind: 'snoozed', at: '2026-11-20T22:15:00.000Z' });
  });
  it('infers the previous year when the stamp would otherwise post-date the row', () => {
    expect(parseCtStamp('Dec', 30, 9, 0, 'AM', '2027-01-02T12:00:00.000Z')).toBe('2026-12-30T15:00:00.000Z');
    expect(parseCtStamp('Foo', 30, 9, 0, 'AM', '2027-01-02T12:00:00.000Z')).toBeNull();
    expect(parseCtStamp('Jan', 1, 9, 0, 'AM', 'not a date')).toBeNull();
  });
  it('handles 12 AM / 12 PM correctly', () => {
    expect(parseCtStamp('Jul', 4, 12, 0, 'AM', '2026-08-01T00:00:00.000Z')).toBe('2026-07-04T05:00:00.000Z');
    expect(parseCtStamp('Jul', 4, 12, 0, 'PM', '2026-08-01T00:00:00.000Z')).toBe('2026-07-04T17:00:00.000Z');
  });
});

describe('buildTimeline', () => {
  it('shows only the enrollment for a fresh active cadence', () => {
    const events = buildTimeline(enrollment(), [touch(), touch({ id: 't2', touch_number: 2 })], null);
    expect(events).toEqual([{ at: '2026-11-02T14:00:00.000Z', kind: 'enrolled', title: 'Enrolled in 12-touch cadence', detail: 'Assigned to rep@example.com · starts 2026-11-03' }]);
  });

  it('orders events newest first and labels each channel', () => {
    const events = buildTimeline(enrollment({ researched_at: '2026-11-02T15:00:00.000Z', research_status: 'complete' }), [
      touch({ status: 'completed', completed_at: '2026-11-03T22:00:00.000Z', outcome: 'sent', subject: 'Quick question', provider_message_id: 'gm-1' }),
      touch({ id: 't2', touch_number: 2, channel: 'call', title: 'Discovery call', status: 'completed', completed_at: '2026-11-04T22:00:00.000Z', outcome: 'voicemail', notes: 'Left VM on direct line', provider_message_id: 'rec-9' }),
      touch({ id: 't3', touch_number: 3, channel: 'linkedin', title: 'Connect on LinkedIn', status: 'completed', completed_at: '2026-11-05T22:00:00.000Z', outcome: 'connected', notes: '' }),
    ], null);
    expect(events.map(e => e.kind)).toEqual(['linkedin', 'call', 'email_sent', 'research', 'enrolled']);
    expect(events[0]).toMatchObject({ title: 'Touch 3/12 · Connect on LinkedIn', outcome: 'Connected', detail: '' });
    expect(events[1]).toMatchObject({ title: 'Touch 2/12 · Discovery call', outcome: 'Voicemail left', detail: 'Left VM on direct line\nRef: rec-9' });
    expect(events[2]).toMatchObject({ title: 'Touch 1/12 · Intro email · email sent', detail: 'Quick question', outcome: 'Sent' });
    expect(events[3]).toMatchObject({ title: 'AI research and drafts ready', detail: 'Research complete' });
  });

  it('records skips and snoozes from the appended note lines, and strips them from call notes', () => {
    const events = buildTimeline(enrollment(), [
      touch({ channel: 'call', title: 'Call', status: 'skipped', updated_at: '2026-11-04T23:00:00.000Z', notes: 'Prepped\nNov 4, 3:00 PM CT — Snoozed: travelling\nNov 4, 5:00 PM CT — Skipped: wrong number' }),
    ], null);
    expect(events.map(e => [e.kind, e.at, e.detail])).toEqual([
      ['skipped', '2026-11-04T23:00:00.000Z', 'wrong number'],
      ['snoozed', '2026-11-04T21:00:00.000Z', 'travelling'],
      ['enrolled', '2026-11-02T14:00:00.000Z', 'Assigned to rep@example.com · starts 2026-11-03'],
    ]);
  });

  it('still shows a skipped touch whose note line is missing, using the stored time', () => {
    const events = buildTimeline(enrollment(), [touch({ status: 'skipped', updated_at: '2026-11-04T23:00:00.000Z', notes: null })], null);
    expect(events[0]).toMatchObject({ kind: 'skipped', at: '2026-11-04T23:00:00.000Z', title: 'Touch 1/12 · Intro email skipped' });
  });

  it('logs a verbatim reply once even when the contact snippet repeats it', () => {
    const events = buildTimeline(enrollment({ status: 'replied', updated_at: '2026-11-06T00:00:00.000Z' }), [
      touch({ channel: 'call', title: 'Call', status: 'completed', completed_at: '2026-11-05T22:00:00.000Z', outcome: 'positive', reply_word_for_word: 'Yes, send me times' }),
    ], { replied_at: '2026-11-05T22:01:00.000Z', reply_snippet: 'Yes, send me times', bounced_at: null, bounce_reason: null });
    expect(events.filter(e => e.kind === 'reply')).toEqual([{ at: '2026-11-05T22:00:00.000Z', kind: 'reply', title: 'Reply recorded on touch 1', detail: 'Yes, send me times', outcome: 'Positive reply' }]);
    expect(events[0]).toMatchObject({ kind: 'stopped', title: 'Cadence stopped — contact replied' });
  });

  it('shows an email-detected reply and a bounce from the contact row', () => {
    const events = buildTimeline(enrollment(), [], { replied_at: '2026-11-07T10:00:00.000Z', reply_snippet: 'Not now', bounced_at: '2026-11-06T10:00:00.000Z', bounce_reason: 'mailbox full' });
    expect(events.map(e => [e.kind, e.title, e.detail])).toEqual([
      ['reply', 'Reply received', 'Not now'],
      ['stopped', 'Email bounced', 'mailbox full'],
      ['enrolled', 'Enrolled in 12-touch cadence', 'Assigned to rep@example.com · starts 2026-11-03'],
    ]);
  });

  it('flags failed research and paused cadences', () => {
    const events = buildTimeline(enrollment({ status: 'paused', updated_at: '2026-11-09T00:00:00.000Z', researched_at: '2026-11-08T00:00:00.000Z', research_status: 'failed', research_error: 'Website unreachable' }), [], null);
    expect(events.map(e => [e.kind, e.title, e.detail])).toEqual([
      ['stopped', 'Cadence paused', ''],
      ['research', 'AI research needs attention', 'Website unreachable'],
      ['enrolled', 'Enrolled in 12-touch cadence', 'Assigned to rep@example.com · starts 2026-11-03'],
    ]);
  });

  it('names the completer only when a name is supplied, never an invented one', () => {
    const done = touch({ status: 'completed', completed_at: '2026-11-03T22:00:00.000Z', completed_by: 'u-1', outcome: 'sent', subject: 'Hi' });
    expect(buildTimeline(enrollment(), [done], null)[0].by).toBeUndefined();
    expect(buildTimeline(enrollment(), [done], null, { 'u-1': 'Darryn' })[0].by).toBe('Darryn');
  });

  it('does not emit events for pending touches', () => {
    const events = buildTimeline(enrollment(), [touch({ notes: 'prep only', outcome: null })], null);
    expect(events.map(e => e.kind)).toEqual(['enrolled']);
  });
});
