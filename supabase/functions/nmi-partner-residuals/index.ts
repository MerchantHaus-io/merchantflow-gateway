// Fetch NMI's partner residual/commission report (what NMI pays us) and
// persist per-merchant per-month rows into `nmi_partner_residuals`.
//
// NMI publishes partner residuals through the Partner Portal Query API
// (`/api/query.php?report_type=residual_summary`), which returns XML.
// We try that first on the white-label partner domain, then on
// secure.nmi.com, and finally fall back to any v4/v3 JSON endpoints that
// might exist for a given portal generation. Every attempt is captured
// in the response so the UI can surface *why* nothing came back instead
// of silently persisting zero rows.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PARTNER_BASE = "https://merchanthausio.transactiongateway.com";
const SECURE_BASE = "https://secure.nmi.com";
const V4_BASE = `${SECURE_BASE}/api/v4`;

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

interface AttemptLog {
  endpoint: string;
  status: number | null;
  rows: number;
  note?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const nmiKey = Deno.env.get("NMI_API_KEY");
    // The Partner Portal Query/Reporting API (query.php?report_type=residual_summary)
    // uses a DIFFERENT security key than the v3 Boarding / v4 Partner API key.
    // NMI issues it separately as the "Partner Reporting Key" / Query API key.
    // Prefer it when present; fall back to NMI_API_KEY only so the request
    // still runs and returns a diagnostic instead of silently doing nothing.
    const queryKey = Deno.env.get("NMI_PARTNER_QUERY_KEY") || nmiKey;
    if (!nmiKey && !queryKey) throw new Error("NMI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const defaultMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthStr: string =
      body.month ??
      `${defaultMonthDate.getFullYear()}-${String(defaultMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = monthStr.split("-").map(Number);
    if (!y || !m) return json({ error: "Invalid month; expected YYYY-MM" }, 400);
    const periodMonth = `${y}-${String(m).padStart(2, "0")}-01`;

    const attempts: AttemptLog[] = [];
    let rows: NormalizedRow[] = [];
    let source = "";

    // 1) Partner Query API — XML residual_summary on the white-label domain
    for (const base of [PARTNER_BASE, SECURE_BASE]) {
      const attempt = await fetchQueryPhpResiduals(base, queryKey!, y, m);
      attempts.push(attempt.log);
      if (attempt.rows.length) {
        rows = attempt.rows;
        source = `query.php@${base}`;
        break;
      }
    }

    // 2) v4 JSON residuals (portal-generation-dependent)
    if (!rows.length) {
      const attempt = await fetchV4Residuals(nmiKey!, y, m);
      attempts.push(...attempt.logs);
      if (attempt.rows.length) {
        rows = attempt.rows;
        source = "v4-json";
      }
    }

    // Resolve MID → account_id
    const mids = [...new Set(rows.map((r) => r.nmi_merchant_id).filter(Boolean))];
    const midToAccount = new Map<string, string>();
    if (mids.length) {
      const { data: accts } = await sb
        .from("accounts")
        .select("id, nmi_merchant_id")
        .in("nmi_merchant_id", mids);
      for (const a of accts ?? []) if (a.nmi_merchant_id) midToAccount.set(a.nmi_merchant_id, a.id);
    }

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
        { onConflict: "period_month,nmi_merchant_id" },
      );
      if (!error) persisted++;
      else console.error("upsert error:", error.message);
    }

    return json({
      period_month: periodMonth,
      source: source || "none",
      row_count: rows.length,
      persisted,
      matched_accounts: [...midToAccount.keys()].length,
      attempts,
      last_error:
        rows.length === 0
          ? (attempts.some((a) => /API key not found/i.test(a.note ?? ""))
              ? "NMI rejected the API key on the Partner Reporting API (query.php). The Reporting/Query API uses a DIFFERENT key from the v3 Boarding / v4 Partner key. Add a secret named NMI_PARTNER_QUERY_KEY with the Partner Reporting key from your NMI Partner Portal (Settings → Security Keys → Reporting API)."
              : "NMI returned no residual rows from any endpoint. See `attempts` for status codes — most partner portals require the Reporting API to be explicitly enabled on your key by NMI support.")
          : null,
      using_dedicated_query_key: Boolean(Deno.env.get("NMI_PARTNER_QUERY_KEY")),
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

// ─── Partner Portal Query API — XML ────────────────────────────────────────
async function fetchQueryPhpResiduals(
  base: string,
  apiKey: string,
  year: number,
  month: number,
): Promise<{ rows: NormalizedRow[]; log: AttemptLog }> {
  const startDate = `${year}${String(month).padStart(2, "0")}01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}${String(month).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
  const url =
    `${base}/api/query.php?security_key=${encodeURIComponent(apiKey)}` +
    `&report_type=residual_summary&start_date=${startDate}&end_date=${endDate}`;
  const log: AttemptLog = { endpoint: `${base}/api/query.php?report_type=residual_summary`, status: null, rows: 0 };
  try {
    const res = await fetch(url, { headers: { Accept: "application/xml,text/xml" } });
    log.status = res.status;
    const text = await res.text();
    if (!res.ok) {
      log.note = text.slice(0, 200);
      return { rows: [], log };
    }
    const rows = parseResidualXml(text);
    log.rows = rows.length;
    if (!rows.length) log.note = text.slice(0, 200);
    return { rows, log };
  } catch (e) {
    log.note = String(e);
    return { rows: [], log };
  }
}

function parseResidualXml(xml: string): NormalizedRow[] {
  const rows: NormalizedRow[] = [];
  // Naive but effective row extractor: matches <merchant>…</merchant> blocks.
  const blocks = xml.match(/<merchant[\s\S]*?<\/merchant>/gi) ?? [];
  const getTag = (block: string, tag: string) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
    const match = block.match(re);
    if (!match) return "";
    return match[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
  };
  const num = (v: string) => {
    if (!v) return 0;
    const n = parseFloat(v.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  for (const block of blocks) {
    const mid = getTag(block, "merchant_id") || getTag(block, "mid") || getTag(block, "gateway_id");
    if (!mid) continue;
    rows.push({
      nmi_merchant_id: mid,
      company_name: getTag(block, "company_name") || getTag(block, "merchant_name") || getTag(block, "dba") || null,
      gross_volume: num(getTag(block, "gross_volume") || getTag(block, "volume")),
      transaction_count: Math.round(num(getTag(block, "transaction_count") || getTag(block, "txn_count"))),
      interchange_cost: num(getTag(block, "interchange") || getTag(block, "interchange_cost")),
      assessments: num(getTag(block, "assessments")),
      processor_fees: num(getTag(block, "processor_fees") || getTag(block, "processing_fees")),
      gateway_fees: num(getTag(block, "gateway_fees") || getTag(block, "gateway_revenue")),
      partner_residual: num(
        getTag(block, "partner_residual") ||
          getTag(block, "residual") ||
          getTag(block, "commission") ||
          getTag(block, "net_residual"),
      ),
      raw: block,
    });
  }
  return rows;
}

// ─── V4 partner residuals (best-effort JSON) ───────────────────────────────
async function fetchV4Residuals(
  apiKey: string,
  year: number,
  month: number,
): Promise<{ rows: NormalizedRow[]; logs: AttemptLog[] }> {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const paths = ["/residuals", "/reports/residuals", "/partner/residuals"];
  const logs: AttemptLog[] = [];
  for (const p of paths) {
    const url = `${V4_BASE}${p}?start_date=${startDate}&end_date=${endDate}&page=1&per_page=500`;
    const log: AttemptLog = { endpoint: `v4${p}`, status: null, rows: 0 };
    try {
      const res = await fetch(url, { headers: { Authorization: apiKey, Accept: "application/json" } });
      log.status = res.status;
      if (!res.ok) {
        log.note = (await res.text()).slice(0, 160);
        logs.push(log);
        continue;
      }
      const data = await res.json().catch(() => null);
      const items: any[] = Array.isArray(data) ? data : data?.data ?? data?.residuals ?? data?.results ?? [];
      log.rows = items.length;
      logs.push(log);
      if (items.length) return { rows: items.map(normalizeRow), logs };
    } catch (e) {
      log.note = String(e);
      logs.push(log);
    }
  }
  return { rows: [], logs };
}

function normalizeRow(item: any): NormalizedRow {
  const num = (v: any): number => {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const mid = item.merchant_id ?? item.mid ?? item.gateway_id ?? item.gatewayId ?? item.id ?? "";
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
        item.affiliate_residual,
    ),
    raw: item,
  };
}
