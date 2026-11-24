import { z } from 'npm:zod@3';
import { outreachSession, enrollmentFor, activeAssignee, OutreachError, json, corsHeaders, type OutreachSession } from '../_shared/outreach-session.ts';
import { emailIssue, canSend, publicHttps, outreachWindow, manualOutcomeIssue } from '../_shared/outreach-policy.ts';
import { normalizeImport } from '../_shared/outreach-import.ts';
import { complianceFooterHtml, listUnsubscribe } from '../_shared/outreach-compliance.ts';

const uuid = z.string().uuid();
const address = z.string().trim().email().max(254);
const text = z.string().max(5000);
const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('team') }),
  z.object({ action: z.literal('enroll'), campaign_id: uuid, contact_id: uuid.optional(), assigned_user_id: uuid, start_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string().max(80), website: z.string().max(2048).optional(), linkedin: z.string().max(2048).optional(), import_data: z.record(z.string().max(5000)).optional(), contact: z.object({ email: address, first_name: z.string().max(100), last_name: z.string().max(100), company: z.string().max(200), phone: z.string().max(40) }).optional() }),
  z.object({ action: z.literal('send'), enrollment_id: uuid, touch_id: uuid, subject: z.string().trim().min(1).max(200), draft_text: text }),
  z.object({ action: z.literal('check_replies'), enrollment_id: uuid }),
  z.object({ action: z.literal('complete'), enrollment_id: uuid, touch_id: uuid, outcome: z.enum(['no_answer', 'voicemail', 'connected', 'meeting_booked', 'positive', 'maybe', 'not_interested', 'replied']), notes: text, reply: text, provider_ref: z.string().max(200) }),
  z.object({ action: z.literal('handoff'), enrollment_id: uuid, recipient_id: uuid, reply: text.min(1) }),
]);
function check(error: { message: string } | null) { if (error) throw new OutreachError(error.message); }
function b64(value: string) { return btoa(Array.from(new TextEncoder().encode(value), b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }
function contactName(c: { first_name?: string | null; last_name?: string | null }) { return [c.first_name, c.last_name].map(v => (v || '').trim()).filter(Boolean).join(' ') || null; }
type GmailMessage = { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };
type GmailResult = GmailMessage & { emailAddress?: string; messages?: GmailMessage[] };
async function gmail(s: OutreachSession, userId: string) {
  const member = await activeAssignee(s, userId);
  const { data: token } = await s.admin.from('google_calendar_tokens').select('id,access_token,refresh_token,expires_at,scopes').eq('tenant_id', s.tenant).eq('user_id', userId).eq('user_email', member.email).maybeSingle();
  if (!token) throw new OutreachError('The assigned person must connect their own Google email in Settings', 409);
  let accessToken = token.access_token;
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'); const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new OutreachError('Google email is not configured', 503);
    const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: clientId, client_secret: clientSecret }) });
    if (!response.ok) throw new OutreachError('The assigned person must reconnect Google email', response.status);
    const refreshed = await response.json(); accessToken = refreshed.access_token;
    const { error } = await s.admin.from('google_calendar_tokens').update({ access_token: accessToken, expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() }).eq('id', token.id).eq('tenant_id', s.tenant); check(error);
  }
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(`https://www.googleapis.com/gmail/v1/users/me/${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    const result = await response.json();
    if (!response.ok) throw new OutreachError(result?.error?.message || 'Google email request failed', response.status);
    return result as GmailResult;
  };
  const profile = await call('profile');
  if (profile.emailAddress?.toLowerCase() !== member.email.toLowerCase()) throw new OutreachError('Connected Google account does not match the assigned person', 403);
  return { call, email: member.email };
}
async function detectReply(s: OutreachSession, enrollment: { id: string }, contact: { id: string; email: string }, mail: Awaited<ReturnType<typeof gmail>>) {
  const { data: sent, error } = await s.db.from('outreach_touches').select('provider_thread_id').eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).eq('status', 'completed').eq('channel', 'email'); check(error);
  const threads = [...new Set((sent || []).map(t => t.provider_thread_id).filter(Boolean))];
  for (const thread of threads) {
    const result = await mail.call(`threads/${encodeURIComponent(String(thread))}?format=metadata`);
    const reply = result.messages?.find(m => {
      const from = m.payload?.headers?.find(h => h.name.toLowerCase() === 'from')?.value || '';
      const parsed = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
      return parsed === contact.email.toLowerCase();
    });
    if (reply) {
      const { error: stopped } = await s.db.from('outreach_contacts').update({ status: 'replied', replied_at: new Date().toISOString(), reply_snippet: reply.snippet || 'Reply received in Google email' }).eq('id', contact.id).eq('tenant_id', s.tenant); check(stopped);
      return true;
    }
  }
  return false;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const s = await outreachSession(req);
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Check the contact, assignment and message fields', details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    if (body.action === 'team') {
      const { data: members, error } = await s.admin.from('tenant_memberships').select('user_id,email').eq('tenant_id', s.tenant).eq('status', 'active'); check(error);
      const { data: roles, error: rolesError } = await s.admin.from('user_roles').select('user_id').eq('tenant_id', s.tenant).in('role', ['staff', 'admin']); check(rolesError);
      const { data: names } = await s.admin.from('team_roster').select('email,display_name').eq('tenant_id', s.tenant).eq('active', true);
      return json({ team: (members || []).filter(m => roles?.some(r => r.user_id === m.user_id)).map(m => ({ ...m, name: names?.find(n => n.email.toLowerCase() === m.email?.toLowerCase())?.display_name || m.email })) });
    }
    if (body.action === 'enroll') {
      const { data: campaign } = await s.db.from('outreach_campaigns').select('id').eq('id', body.campaign_id).eq('tenant_id', s.tenant).single();
      if (!campaign) throw new OutreachError('Campaign not found', 404);
      const member = await activeAssignee(s, body.assigned_user_id);
      if ((body.website && !publicHttps(body.website)) || (body.linkedin && (!publicHttps(body.linkedin) || !/(^|\.)linkedin\.com$/.test(new URL(body.linkedin).hostname)))) throw new OutreachError('Use a public HTTPS website and LinkedIn profile');
      try { new Intl.DateTimeFormat('en', { timeZone: body.timezone }); } catch { throw new OutreachError('Choose a valid contact timezone'); }
      let imported: ReturnType<typeof normalizeImport> | undefined;
      try { if (body.import_data) imported = normalizeImport(body.import_data); } catch (e) { throw new OutreachError(e instanceof Error ? e.message : 'Invalid imported contact'); }
      if (imported && (imported.row.email !== body.contact?.email.toLowerCase() || imported.row.first_name.length > 100 || imported.row.last_name.length > 100 || imported.row.company.length > 200)) throw new OutreachError('Check the imported name, company and email');
      let contactId = body.contact_id;
      if (!contactId) {
        if (!body.contact) throw new OutreachError('Contact details are required');
        const { data: duplicate } = await s.db.from('outreach_contacts').select('id').eq('campaign_id', campaign.id).eq('tenant_id', s.tenant).ilike('email', body.contact.email).limit(1);
        contactId = duplicate?.[0]?.id;
        if (!contactId) {
          const { data, error } = await s.db.from('outreach_contacts').insert({ ...body.contact, ...imported?.contact, email: body.contact.email.toLowerCase(), campaign_id: campaign.id, tenant_id: s.tenant }).select('id').single(); check(error); contactId = data?.id;
        }
      }
      if (!contactId) throw new OutreachError('Contact could not be saved');
      const { data: existing } = await s.db.from('outreach_enrollments').select('id').eq('contact_id', contactId).eq('tenant_id', s.tenant).maybeSingle();
      if (existing) return json({ enrollment_id: existing.id, existing: true });
      const { data, error } = await s.db.from('outreach_enrollments').insert({ tenant_id: s.tenant, campaign_id: campaign.id, contact_id: contactId, assigned_user_id: member.user_id, assigned_email: member.email, start_on: body.start_on, contact_timezone: body.timezone, website_url: imported?.contact.website_url || body.website || null, linkedin_url: imported?.contact.linkedin_url || body.linkedin || null }).select('id').single(); check(error);
      return json({ enrollment_id: data?.id });
    }
    const { enrollment, contact } = await enrollmentFor(s, body.enrollment_id);
    if (body.action === 'handoff') {
      if (enrollment.status !== 'replied') throw new OutreachError('Record the reply before a warm handoff');
      const member = await activeAssignee(s, body.recipient_id);
      const { error } = await s.admin.from('notifications').insert({ tenant_id: s.tenant, user_id: member.user_id, user_email: member.email, title: `Warm outreach reply: ${contact.company || contact.email}`, message: `Positive/maybe reply — arrange a 15-minute call. ${body.reply}`, type: 'task', link: `/outreach/${enrollment.campaign_id}` }); check(error);
      return json({ success: true });
    }
    if (body.action === 'complete') {
      await activeAssignee(s, enrollment.assigned_user_id);
      const { data: touch } = await s.db.from('outreach_touches').select('id,channel,touch_number,status,title').eq('id', body.touch_id).eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).single();
      const { count, error: orderError } = await s.db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).lt('touch_number', touch?.touch_number || 1).not('status', 'in', '(completed,skipped)'); check(orderError);
      if (!touch || touch.channel === 'email' || touch.status !== 'pending' || !canSend(enrollment, contact, s.user.id, Boolean(count))) throw new OutreachError('Only the assignee can complete the next active manual touch', 403);
      const outcomeIssue = manualOutcomeIssue(touch.touch_number, body.outcome, body.reply);
      if (outcomeIssue) throw new OutreachError(outcomeIssue);
      const { error } = await s.db.from('outreach_touches').update({ status: 'completed', outcome: body.outcome, notes: body.notes, reply_word_for_word: body.reply || null, provider_message_id: body.provider_ref || null }).eq('id', touch.id).eq('tenant_id', s.tenant); check(error);
      // Log the completed call / LinkedIn touch on the account record, as 'send' does for emails. Never fail the touch.
      if (contact.opportunity_id) {
        const { data: opportunity } = await s.db.from('opportunities').select('account_id').eq('id', contact.opportunity_id).eq('tenant_id', s.tenant).maybeSingle();
        if (opportunity?.account_id) {
          const isCall = touch.channel === 'call';
          const repNotes = body.notes.split('\n').filter((line: string) => !/^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s?(AM|PM) CT — (Skipped|Snoozed): /.test(line.trim())).join('\n').trim();
          const activityNotes = [repNotes, body.reply.trim() ? `Reply (verbatim): ${body.reply.trim()}` : ''].filter(Boolean).join('\n\n') || null;
          const { error: logError } = await s.db.from('client_interactions').insert({ tenant_id: s.tenant, account_id: opportunity.account_id, interaction_type: isCall ? 'call' : 'note', channel: isCall ? 'phone' : 'linkedin', subject: `Touch ${touch.touch_number}/12 · ${touch.title || (isCall ? 'Call' : 'LinkedIn')}`, notes: activityNotes, outcome: body.outcome, contact_email: contact.email, contact_name: contactName(contact), contact_phone: contact.direct_phone || contact.mobile_phone || contact.phone || null, created_by: s.user.id, created_by_email: s.user.email || null, status: 'resolved' });
          if (logError) return json({ success: true, warning: 'Touch completed; account interaction logging needs attention' });
        }
      }
      return json({ success: true });
    }
    const mail = await gmail(s, enrollment.assigned_user_id);
    if (await detectReply(s, enrollment, contact, mail)) return json({ replied: true, message: 'A reply was received; remaining outreach has stopped' });
    if (body.action === 'check_replies') return json({ replied: false });
    const { data: touch } = await s.db.from('outreach_touches').select('*').eq('id', body.touch_id).eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).single();
    if (!touch || touch.channel !== 'email') throw new OutreachError('Email touch not found', 404);
    if (touch.status === 'completed') return json({ success: true, already_sent: true });
    const { count, error: orderError } = await s.db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).lt('touch_number', touch.touch_number).not('status', 'in', '(completed,skipped)'); check(orderError);
    if (!canSend(enrollment, contact, s.user.id, Boolean(count)) || touch.status !== 'pending') throw new OutreachError('Only the assignee can send the next active touch', 403);
    const issue = emailIssue(body.subject, body.draft_text); if (issue) throw new OutreachError(issue);
    if (new Date(touch.due_at).getTime() > Date.now()) throw new OutreachError('This touch is not due yet');
    const capeDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const { data: workingDay } = await s.db.rpc('outreach_working_day', { d: capeDate });
    if (!outreachWindow(new Date()) || !workingDay) throw new OutreachError('Outreach runs on working days, 16:00–20:00 Cape Town');
    // A stable RFC id plus a compare-and-set claim prevents duplicate sends. Uncertain sends stay claimed.
    const messageId = `<outreach-${touch.id}@${mail.email.split('@')[1]}>`;
    let prior: (GmailResult & { subject: string }) | null = null;
    if (touch.thread_touch) {
      const { data: parent } = await s.db.from('outreach_touches').select('provider_message_id,provider_thread_id,subject').eq('enrollment_id', enrollment.id).eq('tenant_id', s.tenant).eq('touch_number', touch.thread_touch).single();
      if (!parent?.provider_message_id || !parent.provider_thread_id) throw new OutreachError('Send the original thread email first');
      prior = { ...await mail.call(`messages/${encodeURIComponent(parent.provider_message_id)}?format=metadata`), subject: parent.subject };
    }
    if (touch.provider_message_id) {
      const found = await mail.call(`messages?q=${encodeURIComponent('rfc822msgid:' + messageId)}&maxResults=1`);
      if (!found.messages?.[0]) throw new OutreachError('Previous send is unconfirmed; check the assigned person’s Sent folder before retrying', 409);
      const sent = await mail.call(`messages/${encodeURIComponent(found.messages[0].id)}?format=metadata`);
      const { error } = await s.db.from('outreach_touches').update({ status: 'completed', provider_message_id: sent.id, provider_thread_id: sent.threadId, outcome: 'sent' }).eq('id', touch.id).eq('tenant_id', s.tenant); check(error);
      return json({ success: true, reconciled: true });
    }
    const { data: claim, error: claimError } = await s.db.from('outreach_touches').update({ provider_message_id: `sending:${touch.id}`, subject: body.subject, draft_text: body.draft_text }).eq('id', touch.id).eq('tenant_id', s.tenant).eq('status', 'pending').is('provider_message_id', null).select('id'); check(claimError);
    if (!claim?.length) throw new OutreachError('Another send is in progress', 409);
    // Re-read suppression and replies immediately before provider delivery.
    const fresh = await enrollmentFor(s, enrollment.id);
    if (!canSend(fresh.enrollment, fresh.contact, s.user.id, false) || await detectReply(s, fresh.enrollment, fresh.contact, mail)) throw new OutreachError('Contact replied or outreach stopped', 409);
    const ref = prior?.payload?.headers?.find(h => h.name.toLowerCase() === 'message-id')?.value;
    if (prior && !ref) throw new OutreachError('Original message threading reference is missing', 409);
    const subject = prior ? `Re: ${prior.subject.replace(/^Re:\s*/i, '')}` : body.subject;
    const raw = [`From: ${mail.email}`, `To: ${contact.email}`, `Subject: =?UTF-8?B?${btoa(Array.from(new TextEncoder().encode(subject), b => String.fromCharCode(b)).join(''))}?=`, `Message-ID: ${messageId}`, `List-Unsubscribe: ${listUnsubscribe(mail.email)}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', ...(ref ? [`In-Reply-To: ${ref}`, `References: ${ref}`] : []), '', escape(body.draft_text).replace(/\n/g, '<br>') + complianceFooterHtml()].join('\r\n');
    const sent = await mail.call('messages/send', { method: 'POST', body: JSON.stringify({ raw: b64(raw), ...(prior ? { threadId: prior.threadId } : {}) }) });
    if (!sent.id) throw new OutreachError('Google did not confirm delivery; check Sent before retrying', 502);
    const { error } = await s.db.from('outreach_touches').update({ status: 'completed', provider_message_id: sent.id, provider_thread_id: sent.threadId, outcome: 'sent', subject, draft_text: body.draft_text }).eq('id', touch.id).eq('tenant_id', s.tenant); check(error);
    if (contact.opportunity_id) {
      const { data: opportunity } = await s.db.from('opportunities').select('account_id').eq('id', contact.opportunity_id).eq('tenant_id', s.tenant).maybeSingle();
      if (opportunity?.account_id) {
        const { error: logError } = await s.db.from('client_interactions').insert({ tenant_id: s.tenant, account_id: opportunity.account_id, interaction_type: 'email', channel: 'email', subject, notes: body.draft_text, contact_email: contact.email, contact_name: contactName(contact), created_by: s.user.id, created_by_email: mail.email, outcome: 'sent', status: 'closed' });
        if (logError) return json({ success: true, warning: 'Email sent; account interaction logging needs attention' });
      }
    }
    return json({ success: true });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Outreach failed' }, e instanceof OutreachError ? e.status : 500); }
});