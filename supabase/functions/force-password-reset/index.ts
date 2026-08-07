import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** listUsers() defaults to 50 per page — always page explicitly. */
const USERS_PER_PAGE = 200;
/** How many users to update concurrently. Keeps us inside the function timeout
 *  without opening an unbounded number of admin requests at once. */
const UPDATE_CONCURRENCY = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    const ADMIN_EMAILS = ['admin@merchanthaus.io', 'onboarding@merchanthaus.io', 'jamie@merchanthaus.io'];
    if (authError || !caller || !ADMIN_EMAILS.includes(caller.email || '')) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Page through every user. listUsers() returns only the first 50 by
    // default, so the previous single call silently covered a fraction of the
    // team while the response claimed the whole set had been updated.
    const users: { id: string; email?: string; user_metadata: Record<string, unknown>; app_metadata?: Record<string, unknown> }[] = [];
    for (let page = 1; ; page++) {
      const { data, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });
      if (listError) throw listError;

      const batch = data?.users ?? [];
      users.push(...batch);
      if (batch.length < USERS_PER_PAGE) break;
    }

    console.log(`Found ${users.length} users to update`);

    // Update in bounded-concurrency batches rather than strictly one at a
    // time — a sequential loop over a growing team hits the function timeout.
    const results: { id: string; success: boolean; error?: string }[] = [];
    for (let i = 0; i < users.length; i += UPDATE_CONCURRENCY) {
      const batch = users.slice(i, i + UPDATE_CONCURRENCY);
      const settled = await Promise.all(
        batch.map(async (user) => {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            user.id,
            {
              // app_metadata is the authoritative flag: only the service role
              // can write it. The user_metadata copy is kept in step so older
              // clients keep working, but it is no longer trusted.
              app_metadata: {
                ...(user as { app_metadata?: Record<string, unknown> }).app_metadata,
                must_change_password: true,
              },
              user_metadata: {
                ...user.user_metadata,
                must_change_password: true,
              },
            },
          );
          if (updateError) {
            // Log the id, not the email — this lands in edge-function logs.
            console.error(`Failed to update user ${user.id}:`, updateError.message);
            return { id: user.id, success: false, error: updateError.message };
          }
          return { id: user.id, success: true };
        }),
      );
      results.push(...settled);
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;
    console.log(`Updated ${succeeded} of ${users.length} users (${failed} failed)`);

    return new Response(
      JSON.stringify({
        message: `Updated ${succeeded} of ${users.length} users`,
        total: users.length,
        succeeded,
        failed,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    // Log the detail server-side; return an opaque message so Postgres and
    // other internal errors don't leak into the browser.
    console.error("Error in force-password-reset:", error);
    return new Response(
      JSON.stringify({ error: "Failed to force password reset. Check the function logs." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
