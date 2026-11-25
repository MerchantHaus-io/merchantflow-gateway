import { describe, it, expect } from 'vitest';
import { isAddressSuppressed, isUnsubscribeRequest, isUniqueViolation, normalizeOutreachEmail, type RpcClient } from '../../supabase/functions/_shared/outreach-suppression';

describe('normalizeOutreachEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeOutreachEmail('  Jane.Doe@Example.COM ')).toBe('jane.doe@example.com');
  });
  it('returns null for empty, non-string or @-less / leading-@ values', () => {
    for (const v of ['', '   ', 'nobody', '@example.com', null, undefined, 42, {}]) expect(normalizeOutreachEmail(v)).toBeNull();
  });
});

describe('isUnsubscribeRequest', () => {
  it.each([
    ['unsubscribe', null],
    ['Re: unsubscribe', null],
    ['RE: Re: Fwd: Unsubscribe!', null],
    ['Re: unsubscribe me', null],
    ['remove me', null],
    ['STOP', null],
  ])('subject %j is an opt-out', (subject, snippet) => {
    expect(isUnsubscribeRequest(subject, snippet)).toBe(true);
  });

  it.each([
    'unsubscribe',
    'Unsubscribe.',
    'unsubscribe me',
    'Please unsubscribe me.',
    'please remove me',
    'Remove me',
    'remove me from your list',
    'Stop',
    'stop emailing me!',
    'Take me off your list, thanks',
    'Please remove me. Thank you',
    'unsubscribe me thanks',
    'Unsubscribe\n\nOn Mon, Nov 24, 2026 at 4:00 PM Sam <sam@merchanthaus.io> wrote:\n> Hi Jane, quick question about your processing',
    'remove me On Mon, Nov 24, 2026 at 4:00 PM Sam <sam@merchanthaus.io> wrote: Hi Jane, to stop these emails reply unsubscribe',
    'stop\n> To stop these emails, reply "unsubscribe"',
  ])('body %j is an opt-out', body => {
    expect(isUnsubscribeRequest('Re: Quick question about your card fees', body)).toBe(true);
  });

  it.each([
    "don't unsubscribe me yet",
    'Don&#39;t unsubscribe me yet',
    'do not remove me',
    'please do not unsubscribe me',
    'never unsubscribe me',
    'How do I unsubscribe from my current processor?',
    'stop by tomorrow',
    "I'll stop by Friday",
    'Thanks for reaching out. We are reviewing processors this quarter and I would like to know how you compare, and whether I can unsubscribe later if it is not a fit.',
    'Sounds good, send me the pricing',
    '',
    '   ',
    '> unsubscribe',
  ])('body %j is not an opt-out', body => {
    expect(isUnsubscribeRequest('Re: Quick question about your card fees', body)).toBe(false);
  });

  it('is false for subjects that merely contain the word', () => {
    expect(isUnsubscribeRequest('Re: How do I unsubscribe from my processor?', 'Interested, call me')).toBe(false);
    expect(isUnsubscribeRequest("Re: don't stop", null)).toBe(false);
    expect(isUnsubscribeRequest('Re: Stop by Friday?', null)).toBe(false);
  });

  it('is false with nothing to read', () => {
    expect(isUnsubscribeRequest(null, null)).toBe(false);
    expect(isUnsubscribeRequest(undefined, undefined)).toBe(false);
  });
});

describe('isUniqueViolation', () => {
  it('matches only Postgres code 23505', () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isUniqueViolation({ code: '23514' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});

describe('isAddressSuppressed', () => {
  const fake = (result: { data: unknown; error: unknown }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const client: RpcClient = { rpc: (fn, args) => { calls.push({ fn, args }); return Promise.resolve(result); } };
    return { client, calls };
  };
  const tenant = '00000000-0000-0000-0000-000000000001';

  it('returns true when the RPC says the address is suppressed, passing a normalised address', async () => {
    const { client, calls } = fake({ data: true, error: null });
    await expect(isAddressSuppressed(client, tenant, ' Jane@Example.com ')).resolves.toBe(true);
    expect(calls).toEqual([{ fn: 'outreach_email_suppressed', args: { p_tenant: tenant, p_email: 'jane@example.com' } }]);
  });

  it('returns false when the RPC returns false (or anything other than true)', async () => {
    await expect(isAddressSuppressed(fake({ data: false, error: null }).client, tenant, 'a@b.co')).resolves.toBe(false);
    await expect(isAddressSuppressed(fake({ data: null, error: null }).client, tenant, 'a@b.co')).resolves.toBe(false);
  });

  it('throws on an RPC error (fail closed)', async () => {
    await expect(isAddressSuppressed(fake({ data: null, error: { message: 'permission denied' } }).client, tenant, 'a@b.co')).rejects.toThrow(/permission denied/);
  });

  it('throws without calling the RPC when the tenant or address is missing', async () => {
    const { client, calls } = fake({ data: false, error: null });
    await expect(isAddressSuppressed(client, null, 'a@b.co')).rejects.toThrow(/organisation/);
    await expect(isAddressSuppressed(client, '', 'a@b.co')).rejects.toThrow(/organisation/);
    await expect(isAddressSuppressed(client, tenant, 'not-an-email')).rejects.toThrow(/email/);
    expect(calls).toHaveLength(0);
  });
});
