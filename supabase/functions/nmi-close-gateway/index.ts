import { requireAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NMI_GATEWAY_BASE = "https://merchanthausio.transactiongateway.com";

// Deactivates an NMI gateway via the v3 Affiliate Boarding API.
// Body: { gateway_id: string | number, reason?: string }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const unauth = await requireAuth(req, corsHeaders);
  if (unauth) return unauth;

  try {
    const apiKey = Deno.env.get("NMI_API_KEY");
    if (!apiKey) return json({ error: "NMI_API_KEY not configured" }, 500);

    const { gateway_id, reason } = await req.json().catch(() => ({}));
    if (!gateway_id) return json({ error: "gateway_id required" }, 400);

    const url = `${NMI_GATEWAY_BASE}/api/v3/affiliate/gateways/${encodeURIComponent(String(gateway_id))}`;

    // Try PUT with status=deactivated (v3 Boarding API gateway update)
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "deactivated", note: reason ?? "Closed via CRM" }),
    });

    const text = await res.text();
    console.log(`nmi-close-gateway [${gateway_id}] status=${res.status} body=${text.substring(0, 400)}`);

    if (!res.ok) {
      return json(
        { ok: false, status: res.status, message: text.substring(0, 400) || "NMI API rejected request" },
        200, // non-fatal — return ok=false so UI can surface
      );
    }

    return json({ ok: true, gateway_id, message: "Gateway marked deactivated on NMI" });
  } catch (err) {
    console.error("nmi-close-gateway error:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
