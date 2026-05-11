// Creates a Supabase auth user + linked `referrers` row for a new external referrer.
// Returns the generated temp password so the admin can hand it off securely.
// The referrer is prompted to change their password on first login.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Verify caller is an admin (matches create-team-user's allowlist exactly)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    const ADMIN_EMAILS = ['admin@merchanthaus.io', 'onboarding@merchanthaus.io', 'jamie@merchanthaus.io'];
    if (authError || !caller || !ADMIN_EMAILS.includes((caller.email ?? "").toLowerCase())) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const full_name: string = (body.full_name ?? "").trim();
    const phone: string | null = body.phone?.trim() || null;
    const commission_rate: number = Number.isFinite(body.commission_rate) ? body.commission_rate : 0.10;
    const monthly_cap_per_merchant: number =
      Number.isFinite(body.monthly_cap_per_merchant) ? body.monthly_cap_per_merchant : 1500;
    const clawback_window_days: number =
      Number.isFinite(body.clawback_window_days) ? body.clawback_window_days : 90;

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "email and full_name are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a strong temp password (the admin will share this verbally / via secure channel)
    const tempPassword = crypto.randomUUID().slice(0, 16) + "Aa1!";

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        must_change_password: true,
        role: "referrer",
      },
    });

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: referrer, error: insertError } = await supabaseAdmin
      .from("referrers")
      .insert({
        auth_user_id: newUser.user.id,
        full_name,
        email,
        phone,
        active: true,
        commission_rate,
        monthly_cap_per_merchant,
        clawback_window_days,
      })
      .select()
      .single();

    if (insertError) {
      // Roll back the auth user if the referrers row failed
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        message: `Referrer ${email} created.`,
        referrer,
        temp_password: tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
