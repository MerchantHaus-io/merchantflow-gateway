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
      case 'list-phone-numbers': {
        url = `${QUO_API_BASE}/phone-numbers`;
        break;
      }
      case 'list-calls': {
        const searchParams = new URLSearchParams();
        if (params?.phoneNumberId) searchParams.set('phoneNumberId', params.phoneNumberId);
        if (params?.maxResults) searchParams.set('maxResults', params.maxResults.toString());
        if (params?.createdAfter) searchParams.set('createdAfter', params.createdAfter);
        // participants must be an array - append each as separate query param
        if (params?.participants && Array.isArray(params.participants)) {
          for (const p of params.participants) {
            searchParams.append('participants', p);
          }
        }
        url = `${QUO_API_BASE}/calls?${searchParams.toString()}`;
        break;
      }
      case 'create-webhook': {
        url = `${QUO_API_BASE}/webhooks/calls`;
        method = 'POST';
        body = JSON.stringify({
          url: params.url,
          events: params.events || ['call.completed', 'call.ringing', 'call.recording.completed', 'call.summary.completed', 'call.transcript.completed'],
          label: params.label || 'MerchantHaus CRM',
          status: 'enabled',
        });
        break;
      }
      case 'list-webhooks': {
        url = `${QUO_API_BASE}/webhooks/calls`;
        break;
      }
      case 'delete-webhook': {
        url = `${QUO_API_BASE}/webhooks/calls/${params.webhookId}`;
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

    if (body && (method === 'POST' || method === 'PUT')) {
      fetchOptions.body = body;
    }

    console.log(`Quo API ${method} ${url}`);
    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      console.error('Quo API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed: ${response.status}` }),
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
