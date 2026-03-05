import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('Quo webhook received:', JSON.stringify(payload));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const eventType = payload.type;
    const callData = payload.data?.object;

    if (!callData) {
      console.log('No call data in payload');
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // OpenPhone sends `from` and `to` — derive the external participant
    const isIncoming = callData.direction === 'incoming';
    const externalNumber = isIncoming ? callData.from : callData.to;
    const participants = [callData.from, callData.to].filter(Boolean);

    console.log('Call direction:', callData.direction, '| External number:', externalNumber, '| From:', callData.from, '| To:', callData.to);

    // Try to match external phone number to a CRM contact
    let contactId: string | null = null;
    let opportunityId: string | null = null;
    let accountId: string | null = null;

    if (externalNumber) {
      const cleanPhone = externalNumber.replace(/\D/g, '');

      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, account_id, phone')
        .or(`phone.ilike.%${cleanPhone.slice(-10)}%,phone.ilike.%${externalNumber}%`)
        .limit(1);

      if (contacts && contacts.length > 0) {
        contactId = contacts[0].id;
        accountId = contacts[0].account_id;
        console.log('Matched contact:', contactId, '| Account:', accountId);

        // Find related opportunity
        const { data: opportunities } = await supabase
          .from('opportunities')
          .select('id')
          .eq('contact_id', contactId)
          .limit(1);

        if (opportunities && opportunities.length > 0) {
          opportunityId = opportunities[0].id;
        }
      } else {
        console.log('No contact match for:', externalNumber);
      }
    }

    // Map Quo event to call log status
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

    console.log('Upserting call log:', JSON.stringify(callLog));

    const { error } = await supabase
      .from('call_logs')
      .upsert(callLog, { onConflict: 'quo_call_id' });

    if (error) {
      console.error('Error upserting call log:', error);
    } else {
      console.log('Call log upserted:', callData.id);
    }

    // Also log as activity if we have an opportunity
    if (opportunityId && eventType === 'call.completed') {
      const durationMin = Math.round((callData.duration || 0) / 60);
      await supabase.from('activities').insert({
        opportunity_id: opportunityId,
        type: 'call',
        description: `${isIncoming ? 'Incoming' : 'Outgoing'} call (${durationMin}m) - ${externalNumber || 'Unknown'}`,
      });
    }

    // Handle call recordings
    if (eventType === 'call.recording.completed') {
      const recordingMedia = callData.media;
      if (recordingMedia && Array.isArray(recordingMedia) && recordingMedia.length > 0) {
        const recordingUrl = recordingMedia[0]?.url || null;
        if (recordingUrl) {
          await supabase
            .from('call_logs')
            .update({ recording_url: recordingUrl })
            .eq('quo_call_id', callData.id);
          console.log('Recording URL saved for call:', callData.id);
        }
      }
    }

    // Handle call summaries
    if (eventType === 'call.summary.completed') {
      const summaryData = payload.data?.object;
      const callId = summaryData?.callId || callData?.id;
      if (callId) {
        await supabase
          .from('call_logs')
          .update({
            summary: summaryData?.summary || [],
            next_steps: summaryData?.nextSteps || [],
          })
          .eq('quo_call_id', callId);
        console.log('Summary saved for call:', callId);
      }
    }

    // Handle call transcripts
    if (eventType === 'call.transcript.completed') {
      const transcriptData = payload.data?.object;
      const callId = transcriptData?.callId || callData?.id;
      if (callId) {
        await supabase
          .from('call_logs')
          .update({
            transcript: transcriptData?.dialogue || [],
          })
          .eq('quo_call_id', callId);
        console.log('Transcript saved for call:', callId);
      }
    }

    // If it's a ringing incoming call, create a notification for all users
    if (eventType === 'call.ringing' && isIncoming) {
      const contactName = contactId ? 
        (await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).single())
          .data : null;
      
      const callerDisplay = contactName 
        ? `${contactName.first_name || ''} ${contactName.last_name || ''}`.trim()
        : externalNumber || 'Unknown';

      // Notify all users
      const { data: profiles } = await supabase.from('profiles').select('id, email');
      if (profiles) {
        const notifications = profiles.map(p => ({
          user_id: p.id,
          user_email: p.email || '',
          title: '📞 Incoming Call',
          message: `Incoming call from ${callerDisplay}`,
          type: 'call',
          link: opportunityId ? `/opportunities/${opportunityId}` : '/contacts',
        }));
        await supabase.from('notifications').insert(notifications);
      }
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
