// Sends a gentle "we haven't seen you" email to ops-terminal users who
// haven't logged in for more than 2 business days. Designed to be invoked
// daily by pg_cron (idempotent — dedupes via email_send_log if present).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGIN_URL = "https://ops-terminal.lovable.app/auth";
const FROM = "Merchant Haus Ops <ops@merchanthaus.io>";

// Subtract N business days from a date (skips Sat/Sun)
function subtractBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

// Count business days between two dates (inclusive of start, exclusive of end)
function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur < end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function buildHtml(name: string, days: number) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;padding:28px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:20px;letter-spacing:-0.01em">We haven't seen you on the Ops Terminal</h1>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e4e4e7;border-top:0">
      <p style="margin:0 0 12px">Hi ${name},</p>
      <p style="margin:0 0 12px">You haven't been logged onto the Ops Terminal in <strong>${days} business day${days === 1 ? "" : "s"}</strong>. Do you need assistance gaining access?</p>
      <p style="margin:0 0 20px">There may be tasks and activities waiting for your attention.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${LOGIN_URL}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600">Log in to Ops Terminal</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#71717a">If you're having trouble signing in, reply to this email and we'll help you get back in.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#a1a1aa;margin-top:16px">Merchant Haus · Ops Terminal</p>
  </div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const cutoff = subtractBusinessDays(now, 2); // last_sign_in must be older than this

  // List all auth users (paginated)
  const recipients: { email: string; name: string; days: number }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error("listUsers error", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    for (const u of data.users) {
      const email = (u.email || "").toLowerCase();
      if (!email.endsWith("@merchanthaus.io")) continue;
      if (u.banned_until && new Date(u.banned_until) > now) continue;
      const last = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      if (!last) continue; // skip never-signed-in invites
      if (last >= cutoff) continue; // logged in recently
      const days = businessDaysBetween(last, now);
      const name =
        (u.user_metadata?.full_name as string) ||
        (u.user_metadata?.name as string) ||
        email.split("@")[0].replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      recipients.push({ email, name, days });
    }
    if (data.users.length < 200) break;
    page++;
  }

  // De-dupe: don't email same user more than once per 3 days
  const sinceIso = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await supabase
    .from("notifications")
    .select("user_email, created_at")
    .eq("type", "inactivity_reminder")
    .gte("created_at", sinceIso);
  const recentlyEmailed = new Set((recentLogs || []).map((r: any) => (r.user_email || "").toLowerCase()));

  const results: { email: string; status: string; error?: string }[] = [];
  for (const r of recipients) {
    if (recentlyEmailed.has(r.email)) {
      results.push({ email: r.email, status: "skipped_recent" });
      continue;
    }
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: FROM,
          to: [r.email],
          subject: `We haven't seen you on the Ops Terminal in ${r.days} business day${r.days === 1 ? "" : "s"}`,
          html: buildHtml(r.name, r.days),
        }),
      });
      const ok = resp.ok;
      const body = await resp.text();
      if (!ok) {
        results.push({ email: r.email, status: "failed", error: body });
        continue;
      }
      // Log so we don't re-email tomorrow
      const { data: prof } = await supabase.from("profiles").select("id").eq("email", r.email).maybeSingle();
      if (prof?.id) {
        await supabase.from("notifications").insert({
          user_id: prof.id,
          user_email: r.email,
          title: "Inactivity reminder sent",
          message: `Reminder email sent — ${r.days} business days since last sign-in.`,
          type: "inactivity_reminder",
          link: "/auth",
        });
      }
      results.push({ email: r.email, status: "sent" });
    } catch (e: any) {
      results.push({ email: r.email, status: "failed", error: String(e?.message || e) });
    }
  }

  return new Response(
    JSON.stringify({ checked: recipients.length, sent: results.filter((r) => r.status === "sent").length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
