// Returns dev auto-login credentials ONLY to preview/localhost origins.
// Production (ops-terminal.lovable.app, custom domains) will receive 403.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const isPreviewOrigin = (origin: string | null): boolean => {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    // Lovable preview subdomains: id-preview--<uuid>.lovable.app
    if (/^id-preview--[a-z0-9-]+\.lovable\.app$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const origin = req.headers.get("Origin");
  if (!isPreviewOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Not available" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = Deno.env.get("DEV_AUTOLOGIN_EMAIL");
  const password = Deno.env.get("DEV_AUTOLOGIN_PASSWORD");
  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ email, password }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
