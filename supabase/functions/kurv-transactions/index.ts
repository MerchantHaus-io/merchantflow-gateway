import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";

// Pulls daily batch + deposit summaries for a MID + date range and caches them.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const { mid, start_date, end_date } = await req.json();
    if (!mid || !start_date || !end_date) {
      return kurvJson({ error: "mid, start_date, end_date required" }, 400);
    }
    const sb = adminClient();

    const body = { MID: mid, StartDate: start_date, EndDate: end_date };
    const [batchRes, depRes] = await Promise.all([
      kurvFetch("/api/v1/Batches/DailyMerchantBatchSummary", { method: "POST", body: JSON.stringify(body) }, sb),
      kurvFetch("/api/v1/Deposits/DailyMerchantDepositSummary", { method: "POST", body: JSON.stringify(body) }, sb),
    ]);
    const batchText = await batchRes.text();
    const depText = await depRes.text();
    const batches = safeParse(batchText) ?? [];
    const deposits = safeParse(depText) ?? [];

    const batchList: any[] = Array.isArray(batches) ? batches : (batches.data ?? []);
    const depList: any[] = Array.isArray(deposits) ? deposits : (deposits.data ?? []);

    // Cache
    const byDate = new Map<string, any>();
    for (const b of batchList) {
      const d = (b.BusinessDate ?? b.Date ?? b.business_date ?? "").slice(0, 10);
      if (!d) continue;
      byDate.set(d, {
        mid, business_date: d,
        sales_amount: num(b.SalesAmount ?? b.Sales ?? 0),
        sales_count: int(b.SalesCount ?? b.SalesCnt ?? 0),
        refunds_amount: num(b.RefundsAmount ?? b.Refunds ?? 0),
        refunds_count: int(b.RefundsCount ?? 0),
        interchange_amount: num(b.InterchangeAmount ?? 0),
        deposit_amount: 0,
        raw: { batch: b },
        last_synced_at: new Date().toISOString(),
      });
    }
    for (const d of depList) {
      const date = (d.BusinessDate ?? d.Date ?? "").slice(0, 10);
      if (!date) continue;
      const row = byDate.get(date) ?? {
        mid, business_date: date, sales_amount: 0, sales_count: 0,
        refunds_amount: 0, refunds_count: 0, interchange_amount: 0,
        deposit_amount: 0, raw: {}, last_synced_at: new Date().toISOString(),
      };
      row.deposit_amount = num(d.DepositAmount ?? d.Amount ?? 0);
      row.raw = { ...(row.raw ?? {}), deposit: d };
      byDate.set(date, row);
    }
    const rows = Array.from(byDate.values());
    if (rows.length) {
      await sb.from("kurv_transactions_daily").upsert(rows, { onConflict: "mid,business_date" });
    }

    return kurvJson({ ok: true, mid, batches: batchList, deposits: depList, cached: rows.length });
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});

function safeParse(t: string) { try { return t ? JSON.parse(t) : null; } catch { return null; } }
function num(v: any) { const n = Number(v); return isFinite(n) ? n : 0; }
function int(v: any) { const n = parseInt(String(v), 10); return isFinite(n) ? n : 0; }
