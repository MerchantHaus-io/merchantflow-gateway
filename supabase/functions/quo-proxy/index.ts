import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const QUO_API_BASE = 'https://api.openphone.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('QUO_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'QUO_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, params } = await req.json();

    let url: string;
    let method = 'GET';
    let body: string | undefined;

    switch (action) {
      // ── Phone Numbers ──────────────────────────────────────
      case 'list-phone-numbers': {
        url = `${QUO_API_BASE}/phone-numbers`;
        break;
      }
      case 'get-phone-number': {
        url = `${QUO_API_BASE}/phone-numbers/${params.phoneNumberId}`;
        break;
      }

      // ── Calls ──────────────────────────────────────────────
      case 'list-calls': {
        const sp = new URLSearchParams();
        if (params?.phoneNumberId) sp.set('phoneNumberId', params.phoneNumberId);
        if (params?.maxResults) sp.set('maxResults', params.maxResults.toString());
        if (params?.createdAfter) sp.set('createdAfter', params.createdAfter);
        if (params?.createdBefore) sp.set('createdBefore', params.createdBefore);
        if (params?.participants && Array.isArray(params.participants)) {
          for (const p of params.participants) sp.append('participants', p);
        }
        url = `${QUO_API_BASE}/calls?${sp.toString()}`;
        break;
      }
      case 'get-call': {
        url = `${QUO_API_BASE}/calls/${params.callId}`;
        break;
      }
      case 'get-call-summary': {
        url = `${QUO_API_BASE}/calls/${params.callId}/summary`;
        break;
      }
      case 'get-call-transcript': {
        url = `${QUO_API_BASE}/calls/${params.callId}/transcript`;
        break;
      }
      case 'get-call-recordings': {
        url = `${QUO_API_BASE}/calls/${params.callId}/recordings`;
        break;
      }
      case 'get-call-voicemail': {
        url = `${QUO_API_BASE}/calls/${params.callId}/voicemail`;
        break;
      }

      // ── Messages ───────────────────────────────────────────
      case 'list-messages': {
        const sp = new URLSearchParams();
        if (params?.phoneNumberId) sp.set('phoneNumberId', params.phoneNumberId);
        if (params?.maxResults) sp.set('maxResults', params.maxResults.toString());
        if (params?.after) sp.set('after', params.after);
        if (params?.participants && Array.isArray(params.participants)) {
          for (const p of params.participants) sp.append('participants', p);
        }
        url = `${QUO_API_BASE}/messages?${sp.toString()}`;
        break;
      }
      case 'get-message': {
        url = `${QUO_API_BASE}/messages/${params.messageId}`;
        break;
      }
      case 'send-message': {
        url = `${QUO_API_BASE}/messages`;
        method = 'POST';
        body = JSON.stringify({
          from: params.from,
          to: Array.isArray(params.to) ? params.to : [params.to],
          text: params.text,
        });
        break;
      }

      // ── Contacts ───────────────────────────────────────────
      case 'list-contacts': {
        const sp = new URLSearchParams();
        if (params?.maxResults) sp.set('maxResults', params.maxResults.toString());
        if (params?.after) sp.set('after', params.after);
        if (params?.externalIds && Array.isArray(params.externalIds)) {
          for (const id of params.externalIds) sp.append('externalIds', id);
        }
        url = `${QUO_API_BASE}/contacts?${sp.toString()}`;
        break;
      }
      case 'get-contact': {
        url = `${QUO_API_BASE}/contacts/${params.contactId}`;
        break;
      }
      case 'create-contact': {
        url = `${QUO_API_BASE}/contacts`;
        method = 'POST';
        body = JSON.stringify({
          defaultFields: params.defaultFields,
          customFields: params.customFields || {},
        });
        break;
      }
      case 'update-contact': {
        url = `${QUO_API_BASE}/contacts/${params.contactId}`;
        method = 'PATCH';
        body = JSON.stringify({
          defaultFields: params.defaultFields,
          customFields: params.customFields,
        });
        break;
      }
      case 'delete-contact': {
        url = `${QUO_API_BASE}/contacts/${params.contactId}`;
        method = 'DELETE';
        break;
      }

      // ── Conversations ──────────────────────────────────────
      case 'list-conversations': {
        const sp = new URLSearchParams();
        if (params?.phoneNumberId) sp.set('phoneNumberId', params.phoneNumberId);
        if (params?.userId) sp.set('userId', params.userId);
        if (params?.maxResults) sp.set('maxResults', params.maxResults.toString());
        if (params?.after) sp.set('after', params.after);
        url = `${QUO_API_BASE}/conversations?${sp.toString()}`;
        break;
      }

      // ── Users ──────────────────────────────────────────────
      case 'list-users': {
        url = `${QUO_API_BASE}/users`;
        break;
      }
      case 'get-user': {
        url = `${QUO_API_BASE}/users/${params.userId}`;
        break;
      }

      // ── Contact Custom Fields ──────────────────────────────
      case 'get-contact-custom-fields': {
        url = `${QUO_API_BASE}/contact-custom-fields`;
        break;
      }

      // ── Webhooks ───────────────────────────────────────────
      case 'create-webhook': {
        // Determine the correct webhook endpoint based on event types
        const events = params.events || [];
        let webhookPath = 'webhooks/calls'; // default
        if (events.some((e: string) => e.startsWith('message.'))) {
          webhookPath = 'webhooks/messages';
        } else if (events.some((e: string) => e.startsWith('call.summary'))) {
          webhookPath = 'webhooks/call-summaries';
        } else if (events.some((e: string) => e.startsWith('call.transcript'))) {
          webhookPath = 'webhooks/call-transcripts';
        }
        url = `${QUO_API_BASE}/${webhookPath}`;
        method = 'POST';
        body = JSON.stringify({
          url: params.url,
          events: params.events,
          label: params.label || 'MerchantHaus CRM',
          status: 'enabled',
        });
        break;
      }
      case 'list-webhooks': {
        url = `${QUO_API_BASE}/webhooks`;
        break;
      }
      case 'get-webhook': {
        url = `${QUO_API_BASE}/webhooks/${params.webhookId}`;
        break;
      }
      case 'delete-webhook': {
        url = `${QUO_API_BASE}/webhooks/${params.webhookId}`;
        method = 'DELETE';
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = body;
    }

    console.log(`Quo API ${method} ${url}`);
    const response = await fetch(url, fetchOptions);

    // Handle DELETE with no content
    if (response.status === 204) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    if (!response.ok) {
      console.error('Quo API error: status', (data as unknown)?.status || 'unknown');
      return new Response(
        JSON.stringify({ success: false, error: data.error || data.message || `Request failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in quo-proxy:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
