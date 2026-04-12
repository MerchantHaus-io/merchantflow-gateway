import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authenticated CRM user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const crmSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await crmSupabase.auth.getUser();
    if (authErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { portal_merchant_id, nmi_api_key, nmi_public_key, pricing_model } = await req.json();

    if (!portal_merchant_id || !nmi_api_key || !nmi_public_key || !pricing_model) {
      return json({
        error: "Required: portal_merchant_id, nmi_api_key, nmi_public_key, pricing_model",
      }, 400);
    }

    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL");
    const portalKey = Deno.env.get("PORTAL_SERVICE_ROLE_KEY");
    if (!portalUrl || !portalKey) {
      return json({ error: "Portal credentials not configured" }, 500);
    }

    const portalSupabase = createClient(portalUrl, portalKey);

    // Activate merchant on portal — realtime subscription picks this up
    const { error: updateErr } = await portalSupabase
      .from("merchants")
      .update({
        account_status: "active",
        activated_at: new Date().toISOString(),
        nmi_api_key,
        nmi_public_key,
        pricing_model,
      })
      .eq("id", portal_merchant_id);

    if (updateErr) {
      console.error("Portal activation error:", updateErr);
      return json({ error: "Failed to activate on portal" }, 500);
    }

    console.log(`Portal merchant ${portal_merchant_id} activated by ${user.email}`);

    return json({ ok: true });
  } catch (err) {
    console.error("Activation error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
