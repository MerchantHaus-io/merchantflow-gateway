import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  const started = Date.now();
  const sb = adminClient();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    // EMS: POST /api/v1/Merchants returns paged list. We pass through filters.
    const res = await kurvFetch("/api/v1/Merchants", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }, sb);

    const text = await res.text();
    if (!res.ok) {
      await sb.from("kurv_sync_logs").insert({
        job: "list-merchants", status: "error", error: text, duration_ms: Date.now() - started,
      });
      return kurvJson({ error: "Kurv API error", status: res.status, body: text }, 502);
    }
    const data = text ? JSON.parse(text) : [];
    const list: any[] = Array.isArray(data) ? data : (data.Merchants ?? data.merchants ?? data.data ?? []);

    // Upsert into our cache
    let upserted = 0;
    for (const m of list) {
      const mid = String(m.MID ?? m.Mid ?? m.mid ?? "").trim();
      if (!mid) continue;
      const row = {
        mid,
        dba_name: m.DBAName ?? m.DbaName ?? m.dba_name ?? null,
        legal_name: m.LegalName ?? m.legal_name ?? null,
        status: m.Status ?? m.status ?? null,
        mcc: m.MCC ?? m.Mcc ?? m.mcc ?? null,
        processor: m.Processor ?? m.processor ?? null,
        boarded_at: m.BoardedDate ?? m.boarded_at ?? null,
        raw: m,
        last_synced_at: new Date().toISOString(),
      };
      const { error } = await sb.from("kurv_merchants").upsert(row, { onConflict: "mid" });
      if (!error) upserted++;
    }

    await sb.from("kurv_sync_logs").insert({
      job: "list-merchants", status: "ok", rows_processed: upserted,
      duration_ms: Date.now() - started,
    });
    return kurvJson({ merchants: list, total: list.length, upserted });
  } catch (err) {
    const msg = (err as Error).message;
    await sb.from("kurv_sync_logs").insert({
      job: "list-merchants", status: "error", error: msg, duration_ms: Date.now() - started,
    });
    return kurvJson({ error: msg }, 500);
  }
});
