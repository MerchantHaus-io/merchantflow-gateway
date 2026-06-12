import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Lists every merchant on the secure portal (including test/sandbox/inactive).
// Optional query params:
//   ?status=active|pending|test|inactive   - filter by account_status
//   ?q=<text>                              - case-insensitive search on company/dba/email
//   ?limit=<n>                             - cap rows (default 500)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const unauth = await requireAuth(req, corsHeaders);
  if (unauth) return unauth;

  try {
    const portalUrl = Deno.env.get("PORTAL_SUPABASE_URL");
    const portalKey = Deno.env.get("PORTAL_SERVICE_ROLE_KEY");
    if (!portalUrl || !portalKey) {
      return json({ error: "Portal credentials not configured" }, 500);
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const q = (url.searchParams.get("q") || "").trim();
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "500", 10) || 500, 1),
      2000,
    );

    const portal = createClient(portalUrl, portalKey);

    let query = portal
      .from("merchants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("account_status", status);
    if (q) {
      query = query.or(
        `company_name.ilike.%${q}%,dba_name.ilike.%${q}%,contact_email.ilike.%${q}%`,
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("portal merchants query error:", error);
      return json({ error: error.message }, 500);
    }

    const merchants = data || [];
    const counts = merchants.reduce<Record<string, number>>((acc, m: any) => {
      const k = (m.account_status || "unknown") as string;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return json({ merchants, total: merchants.length, counts });
  } catch (err) {
    console.error("gateway-accounts error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
