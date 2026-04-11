import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user with anon client
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

    console.log(`Fetching commission report for ${requestMonth}/${requestYear}, persist=${!!persist}`);

    // Fetch from NMI
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
          month: String(requestMonth),
          year: String(requestYear),
          offset: String(offset),
          maxResults: String(MAX_RESULTS),
        }),
      });

      const text = await response.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }

      if (!response.ok) {
        console.error(`NMI Commission API error [${response.status}]:`, text.substring(0, 500));
        throw new Error(extractError(parsed) || `NMI API returned HTTP ${response.status}`);
      }

      // Log raw response structure for debugging
      if (pageCount === 0 && parsed) {
        const topKeys = Object.keys(parsed);
        console.log("NMI commission response top-level keys:", topKeys);
        // Log first result's keys to understand field mapping
        const firstResult = Array.isArray(parsed?.results) ? parsed.results[0]
          : Array.isArray(parsed?.data) ? parsed.data[0]
          : Array.isArray(parsed?.commissions) ? parsed.commissions[0]
          : Array.isArray(parsed?.records) ? parsed.records[0]
          : null;
        if (firstResult) {
          console.log("NMI commission first record keys:", Object.keys(firstResult));
          console.log("NMI commission first record sample:", JSON.stringify(firstResult).substring(0, 1000));
        } else {
          console.log("NMI commission raw response (first 500 chars):", JSON.stringify(parsed).substring(0, 500));
        }
      }

      // Try multiple possible array field names
      const pageResults = Array.isArray(parsed?.results) ? parsed.results
        : Array.isArray(parsed?.data) ? parsed.data
        : Array.isArray(parsed?.commissions) ? parsed.commissions
        : Array.isArray(parsed?.records) ? parsed.records
        : [];
      results.push(...pageResults);
      totalResults = toNumber(parsed?.totalResults ?? parsed?.total_results ?? parsed?.total) || results.length;
      hasMore = Boolean(parsed?.hasMore) && pageResults.length > 0;
      offset += pageResults.length;
      pageCount++;
      if (pageResults.length === 0) break;
    }

    console.log(`Commission report: ${results.length} records for ${requestMonth}/${requestYear}`);

    const commissions = results.map(mapCommission);
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
      merchant_name: entries[0]?.merchant_name || "",
      gateway_id: entries[0]?.gateway_id || "",
      ...buildSummary(entries),
    }));

    // Persist to DB if requested
    if (persist) {
      try {
        const periodStart = new Date(requestYear, requestMonth - 1, 1).toISOString().split("T")[0];
        const periodEnd = new Date(requestYear, requestMonth, 0).toISOString().split("T")[0];

        // Upsert commission period
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
          // Look up accounts by nmi_merchant_id for cross-referencing
          const { data: accounts } = await sb
            .from("accounts")
            .select("id, nmi_merchant_id")
            .not("nmi_merchant_id", "is", null);

          const accountMap = new Map<string, string>();
          for (const a of accounts || []) {
            if (a.nmi_merchant_id) accountMap.set(a.nmi_merchant_id, a.id);
          }

          // Upsert commission records per merchant
          for (const ms of merchantSummaries) {
            const accountId = accountMap.get(ms.merchant_id) || null;

            await sb.from("commission_records").upsert(
              {
                period_id: period.id,
                account_id: accountId,
                nmi_gateway_id: ms.merchant_id,
                company_name: ms.merchant_name,
                transaction_count: ms.total_transactions,
                transaction_volume: ms.total_volume,
                transaction_fees: ms.total_fees,
                chargeback_fees: ms.total_chargebacks,
                residual_amount: ms.total_commission,
                total_commission: ms.total_commission,
              },
              { onConflict: "period_id,nmi_gateway_id" }
            );
          }

          console.log(`Persisted commission data: period ${period.id}, ${merchantSummaries.length} merchants`);
        }
      } catch (persistErr) {
        console.error("Failed to persist commission data:", persistErr);
      }
    }

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
