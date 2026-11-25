import { describe, it, expect } from 'vitest';
import { canCreateDeal, createDealFromOutreach, dealAccountName, type ConvertClient } from './outreachConvert';

function fakeDb(failOn?: string) {
  const calls: { table: string; op: string; values: Record<string, unknown>; eq?: [string, string] }[] = [];
  const db: ConvertClient = {
    from(table) {
      return {
        insert(values) {
          calls.push({ table, op: 'insert', values });
          return { select: () => ({ single: async () => (failOn === table ? { data: null, error: { message: `${table} denied` } } : { data: { id: `${table}-1` }, error: null }) }) };
        },
        update(values) {
          return { eq: async (column: string, value: string) => { calls.push({ table, op: 'update', values, eq: [column, value] }); return { error: failOn === `${table}:update` ? { message: 'rls' } : null }; } };
        },
      };
    },
  };
  return { db, calls };
}
const maya = { id: 'oc-1', email: 'maya@fernbrook.example', first_name: 'Maya', last_name: 'Okafor', company: 'Fernbrook Outdoor Supply', phone: '555' };

describe('createDealFromOutreach', () => {
  it('creates account, contact and discovery opportunity, then marks the outreach contact converted', async () => {
    const { db, calls } = fakeDb();
    const result = await createDealFromOutreach(db, maya, 'Q4 retailers');
    expect(result).toEqual({ opportunityId: 'opportunities-1', accountName: 'Fernbrook Outdoor Supply' });
    expect(calls.map(c => `${c.op}:${c.table}`)).toEqual(['insert:accounts', 'insert:contacts', 'insert:opportunities', 'update:outreach_contacts']);
    expect(calls[1].values).toMatchObject({ account_id: 'accounts-1', email: 'maya@fernbrook.example', phone: '555' });
    expect(calls[2].values).toMatchObject({ account_id: 'accounts-1', contact_id: 'contacts-1', stage: 'discovery', referral_source: 'Sequence: Q4 retailers' });
    expect(calls[3]).toMatchObject({ values: { status: 'converted', opportunity_id: 'opportunities-1' }, eq: ['id', 'oc-1'] });
  });

  it('stops at the first failure and never marks the contact converted', async () => {
    const { db, calls } = fakeDb('contacts');
    await expect(createDealFromOutreach(db, maya, 'S')).rejects.toThrow('contacts denied');
    expect(calls.some(c => c.op === 'update')).toBe(false);
  });

  it('reports a failed final update instead of claiming success', async () => {
    const { db } = fakeDb('outreach_contacts:update');
    await expect(createDealFromOutreach(db, maya, 'S')).rejects.toThrow(/could not be marked converted/);
  });

  it('refuses a contact that already has an opportunity', async () => {
    const { db, calls } = fakeDb();
    await expect(createDealFromOutreach(db, { ...maya, opportunity_id: 'opp-9' }, 'S')).rejects.toThrow(/already in the pipeline/);
    expect(calls).toEqual([]);
  });
});

describe('dealAccountName and canCreateDeal', () => {
  it('names the account by company, then person, then email', () => {
    expect(dealAccountName(maya)).toBe('Fernbrook Outdoor Supply');
    expect(dealAccountName({ ...maya, company: ' ' })).toBe('Maya Okafor');
    expect(dealAccountName({ id: 'x', email: 'a@b.example' })).toBe('a@b.example');
  });

  it('offers a deal for replies and booked/positive outcomes, never twice', () => {
    expect(canCreateDeal(maya, 'replied', [])).toBe(true);
    expect(canCreateDeal(maya, 'active', [null, 'meeting_booked'])).toBe(true);
    expect(canCreateDeal(maya, 'active', ['no_answer', 'voicemail'])).toBe(false);
    expect(canCreateDeal({ ...maya, opportunity_id: 'o' }, 'replied', [])).toBe(false);
    expect(canCreateDeal(undefined, 'replied', [])).toBe(false);
  });
});
