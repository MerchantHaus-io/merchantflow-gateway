import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_GATEWAY_BASE = "https://merchanthausio.transactiongateway.com";
const NMI_TRANSACTIONS_REPORT_URL = "https://secure.nmi.com/api/v4/transactions/reports";
const DEDUP_WINDOW_HOURS = 6;
const MAX_RESULTS_PER_PAGE = 1000;
const MAX_REPORT_PAGES = 20;
const PRIMARY_ACTION_TYPES = new Set(["sale", "capture", "refund", "credit", "void", "auth", "validate"]);

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

    const anonClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { month, year, persist, force } = body ?? {};

    const now = new Date();
    const requestMonth = month ? Number(month) : now.getMonth() + 1;
    const requestYear = year ? Number(year) : now.getFullYear();

    // Build date range for the period
    const startDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(requestYear, requestMonth, 0).getDate();
    const endDate = `${requestYear}-${String(requestMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const startIso = `${startDate}T00:00:00Z`;
    const endIso = `${endDate}T23:59:59Z`;

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
        const { data: cachedRecords } = await sb
          .from("commission_records")
          .select("nmi_gateway_id, company_name, transaction_count, transaction_volume, transaction_fees, chargeback_fees, residual_amount, total_commission")
          .eq("period_id", (await sb.from("commission_periods")
            .select("id")
            .eq("period_start", startDate)
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

    console.log(`Commission sync for ${requestMonth}/${requestYear} (${startDate} → ${endDate})`);

    // ── Step 1: Resolve OUR accounts (Live & Billing scope) ──
    // Accounts linked to a closed_won opportunity AND with an nmi_merchant_id set.
    const { data: liveOpps, error: oppsError } = await sb
      .from("opportunities")
      .select("account_id, account:accounts!inner(id, name, nmi_merchant_id)")
      .eq("outcome_status", "closed_won");

    if (oppsError) throw new Error(`Failed to load live accounts: ${oppsError.message}`);

    type AccountInfo = {
      id: string;
      name: string;
      commission_model: string;
      merchant_rate_pct: number;
      interchange_rate_pct: number;
      revenue_share_pct: number;
    };
    const accountByMid = new Map<string, AccountInfo>();
    for (const opp of liveOpps || []) {
      const acc: unknown = (opp as unknown).account;
      const mid = acc?.nmi_merchant_id ? String(acc.nmi_merchant_id).trim() : "";
      if (mid && !accountByMid.has(mid)) {
        accountByMid.set(mid, {
          id: acc.id,
          name: acc.name || mid,
          commission_model: acc.commission_model || "gateway_only",
          merchant_rate_pct: Number(acc.merchant_rate_pct) || 0,
          interchange_rate_pct: Number(acc.interchange_rate_pct) || 0,
          revenue_share_pct: Number(acc.revenue_share_pct) || 0,
        });
      }
    }

    const merchantIds = [...accountByMid.keys()];
    console.log(`Live & Billing scope: ${merchantIds.length} accounts with NMI merchant IDs`);

    // ── Step 2: Pull transactions for our merchants from v4 reports API ──
    let txReport: { results: unknown[]; truncated: boolean } = { results: [], truncated: false };
    if (merchantIds.length > 0) {
      txReport = await fetchTransactionsReport({ nmiApiKey, merchantIds, startIso, endIso });
      console.log(`Fetched ${txReport.results.length} transactions for period`);
    }

    // ── Step 3: Aggregate per merchant ──
    type Agg = { count: number; volume: number; refunds: number; chargebacks: number };
    const aggByMid = new Map<string, Agg>();
    for (const mid of merchantIds) {
      aggByMid.set(mid, { count: 0, volume: 0, refunds: 0, chargebacks: 0 });
    }

    for (const tx of txReport.results) {
      const mid = String(tx?.merchantId ?? "").trim();
      const agg = aggByMid.get(mid);
      if (!agg) continue;

      const primary = pickPrimaryAction(tx?.actions);
      const amount = parseFloat(String(primary?.amount?.amount ?? tx?.amount?.amount ?? "0")) || 0;
      const status = normaliseStatus(tx?.status);
      const txType = normaliseType(primary?.actionType ?? tx?.transactionType);

      if (txType === "refund" || txType === "credit") {
        agg.refunds += amount;
      } else if (txType === "void") {
        // ignore voids in volume/count
      } else if (status === "complete" || status === "pending" || status === "pending_settlement") {
        agg.count += 1;
        agg.volume += amount;
      }

      if (status === "chargeback" || txType === "chargeback") {
        agg.chargebacks += amount;
      }
    }

    // ── Step 4: Optionally enrich names from v3 affiliate roster (best-effort) ──
    const nameOverride = new Map<string, string>();
    try {
      const rosterRes = await fetch(`${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways`, {
        headers: { Authorization: nmiApiKey, Accept: "application/json" },
      });
      if (rosterRes.ok) {
        const rosterParsed = await rosterRes.json();
        const merchantsRaw = Array.isArray(rosterParsed)
          ? rosterParsed
          : rosterParsed?.gateways ?? rosterParsed?.data ?? [];
        for (const m of merchantsRaw) {
          const mid = String(m.id ?? m.gateway_id ?? m.merchant_id ?? "");
          const name = String(m.company ?? m.company_name ?? m.dba_name ?? m.name ?? "");
          if (mid && name && accountByMid.has(mid)) nameOverride.set(mid, name);
        }
      }
    } catch (rosterErr) {
      console.warn("Affiliate roster lookup failed (non-fatal):", rosterErr);
    }

    // ── Step 5: Build commission rows from our scoped accounts ──
    // Per-account formula (processing model):
    //   gross_fees      = volume × merchant_rate_pct / 100
    //   gross_margin    = volume × (merchant_rate_pct − interchange_rate_pct) / 100
    //   total_commission = gross_margin × revenue_share_pct / 100
    // Gateway-only accounts produce no processing residual (commission = 0).
    const commissions = merchantIds.map((mid) => {
      const account = accountByMid.get(mid)!;
      const agg = aggByMid.get(mid)!;
      const displayName = account.name || nameOverride.get(mid) || mid;

      let fees = 0;
      let grossMargin = 0;
      let totalCommission = 0;
      let residualRate: number | null = null;

      if (account.commission_model === "processing") {
        const merchantRate = account.merchant_rate_pct / 100;
        const interchangeRate = account.interchange_rate_pct / 100;
        const revShare = account.revenue_share_pct / 100;
        fees = agg.volume * merchantRate;
        grossMargin = agg.volume * (merchantRate - interchangeRate);
        totalCommission = grossMargin * revShare;
        residualRate = (merchantRate - interchangeRate) * revShare;
      }

      return {
        account_id: account.id,
        gateway_id: mid,
        company_name: displayName,
        transaction_count: agg.count,
        gross_volume: agg.volume,
        fees: round2(fees),
        residual_amount: round2(grossMargin),
        residual_rate: residualRate,
        total_commission: round2(totalCommission),
        chargeback_amount: agg.chargebacks,
        refund_amount: agg.refunds,
        status: agg.count > 0 ? "active" : "inactive",
        currency: "USD",
      };
    });

    const summary = buildSummary(commissions.filter(c => c.transaction_count > 0 || c.gross_volume > 0));
    const durationMs = Date.now() - startTime;

    // ── Step 6: Log the sync ──
    await sb.from("commission_sync_logs").insert({
      period_month: requestMonth,
      period_year: requestYear,
      merchant_count: commissions.length,
      raw_response: { merchant_ids: merchantIds, transaction_count: txReport.results.length, summary },
      source_api: "v4_transactions_reports",
      triggered_by: user.email,
      duration_ms: durationMs,
      status: "success",
    });

    // ── Step 7: Persist to commission tables ──
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
          await sb.from("commission_records").delete().eq("period_id", period.id);

          for (const c of commissions) {
            await sb.from("commission_records").insert({
              period_id: period.id,
              account_id: c.account_id,
              nmi_gateway_id: c.gateway_id,
              company_name: c.company_name,
              transaction_count: c.transaction_count,
              transaction_volume: c.gross_volume,
              transaction_fees: c.fees,
              chargeback_fees: c.chargeback_amount,
              residual_rate: c.residual_rate,
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
      truncated: txReport.truncated,
      cached: false,
      sync_duration_ms: durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error("NMI commissions error:", err);

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
        source_api: "v4_transactions_reports",
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function buildSummary(commissions: unknown[]) {
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

async function fetchTransactionsReport({
  nmiApiKey,
  merchantIds,
  startIso,
  endIso,
}: {
  nmiApiKey: string;
  merchantIds: string[];
  startIso: string;
  endIso: string;
}) {
  const results: unknown[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < MAX_REPORT_PAGES) {
    const payload: Record<string, unknown> = {
      maxResults: String(MAX_RESULTS_PER_PAGE),
      offset: String(offset),
      date: { start: startIso, end: endIso },
    };

    if (merchantIds.length === 1) {
      payload.merchantId = merchantIds[0];
    } else if (merchantIds.length > 1) {
      payload.merchantIds = merchantIds;
    }

    const response = await fetch(NMI_TRANSACTIONS_REPORT_URL, {
      method: "POST",
      headers: {
        Authorization: nmiApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let parsed: unknown = null;
    try { parsed = responseText ? JSON.parse(responseText) : null; } catch { /* ignore */ }

    if (!response.ok) {
      console.error(`NMI transactions HTTP ${response.status}:`, responseText.substring(0, 500));
      throw new Error(extractNmiError(parsed) || `NMI transactions API returned HTTP ${response.status}`);
    }

    const pageResults = Array.isArray(parsed?.results) ? parsed.results : [];
    results.push(...pageResults);

    hasMore = Boolean(parsed?.hasMore) && pageResults.length > 0;
    offset += pageResults.length;
    pageCount += 1;

    if (pageResults.length === 0) break;
  }

  return { results, truncated: hasMore };
}

function pickPrimaryAction(actions: unknown[] | undefined) {
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const sorted = [...actions].sort((a, b) => {
    const aTime = new Date(a?.date ?? 0).getTime();
    const bTime = new Date(b?.date ?? 0).getTime();
    return aTime - bTime;
  });
  const preferred = sorted.filter((a) => PRIMARY_ACTION_TYPES.has(normaliseType(a?.actionType)));
  return preferred[preferred.length - 1] ?? sorted[sorted.length - 1] ?? sorted[0] ?? null;
}

function normaliseStatus(status: unknown) {
  const value = String(status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "pendingsettlement") return "pending_settlement";
  if (value === "approved") return "complete";
  if (value === "declined") return "failed";
  return value;
}

function normaliseType(type: unknown) {
  return String(type ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractNmiError(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return payload.errors
      .map((item: unknown) =>
        typeof item === "string" ? item :
        typeof item?.message === "string" ? item.message :
        JSON.stringify(item)
      )
      .join("; ");
  }
  return null;
}
