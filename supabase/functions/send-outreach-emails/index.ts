import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { requireAuth } from "../_shared/require-auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const unauth = await requireAuth(req, corsHeaders);
  if (unauth) return unauth;

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { campaign_id, step_number = 1, scheduled_trigger = false } = body;
    if (!campaign_id) throw new Error("campaign_id required");

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("outreach_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) throw new Error("Campaign not found");

    // Determine subject and body
    let subject = campaign.subject;
    let bodyHtml = campaign.body_html;

    if (step_number > 1) {
      // Get cadence step
      const { data: step, error: stepErr } = await supabase
        .from("cadence_steps")
        .select("*")
        .eq("campaign_id", campaign_id)
        .eq("step_number", step_number)
        .single();

      if (stepErr || !step) throw new Error(`Cadence step ${step_number} not found`);
      subject = step.subject;
      bodyHtml = step.body_html;
    }

    // Get eligible contacts
    let contactQuery = supabase
      .from("outreach_contacts")
      .select("*")
      .eq("campaign_id", campaign_id);

    if (step_number === 1) {
      contactQuery = contactQuery.eq("status", "pending");
    } else {
      // For follow-up steps: contacts who were sent the previous step and haven't replied/bounced/converted
      contactQuery = contactQuery
        .eq("current_step", step_number - 1)
        .eq("status", "sent");
    }

    const { data: contacts, error: contErr } = await contactQuery;
    if (contErr) throw contErr;
    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ message: "No eligible contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update campaign status
    await supabase
      .from("outreach_campaigns")
      .update({ status: "sending" })
      .eq("id", campaign_id);

    let sentCount = 0;
    let bouncedCount = 0;

    for (const contact of contacts) {
      let html = bodyHtml;
      html = html.replace(/\{\{first_name\}\}/g, contact.first_name || "");
      html = html.replace(/\{\{last_name\}\}/g, contact.last_name || "");
      html = html.replace(/\{\{company\}\}/g, contact.company || "");
      html = html.replace(/\{\{email\}\}/g, contact.email || "");

      try {
        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: [contact.email],
            subject,
            html,
          }),
        });

        const resendData = await resendRes.json();

        if (resendRes.ok && resendData.id) {
          await supabase
            .from("outreach_contacts")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              resend_message_id: resendData.id,
              current_step: step_number,
              last_step_sent_at: new Date().toISOString(),
            })
            .eq("id", contact.id);
          sentCount++;
        } else {
          await supabase
            .from("outreach_contacts")
            .update({
              status: "bounced",
              bounced_at: new Date().toISOString(),
              bounce_reason: resendData?.message || "Send failed",
            })
            .eq("id", contact.id);
          bouncedCount++;
        }
      } catch (emailErr: unknown) {
        await supabase
          .from("outreach_contacts")
          .update({
            status: "bounced",
            bounced_at: new Date().toISOString(),
            bounce_reason: emailErr.message || "Network error",
          })
          .eq("id", contact.id);
        bouncedCount++;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    // Recalculate counts
    const { data: allContacts } = await supabase
      .from("outreach_contacts")
      .select("status")
      .eq("campaign_id", campaign_id);

    if (allContacts) {
      await supabase.from("outreach_campaigns").update({
        status: "sent",
        sent_count: allContacts.filter((c: unknown) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length,
        bounced_count: allContacts.filter((c: unknown) => c.status === "bounced").length,
        replied_count: allContacts.filter((c: unknown) => ["replied", "converted"].includes(c.status)).length,
        converted_count: allContacts.filter((c: unknown) => c.status === "converted").length,
        total_contacts: allContacts.length,
      }).eq("id", campaign_id);
    }

    return new Response(
      JSON.stringify({ sent: sentCount, bounced: bouncedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("send-outreach-emails error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
