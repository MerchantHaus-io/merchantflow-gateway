import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { requireRole } from "../_shared/require-auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const typeLabels: Record<string, { label: string; color: string; bg: string }> = {
  feature: { label: "New", color: "#16a34a", bg: "#dcfce7" },
  fix: { label: "Fix", color: "#dc2626", bg: "#fee2e2" },
  improvement: { label: "Improved", color: "#2563eb", bg: "#dbeafe" },
  security: { label: "Security", color: "#d97706", bg: "#fef3c7" },
};

interface Update {
  id: string;
  title: string;
  description: string;
  type: string;
  icon_name: string;
  published_date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function buildEmailHtml(updates: Update[], dateLabel: string): string {
  const rows = updates
    .map((u) => {
      const t = typeLabels[u.type] || typeLabels.feature;
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:${t.bg};color:${t.color};margin-bottom:4px;">${t.label}</span>
            <div style="font-weight:600;font-size:14px;color:#111827;margin:4px 0 2px;">${u.title}</div>
            <div style="font-size:13px;color:#6b7280;line-height:1.5;">${u.description}</div>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#111827 0%,#1f2937 100%);color:white;padding:24px 28px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">🚀 Terminal Updates</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.8;">${dateLabel}</p>
    </div>
    <div style="background:white;border-radius:0 0 12px 12px;overflow:hidden;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${rows}
      </table>
      <div style="padding:16px 20px;text-align:center;">
        <a href="https://ops-terminal.lovable.app/tools/terminal-updates" style="display:inline-block;padding:10px 24px;background:#111827;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">View All Updates</a>
      </div>
    </div>
    <div style="text-align:center;padding:16px;font-size:11px;color:#9ca3af;">
      Merchant Haus &bull; <a href="https://merchanthaus.io" style="color:#9ca3af;text-decoration:none;">merchanthaus.io</a>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authorization: this function was world-callable with no check.
  const denied = await requireRole(req, corsHeaders, ["staff", "admin"]);
  if (denied) return denied;

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Accept optional date param, default to today
    let targetDate: string | undefined;
    try {
      const body = await req.json();
      targetDate = body?.date;
    } catch {
      // no body is fine
    }

    // Fetch updates for the target date (or today)
    let query = supabase
      .from("terminal_updates")
      .select("*")
      .order("created_at", { ascending: false });

    if (targetDate) {
      query = query.eq("published_date", targetDate);
    } else {
      // today
      const today = new Date().toISOString().split("T")[0];
      query = query.eq("published_date", today);
    }

    const { data: updates, error: updatesErr } = await query;
    if (updatesErr) throw updatesErr;

    if (!updates || updates.length === 0) {
      return new Response(JSON.stringify({ message: "No updates for today" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all user emails from profiles
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("email, full_name")
      .not("email", "is", null);
    if (profilesErr) throw profilesErr;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No users to notify" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateLabel = formatDate(updates[0].published_date);
    const html = buildEmailHtml(updates as Update[], dateLabel);
    const subject = `Terminal Updates — ${dateLabel}`;

    const recipientEmails = profiles.map((p: { email: string }) => p.email);

    // Send via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ops Terminal IT <onboarding@merchanthaus.io>",
        to: recipientEmails,
        subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend error:", emailData);
      return new Response(JSON.stringify({ error: emailData.message || "Failed to send" }), {
        status: emailResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Terminal update email sent to ${recipientEmails.length} users:`, emailData);

    return new Response(JSON.stringify({ success: true, recipients: recipientEmails.length, emailData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
