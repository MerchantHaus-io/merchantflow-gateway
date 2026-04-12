import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_GATEWAY_BASE = "https://merchanthausio.transactiongateway.com";
const MAX_PER_PAGE = 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nmiApiKey = Deno.env.get("NMI_API_KEY");
    if (!nmiApiKey) throw new Error("NMI_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const anonClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    // Service client for DB writes
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { month, year, persist } = body ?? {};

    const now = new Date();
    const requestMonth = month ? Number(month) : now.getMonth() + 1;
    const requestYear = year ? Number(year) : now.getFullYear();

    // Build date range
    const startDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(requestYear, requestMonth, 0).getDate();
    const endDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-${lastDay}`;

    console.log(`Commission sync for ${requestMonth}/${requestYear} (${startDate} → ${endDate})`);

    // ── Step 1: Fetch merchant roster from v3 Boarding API ──
    const rosterRes = await fetch(`${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways`, {
      headers: { Authorization: nmiApiKey, Accept: "application/json" },
    });
    const rosterText = await rosterRes.text();
    let rosterParsed: any = null;
    try { rosterParsed = JSON.parse(rosterText); } catch { /* ignore */ }

    const merchantsRaw = Array.isArray(rosterParsed) ? rosterParsed
      : rosterParsed?.gateways ?? rosterParsed?.data ?? [];

    // Build name map: gatewayId → company name
    const nameMap = new Map<string, string>();
    for (const m of merchantsRaw) {
      const mid = String(m.id ?? m.gateway_id ?? m.merchant_id ?? "");
      const name = String(m.company ?? m.company_name ?? m.dba_name ?? m.name ?? "");
      if (mid) nameMap.set(mid, name);
    }
    console.log(`Merchant roster: ${nameMap.size} merchants loaded`);

    // ── Step 2: Fetch transaction data ──
    // The Query API uses merchant-level keys, so we use the v3 affiliate reporting
    // or fall back to per-merchant queries if we have their keys.
    // For now, try the affiliate-level transaction query.
    const allTxns: any[] = [];

    // Try getting aggregate data from each merchant's gateway via affiliate API
    for (const [mid] of nameMap) {
      try {
        const detailRes = await fetch(`${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways/${mid}`, {
          headers: { Authorization: nmiApiKey, Accept: "application/json" },
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          // Extract any transaction/volume data from gateway detail
          if (detail.transaction_count || detail.volume || detail.total_transactions) {
            allTxns.push({
              merchant_id: mid,
              transaction_count: detail.transaction_count || detail.total_transactions || 0,
              volume: detail.volume || detail.total_volume || 0,
              fees: detail.fees || detail.total_fees || 0,
            });
          }
        } else {
          await detailRes.text(); // consume body
        }
      } catch {
        // Skip individual merchant errors
      }
    }

    console.log(`Gateway detail data: ${allTxns.length} merchants with data`);

    // Parse individual transactions and aggregate per merchant
    const allTxns: any[] = [];
    if (txnParsed) {
      const items = Array.isArray(txnParsed) ? txnParsed
        : txnParsed.transactions ?? txnParsed.results ?? txnParsed.data ?? [];
      allTxns.push(...items);
    }

    // If v4 report didn't return data, try Query API as fallback
    if (allTxns.length === 0 && txnRes.ok) {
      console.log("No transactions from v4 report, trying Query API fallback...");
      try {
        const queryUrl = `${NMI_GATEWAY_BASE}/api/query.php?security_key=${encodeURIComponent(nmiApiKey)}&report_type=transaction&start_date=${startDate}&end_date=${endDate}&result_limit=1000`;
        const queryRes = await fetch(queryUrl);
        const queryText = await queryRes.text();
        // Query API returns XML, parse transactions from it
        const txnMatches = queryText.matchAll(/<transaction>([\s\S]*?)<\/transaction>/g);
        for (const match of txnMatches) {
          const xmlBlock = match[1];
          const getValue = (tag: string) => {
            const m = xmlBlock.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
            return m ? m[1] : null;
          };
          allTxns.push({
            merchant_id: getValue("merchant_id") || getValue("gateway_id"),
            amount: getValue("amount"),
            action: getValue("action") || getValue("transaction_type"),
            condition: getValue("condition"),
          });
        }
        console.log(`Query API fallback: ${allTxns.length} transactions parsed`);
      } catch (queryErr) {
        console.warn("Query API fallback failed:", queryErr);
      }
    }

    // Aggregate transactions by merchant
    const merchantAgg = new Map<string, { count: number; volume: number; fees: number; refunds: number; chargebacks: number }>();
    for (const t of allTxns) {
      const mid = String(t.merchant_id ?? t.gateway_id ?? t.merchantId ?? "");
      if (!mid) continue;
      const agg = merchantAgg.get(mid) || { count: 0, volume: 0, fees: 0, refunds: 0, chargebacks: 0 };
      const amount = toNumber(t.amount ?? t.requested_amount ?? 0);
      const action = String(t.action ?? t.action_type ?? t.type ?? "sale").toLowerCase();
      const condition = String(t.condition ?? t.status ?? "").toLowerCase();

      if (action === "sale" || action === "capture" || action === "auth") {
        if (condition !== "failed" && condition !== "canceled") {
          agg.count++;
          agg.volume += amount;
        }
      } else if (action === "refund" || action === "credit") {
        agg.refunds += amount;
      }
      // Fees from transaction-level data if available
      agg.fees += toNumber(t.platform_fee ?? t.surcharge_amount ?? 0);

      merchantAgg.set(mid, agg);
    }

    console.log(`Aggregated data for ${merchantAgg.size} merchants from ${allTxns.length} transactions`);

    // Build commission records
    const commissions = [...nameMap.entries()].map(([mid, name]) => {
      const agg = merchantAgg.get(mid) || { count: 0, volume: 0, fees: 0, refunds: 0, chargebacks: 0 };
      return {
        gateway_id: mid,
        company_name: name || mid,
        transaction_count: agg.count,
        gross_volume: agg.volume,
        fees: agg.fees,
        residual_amount: 0,
        total_commission: agg.fees, // Best approximation from available data
        chargeback_amount: agg.chargebacks,
        refund_amount: agg.refunds,
        status: "active",
        currency: "USD",
      };
    }).filter(c => c.transaction_count > 0 || c.gross_volume > 0); // Only include merchants with activity

    // Include merchants with no transactions too (for complete roster view)
    const activeWithNoData = [...nameMap.entries()]
      .filter(([mid]) => !merchantAgg.has(mid))
      .map(([mid, name]) => ({
        gateway_id: mid,
        company_name: name || mid,
        transaction_count: 0,
        gross_volume: 0,
        fees: 0,
        residual_amount: 0,
        total_commission: 0,
        chargeback_amount: 0,
        refund_amount: 0,
        status: "inactive",
        currency: "USD",
      }));

    const allCommissions = [...commissions, ...activeWithNoData];

    const summary = buildSummary(commissions);

    // ── Step 3: Persist to DB ──
    if (persist) {
      try {
        const { data: period, error: periodError } = await sb
          .from("commission_periods")
          .upsert(
            {
              period_start: startDate,
              period_end: endDate,
              status: "complete",
              total_volume: summary.total_volume,
              total_transactions: summary.total_transactions,
              total_commission: summary.total_commission,
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "period_start,period_end" }
          )
          .select("id")
          .single();

        if (periodError) {
          console.error("Failed to upsert commission period:", periodError);
        } else if (period) {
          // Cross-reference with CRM accounts
          const { data: accounts } = await sb
            .from("accounts")
            .select("id, nmi_merchant_id")
            .not("nmi_merchant_id", "is", null);

          const accountMap = new Map<string, string>();
          for (const a of accounts || []) {
            if (a.nmi_merchant_id) accountMap.set(a.nmi_merchant_id, a.id);
          }

          for (const c of allCommissions) {
            if (!c.gateway_id) continue;
            const accountId = accountMap.get(c.gateway_id) || null;

            await sb.from("commission_records").upsert(
              {
                period_id: period.id,
                account_id: accountId,
                nmi_gateway_id: c.gateway_id,
                company_name: c.company_name,
                transaction_count: c.transaction_count,
                transaction_volume: c.gross_volume,
                transaction_fees: c.fees,
                chargeback_fees: c.chargeback_amount,
                residual_amount: c.residual_amount,
                total_commission: c.total_commission,
              },
              { onConflict: "period_id,nmi_gateway_id" }
            );
          }

          console.log(`Persisted: period ${period.id}, ${allCommissions.length} merchants`);
        }
      } catch (persistErr) {
        console.error("Persist error:", persistErr);
      }
    }

    return json({
      month: requestMonth,
      year: requestYear,
      commissions: allCommissions,
      total_count: allCommissions.length,
      summary,
      truncated: false,
    });
  } catch (err) {
    console.error("NMI commissions error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildSummary(commissions: any[]) {
  let total_commission = 0, total_volume = 0, total_fees = 0, total_chargebacks = 0, total_transactions = 0;
  for (const c of commissions) {
    total_commission += c.total_commission;
    total_volume += c.gross_volume;
    total_fees += c.fees;
    total_chargebacks += c.chargeback_amount;
    total_transactions += c.transaction_count;
  }
  return { total_commission, total_volume, total_fees, total_refunds: 0, total_chargebacks, total_transactions, merchant_count: commissions.length };
}
