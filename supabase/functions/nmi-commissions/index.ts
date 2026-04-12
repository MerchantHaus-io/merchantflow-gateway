import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_GATEWAY_BASE = "https://merchanthausio.transactiongateway.com";
const DEDUP_WINDOW_HOURS = 6; // Skip re-sync if a successful sync exists within this window

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

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
    const { month, year, persist, force } = body ?? {};

    const now = new Date();
    const requestMonth = month ? Number(month) : now.getMonth() + 1;
    const requestYear = year ? Number(year) : now.getFullYear();

    // ── Dedup check: skip if recent successful sync exists ──
    if (!force) {
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
      const { data: recentSync } = await sb
        .from("commission_sync_logs")
        .select("id, created_at, merchant_count")
        .eq("period_month", requestMonth)
        .eq("period_year", requestYear)
        .eq("status", "success")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentSync) {
        console.log(`Dedup: skipping sync for ${requestMonth}/${requestYear}, last synced at ${recentSync.created_at}`);
        // Return cached data from commission_records instead
        const { data: cachedRecords } = await sb
          .from("commission_records")
          .select("nmi_gateway_id, company_name, transaction_count, transaction_volume, transaction_fees, chargeback_fees, residual_amount, total_commission")
          .eq("period_id", (await sb.from("commission_periods")
            .select("id")
            .eq("period_start", `${requestYear}-${String(requestMonth).padStart(2, "0")}-01`)
            .maybeSingle()).data?.id ?? "");

        const commissions = (cachedRecords || []).map(r => ({
          gateway_id: r.nmi_gateway_id,
          company_name: r.company_name || r.nmi_gateway_id,
          transaction_count: r.transaction_count || 0,
          gross_volume: r.transaction_volume || 0,
          fees: r.transaction_fees || 0,
          residual_amount: r.residual_amount || 0,
          total_commission: r.total_commission || 0,
          chargeback_amount: r.chargeback_fees || 0,
          refund_amount: 0,
          status: (r.transaction_count || 0) > 0 ? "active" : "inactive",
          currency: "USD",
        }));

        return json({
          month: requestMonth,
          year: requestYear,
          commissions,
          total_count: commissions.length,
          summary: buildSummary(commissions.filter(c => c.transaction_count > 0 || c.gross_volume > 0)),
          truncated: false,
          cached: true,
          last_synced: recentSync.created_at,
        });
      }
    }

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

    // ── Step 2: Fetch per-merchant gateway detail for activity data ──
    const merchantAgg = new Map<string, { count: number; volume: number; fees: number; refunds: number; chargebacks: number }>();
    const rawDetails: Record<string, any> = {};

    for (const [mid] of nameMap) {
      try {
        const detailRes = await fetch(`${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways/${mid}`, {
          headers: { Authorization: nmiApiKey, Accept: "application/json" },
        });
        if (detailRes.ok) {
          const detail = await detailRes.json();
          rawDetails[mid] = detail;
          const gateway = detail?.gateway ?? detail ?? {};
          const txnCount = toNumber(gateway.transaction_count ?? gateway.total_transactions ?? 0);
          const vol = toNumber(gateway.volume ?? gateway.total_volume ?? gateway.monthly_volume ?? 0);
          const fees = toNumber(gateway.fees ?? gateway.total_fees ?? 0);
          if (txnCount > 0 || vol > 0) {
            merchantAgg.set(mid, { count: txnCount, volume: vol, fees, refunds: 0, chargebacks: 0 });
          }
        } else {
          await detailRes.text();
        }
      } catch {
        // Skip individual merchant errors
      }
    }

    console.log(`Gateway detail: ${merchantAgg.size} merchants with activity data`);

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
        total_commission: agg.fees,
        chargeback_amount: agg.chargebacks,
        refund_amount: agg.refunds,
        status: agg.count > 0 ? "active" : "inactive",
        currency: "USD",
      };
    });

    const summary = buildSummary(commissions.filter(c => c.transaction_count > 0 || c.gross_volume > 0));
    const durationMs = Date.now() - startTime;

    // ── Step 3: Log the sync to commission_sync_logs ──
    await sb.from("commission_sync_logs").insert({
      period_month: requestMonth,
      period_year: requestYear,
      merchant_count: commissions.length,
      raw_response: { roster: merchantsRaw, details: rawDetails, summary },
      source_api: "v3_boarding",
      triggered_by: user.email,
      duration_ms: durationMs,
      status: "success",
    });

    // ── Step 4: Persist to commission tables ──
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
          const { data: accounts } = await sb
            .from("accounts")
            .select("id, nmi_merchant_id")
            .not("nmi_merchant_id", "is", null);

          const accountMap = new Map<string, string>();
          for (const a of accounts || []) {
            if (a.nmi_merchant_id) accountMap.set(a.nmi_merchant_id, a.id);
          }

          await sb.from("commission_records").delete().eq("period_id", period.id);

          for (const c of commissions) {
            if (!c.gateway_id) continue;
            const accountId = accountMap.get(c.gateway_id) || null;

            await sb.from("commission_records").insert({
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
            });
          }

          console.log(`Persisted: period ${period.id}, ${commissions.length} merchants`);
        }
      } catch (persistErr) {
        console.error("Persist error:", persistErr);
      }
    }

    return json({
      month: requestMonth,
      year: requestYear,
      commissions,
      total_count: commissions.length,
      summary,
      truncated: false,
      cached: false,
      sync_duration_ms: durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error("NMI commissions error:", err);

    // Log failed sync attempt
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseServiceKey);
      const body = await req.clone().json().catch(() => ({}));
      const now = new Date();
      await sb.from("commission_sync_logs").insert({
        period_month: body?.month ? Number(body.month) : now.getMonth() + 1,
        period_year: body?.year ? Number(body.year) : now.getFullYear(),
        merchant_count: 0,
        source_api: "v3_boarding",
        duration_ms: durationMs,
        status: "error",
        error_message: err instanceof Error ? err.message : "Unknown error",
      });
    } catch { /* best effort */ }

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
