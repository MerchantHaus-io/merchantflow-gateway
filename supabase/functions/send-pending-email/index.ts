import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendPendingRequest {
  pending_email_id: string;
  /** Optional rep edits applied just before send. */
  custom_subject?: string;
  custom_html?: string;
  /** Email of the staff member who reviewed/approved. */
  reviewed_by?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pending_email_id, custom_subject, custom_html, reviewed_by }: SendPendingRequest = await req.json();
    if (!pending_email_id) {
      return new Response(JSON.stringify({ error: "pending_email_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the queue row
    const { data: pending, error: fetchErr } = await supabase
      .from("pending_emails")
      .select("*")
      .eq("id", pending_email_id)
      .single();

    if (fetchErr || !pending) {
      return new Response(JSON.stringify({ error: "pending_email_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pending.status !== "pending") {
      return new Response(JSON.stringify({ error: "already_processed", status: pending.status }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "resend_not_configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = (typeof custom_subject === "string" && custom_subject.trim()) ? custom_subject : pending.subject;
    const html = (typeof custom_html === "string" && custom_html.trim()) ? custom_html : pending.body_html;

    // Send via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <onboarding@merchanthaus.io>",
        to: [pending.recipient_email],
        subject,
        html,
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      await supabase
        .from("pending_emails")
        .update({
          send_error: typeof result === "object" ? JSON.stringify(result).slice(0, 500) : String(result).slice(0, 500),
        })
        .eq("id", pending_email_id);

      return new Response(JSON.stringify({ error: "resend_failed", detail: result }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark sent — persist any edits the staff made
    await supabase
      .from("pending_emails")
      .update({
        status: "sent",
        subject,
        body_html: html,
        sent_at: new Date().toISOString(),
        reviewed_by: reviewed_by || null,
        reviewed_at: new Date().toISOString(),
        send_error: null,
      })
      .eq("id", pending_email_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-pending-email error:", err);
    return new Response(JSON.stringify({ error: err.message || "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
