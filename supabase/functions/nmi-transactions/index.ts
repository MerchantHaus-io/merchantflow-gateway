import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NMI_BASE_URL = 'https://secure.nmi.com/api/v4';

// Allowed gateway IDs to prevent arbitrary queries
const ALLOWED_GATEWAY_IDS = ['1240273', '1279268', '1279623'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NMI_API_KEY = Deno.env.get('NMI_API_KEY');
    if (!NMI_API_KEY) {
      throw new Error('NMI_API_KEY is not configured');
    }

    // Verify JWT
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

    // Validate gateway IDs
    const validIds = (gateway_ids || []).filter((id: string) => ALLOWED_GATEWAY_IDS.includes(id));
    if (validIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid gateway IDs provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate date range (default last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start_date || thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = end_date || now.toISOString().split('T')[0];

    // Fetch transactions for each gateway ID in parallel
    const results = await Promise.all(
      validIds.map(async (gatewayId: string) => {
        try {
          // Use the v4 transactions reports endpoint
          const response = await fetch(`${NMI_BASE_URL}/merchants/${gatewayId}/transactions/reports`, {
            method: 'POST',
            headers: {
              'Authorization': NMI_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              startDate,
              endDate,
              maxResults: 100,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`NMI API error for gateway ${gatewayId} [${response.status}]:`, errorText);
            return {
              gateway_id: gatewayId,
              error: `API error: ${response.status}`,
              transactions: [],
              summary: null,
            };
          }

          const data = await response.json();

          // Parse transactions from NMI response
          const transactions = (data.transactions || data.data || data || []);
          const txList = Array.isArray(transactions) ? transactions : [];

          // Build summary
          const summary = {
            total_count: data.totalResults || txList.length,
            approved_count: 0,
            declined_count: 0,
            total_amount: 0,
            approved_amount: 0,
          };

          for (const tx of txList) {
            const amount = parseFloat(tx.amount || tx.requestedAmount || '0');
            summary.total_amount += amount;
            const condition = (tx.condition || tx.status || '').toLowerCase();
            if (condition === 'complete' || condition === 'pending' || condition === 'pendingsettlement' || condition === 'pending_settlement') {
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
              date: tx.date || tx.transactionDate || tx.created_at,
              amount: tx.amount || tx.requestedAmount,
              condition: tx.condition || tx.status,
              type: tx.transactionType || tx.type,
              card_type: tx.cardType || tx.card_type,
              last_four: tx.lastFour || tx.last_four || tx.ccLastFour,
              customer_name: tx.customerName || tx.customer_name || [tx.firstName, tx.lastName].filter(Boolean).join(' '),
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
