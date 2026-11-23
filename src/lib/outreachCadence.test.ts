import { describe, expect, it } from 'vitest';
import { readCsv, guessMapping, previewCsv, nextTouch, ctInputToUtc } from './outreachCadence';
import { emailIssue, canSend, publicHttps, outreachWindow, citationUrl, withoutCitations, manualOutcomeIssue } from '../../supabase/functions/_shared/outreach-policy';
describe('twelve-touch execution rules', () => {
  it('preserves quoted commas, multiline fields, escaped quotes and BOM in uploaded CSV', () => {
    const csv = readCsv('\uFEFFEmail,Company\r\na@example.com,"Acme, Inc"\r\nb@example.com,"Two\nLines ""LLC"""');
    expect(csv.rows).toEqual([['a@example.com', 'Acme, Inc'], ['b@example.com', 'Two\nLines "LLC"']]);
  });
  it('reports invalid and duplicate contacts instead of enrolling them twice', () => {
    const csv = readCsv('Email,First Name\na@example.com,Ann\nA@example.com,Ann\nbad,Bob');
    const result = previewCsv(csv.headers, csv.rows, guessMapping(csv.headers), []);
    expect(result.accepted.length).toBe(1); expect(result.issues.length).toBe(2);
  });
  it('chooses the next pending touch in order', () => {
    expect(nextTouch([{ touch_number: 3, status: 'pending' }, { touch_number: 1, status: 'completed' }, { touch_number: 2, status: 'pending' }])?.touch_number).toBe(2);
  });
  it('emails remain below 90 words', () => { expect(emailIssue('Hello', Array(89).fill('word').join(' ') + '?')).toBeNull(); expect(emailIssue('Hello', Array(90).fill('word').join(' ') + '?')).toContain('90'); });
  it('requires exactly one question', () => { expect(emailIssue('Hello', 'Is this useful?')).toBeNull(); expect(emailIssue('Hello', 'Hi there')).toContain('one question'); expect(emailIssue('Hello', 'Hi? Really?')).toContain('one question'); });
  it('rejects prices and internal cost claims', () => { expect(emailIssue('Hello', 'Want our $25 plan?')).toContain('prices'); expect(emailIssue('Hello', 'Want partner cost details?')).toContain('prices'); });
  it('sends only as the assigned person', () => { expect(canSend({ status: 'active', assigned_user_id: 'ann' }, { status: 'cadence_active' }, 'bob', false)).toBe(false); expect(canSend({ status: 'active', assigned_user_id: 'ann' }, { status: 'cadence_active' }, 'ann', false)).toBe(true); });
  it('never sends after a reply or while paused', () => { expect(canSend({ status: 'active', assigned_user_id: 'ann' }, { status: 'replied' }, 'ann', false)).toBe(false); expect(canSend({ status: 'paused', assigned_user_id: 'ann' }, { status: 'cadence_active' }, 'ann', false)).toBe(false); });
  it('does not send later touches before earlier steps', () => { expect(canSend({ status: 'active', assigned_user_id: 'ann' }, { status: 'cadence_active' }, 'ann', true)).toBe(false); });
  it('research excludes local, non-HTTPS and credential URLs', () => { expect(publicHttps('http://example.com')).toBeNull(); expect(publicHttps('https://127.0.0.1')).toBeNull(); expect(publicHttps('https://secret@example.com')).toBeNull(); expect(publicHttps('https://example.com')).toBe('https://example.com/'); });
  it('outreach starts at 16:00 Cape Town, closes at 20:00 and excludes weekends', () => { expect(outreachWindow(new Date('2026-11-23T13:59:00Z'))).toBe(false); expect(outreachWindow(new Date('2026-11-23T14:00:00Z'))).toBe(true); expect(outreachWindow(new Date('2026-11-23T18:00:00Z'))).toBe(false); expect(outreachWindow(new Date('2026-11-28T14:00:00Z'))).toBe(false); });
  it('snooze input is Central Time regardless of the teammate’s device timezone', () => { expect(ctInputToUtc('2026-11-23T10:00')).toBe('2026-11-23T16:00:00.000Z'); expect(ctInputToUtc('2026-07-01T10:00')).toBe('2026-07-01T15:00:00.000Z'); });
  it('matches actual citations without markdown wrappers or tracking parameters, but keeps meaningful query differences', () => { expect(citationUrl('`https://stripe.com/radar`')).toBe(citationUrl('https://stripe.com/radar?utm_source=chatgpt')); expect(citationUrl('https://example.com/page?id=1')).not.toBe(citationUrl('https://example.com/page?id=2')); expect(withoutCitations('A grounded fact. ([Stripe](https://stripe.com/radar))')).toBe('A grounded fact.'); });
  it('call touch 6 does not leave voicemail, while touches 3 and 9 may', () => { expect(manualOutcomeIssue(6, 'voicemail', '')).toContain('no voicemail'); expect(manualOutcomeIssue(3, 'voicemail', '')).toBeNull(); expect(manualOutcomeIssue(9, 'voicemail', '')).toBeNull(); });
  it('positive and maybe outcomes preserve the contact’s exact reply', () => { expect(manualOutcomeIssue(3, 'positive', '')).toContain('exact words'); expect(manualOutcomeIssue(3, 'maybe', 'Call me next week')).toBeNull(); });
});