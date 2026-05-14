import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Helpers ──────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function matchContact(supabase: ReturnType<typeof createClient>, phoneNumber: string) {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, account_id, phone, first_name, last_name')
    .or(`phone.ilike.%${cleanPhone.slice(-10)}%,phone.ilike.%${phoneNumber}%`)
    .limit(1);

  if (contacts && contacts.length > 0) {
    const c = contacts[0];
    const contactDisplay = `${c.first_name || ''} ${c.last_name || ''}`.trim() || phoneNumber;

    // Find related opportunity
    const { data: opps } = await supabase
      .from('opportunities')
      .select('id')
      .eq('contact_id', c.id)
      .limit(1);

    return {
      contactId: c.id,
      accountId: c.account_id,
      opportunityId: opps?.[0]?.id || null,
      contactDisplay,
    };
  }
  return { contactId: null, accountId: null, opportunityId: null, contactDisplay: phoneNumber };
}

async function getAllOpportunities(supabase: ReturnType<typeof createClient>, contactId: string) {
  const { data } = await supabase
    .from('opportunities')
    .select('id')
    .eq('contact_id', contactId);
  return data || [];
}

async function notifyAllUsers(
  supabase: ReturnType<typeof createClient>,
  title: string,
  message: string,
  type: string,
  link: string
) {
  const { data: profiles } = await supabase.from('profiles').select('id, email');
  if (profiles && profiles.length > 0) {
    const notifications = profiles.map((p: { id: string; email: string }) => ({
      user_id: p.id,
      user_email: p.email || '',
      title,
      message,
      type,
      link,
    }));
    await supabase.from('notifications').insert(notifications);
  }
}

// ── Call Handlers ────────────────────────────────────────────────────

async function handleCallEvent(supabase: ReturnType<typeof createClient>, eventType: string, callData: any) {
  const isIncoming = callData.direction === 'incoming';
  const externalNumber = isIncoming ? callData.from : callData.to;
  const participants = [callData.from, callData.to].filter(Boolean);

  console.log('Call direction:', callData.direction, '| External:', externalNumber);

  const { contactId, accountId, opportunityId, contactDisplay } =
    externalNumber ? await matchContact(supabase, externalNumber) : { contactId: null, accountId: null, opportunityId: null, contactDisplay: 'Unknown' };

  // Map event to status
  let status = 'unknown';
  if (eventType === 'call.ringing') status = 'ringing';
  else if (eventType === 'call.completed') status = 'completed';
  else if (eventType === 'call.recording.completed') status = 'recorded';

  // Upsert call log
  const callLog = {
    quo_call_id: callData.id,
    direction: callData.direction || 'unknown',
    status,
    duration: callData.duration || 0,
    phone_number: externalNumber || null,
    participants,
    quo_phone_number_id: callData.phoneNumberId || null,
    initiated_by: callData.userId || callData.initiatedBy || null,
    answered_at: callData.answeredAt || null,
    completed_at: callData.completedAt || null,
    contact_id: contactId,
    opportunity_id: opportunityId,
    account_id: accountId,
  };

  const { error } = await supabase.from('call_logs').upsert(callLog, { onConflict: 'quo_call_id' });
  if (error) console.error('Error upserting call log:', error);
  else console.log('Call log upserted:', callData.id);

  // Log activity on completed calls
  if (contactId && eventType === 'call.completed') {
    const durationMin = Math.round((callData.duration || 0) / 60);
    const durationLabel = durationMin > 0 ? `${durationMin}m` : `${callData.duration || 0}s`;

    const allOpps = await getAllOpportunities(supabase, contactId);
    if (allOpps.length > 0) {
      const activityRows = allOpps.map((opp: { id: string }) => ({
        opportunity_id: opp.id,
        type: 'call',
        description: `${isIncoming ? 'Incoming' : 'Outgoing'} call with ${contactDisplay} (${durationLabel}) — ${externalNumber || 'Unknown'}`,
      }));
      await supabase.from('activities').insert(activityRows);
      console.log(`Logged call activity on ${allOpps.length} opportunity(ies)`);
    }

    // Log client_interaction
    if (accountId) {
      await supabase.from('client_interactions').insert({
        account_id: accountId,
        interaction_type: 'call',
        subject: `${isIncoming ? 'Incoming' : 'Outgoing'} Call — ${contactDisplay}`,
        notes: `Phone: ${externalNumber || 'N/A'} | Duration: ${durationLabel}`,
        status: 'resolved',
        priority: 'medium',
        contact_name: contactDisplay,
        contact_phone: externalNumber || null,
      });
    }
  }

  // Incoming call notification
  if (eventType === 'call.ringing' && isIncoming) {
    await notifyAllUsers(
      supabase,
      'Incoming Call',
      `Incoming call from ${contactDisplay}`,
      'call',
      opportunityId ? `/opportunities/${opportunityId}` : '/contacts'
    );
  }
}

async function handleCallRecording(supabase: ReturnType<typeof createClient>, callData: any) {
  const recordingMedia = callData.media;
  if (recordingMedia && Array.isArray(recordingMedia) && recordingMedia.length > 0) {
    const recordingUrl = recordingMedia[0]?.url || null;
    if (recordingUrl) {
      await supabase.from('call_logs').update({ recording_url: recordingUrl }).eq('quo_call_id', callData.id);
      console.log('Recording URL saved for call:', callData.id);
    }
  }
}

async function handleCallSummary(supabase: ReturnType<typeof createClient>, payload: any) {
  const summaryData = payload.data?.object;
  const callId = summaryData?.callId || payload.data?.object?.id;
  if (callId) {
    await supabase.from('call_logs').update({
      summary: summaryData?.summary || [],
      next_steps: summaryData?.nextSteps || [],
    }).eq('quo_call_id', callId);
    console.log('Summary saved for call:', callId);
  }
}

async function handleCallTranscript(supabase: ReturnType<typeof createClient>, payload: any) {
  const transcriptData = payload.data?.object;
  const callId = transcriptData?.callId || payload.data?.object?.id;
  if (callId) {
    await supabase.from('call_logs').update({
      transcript: transcriptData?.dialogue || [],
    }).eq('quo_call_id', callId);
    console.log('Transcript saved for call:', callId);
  }
}

// ── Message Handlers ─────────────────────────────────────────────────

async function handleMessageEvent(supabase: ReturnType<typeof createClient>, eventType: string, msgData: any) {
  const isIncoming = msgData.direction === 'incoming';
  const externalNumber = isIncoming ? msgData.from : (Array.isArray(msgData.to) ? msgData.to[0] : msgData.to);

  console.log('Message direction:', msgData.direction, '| External:', externalNumber, '| Event:', eventType);

  const { contactId, accountId, opportunityId, contactDisplay } =
    externalNumber ? await matchContact(supabase, externalNumber) : { contactId: null, accountId: null, opportunityId: null, contactDisplay: 'Unknown' };

  // Map event type to status
  let status = 'unknown';
  if (eventType === 'message.received') status = 'received';
  else if (eventType === 'message.delivered') status = 'delivered';

  // Upsert message log
  const messageLog = {
    quo_message_id: msgData.id,
    direction: msgData.direction || 'unknown',
    status,
    phone_number: externalNumber || null,
    content: msgData.text || null,
    from_number: msgData.from || null,
    to_numbers: Array.isArray(msgData.to) ? msgData.to : msgData.to ? [msgData.to] : [],
    quo_phone_number_id: msgData.phoneNumberId || null,
    contact_id: contactId,
    opportunity_id: opportunityId,
    account_id: accountId,
    media_urls: msgData.media?.map((m: any) => m.url).filter(Boolean) || [],
  };

  const { error } = await supabase.from('message_logs').upsert(messageLog, { onConflict: 'quo_message_id' });
  if (error) console.error('Error upserting message log:', error);
  else console.log('Message log upserted:', msgData.id);

  // Log activity on received messages only
  if (contactId && eventType === 'message.received') {
    const allOpps = await getAllOpportunities(supabase, contactId);
    if (allOpps.length > 0) {
      const preview = (msgData.text || '').slice(0, 80);
      const activityRows = allOpps.map((opp: { id: string }) => ({
        opportunity_id: opp.id,
        type: 'sms',
        description: `Incoming SMS from ${contactDisplay}: "${preview}${(msgData.text || '').length > 80 ? '…' : ''}"`,
      }));
      await supabase.from('activities').insert(activityRows);
      console.log(`Logged SMS activity on ${allOpps.length} opportunity(ies)`);
    }

    // Log client_interaction
    if (accountId) {
      await supabase.from('client_interactions').insert({
        account_id: accountId,
        interaction_type: 'sms',
        subject: `Incoming SMS — ${contactDisplay}`,
        notes: `Phone: ${externalNumber || 'N/A'} | Message: ${(msgData.text || '').slice(0, 200)}`,
        status: 'resolved',
        priority: 'medium',
        contact_name: contactDisplay,
        contact_phone: externalNumber || null,
      });
    }

    // Notify all users of incoming SMS
    await notifyAllUsers(
      supabase,
      'Incoming SMS',
      `SMS from ${contactDisplay}: "${(msgData.text || '').slice(0, 80)}"`,
      'sms',
      opportunityId ? `/opportunities/${opportunityId}` : '/contacts'
    );
  }
}

// ── Main Handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Quo webhook received:', JSON.stringify({ type: payload?.type, hasData: !!payload?.data }));

    const supabase = getSupabase();
    const eventType = payload.type;
    const objectData = payload.data?.object;

    if (!objectData) {
      console.log('No object data in payload');
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Route by event type
    switch (eventType) {
      case 'call.ringing':
      case 'call.completed':
        await handleCallEvent(supabase, eventType, objectData);
        break;

      case 'call.recording.completed':
        await handleCallEvent(supabase, eventType, objectData);
        await handleCallRecording(supabase, objectData);
        break;

      case 'call.summary.completed':
        await handleCallSummary(supabase, payload);
        break;

      case 'call.transcript.completed':
        await handleCallTranscript(supabase, payload);
        break;

      case 'message.received':
      case 'message.delivered':
        await handleMessageEvent(supabase, eventType, objectData);
        break;

      default:
        console.log('Unhandled event type:', eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
