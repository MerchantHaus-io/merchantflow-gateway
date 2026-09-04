import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // All authenticated CRM users (team are equal partners) may impersonate.
    // Restrict to verified team domain to prevent edge cases.
    if (!(user.email || "").toLowerCase().endsWith("@merchanthaus.io")) {
      return json({ error: "Team access required" }, 403);
    }

    const { referrer_id } = await req.json();
    if (!referrer_id) return json({ error: "referrer_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: ref, error: refErr } = await admin
      .from("referrers")
      .select("id, email, full_name, active")
      .eq("id", referrer_id)
      .maybeSingle();

    if (refErr || !ref) return json({ error: "Referrer not found" }, 404);
    if (!ref.active) return json({ error: "Referrer account is inactive" }, 400);

    const origin = req.headers.get("origin") || req.headers.get("referer") || "";
    const redirectTo = origin ? `${origin.replace(/\/$/, "")}/affiliate` : undefined;

    const refEmail = ref.email as string;
    async function makeLink() {
      return await admin.auth.admin.generateLink({
        type: "magiclink",
        email: refEmail,
        options: redirectTo ? { redirectTo } : undefined,
      });
    }

    // eslint-disable-next-line prefer-const
    let { data: linkData, error: linkErr } = await makeLink();

    if (linkErr || !linkData) {
      console.error("Magic link error", linkErr);
      return json({ error: linkErr?.message || "Failed to generate magic link" }, 500);
    }

    // An active affiliate whose auth login is still suspended (e.g. created while
    // pending approval) cannot exchange the magic link — lift the ban first, then
    // mint a fresh link.
    const linkUser = (linkData as unknown as { user?: { id?: string; banned_until?: string | null } })?.user;
    const bannedUntil = linkUser?.banned_until;
    if (linkUser?.id && bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
      const { error: unbanErr } = await admin.auth.admin.updateUserById(linkUser.id, {
        ban_duration: "none",
      });
      if (unbanErr) {
        console.error("Unban failed", unbanErr);
        return json({ error: `Partner login is suspended: ${unbanErr.message}` }, 400);
      }
      const retry = await makeLink();
      if (retry.error || !retry.data) {
        console.error("Magic link retry error", retry.error);
        return json({ error: retry.error?.message || "Failed to generate magic link" }, 500);
      }
      linkData = retry.data;
    }

    // Exchange the magic-link OTP for a real session pair so the admin can hand
    // tokens to an isolated tab via setSession() — no browser navigation needed.
    const tokenHash = (linkData as unknown as { properties?: { hashed_token?: string } })?.properties
      ?.hashed_token;
    let access_token: string | null = null;
    let refresh_token: string | null = null;
    let otpFailure: string | null = null;
    if (tokenHash) {
      const otpClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data: otpData, error: otpErr } = await otpClient.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (otpErr) {
        console.error("verifyOtp error", otpErr);
        otpFailure =
          otpErr.message === "User is banned"
            ? "This partner's login is suspended — reactivate it and try again."
            : otpErr.message;
      } else {
        access_token = otpData.session?.access_token ?? null;
        refresh_token = otpData.session?.refresh_token ?? null;
      }
    }

    if (!access_token || !refresh_token) {
      return json({ error: otpFailure || "Could not start a partner session" }, 400);
    }


    // Backfill referrers.auth_user_id so RLS policies that key off auth_user_id work
    // for impersonated sessions. generateLink upserts the auth user, so it now exists.
    try {
      const userId = (linkData as unknown as { user?: { id?: string } })?.user?.id;
      if (userId) {
        await admin
          .from("referrers")
          .update({ auth_user_id: userId })
          .eq("id", ref.id)
          .is("auth_user_id", null);
      }
    } catch (_) { /* non-fatal */ }

    // Audit log
    await admin.from("referrer_impersonation_logs").insert({
      referrer_id: ref.id,
      referrer_email: ref.email,
      admin_user_id: user.id,
      admin_email: user.email,
    });

    console.log(`Impersonation link generated by ${user.email} for ${ref.email}`);

    return json({
      ok: true,
      access_url: linkData.properties?.action_link,
      referrer_email: ref.email,
      referrer_name: ref.full_name,
      access_token,
      refresh_token,
    });
  } catch (err) {
    console.error("impersonate-referrer error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
