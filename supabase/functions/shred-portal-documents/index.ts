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

    // Admin-only: irreversible destructive storage operation
    const ADMIN_EMAILS = ['admin@merchanthaus.io', 'onboarding@merchanthaus.io', 'jamie@merchanthaus.io'];
    if (!ADMIN_EMAILS.includes(user.email || '')) {
      console.warn(`Forbidden shred-portal-documents attempt by ${user.email}`);
      return json({ error: "Admin access required" }, 403);
    }

    const { portal_merchant_id } = await req.json();
    if (!portal_merchant_id) {
      return json({ error: "portal_merchant_id is required" }, 400);
    }

    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL");
    const portalKey = Deno.env.get("PORTAL_SERVICE_ROLE_KEY");
    if (!portalUrl || !portalKey) {
      return json({ error: "Portal credentials not configured" }, 500);
    }

    const portalSupabase = createClient(portalUrl, portalKey);

    // Get all non-shredded document paths from portal
    const { data: docs } = await portalSupabase
      .from("merchant_documents")
      .select("storage_path")
      .eq("merchant_id", portal_merchant_id)
      .neq("status", "shredded")
      .not("storage_path", "is", null);

    const paths = (docs || []).map((d: unknown) => d.storage_path).filter(Boolean);

    if (paths.length > 0) {
      // Delete files from portal storage
      await portalSupabase.storage
        .from("merchant-documents")
        .remove(paths);
    }

    // Update portal merchant_documents rows — keep metadata, null the path
    await portalSupabase
      .from("merchant_documents")
      .update({
        status: "shredded",
        storage_path: null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("merchant_id", portal_merchant_id)
      .neq("status", "shredded");

    console.log(`Shredded ${paths.length} portal documents for merchant ${portal_merchant_id} by ${user.email}`);

    return json({ ok: true, shredded: paths.length });
  } catch (err) {
    console.error("Shred error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
