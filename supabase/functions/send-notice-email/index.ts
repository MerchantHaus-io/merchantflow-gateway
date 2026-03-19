import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NoticeEmailRequest {
  title: string;
  postedBy: string;
  taggedUsers: string[]; // emails
  attachmentName?: string | null;
}

function buildHtml(title: string, postedBy: string, attachmentName?: string | null): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);color:white;padding:24px 28px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">📌 Notice Board Update</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.8;">You've been tagged in a new notice</p>
    </div>
    <div style="background:white;border-radius:0 0 12px 12px;padding:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Hi there,</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#111827;white-space:pre-wrap;">${title}</p>
        <p style="margin:0;font-size:12px;color:#6b7280;">Posted by <strong>${postedBy}</strong></p>
        ${attachmentName ? `<p style="margin:8px 0 0;font-size:12px;color:#6b7280;">📎 Attachment: ${attachmentName}</p>` : ""}
      </div>
      <a href="https://ops-terminal.lovable.app" style="display:inline-block;padding:10px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open Ops Terminal</a>
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
        Ops Terminal — MerchantHaus Tasks
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

    const { title, postedBy, taggedUsers, attachmentName }: NoticeEmailRequest = await req.json();

    if (!taggedUsers || taggedUsers.length === 0) {
      return new Response(JSON.stringify({ message: "No tagged users to notify" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = buildHtml(title, postedBy, attachmentName);
    const subject = `📌 Notice Board: ${title.replace(/[\r\n]+/g, ' ').trim().slice(0, 80)}`;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ops Terminal Tasks <tasks@merchanthaus.io>",
        to: taggedUsers,
        subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend error:", emailData);
      return new Response(JSON.stringify({ error: emailData.message || "Failed to send" }), {
        status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Notice board email sent to ${taggedUsers.length} users:`, emailData);

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
