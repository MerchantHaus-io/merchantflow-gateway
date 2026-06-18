import { requireAuth } from "../_shared/require-auth.ts";
import { kurvCors, kurvFetch, kurvJson, adminClient } from "../_shared/kurv.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Submits a deal to Kurv (signed or unsigned) and records it locally.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: kurvCors });
  const unauth = await requireAuth(req, kurvCors);
  if (unauth) return unauth;

  try {
    const { deal_type = "unsigned", opportunity_id, payload, idempotency_key } = await req.json();
    if (!payload || typeof payload !== "object") {
      return kurvJson({ error: "payload is required" }, 400);
    }
    if (!["signed", "unsigned"].includes(deal_type)) {
      return kurvJson({ error: "deal_type must be signed|unsigned" }, 400);
    }

    const sb = adminClient();
    // Resolve submitter email
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: who } = await userClient.auth.getUser();
    const submittedBy = who?.user?.email ?? null;

    // Idempotency
    if (idempotency_key) {
      const { data: existing } = await sb
        .from("kurv_deal_submissions")
        .select("id,deal_id,status,response")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();
      if (existing) return kurvJson({ duplicate: true, submission: existing });
    }

    const endpoint = deal_type === "signed"
      ? "/api/v1/Deal/SubmitSignedDealV2"
      : "/api/v1/Deal/SubmitUnsignedDeal";

    const res = await kurvFetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    }, sb);
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }

    const dealId = parsed?.DealId ?? parsed?.dealId ?? parsed?.Id ?? null;
    const status = res.ok ? (parsed?.Status ?? "submitted") : "error";

    const { data: row, error: insErr } = await sb.from("kurv_deal_submissions").insert({
      opportunity_id: opportunity_id ?? null,
      deal_id: dealId ? String(dealId) : null,
      deal_type,
      status,
      submitted_by: submittedBy,
      payload,
      response: parsed,
      error: res.ok ? null : (text || `HTTP ${res.status}`),
      idempotency_key: idempotency_key ?? null,
    }).select().single();

    if (insErr) console.error("kurv_deal_submissions insert error:", insErr);

    if (!res.ok) {
      return kurvJson({ error: "Kurv API error", status: res.status, body: parsed, submission: row }, 502);
    }
    return kurvJson({ ok: true, submission: row, response: parsed });
  } catch (err) {
    return kurvJson({ error: (err as Error).message }, 500);
  }
});
