// Fetch NMI's partner residual/commission report (what NMI pays us) and
// persist per-merchant per-month rows into `nmi_partner_residuals`.
// Strategy: try Partner v4 residuals endpoints first, then fall back to v3
// affiliate reports. Raw JSON is stored so mapping can be tuned later.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const V4_BASE = "https://secure.nmi.com/api/v4";
const V3_BASE = "https://merchanthausio.transactiongateway.com/api/v3/affiliate";

interface NormalizedRow {
  nmi_merchant_id: string;
  company_name: string | null;
  gross_volume: number;
  transaction_count: number;
  interchange_cost: number;
  assessments: number;
  processor_fees: number;
  gateway_fees: number;
  partner_residual: number;
  raw: unknown;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const nmiKey = Deno.env.get("NMI_API_KEY");
    if (!nmiKey) throw new Error("NMI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Auth: allow signed-in team OR service-role invocations (cron).
    const authHeader = req.headers.get("Authorization") ?? "";
    const isService = authHeader.includes(serviceKey);
    if (!isService) {
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    // Default: last complete month (NMI publishes residuals mid-following month).
    const now = new Date();
    const defaultMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr: string =
      body.month ??
      `${defaultMonthDate.getFullYear()}-${String(defaultMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = monthStr.split("-").map(Number);
    if (!y || !m) return json({ error: "Invalid month; expected YYYY-MM" }, 400);
    const periodMonth = `${y}-${String(m).padStart(2, "0")}-01`;

    // ── Try Partner v4 residual reports ──
    let rows: NormalizedRow[] = [];
    let source = "v4";
    let lastError: string | null = null;
    try {
      rows = await fetchV4Residuals(nmiKey, y, m);
    } catch (e) {
      lastError = String(e);
      console.log("v4 residuals failed:", lastError);
    }

    if (!rows.length) {
      source = "v3";
      try {
        rows = await fetchV3Residuals(nmiKey, y, m);
      } catch (e) {
        lastError = String(e);
        console.log("v3 residuals failed:", lastError);
      }
    }

    // Resolve MID → account_id in one shot
    const mids = [...new Set(rows.map((r) => r.nmi_merchant_id).filter(Boolean))];
    const midToAccount = new Map<string, string>();
    if (mids.length) {
      const { data: accts } = await sb
        .from("accounts")
        .select("id, nmi_merchant_id")
        .in("nmi_merchant_id", mids);
      for (const a of accts ?? []) if (a.nmi_merchant_id) midToAccount.set(a.nmi_merchant_id, a.id);
    }

    // Upsert
    let persisted = 0;
    for (const r of rows) {
      const { error } = await sb.from("nmi_partner_residuals").upsert(
        {
          period_month: periodMonth,
          nmi_merchant_id: r.nmi_merchant_id,
          account_id: midToAccount.get(r.nmi_merchant_id) ?? null,
          company_name: r.company_name,
          gross_volume: r.gross_volume,
          transaction_count: r.transaction_count,
          interchange_cost: r.interchange_cost,
          assessments: r.assessments,
          processor_fees: r.processor_fees,
          gateway_fees: r.gateway_fees,
          partner_residual: r.partner_residual,
          raw: r.raw,
          synced_at: new Date().toISOString(),
        },
        { onConflict: "period_month,nmi_merchant_id" }
      );
      if (!error) persisted++;
      else console.error("upsert error:", error.message);
    }

    return json({
      period_month: periodMonth,
      source,
      row_count: rows.length,
      persisted,
      matched_accounts: [...midToAccount.keys()].length,
      last_error: rows.length === 0 ? lastError : null,
    });
  } catch (err) {
    console.error("nmi-partner-residuals error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── V4 partner residuals ──────────────────────────────────────────────────
async function fetchV4Residuals(apiKey: string, year: number, month: number): Promise<NormalizedRow[]> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // NMI v4 residual endpoint names vary by portal generation — try the common ones.
  const paths = ["/residuals", "/reports/residuals", "/partner/residuals"];
  for (const p of paths) {
    const url = `${V4_BASE}${p}?start_date=${startDate}&end_date=${endDate}&page=1&per_page=500`;
    const res = await fetch(url, { headers: { Authorization: apiKey, Accept: "application/json" } });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.residuals ?? data?.results ?? [];
    if (items.length) return items.map(normalizeRow);
  }
  return [];
}

// ─── V3 affiliate reports (fallback) ───────────────────────────────────────
async function fetchV3Residuals(apiKey: string, year: number, month: number): Promise<NormalizedRow[]> {
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const paths = [
    `/reports/residuals?month=${monthStr}`,
    `/residuals?month=${monthStr}`,
    `/reports/commissions?month=${monthStr}`,
  ];
  for (const p of paths) {
    const res = await fetch(`${V3_BASE}${p}`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
    });
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.residuals ?? data?.gateways ?? [];
    if (items.length) return items.map(normalizeRow);
  }
  return [];
}

// Best-effort field normalization — NMI response shapes vary. Raw JSON is
// preserved so we can retune once we see real payloads.
function normalizeRow(item: any): NormalizedRow {
  const num = (v: any): number => {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const mid =
    item.merchant_id ?? item.mid ?? item.gateway_id ?? item.gatewayId ?? item.id ?? "";
  return {
    nmi_merchant_id: String(mid),
    company_name: item.company_name ?? item.merchant_name ?? item.dba ?? item.name ?? null,
    gross_volume: num(item.gross_volume ?? item.volume ?? item.sales_volume ?? item.total_volume),
    transaction_count: Math.round(num(item.transaction_count ?? item.txn_count ?? item.transactions ?? item.count)),
    interchange_cost: num(item.interchange ?? item.interchange_cost),
    assessments: num(item.assessments ?? item.assessment_fees),
    processor_fees: num(item.processor_fees ?? item.processing_fees),
    gateway_fees: num(item.gateway_fees ?? item.gateway_revenue),
    partner_residual: num(
      item.partner_residual ??
        item.residual ??
        item.commission ??
        item.payout ??
        item.net_residual ??
        item.affiliate_residual
    ),
    raw: item,
  };
}
