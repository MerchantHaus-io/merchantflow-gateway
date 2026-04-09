import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_COMMISSION_URL = "https://secure.nmi.com/api/v4/commission_reports/reports";
const MAX_RESULTS = 1000;
const MAX_PAGES = 10;

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

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { month, year } = body ?? {};

    const now = new Date();
    const requestMonth = month ? String(month) : String(now.getMonth() + 1);
    const requestYear = year ? String(year) : String(now.getFullYear());

    console.log(`Fetching commission report for ${requestMonth}/${requestYear}`);

    const results: any[] = [];
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    let totalResults = 0;

    while (hasMore && pageCount < MAX_PAGES) {
      const response = await fetch(NMI_COMMISSION_URL, {
        method: "POST",
        headers: {
          Authorization: nmiApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          month: requestMonth,
          year: requestYear,
          offset: String(offset),
          maxResults: String(MAX_RESULTS),
        }),
      });

      const text = await response.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        console.error(`NMI Commission API error [${response.status}]:`, text.substring(0, 500));
        throw new Error(extractError(parsed) || `NMI API returned HTTP ${response.status}`);
      }

      const pageResults = Array.isArray(parsed?.results) ? parsed.results : [];
      results.push(...pageResults);
      totalResults = toNumber(parsed?.totalResults) || results.length;
      hasMore = Boolean(parsed?.hasMore) && pageResults.length > 0;
      offset += pageResults.length;
      pageCount++;

      if (pageResults.length === 0) break;
    }

    console.log(`Commission report: ${results.length} records for ${requestMonth}/${requestYear}`);

    // Map commission entries
    const commissions = results.map(mapCommission);

    // Build summary
    const summary = buildSummary(commissions);

    // Group by merchant
    const byMerchant: Record<string, typeof commissions> = {};
    for (const c of commissions) {
      const key = c.merchant_id || "unknown";
      if (!byMerchant[key]) byMerchant[key] = [];
      byMerchant[key].push(c);
    }

    const merchantSummaries = Object.entries(byMerchant).map(([merchantId, entries]) => ({
      merchant_id: merchantId,
      ...buildSummary(entries),
    }));

    return json({
      month: requestMonth,
      year: requestYear,
      commissions,
      total_count: totalResults,
      summary,
      merchant_summaries: merchantSummaries,
      truncated: hasMore,
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

function mapCommission(entry: any) {
  return {
    merchant_id: String(entry?.merchantId ?? entry?.merchant_id ?? ""),
    merchant_name: String(entry?.merchantName ?? entry?.merchant_name ?? entry?.companyName ?? ""),
    gateway_id: String(entry?.gatewayId ?? entry?.gateway_id ?? ""),
    transaction_count: toNumber(entry?.transactionCount ?? entry?.transaction_count ?? entry?.count),
    gross_volume: toNumber(entry?.grossVolume ?? entry?.gross_volume ?? entry?.volume ?? 0),
    net_volume: toNumber(entry?.netVolume ?? entry?.net_volume ?? 0),
    commission_amount: toNumber(entry?.commissionAmount ?? entry?.commission_amount ?? entry?.commission ?? entry?.amount ?? 0),
    commission_rate: toNumber(entry?.commissionRate ?? entry?.commission_rate ?? entry?.rate ?? 0),
    fees: toNumber(entry?.fees ?? entry?.totalFees ?? 0),
    refund_amount: toNumber(entry?.refundAmount ?? entry?.refund_amount ?? 0),
    chargeback_amount: toNumber(entry?.chargebackAmount ?? entry?.chargeback_amount ?? 0),
    status: String(entry?.status ?? entry?.paymentStatus ?? ""),
    payout_date: String(entry?.payoutDate ?? entry?.payout_date ?? ""),
    currency: String(entry?.currency ?? "USD"),
    // Keep raw for debugging
    _raw: entry,
  };
}

function buildSummary(commissions: ReturnType<typeof mapCommission>[]) {
  let totalCommission = 0;
  let totalVolume = 0;
  let totalFees = 0;
  let totalRefunds = 0;
  let totalChargebacks = 0;
  let totalTransactions = 0;

  for (const c of commissions) {
    totalCommission += c.commission_amount;
    totalVolume += c.gross_volume;
    totalFees += c.fees;
    totalRefunds += c.refund_amount;
    totalChargebacks += c.chargeback_amount;
    totalTransactions += c.transaction_count;
  }

  return {
    total_commission: totalCommission,
    total_volume: totalVolume,
    total_fees: totalFees,
    total_refunds: totalRefunds,
    total_chargebacks: totalChargebacks,
    total_transactions: totalTransactions,
    merchant_count: commissions.length,
  };
}
