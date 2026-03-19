import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NoticeEmailRequest {
  title: string;
  postedBy: string;
  postedByEmail?: string;
  taggedUsers: string[];
  attachmentName?: string | null;
}

function deriveSubjectTitle(raw: string): string {
  // Take first line, strip markdown formatting, truncate
  const firstLine = raw.split(/[\r\n]+/).find(l => l.trim()) || raw;
  const clean = firstLine.replace(/[*_~`#>•\-\d.]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.slice(0, 80) || "New Notice";
}

function buildHtml(title: string, postedBy: string, attachmentName?: string | null): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:white;padding:24px 28px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">📌 Notice Board</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.8;">You've been tagged in a new notice by ${postedBy}</p>
    </div>
    <div style="background:white;border-radius:0 0 12px 12px;padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hi there,</p>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;"><strong>${postedBy}</strong> posted a notice and tagged you:</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0;font-size:15px;color:#111827;white-space:pre-wrap;line-height:1.6;">${title}</p>
        ${attachmentName ? `<p style="margin:12px 0 0;font-size:12px;color:#6b7280;">📎 Attachment: ${attachmentName}</p>` : ""}
      </div>
      <a href="https://ops-terminal.lovable.app" style="display:inline-block;padding:10px 24px;background:#c9a227;color:#1a1a2e;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open Ops Terminal</a>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
        Ops Terminal — MerchantHaus
      </div>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, postedBy, postedByEmail, taggedUsers, attachmentName }: NoticeEmailRequest = await req.json();

    if (!taggedUsers || taggedUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No tagged users to notify" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = buildHtml(title, postedBy, attachmentName);
    const subjectTitle = deriveSubjectTitle(title);
    const subject = `NOTICE BOARD: ${subjectTitle}`;

    // Send from the creator's name via the tasks domain
    const fromName = postedBy || "Ops Terminal";
    const fromAddress = `${fromName} <tasks@merchanthaus.io>`;

    // Reply-to the actual creator so replies go to them
    const replyTo = postedByEmail || undefined;

    const emailPayload: Record<string, unknown> = {
      from: fromAddress,
      to: taggedUsers,
      subject,
      html,
    };
    if (replyTo) {
      emailPayload.reply_to = replyTo;
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend error:", emailData);
      return new Response(JSON.stringify({ error: emailData.message || "Failed to send" }), {
        status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Notice board email sent to ${taggedUsers.length} users from ${fromAddress}:`, emailData);

    return new Response(JSON.stringify({ success: true, recipients: taggedUsers.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
