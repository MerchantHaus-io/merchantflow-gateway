import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_BASE = "https://secure.nmi.com/api/v4";

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

    // Build date range for the requested month
    const startDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(requestYear, requestMonth, 0).getDate();
    const endDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-${lastDay}`;

    console.log(`Fetching commission report for ${requestMonth}/${requestYear} (${startDate} to ${endDate}), persist=${!!persist}`);

    // Fetch from NMI v4 Commission Report API
    const response = await fetch(`${NMI_BASE}/reports/commission`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nmiApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        include_details: true,
        group_by: "merchant",
      }),
    });

    const text = await response.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

    if (!response.ok) {
      console.error(`NMI Commission API error [${response.status}]:`, text.substring(0, 500));
      throw new Error(extractError(parsed) || `NMI API returned HTTP ${response.status}`);
    }

    // Log response structure for debugging
    if (parsed) {
      const topKeys = Object.keys(parsed);
      console.log("NMI commission response keys:", topKeys);
      const merchants = parsed.merchants || parsed.results || parsed.data || [];
      if (merchants.length > 0) {
        console.log("NMI commission first merchant keys:", Object.keys(merchants[0]));
        console.log("NMI commission first merchant:", JSON.stringify(merchants[0]).substring(0, 500));
      }
    }

    // Extract merchants array from response
    const merchantsRaw = Array.isArray(parsed?.merchants) ? parsed.merchants
      : Array.isArray(parsed?.results) ? parsed.results
      : Array.isArray(parsed?.data) ? parsed.data
      : [];

    console.log(`Commission report: ${merchantsRaw.length} merchants for ${requestMonth}/${requestYear}`);

    // Map merchants to our format
    const commissions = merchantsRaw.map(mapMerchant);

    // Build totals from response or calculate
    const apiTotals = parsed?.totals || parsed?.summary || null;
    const summary = apiTotals ? {
      total_commission: toNumber(apiTotals.total_commission ?? apiTotals.commission),
      total_volume: toNumber(apiTotals.transaction_volume ?? apiTotals.volume),
      total_fees: toNumber(apiTotals.transaction_fees ?? apiTotals.fees),
      total_transactions: toNumber(apiTotals.transaction_count ?? apiTotals.transactions),
      total_chargebacks: toNumber(apiTotals.chargeback_fees ?? apiTotals.chargebacks),
      total_refunds: toNumber(apiTotals.refund_amount ?? apiTotals.refunds),
      merchant_count: commissions.length,
    } : buildSummary(commissions);

    // Persist to DB if requested
    if (persist) {
      try {
        const periodStart = startDate;
        const periodEnd = endDate;

        const { data: period, error: periodError } = await sb
          .from("commission_periods")
          .upsert(
            {
              period_start: periodStart,
              period_end: periodEnd,
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

          // Upsert commission records per merchant
          for (const c of commissions) {
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

          console.log(`Persisted commission data: period ${period.id}, ${commissions.length} merchants`);
        }
      } catch (persistErr) {
        console.error("Failed to persist commission data:", persistErr);
      }
    }

    return json({
      month: requestMonth,
      year: requestYear,
      commissions,
      total_count: commissions.length,
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

function extractError(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors.map((e: any) => (typeof e === "string" ? e : e?.message ?? JSON.stringify(e))).join("; ");
  }
  return null;
}

function toNumber(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapMerchant(entry: any) {
  return {
    gateway_id: String(entry?.gateway_id ?? entry?.gatewayId ?? entry?.merchant_id ?? entry?.merchantId ?? ""),
    company_name: String(entry?.company_name ?? entry?.companyName ?? entry?.merchant_name ?? entry?.merchantName ?? ""),
    transaction_count: toNumber(entry?.transaction_count ?? entry?.transactionCount ?? entry?.count ?? 0),
    gross_volume: toNumber(entry?.transaction_volume ?? entry?.transactionVolume ?? entry?.volume ?? entry?.gross_volume ?? 0),
    fees: toNumber(entry?.transaction_fees ?? entry?.transactionFees ?? entry?.fees ?? 0),
    residual_amount: toNumber(entry?.residual_amount ?? entry?.residualAmount ?? 0),
    total_commission: toNumber(entry?.total_commission ?? entry?.totalCommission ?? entry?.commission ?? entry?.commission_amount ?? 0),
    chargeback_amount: toNumber(entry?.chargeback_fees ?? entry?.chargebackFees ?? entry?.chargeback_amount ?? 0),
    status: String(entry?.status ?? ""),
    currency: String(entry?.currency ?? "USD"),
  };
}

function buildSummary(commissions: ReturnType<typeof mapMerchant>[]) {
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
