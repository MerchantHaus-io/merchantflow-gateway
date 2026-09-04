// Deletes an affiliate: removes the `referrers` row and, when present, the
// linked auth user. Admin-only (token bearer must have a @merchanthaus.io
// email, matching create-referrer-user).
//
// Refuses to delete while commission records still reference the affiliate,
// so payout history is never orphaned.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller || !(caller.email ?? "").toLowerCase().endsWith("@merchanthaus.io")) {
      return json({ error: "Admin access required" }, 403);
    }

    const body = await req.json();
    const referrer_id: string = (body.referrer_id ?? "").trim();
    if (!referrer_id) return json({ error: "referrer_id is required" }, 400);

    const { data: referrer, error: loadError } = await supabaseAdmin
      .from("referrers")
      .select("id, full_name, auth_user_id")
      .eq("id", referrer_id)
      .maybeSingle();

    if (loadError) return json({ error: loadError.message }, 400);
    if (!referrer) return json({ error: "Affiliate not found" }, 404);

    const { count: commissionCount, error: countError } = await supabaseAdmin
      .from("commission_records")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", referrer_id);

    if (countError) return json({ error: countError.message }, 400);
    if ((commissionCount ?? 0) > 0) {
      return json(
        {
          error:
            `${referrer.full_name} has ${commissionCount} commission record(s). ` +
            `Switch them to inactive instead of deleting so payout history stays intact.`,
        },
        409,
      );
    }

    // Detach attribution so tagged deals survive the delete.
    const { error: detachError } = await supabaseAdmin
      .from("opportunities")
      .update({ referrer_id: null })
      .eq("referrer_id", referrer_id);
    if (detachError) return json({ error: detachError.message }, 400);

    const { error: deleteError } = await supabaseAdmin.from("referrers").delete().eq("id", referrer_id);
    if (deleteError) return json({ error: deleteError.message }, 400);

    if (referrer.auth_user_id) {
      const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(referrer.auth_user_id);
      if (userError) {
        return json({
          message: `${referrer.full_name} removed, but the login could not be deleted: ${userError.message}`,
          partial: true,
        });
      }
    }

    return json({ message: `${referrer.full_name} deleted.` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json({ error: errorMessage }, 500);
  }
});
