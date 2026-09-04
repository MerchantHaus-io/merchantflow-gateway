// Public self-serve affiliate sign-up.
//
// Creates the auth login AND a `referrers` row, but leaves the row INACTIVE.
// An admin activates it on /admin/affiliates. Until then the account cannot
// reach the affiliate portal (AuthContext only resolves active referrers), so
// nobody self-grants commission access.
//
// verify_jwt = false: this endpoint is reached by anonymous visitors.

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

// Default partner terms — mirrors the referral programme (50% rev share,
// $1,000 per account per month). Admins can adjust per affiliate after approval.
const DEFAULT_COMMISSION_RATE = 0.5;
const DEFAULT_MONTHLY_CAP = 1000;
const DEFAULT_CLAWBACK_DAYS = 90;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const phone = String(body.phone ?? "").trim() || null;
    const company = String(body.company ?? "").trim();
    const notes = company ? `Self sign-up — ${company}` : "Self sign-up";

    const errors: string[] = [];
    if (full_name.length < 2 || full_name.length > 120) errors.push("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) errors.push("Enter a valid email address.");
    if (password.length < 10 || password.length > 200) errors.push("Password must be at least 10 characters.");
    if (phone && phone.length > 40) errors.push("Phone number is too long.");
    if (errors.length) return json({ error: errors.join(" ") }, 400);

    // Internal staff must not register as affiliates.
    if (email.endsWith("@merchanthaus.io")) {
      return json({ error: "Internal staff accounts cannot register as affiliates." }, 400);
    }

    // Existing affiliate row for this email?
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("referrers")
      .select("id, auth_user_id, active")
      .eq("email", email)
      .maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, 400);

    if (existing?.auth_user_id) {
      return json({ error: "An affiliate account already exists for this email. Try signing in instead." }, 409);
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
      app_metadata: { role: "referrer" },
    });

    if (createError || !created?.user) {
      const msg = createError?.message ?? "Could not create your login.";
      const conflict = /already|registered|exists/i.test(msg);
      return json(
        { error: conflict ? "An account already exists for this email. Try signing in instead." : msg },
        conflict ? 409 : 400,
      );
    }

    const userId = created.user.id;

    if (existing) {
      // Attribution-only / pre-seeded row: attach the new login, keep pending.
      const { error: updateError } = await supabaseAdmin
        .from("referrers")
        .update({
          auth_user_id: userId,
          full_name,
          phone: phone ?? undefined,
          attribution_only: false,
          active: false,
        })
        .eq("id", existing.id);
      if (updateError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return json({ error: updateError.message }, 400);
      }
    } else {
      const { error: insertError } = await supabaseAdmin.from("referrers").insert({
        auth_user_id: userId,
        full_name,
        email,
        phone,
        notes,
        active: false,
        attribution_only: false,
        commission_rate: DEFAULT_COMMISSION_RATE,
        monthly_cap_per_merchant: DEFAULT_MONTHLY_CAP,
        clawback_window_days: DEFAULT_CLAWBACK_DAYS,
      });
      if (insertError) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return json({ error: insertError.message }, 400);
      }
    }

    return json({
      message: "Application received. An administrator will approve your account shortly.",
      status: "pending_approval",
    });
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
