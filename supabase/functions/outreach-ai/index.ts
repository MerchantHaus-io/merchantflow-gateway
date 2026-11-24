import { z } from 'npm:zod@3';
import { Output } from 'npm:ai@6';
import { createResponsesCall } from '../_shared/outreach-responses.ts';
import { getLovableAiGatewayResponseHeaders } from '../_shared/outreach-run-id.ts';
import { outreachSession, enrollmentFor, activeAssignee, OutreachError, json, corsHeaders } from '../_shared/outreach-session.ts';
import { publicHttps, emailIssue, citationUrl, withoutCitations, researchPersonalisation } from '../_shared/outreach-policy.ts';
import { OUTREACH_AI_LOGIC_VERSION, buildResearchInstructions, buildResearchInput } from '../_shared/outreach-prompt.ts';

const inputSchema = z.object({ enrollment_id: z.string().uuid() });
const outputSchema = z.object({ summary: z.string(), facts: z.array(z.object({ detail: z.string(), source: z.string(), about: z.enum(['company', 'person']) }).strict()), drafts: z.array(z.object({ touch_number: z.number(), subject: z.string(), text: z.string() }).strict()) }).strict();
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const s = await outreachSession(req);
    const parsed = inputSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: 'Choose a cadence contact' }, 400);
    const { enrollment, contact } = await enrollmentFor(s, parsed.data.enrollment_id);
    await activeAssignee(s, enrollment.assigned_user_id);
    if (!['active', 'paused'].includes(enrollment.status)) throw new OutreachError('Research is unavailable for a stopped cadence');
    const website = publicHttps(enrollment.website_url || '');
    if (!website) throw new OutreachError('Add the company’s public HTTPS website before researching');
    const key = Deno.env.get('LOVABLE_API_KEY'); if (!key) throw new OutreachError('Lovable AI is not configured', 503);
    // Provider denials persist across reloads and function restarts; no automatic alternative or retry.
    const { data: denied } = await s.admin.from('outreach_enrollments').select('research_error').eq('tenant_id', s.tenant).eq('research_status', 'blocked').like('research_error', 'Provider access denied:%').limit(1);
    if (denied?.length) throw new OutreachError(denied[0].research_error, 403);
    const { data: claimed, error } = await s.db.from('outreach_enrollments').update({ research_status: 'running', research_error: null }).eq('id', enrollment.id).eq('tenant_id', s.tenant).neq('research_status', 'running').select('id');
    if (error) throw new OutreachError(error.message);
    if (!claimed?.length) throw new OutreachError('Research is already running', 409);
    const { data: roster } = await s.admin.from('team_roster').select('display_name').eq('tenant_id', s.tenant).eq('email', enrollment.assigned_email).maybeSingle();
    const { data: touches } = await s.db.from('outreach_touches').select('touch_number,title,channel,thread_touch,status').eq('tenant_id', s.tenant).eq('enrollment_id', enrollment.id).order('touch_number');
    const host = new URL(website).hostname.replace(/^www\./, '');
    const senderName = roster?.display_name || enrollment.assigned_email.split('@')[0];
    const input = buildResearchInput({ company: contact.company, firstName: contact.first_name, lastName: contact.last_name, title: contact.job_title, website, linkedinUrl: enrollment.linkedin_url, senderName, touches });
    const call = createResponsesCall(req, { baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey: key, model: 'openai/gpt-6-astra' }, [{ role: 'user', content: JSON.stringify(input) }],
      buildResearchInstructions({ host, senderName }),
      provider => ({ tools: { web_search: provider.tools.webSearch({}) }, output: Output.object({ schema: outputSchema }) }));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (data: unknown) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* browser cancelled */ } };
        const sources: { url: string; title: string }[] = [];
        try {
          emit({ type: 'progress', message: 'Researching public company and contact sources…' });
          for await (const part of call.result.fullStream) {
            if (part.type === 'error') throw part.error;
            if (part.type === 'source' && part.sourceType === 'url' && publicHttps(part.url) && new URL(part.url).hostname.replace(/^www\./, '') === host) sources.push({ url: part.url, title: part.title || part.url });
            if (part.type === 'reasoning-delta') emit({ type: 'reasoning', text: part.text });
            if (part.type === 'text-delta') emit({ type: 'progress', message: 'Preparing twelve editable touch drafts…' });
          }
          const result = outputSchema.parse(await call.result.output);
          const facts = result.facts.flatMap(f => {
            const source = sources.find(source => citationUrl(source.url) === citationUrl(f.source));
            return source ? [{ detail: withoutCitations(f.detail), source: source.url, about: f.about }] : [];
          });
          // Rule 26: thin site -> flagged drafts; claimed-but-unverified facts -> nothing saved.
          const outcome = researchPersonalisation(result.facts.length, facts.length, result.summary);
          if ('error' in outcome) throw new OutreachError(outcome.error, 422);
          const { personalisation, summary } = outcome;
          if (result.drafts.length !== 12 || new Set(result.drafts.map(d => d.touch_number)).size !== 12 || result.drafts.some(d => d.touch_number < 1 || d.touch_number > 12)) throw new OutreachError('AI returned an incomplete cadence; no drafts were saved', 422);
          for (const draft of result.drafts) {
            draft.text = withoutCitations(draft.text);
            const touch = touches?.find(t => t.touch_number === draft.touch_number);
            if (touch?.channel === 'email') { const issue = emailIssue(draft.subject, draft.text); if (issue) throw new OutreachError(`Touch ${draft.touch_number}: ${issue}`, 422); }
          }
          // Do not silently overwrite drafts the teammate has already edited. A draft that is
          // still exactly the previous AI output (unedited) may be refreshed by a re-run.
          const previous = ((enrollment.research as { ai_drafts?: Record<string, string> } | null)?.ai_drafts) || {};
          const aiDrafts: Record<string, string> = {};
          let saved = 0;
          for (const draft of result.drafts) {
            aiDrafts[String(draft.touch_number)] = draft.text;
            const target = () => s.db.from('outreach_touches').update({ subject: draft.subject, draft_text: draft.text }).eq('tenant_id', s.tenant).eq('enrollment_id', enrollment.id).eq('touch_number', draft.touch_number).eq('status', 'pending');
            const { data, error: writeError } = await target().eq('draft_text', '').select('id');
            if (writeError) throw new OutreachError(writeError.message); saved += data?.length || 0;
            const prior = previous[String(draft.touch_number)];
            if (!data?.length && prior) {
              const { data: refreshed, error: refreshError } = await target().eq('draft_text', prior).select('id');
              if (refreshError) throw new OutreachError(refreshError.message); saved += refreshed?.length || 0;
            }
          }
          const { error: saveError } = await s.db.from('outreach_enrollments').update({ research: { summary, facts, logic_version: OUTREACH_AI_LOGIC_VERSION, personalisation, ai_drafts: aiDrafts }, research_sources: sources, research_status: 'ready', research_error: null, research_run_id: call.runIdFetch.getRunId(), researched_at: new Date().toISOString() }).eq('tenant_id', s.tenant).eq('id', enrollment.id);
          if (saveError) throw new OutreachError(saveError.message);
          emit({ type: 'done', saved, sources, personalisation });
        } catch (err) {
          const e = err as { message?: string; statusCode?: number; responseBody?: string; name?: string };
          let message = e.message || 'Research failed; no messages were sent';
          try { const upstream = JSON.parse(e.responseBody || '{}'); message = upstream.message || upstream.error?.message || upstream.error || message; } catch { /* keep safe SDK error */ }
          const status = e.statusCode || (err instanceof OutreachError ? err.status : req.signal.aborted ? 499 : 500);
          const providerDenial = status === 403 && !/credit|limit|policy|region|vendor|retention/i.test(message);
          if (providerDenial) message = `Provider access denied: ${message}`;
          await s.db.from('outreach_enrollments').update({ research_status: [402, 403].includes(status) ? 'blocked' : 'failed', research_error: message, research_run_id: call.runIdFetch.getRunId() }).eq('tenant_id', s.tenant).eq('id', enrollment.id);
          emit({ type: [402, 403].includes(status) ? 'denied' : 'error', message, status });
        } finally { try { controller.close(); } catch { /* cancelled */ } }
      },
    });
    await call.runIdFetch.waitForRunId();
    const headers = getLovableAiGatewayResponseHeaders(call.runIdFetch.getRunId() ? { 'X-Lovable-AIG-Run-ID': call.runIdFetch.getRunId() || '' } : undefined, { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const upstreamStatus = call.runIdFetch.getUpstreamStatus();
    return new Response(stream, { headers, status: upstreamStatus && upstreamStatus >= 400 ? upstreamStatus : 200 });
  } catch (e) { return json({ error: e instanceof Error ? e.message : 'Research failed' }, e instanceof OutreachError ? e.status : 500); }
});