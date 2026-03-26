import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // contains user_email
  const error = url.searchParams.get("error");

  const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://ops-terminal.lovable.app";

  if (error) {
    console.error("OAuth error:", error);
    return Response.redirect(`${frontendUrl}/calendar?gcal_error=${encodeURIComponent(error)}`, 302);
  }

  if (!code || !state) {
    return Response.redirect(`${frontendUrl}/calendar?gcal_error=missing_params`, 302);
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("OAuth credentials not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text();
      console.error("Token exchange failed:", errBody);
      return Response.redirect(`${frontendUrl}/calendar?gcal_error=token_exchange_failed`, 302);
    }

    const tokens = await tokenResp.json();

    if (!tokens.refresh_token) {
      console.warn("No refresh_token returned — user may have previously authorized. Token response:", JSON.stringify(tokens));
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    // Decode state to get user email and user_id
    let stateData: { email: string; user_id?: string };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      stateData = { email: state };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert token
    const upsertData: Record<string, unknown> = {
      user_email: stateData.email,
      access_token: tokens.access_token,
      expires_at: expiresAt,
      scopes: tokens.scope || "https://www.googleapis.com/auth/calendar.readonly",
      updated_at: new Date().toISOString(),
    };

    if (tokens.refresh_token) {
      upsertData.refresh_token = tokens.refresh_token;
    }

    if (stateData.user_id) {
      upsertData.user_id = stateData.user_id;
    }

    const { error: dbError } = await supabase
      .from("google_calendar_tokens")
      .upsert(upsertData, { onConflict: "user_email" });

    if (dbError) {
      console.error("DB upsert error:", dbError);
      return Response.redirect(`${frontendUrl}/calendar?gcal_error=db_error`, 302);
    }

    // Trigger an immediate sync
    try {
      await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ user_email: stateData.email }),
      });
    } catch (syncErr) {
      console.warn("Post-auth sync failed (non-critical):", syncErr);
    }

    return Response.redirect(`${frontendUrl}/calendar?gcal_connected=true`, 302);
  } catch (err) {
    console.error("Callback error:", err);
    const message = err instanceof Error ? err.message : "unknown";
    return Response.redirect(`${frontendUrl}/calendar?gcal_error=${encodeURIComponent(message)}`, 302);
  }
});
