import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NMI_API_URL = 'https://secure.nmi.com/api/v4/transactions/reports';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NMI_API_KEY = Deno.env.get('NMI_API_KEY');
    if (!NMI_API_KEY) {
      throw new Error('NMI_API_KEY is not configured');
    }

    // Verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { gateway_ids, start_date, end_date } = await req.json();

    if (!gateway_ids || !Array.isArray(gateway_ids) || gateway_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'No gateway IDs provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date range (default last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start_date || thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = end_date || now.toISOString().split('T')[0];

    // Fetch transactions for each gateway ID
    const results = await Promise.all(
      gateway_ids.map(async (gatewayId: string) => {
        try {
          // POST to /v4/transactions/reports with merchantId in body
          const nmiPayload: Record<string, any> = {
            merchantId: gatewayId,
            maxResults: "100",
            date: {
              startDate,
              endDate,
            },
          };

          console.log(`Fetching transactions for gateway ${gatewayId}:`, JSON.stringify(nmiPayload));

          const response = await fetch(NMI_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': NMI_API_KEY,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(nmiPayload),
          });

          const responseText = await response.text();
          console.log(`NMI response for gateway ${gatewayId} [${response.status}]:`, responseText.substring(0, 500));

          if (!response.ok) {
            return {
              gateway_id: gatewayId,
              error: `NMI API ${response.status}: ${responseText.substring(0, 200)}`,
              transactions: [],
              summary: null,
            };
          }

          let data;
          try {
            data = JSON.parse(responseText);
          } catch {
            return {
              gateway_id: gatewayId,
              error: 'Invalid JSON response from NMI',
              transactions: [],
              summary: null,
            };
          }

          // Parse transactions - NMI v4 returns data in various formats
          const txList = Array.isArray(data) ? data 
            : Array.isArray(data?.transactions) ? data.transactions
            : Array.isArray(data?.data) ? data.data
            : [];

          // Build summary
          const summary = {
            total_count: data?.totalResults || txList.length,
            approved_count: 0,
            declined_count: 0,
            total_amount: 0,
            approved_amount: 0,
          };

          for (const tx of txList) {
            const amount = parseFloat(tx.amount || tx.requestedAmount || tx.authorizedAmount || '0');
            summary.total_amount += amount;
            const condition = (tx.condition || tx.status || tx.responseText || '').toLowerCase();
            if (['complete', 'pending', 'pendingsettlement', 'pending_settlement', 'approved'].includes(condition)) {
              summary.approved_count++;
              summary.approved_amount += amount;
            } else {
              summary.declined_count++;
            }
          }

          return {
            gateway_id: gatewayId,
            transactions: txList.slice(0, 50).map((tx: any) => ({
              id: tx.transactionId || tx.transaction_id || tx.id,
              date: tx.date || tx.transactionDate || tx.dateTime || tx.created_at,
              amount: tx.amount || tx.requestedAmount || tx.authorizedAmount,
              condition: tx.condition || tx.status || tx.responseText,
              type: tx.transactionType || tx.type || tx.actionType,
              card_type: tx.cardType || tx.card_type || tx.ccType,
              last_four: tx.lastFour || tx.last_four || tx.ccLastFour || tx.ccLast4,
              customer_name: tx.customerName || tx.customer_name || [tx.firstName, tx.lastName].filter(Boolean).join(' ') || [tx.billingFirstName, tx.billingLastName].filter(Boolean).join(' '),
            })),
            summary,
          };
        } catch (err) {
          console.error(`Error fetching transactions for gateway ${gatewayId}:`, err);
          return {
            gateway_id: gatewayId,
            error: err instanceof Error ? err.message : 'Unknown error',
            transactions: [],
            summary: null,
          };
        }
      })
    );

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('NMI transactions error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
