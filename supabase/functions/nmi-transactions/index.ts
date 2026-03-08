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
    if (!NMI_API_KEY) throw new Error('NMI_API_KEY is not configured');

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

    // Date range defaults to last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = start_date || formatDate(thirtyDaysAgo);
    const endDate   = end_date   || formatDate(now);

    // ─── PARTNER API STRATEGY ────────────────────────────────────────────────
    //
    // This key is a Partner API key. NMI's query.php does NOT accept a
    // merchant_id filter parameter — it returns ALL transactions across the
    // partner's entire portfolio for the date range, and each <transaction>
    // block contains a <merchant_id> field that identifies the sub-merchant.
    //
    // The stored `nmi_gateway_id` (from the boarding response) IS that same
    // merchant_id value. So the correct approach is:
    //   1. Make ONE query call for the full date range (no per-gateway calls)
    //   2. Parse all <transaction> blocks from the XML
    //   3. Group/filter by <merchant_id> matching our stored gateway IDs
    //
    // ─────────────────────────────────────────────────────────────────────────

    const params = new URLSearchParams({
      security_key: NMI_API_KEY,
      start_date:   startDate,
      end_date:     endDate,
    });

    console.log(`Fetching partner transactions from ${startDate} to ${endDate} for ${gateway_ids.length} gateway(s):`, gateway_ids);

    const response = await fetch(NMI_QUERY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`NMI API HTTP error [${response.status}]:`, responseText.substring(0, 500));
      // Return per-gateway error objects so the frontend can show them
      const results = gateway_ids.map((id: string) => ({
        gateway_id:   id,
        error:        `NMI API returned HTTP ${response.status}`,
        transactions: [],
        summary:      null,
      }));
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`NMI response: ${responseText.length} chars`);
    console.log(`NMI preview: ${responseText.substring(0, 600)}`);

    // Check for an NMI-level error in the XML body
    const topLevelError = extractSingleField(responseText, 'error_response')
      || (extractSingleField(responseText, 'result') === '3' ? extractSingleField(responseText, 'result_text') : null);

    if (topLevelError) {
      console.error('NMI query returned error:', topLevelError);
      const results = gateway_ids.map((id: string) => ({
        gateway_id:   id,
        error:        `NMI error: ${topLevelError}`,
        transactions: [],
        summary:      null,
      }));
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse every transaction out of the XML, retaining the raw merchant_id
    const allTransactions = parseNmiXml(responseText);
    console.log(`Total transactions in partner response: ${allTransactions.length}`);

    // Log the distinct merchant_id values seen so we can verify the mapping
    const seenMerchantIds = [...new Set(allTransactions.map(t => t._merchant_id).filter(Boolean))];
    console.log(`Distinct merchant_ids in response: ${JSON.stringify(seenMerchantIds)}`);
    console.log(`Looking for gateway_ids: ${JSON.stringify(gateway_ids)}`);

    // Build per-gateway result objects
    const results = gateway_ids.map((gatewayId: string) => {
      // NMI stores the sub-merchant ID in <merchant_id>.
      // The value stored in our DB (nmi_gateway_id) came from the boarding
      // response field gatewayId/gateway_id/id — which is the same numeric
      // merchant ID. Normalise both sides to strings for comparison.
      const normalised = String(gatewayId).trim();
      const matched = allTransactions.filter(tx =>
        String(tx._merchant_id || '').trim() === normalised
      );

      console.log(`Gateway ${gatewayId}: ${matched.length} matched transactions`);

      // Build summary
      const summary = {
        total_count:     matched.length,
        approved_count:  0,
        declined_count:  0,
        total_amount:    0,
        approved_amount: 0,
      };

      for (const tx of matched) {
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

      // Strip internal _merchant_id before returning
      const cleanTransactions = matched.slice(0, 100).map(({ _merchant_id, ...rest }) => rest);

      return {
        gateway_id:   gatewayId,
        transactions: cleanTransactions,
        summary,
      };
    });

    return new Response(JSON.stringify({ results, _debug: { total_in_response: allTransactions.length, seen_merchant_ids: seenMerchantIds } }), {
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
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function extractSingleField(xml: string, field: string): string | null {
  const m = xml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
  return m ? m[1].trim() : null;
}

/** Parse all <transaction> blocks from NMI query XML */
function parseNmiXml(xml: string): any[] {
  const transactions: any[] = [];
  const txRegex = /<transaction>([\s\S]*?)<\/transaction>/g;
  let match;

  while ((match = txRegex.exec(xml)) !== null) {
    const block = match[1];
    const tx    = extractFields(block);

    if (transactions.length < 5) {
      // Debug: log all fields of first few transactions so we can verify field names
      console.log(`Sample transaction fields:`, JSON.stringify(tx));
    }

    // Amount: prefer requested_amount (set at auth time) over amount (set at settlement)
    // so pending/authorised transactions show their actual value, not 0.00
    const amount =
      (tx.requested_amount && tx.requested_amount !== '0.00') ? tx.requested_amount :
      (tx.amount           && tx.amount           !== '0.00') ? tx.amount           :
      tx.authorized_amount || '0.00';

    transactions.push({
      // Internal field used for filtering — stripped before returning to client
      _merchant_id: tx.merchant_id || tx.merchantId || '',

      id:            tx.transaction_id || '',
      date:          tx.date || tx.created || '',
      amount,
      condition:     tx.condition || '',
      type:          tx.transaction_type || tx.type || tx.action_type || '',
      card_type:     tx.cc_type  || tx.card_type || '',
      last_four:     tx.cc_number ? tx.cc_number.slice(-4) : (tx.last_four || ''),
      customer_name:
        [tx.first_name,  tx.last_name ].filter(Boolean).join(' ') ||
        [tx.billing_first_name, tx.billing_last_name].filter(Boolean).join(' ') ||
        tx.customer_name || '',
    });
  }

  return transactions;
}

function extractFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRegex = /<(\w+)>(.*?)<\/\1>/gs;
  let m;
  while ((m = fieldRegex.exec(block)) !== null) {
    fields[m[1]] = m[2].trim();
  }
  return fields;
}
