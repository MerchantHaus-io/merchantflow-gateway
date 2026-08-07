import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Clear the caller's own `must_change_password` flag after they have actually
 * changed their password.
 *
 * The flag used to live in `user_metadata`, which the owning user can write
 * themselves via `supabase.auth.updateUser({ data })` — so anyone subject to a
 * forced reset could simply clear their own flag and skip it. It now lives in
 * `app_metadata`, which only the service role can modify, which is why this
 * function has to exist: the browser can no longer clear it directly.
 *
 * The caller's JWT identifies whose flag is cleared. A user can only ever
 * clear their own, and the request body is not trusted for identity.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "").trim();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Identity comes from the token, never from the body.
    const { data: userData, error: authError } = await admin.auth.getUser(token);
    if (authError || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const user = userData.user;

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, must_change_password: false },
      // Clear the legacy copy too, so a stale user_metadata value can't keep
      // the user trapped on the change-password screen after migration.
      user_metadata: { ...user.user_metadata, must_change_password: false },
    });

    if (updateError) {
      console.error("[complete-password-change] update failed:", updateError.message);
      return json({ error: "Could not clear the password-change flag." }, 500);
    }

    console.log(`[complete-password-change] cleared for user ${user.id}`);
    return json({ success: true }, 200);
  } catch (error) {
    console.error("[complete-password-change] unexpected error:", error);
    return json({ error: "Unexpected error." }, 500);
  }
});
