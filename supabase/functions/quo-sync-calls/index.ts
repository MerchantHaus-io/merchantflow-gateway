// Periodic Quo (OpenPhone) call sync.
// Pulls recent calls from every phone number and upserts them into call_logs
// so Atria always has persistent access to the full call history (not just
// webhook-received events going forward).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUO_API_BASE = 'https://api.openphone.com/v1';

type QuoCall = {
  id: string;
  direction?: 'incoming' | 'outgoing' | string;
  status?: string;
  duration?: number;
  participants?: string[];
  from?: string;
  to?: string | string[];
  phoneNumberId?: string;
  userId?: string;
  answeredAt?: string;
  completedAt?: string;
  createdAt?: string;
};

async function quoFetch(path: string, apiKey: string) {
  const res = await fetch(`${QUO_API_BASE}${path}`, {
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Quo ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function matchContact(
  supabase: ReturnType<typeof createClient>,
  phone: string,
) {
  if (!phone) return { contactId: null, accountId: null, opportunityId: null };
  const last10 = phone.replace(/\D/g, '').slice(-10);
  if (!last10) return { contactId: null, accountId: null, opportunityId: null };
  const { data } = await supabase
    .from('contacts')
    .select('id, account_id')
    .ilike('phone', `%${last10}%`)
    .limit(1);
  const c = data?.[0];
  if (!c) return { contactId: null, accountId: null, opportunityId: null };
  const { data: opps } = await supabase
    .from('opportunities')
    .select('id')
    .eq('contact_id', c.id)
    .limit(1);
  return {
    contactId: c.id,
    accountId: c.account_id,
    opportunityId: opps?.[0]?.id ?? null,
  };
}

function counterpartPhone(call: QuoCall): string {
  // Whichever side is NOT one of our phone numbers; fallback to first participant.
  const parts = (call.participants || []).filter(Boolean);
  return (
    parts[0] ||
    (Array.isArray(call.to) ? call.to[0] : call.to) ||
    call.from ||
    ''
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('QUO_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'QUO_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Optional body params: { hoursBack?: number, maxPerNumber?: number }
    let hoursBack = 24;
    let maxPerNumber = 100;
    try {
      const body = req.method === 'POST' ? await req.json() : {};
      if (typeof body?.hoursBack === 'number') hoursBack = body.hoursBack;
      if (typeof body?.maxPerNumber === 'number') maxPerNumber = body.maxPerNumber;
    } catch { /* no body */ }

    const createdAfter = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

    // 1. List all our phone numbers
    const phoneRes = await quoFetch('/phone-numbers', apiKey);
    const phoneNumbers: Array<{ id: string; phoneNumber?: string }> =
      phoneRes?.data || phoneRes || [];

    let totalFetched = 0;
    let totalUpserted = 0;
    const errors: string[] = [];

    for (const pn of phoneNumbers) {
      try {
        const sp = new URLSearchParams();
        sp.set('phoneNumberId', pn.id);
        sp.set('maxResults', String(Math.min(maxPerNumber, 100)));
        sp.set('createdAfter', createdAfter);
        const callsRes = await quoFetch(`/calls?${sp.toString()}`, apiKey);
        const calls: QuoCall[] = callsRes?.data || [];
        totalFetched += calls.length;

        for (const call of calls) {
          const phone = counterpartPhone(call);
          const match = await matchContact(supabase, phone);

          const row = {
            quo_call_id: call.id,
            contact_id: match.contactId,
            account_id: match.accountId,
            opportunity_id: match.opportunityId,
            direction:
              call.direction === 'incoming'
                ? 'inbound'
                : call.direction === 'outgoing'
                ? 'outbound'
                : call.direction || null,
            status: call.status || null,
            duration: typeof call.duration === 'number' ? call.duration : null,
            phone_number: phone || null,
            participants: call.participants || null,
            quo_phone_number_id: pn.id,
            initiated_by: call.userId || null,
            answered_at: call.answeredAt || null,
            completed_at: call.completedAt || null,
            created_at: call.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from('call_logs')
            .upsert(row, { onConflict: 'quo_call_id' });
          if (error) {
            errors.push(`${call.id}: ${error.message}`);
          } else {
            totalUpserted++;
          }
        }
      } catch (e) {
        errors.push(`phone ${pn.id}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        hoursBack,
        phoneNumbers: phoneNumbers.length,
        fetched: totalFetched,
        upserted: totalUpserted,
        errors: errors.slice(0, 20),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
