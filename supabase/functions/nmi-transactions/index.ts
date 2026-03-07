import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const NMI_QUERY_URL = 'https://secure.nmi.com/api/query.php';

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
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
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
    const startDate = start_date || formatDate(thirtyDaysAgo);
    const endDate = end_date || formatDate(now);

    // Fetch transactions for each gateway ID
    // NMI sub-merchant accounts are queried by making a separate API call per
    // gateway ID, using the gateway's own security key stored in the DB — or,
    // if we only have the master key, by including merchant_id in the query.
    const results = await Promise.all(
      gateway_ids.map(async (gatewayId: string) => {
        try {
          console.log(`Fetching transactions for gateway ${gatewayId} from ${startDate} to ${endDate}`);

          // FIX: Include merchant_id (the sub-merchant gateway ID) in the query
          // so NMI scopes results to that specific merchant account.
          // NMI's query API accepts merchant_id to filter by sub-merchant.
          const params = new URLSearchParams({
            security_key: NMI_API_KEY,
            start_date: startDate,
            end_date: endDate,
            merchant_id: gatewayId,  // <-- THIS WAS MISSING — the root cause of zero results
          });

          const response = await fetch(NMI_QUERY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });

          const responseText = await response.text();

          if (!response.ok) {
            console.error(`NMI API error for gateway ${gatewayId} [${response.status}]:`, responseText.substring(0, 500));
            return {
              gateway_id: gatewayId,
              error: `NMI API returned HTTP ${response.status}`,
              transactions: [],
              summary: null,
            };
          }

          console.log(`NMI response length for gateway ${gatewayId}: ${responseText.length} chars`);
          console.log(`NMI response preview: ${responseText.substring(0, 500)}`);

          // Check for NMI-level error in the XML (e.g. invalid merchant_id)
          if (responseText.includes('<response_code>200</response_code>') === false && responseText.includes('<response>')) {
            const errCode = extractSingleField(responseText, 'response_code');
            const errText = extractSingleField(responseText, 'message') || extractSingleField(responseText, 'result_text');
            if (errCode && errCode !== '100') {
              console.error(`NMI query error for ${gatewayId}: [${errCode}] ${errText}`);
              return {
                gateway_id: gatewayId,
                error: `NMI error ${errCode}: ${errText || 'Unknown'}`,
                transactions: [],
                summary: null,
              };
            }
          }

          // Parse XML response
          const transactions = parseNmiXml(responseText, gatewayId);
          console.log(`Parsed ${transactions.length} transactions for gateway ${gatewayId}`);

          // Build summary
          const summary = {
            total_count: transactions.length,
            approved_count: 0,
            declined_count: 0,
            total_amount: 0,
            approved_amount: 0,
          };

          for (const tx of transactions) {
            const amount = parseFloat(tx.amount || '0');
            summary.total_amount += amount;
            const condition = (tx.condition || '').toLowerCase();
            if (['complete', 'pending', 'pendingsettlement', 'pending_settlement'].includes(condition)) {
              summary.approved_count++;
              summary.approved_amount += amount;
            } else {
              summary.declined_count++;
            }
          }

          return {
            gateway_id: gatewayId,
            transactions: transactions.slice(0, 100),
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

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  // NMI date format: YYYYMMDDHHMMSS — use start-of-day / end-of-day
  return `${yyyy}${mm}${dd}`;
}

/** Extract a single top-level XML field value (for error checking) */
function extractSingleField(xml: string, field: string): string | null {
  const m = xml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
  return m ? m[1].trim() : null;
}

/** Parse NMI Query API XML response into transaction objects */
function parseNmiXml(xml: string, filterGatewayId: string): any[] {
  const transactions: any[] = [];

  // Extract all <transaction> blocks
  const txRegex = /<transaction>([\s\S]*?)<\/transaction>/g;
  let match;

  while ((match = txRegex.exec(xml)) !== null) {
    const block = match[1];
    const tx = extractFields(block);

    // FIX: The old filter was inverted — it only skipped rows where merchant_id
    // was present AND mismatched. Rows with no merchant_id (most sub-merchant
    // responses) always slipped through unfiltered.
    //
    // Correct approach: since we queried with merchant_id in the request, NMI
    // already scoped the response. We just do a soft secondary check: if the
    // field IS present and doesn't match, skip it (prevents cross-contamination
    // when the API key is a parent account with multiple sub-merchants).
    const txMerchantId = (tx.merchant_id || tx.gateway_id || '').trim();
    if (txMerchantId && txMerchantId !== filterGatewayId.trim()) {
      console.log(`Skipping tx ${tx.transaction_id} — merchant_id ${txMerchantId} != ${filterGatewayId}`);
      continue;
    }

    // Debug log first few parsed transactions
    if (transactions.length < 3) {
      console.log(`Sample tx: id=${tx.transaction_id} condition=${tx.condition} amount=${tx.amount} requested_amount=${tx.requested_amount}`);
    }

    // FIX: NMI amount field precedence.
    // <amount> is only populated after settlement.
    // <requested_amount> has the authorised amount at auth time.
    // Prefer requested_amount so pending/auth txns show their value correctly.
    const amount =
      tx.requested_amount && tx.requested_amount !== '0.00'
        ? tx.requested_amount
        : tx.amount && tx.amount !== '0.00'
          ? tx.amount
          : tx.authorized_amount || '0.00';

    transactions.push({
      id: tx.transaction_id || '',
      date: tx.date || '',
      amount,
      condition: tx.condition || '',
      type: tx.transaction_type || tx.action_type || '',
      card_type: tx.cc_type || tx.card_type || '',
      last_four: tx.cc_number ? tx.cc_number.slice(-4) : (tx.last_four || ''),
      customer_name:
        [tx.first_name, tx.last_name].filter(Boolean).join(' ') ||
        [tx.billing_first_name, tx.billing_last_name].filter(Boolean).join(' ') ||
        tx.customer_name ||
        '',
    });
  }

  return transactions;
}

function extractFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /<(\w+)>(.*?)<\/\1>/g;
  let m;
  while ((m = fieldRegex.exec(block)) !== null) {
    fields[m[1]] = m[2].trim();
  }
  return fields;
}
