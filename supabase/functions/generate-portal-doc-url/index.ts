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

    const { storage_path } = await req.json();
    if (!storage_path) {
      return json({ error: "storage_path is required" }, 400);
    }

    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL");
    const portalKey = Deno.env.get("PORTAL_SERVICE_ROLE_KEY");
    if (!portalUrl || !portalKey) {
      return json({ error: "Portal credentials not configured" }, 500);
    }

    const portalSupabase = createClient(portalUrl, portalKey);

    // Generate signed URL with 1-hour expiry
    const { data, error } = await portalSupabase.storage
      .from("merchant-documents")
      .createSignedUrl(storage_path, 3600);

    if (error) {
      console.error("Signed URL error:", error);
      return json({ error: "Could not generate URL" }, 500);
    }

    return json({ signed_url: data.signedUrl });
  } catch (err) {
    console.error("Generate portal doc URL error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
