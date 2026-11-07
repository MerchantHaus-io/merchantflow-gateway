// send-lead-outreach — send the rep-reviewed first outreach email to a new lead
// from sales@merchanthaus.io (replies come back to the sales inbox), and log it
// on the lead's opportunity as an email_sent / email_failed activity.
//
// The body arrives as the plain text the rep edited; it is escaped and turned
// into simple paragraphs here, so no rep- or AI-authored HTML is ever sent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireRole } from "../_shared/require-auth.ts";
import { escapeHtml } from "../_shared/email-layout.ts";
import { isBlockedRecipient } from "../_shared/blocked-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FROM = "Merchant Haus Sales <sales@merchanthaus.io>";
const REPLY_TO = "sales@merchanthaus.io";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#18181b;">${paragraphs}</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireRole(req, corsHeaders, ["staff", "admin"], { allowServiceRole: false });
  if (denied) return denied;

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // requireRole already verified the JWT; read the user again for the log row.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;

  try {
    const body = await req.json().catch(() => ({}));
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const subject = typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const opportunityId = typeof body.opportunity_id === "string" ? body.opportunity_id : "";

    if (!EMAIL_RE.test(to)) return json({ error: "That email address doesn't look right." }, 400);
    if (to.endsWith("@merchanthaus.io")) return json({ error: "That's an internal address." }, 400);
    if (isBlockedRecipient(to)) return json({ error: "That address is on the blocked list." }, 400);
    if (!subject || subject.length > 200) return json({ error: "Add a subject (under 200 characters)." }, 400);
    if (!text || text.length > 10_000) return json({ error: "Add an email body (under 10,000 characters)." }, 400);
    if (!UUID_RE.test(opportunityId)) return json({ error: "Save the lead before sending." }, 400);

    // The email must go to the opportunity's own contact: this function can't
    // be used to mail an arbitrary address from sales@.
    const { data: opp, error: oppErr } = await admin
      .from("opportunities")
      .select("id, tenant_id, contact:contacts(email)")
      .eq("id", opportunityId)
      .maybeSingle();
    if (oppErr || !opp) return json({ error: "Lead not found." }, 404);
    const contactEmail = String((opp as { contact?: { email?: string } }).contact?.email ?? "").trim().toLowerCase();
    if (contactEmail !== to) return json({ error: "The address doesn't match the lead's contact." }, 400);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html: textToHtml(text), text }),
    });
    const result = await resp.json().catch(() => ({}));

    await admin.from("activities").insert({
      opportunity_id: opportunityId,
      tenant_id: (opp as { tenant_id?: string }).tenant_id ?? null,
      type: resp.ok ? "email_sent" : "email_failed",
      description: resp.ok
        ? `Outreach email sent to ${to}: ${subject}`
        : `Outreach email to ${to} failed: ${String(result?.message ?? resp.status)}`,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });

    if (!resp.ok) {
      console.error("send-lead-outreach Resend error:", result);
      return json({ error: result?.message || "Failed to send" }, 502);
    }
    return json({ success: true, id: result?.id ?? null });
  } catch (e) {
    console.error("send-lead-outreach error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
