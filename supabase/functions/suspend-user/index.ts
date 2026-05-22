import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Require a valid admin JWT — never trust missing/anon headers
    const ADMIN_EMAILS = ["admin@merchanthaus.io", "jamie@merchanthaus.io", "onboarding@merchanthaus.io"];
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    const callerEmail = (callerData?.user?.email ?? "").toLowerCase();
    if (callerErr || !callerData?.user || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(callerEmail)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId, action } = await req.json();
    
    if (action === "suspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User suspended" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (action === "unsuspend") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, message: "User unsuspended" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
