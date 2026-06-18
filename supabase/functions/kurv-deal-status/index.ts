import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const url = new URL(req.url);
    const dealId = url.searchParams.get("deal_id");
    if (!dealId) return kurvJson({ error: "deal_id required" }, 400);

    const sb = adminClient();
    const res = await kurvFetch(`/api/v1/Deal/GetDealStatus?dealId=${encodeURIComponent(dealId)}`, {}, sb);
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    if (!res.ok) return kurvJson({ error: "Kurv API error", status: res.status, body: parsed }, 502);

    const status = parsed?.Status ?? parsed?.status ?? "unknown";
    await sb.from("kurv_deal_submissions")
      .update({ status, response: parsed })
      .eq("deal_id", dealId);

    return kurvJson({ ok: true, deal_id: dealId, status, response: parsed });
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});
