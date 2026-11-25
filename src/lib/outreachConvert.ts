// Turns a warm outreach contact into a pipeline deal: account -> contact ->
// opportunity (stage "discovery"), then marks the outreach contact converted.
// Ported from the retired legacy campaign page (OutreachDetail "Convert to
// pipeline") so the 12-touch sequence keeps a path into the pipeline.
// Setting the outreach contact to "converted" also stops its cadence
// (DB trigger outreach_contact_reply_stop).

export interface ConvertibleContact {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  opportunity_id?: string | null;
}

type Result<T> = { data: T | null; error: { message: string } | null };

/** The minimal slice of the Supabase client this needs, so tests can inject a fake. */
export interface ConvertClient {
  from(table: string): {
    insert(values: Record<string, unknown>): { select(columns?: string): { single(): PromiseLike<Result<{ id: string }>> } };
    update(values: Record<string, unknown>): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> };
  };
}

export function dealAccountName(c: ConvertibleContact): string {
  return c.company?.trim() || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email;
}

/** Contacts that replied or booked a meeting and are not yet in the pipeline. */
export function canCreateDeal(c: ConvertibleContact | undefined, enrollmentStatus: string, outcomes: (string | null)[]): boolean {
  if (!c || c.opportunity_id) return false;
  return enrollmentStatus === 'replied' || outcomes.some(o => o === 'meeting_booked' || o === 'positive' || o === 'maybe');
}

export async function createDealFromOutreach(db: ConvertClient, contact: ConvertibleContact, sequenceName: string): Promise<{ opportunityId: string; accountName: string }> {
  if (contact.opportunity_id) throw new Error('This contact is already in the pipeline');
  const accountName = dealAccountName(contact);
  const step = async (table: string, values: Record<string, unknown>) => {
    const { data, error } = await db.from(table).insert(values).select('id').single();
    if (error || !data) throw new Error(error?.message || `Could not create ${table}`);
    return data.id;
  };
  const accountId = await step('accounts', { name: accountName });
  const contactId = await step('contacts', { account_id: accountId, first_name: contact.first_name || null, last_name: contact.last_name || null, email: contact.email, phone: contact.phone || null });
  const opportunityId = await step('opportunities', { account_id: accountId, contact_id: contactId, stage: 'discovery', referral_source: `Sequence: ${sequenceName}` });
  const { error } = await db.from('outreach_contacts').update({ status: 'converted', converted_at: new Date().toISOString(), opportunity_id: opportunityId }).eq('id', contact.id);
  if (error) throw new Error(`Deal created, but the outreach contact could not be marked converted: ${error.message}`);
  return { opportunityId, accountName };
}
