import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
export { corsHeaders };
export class OutreachError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
export async function outreachSession(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new OutreachError('Sign in to continue', 401);
  const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new OutreachError('Outreach service is not configured', 500);
  const db = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) throw new OutreachError('Sign in to continue', 401);
  const { data: tenant } = await db.rpc('current_tenant_id');
  const { data: internal } = await db.rpc('is_internal_staff');
  if (!tenant || !internal) throw new OutreachError('Active organisation staff access required', 403);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  return { db, admin, tenant: String(tenant), user: auth.user };
}
export type OutreachSession = Awaited<ReturnType<typeof outreachSession>>;
export async function enrollmentFor(s: OutreachSession, id: string) {
  const { data: enrollment, error } = await s.db.from('outreach_enrollments').select('*').eq('id', id).eq('tenant_id', s.tenant).single();
  if (error || !enrollment) throw new OutreachError('Cadence contact not found', 404);
  const { data: contact } = await s.db.from('outreach_contacts').select('*').eq('id', enrollment.contact_id).eq('tenant_id', s.tenant).single();
  if (!contact) throw new OutreachError('Contact not found', 404);
  return { enrollment, contact };
}
export async function activeAssignee(s: OutreachSession, userId: string) {
  const { data: membership } = await s.admin.from('tenant_memberships').select('email,user_id').eq('tenant_id', s.tenant).eq('user_id', userId).eq('status', 'active').single();
  const { data: roles } = await s.admin.from('user_roles').select('role').eq('tenant_id', s.tenant).eq('user_id', userId).in('role', ['admin', 'staff']);
  if (!membership?.email || !roles?.length) throw new OutreachError('Choose an active teammate in this organisation', 403);
  return membership;
}