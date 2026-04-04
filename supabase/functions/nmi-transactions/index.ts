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

    const body = await req.json();
    const { gateway_ids, start_date, end_date, mode } = body;

    // mode = "all" → fetch ALL partner transactions (no gateway_id filter)
    // mode = "gateway" (default) → filter by gateway_ids
    const fetchMode = mode === 'all' ? 'all' : 'gateway';

    if (fetchMode === 'gateway' && (!gateway_ids || !Array.isArray(gateway_ids) || gateway_ids.length === 0)) {
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

    const params = new URLSearchParams({
      security_key: NMI_API_KEY,
      start_date:   startDate,
      end_date:     endDate,
    });

    console.log(`Fetching partner transactions [${fetchMode}] from ${startDate} to ${endDate}`);

    const response = await fetch(NMI_QUERY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`NMI API HTTP error [${response.status}]:`, responseText.substring(0, 500));
      return new Response(JSON.stringify({ error: `NMI API returned HTTP ${response.status}`, results: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`NMI response: ${responseText.length} chars`);

    // Check for an NMI-level error in the XML body
    const topLevelError = extractSingleField(responseText, 'error_response')
      || (extractSingleField(responseText, 'result') === '3' ? extractSingleField(responseText, 'result_text') : null);

    if (topLevelError) {
      console.error('NMI query returned error:', topLevelError);
      return new Response(JSON.stringify({ error: topLevelError, results: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse every transaction out of the XML
    const allTransactions = parseNmiXml(responseText);
    console.log(`Total transactions in partner response: ${allTransactions.length}`);

    const seenMerchantIds = [...new Set(allTransactions.map(t => t.merchant_id).filter(Boolean))];
    console.log(`Distinct merchant_ids: ${JSON.stringify(seenMerchantIds)}`);

    if (fetchMode === 'all') {
      // Return all transactions grouped by merchant
      const summary = buildSummary(allTransactions);
      
      // Group by merchant
      const byMerchant: Record<string, typeof allTransactions> = {};
      for (const tx of allTransactions) {
        const mid = tx.merchant_id || 'unknown';
        if (!byMerchant[mid]) byMerchant[mid] = [];
        byMerchant[mid].push(tx);
      }

      const merchantSummaries = Object.entries(byMerchant).map(([mid, txs]) => ({
        merchant_id: mid,
        transaction_count: txs.length,
        ...buildSummary(txs),
      }));

      return new Response(JSON.stringify({
        mode: 'all',
        transactions: allTransactions.slice(0, 500),
        total_count: allTransactions.length,
        summary,
        merchant_summaries: merchantSummaries,
        seen_merchant_ids: seenMerchantIds,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Gateway mode — filter by merchant_id
    const results = gateway_ids.map((gatewayId: string) => {
      const normalised = String(gatewayId).trim();
      const matched = allTransactions.filter(tx =>
        String(tx.merchant_id || '').trim() === normalised
      );

      const summary = buildSummary(matched);
      const cleanTransactions = matched.slice(0, 100);

      return {
        gateway_id: gatewayId,
        transactions: cleanTransactions,
        summary,
      };
    });

    return new Response(JSON.stringify({
      mode: 'gateway',
      results,
      _debug: { total_in_response: allTransactions.length, seen_merchant_ids: seenMerchantIds },
    }), {
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

function buildSummary(txs: any[]) {
  const summary = {
    total_count:     txs.length,
    approved_count:  0,
    declined_count:  0,
    total_amount:    0,
    approved_amount: 0,
    refund_count:    0,
    refund_amount:   0,
    void_count:      0,
    sale_count:      0,
    auth_count:      0,
  };

  for (const tx of txs) {
    const amount = parseFloat(tx.amount || '0');
    summary.total_amount += amount;
    const condition = (tx.condition || '').toLowerCase();
    const txType = (tx.type || '').toLowerCase();
    
    if (['complete', 'pending', 'pendingsettlement', 'pending_settlement'].includes(condition)) {
      summary.approved_count++;
      summary.approved_amount += amount;
    } else {
      summary.declined_count++;
    }

    if (txType === 'refund' || txType === 'credit') {
      summary.refund_count++;
      summary.refund_amount += amount;
    } else if (txType === 'void') {
      summary.void_count++;
    } else if (txType === 'sale' || txType === 'capture') {
      summary.sale_count++;
    } else if (txType === 'auth') {
      summary.auth_count++;
    }
  }

  return summary;
}

/** Parse all <transaction> blocks from NMI query XML — extract rich detail */
function parseNmiXml(xml: string): any[] {
  const transactions: any[] = [];
  const txRegex = /<transaction>([\s\S]*?)<\/transaction>/g;
  let match;

  while ((match = txRegex.exec(xml)) !== null) {
    const block = match[1];
    const tx    = extractFields(block);

    // Amount: prefer requested_amount over amount
    const amount =
      (tx.requested_amount && tx.requested_amount !== '0.00') ? tx.requested_amount :
      (tx.amount           && tx.amount           !== '0.00') ? tx.amount           :
      tx.authorized_amount || '0.00';

    transactions.push({
      merchant_id:    tx.merchant_id || tx.merchantId || '',
      id:             tx.transaction_id || '',
      date:           tx.date || tx.created || '',
      amount,
      condition:      tx.condition || '',
      type:           tx.transaction_type || tx.type || tx.action_type || '',
      card_type:      tx.cc_type  || tx.card_type || '',
      last_four:      tx.cc_number ? tx.cc_number.slice(-4) : (tx.last_four || ''),
      customer_name:
        [tx.first_name, tx.last_name].filter(Boolean).join(' ') ||
        [tx.billing_first_name, tx.billing_last_name].filter(Boolean).join(' ') ||
        tx.customer_name || '',
      customer_email: tx.email || tx.billing_email || '',
      response_text:  tx.response_text || tx.responsetext || '',
      response_code:  tx.response_code || tx.responsecode || '',
      authorization:  tx.authorization_code || tx.authcode || '',
      processor_id:   tx.processor_id || '',
      currency:       tx.currency || 'USD',
      // Settlement fields
      settlement_amount: tx.settlement_amount || '',
      settlement_currency: tx.settlement_currency || '',
      // AVS / CVV
      avs_response:   tx.avs_response || tx.avsresponse || '',
      cvv_response:   tx.cvv_response || tx.cvvresponse || '',
      // Billing address
      billing_city:   tx.billing_city || tx.city || '',
      billing_state:  tx.billing_state || tx.state || '',
      billing_zip:    tx.billing_postal || tx.billing_zip || tx.zip || '',
      billing_country: tx.billing_country || tx.country || '',
      // IP & platform
      ip_address:     tx.ip_address || '',
      platform_id:    tx.platform_id || '',
      // Subscription
      subscription_id: tx.subscription_id || '',
      // Fees (partner/commission)
      merchant_defined_field_1: tx.merchant_defined_field_1 || '',
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