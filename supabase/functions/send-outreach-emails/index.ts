import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { campaign_id } = await req.json();
    if (!campaign_id) throw new Error("campaign_id required");

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("outreach_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campErr || !campaign) throw new Error("Campaign not found");

    // Get pending contacts
    const { data: contacts, error: contErr } = await supabase
      .from("outreach_contacts")
      .select("*")
      .eq("campaign_id", campaign_id)
      .eq("status", "pending");

    if (contErr) throw contErr;
    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ message: "No pending contacts" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update campaign status to sending
    await supabase
      .from("outreach_campaigns")
      .update({ status: "sending" })
      .eq("id", campaign_id);

    let sentCount = 0;
    let bouncedCount = 0;

    for (const contact of contacts) {
      // Replace merge tags
      let html = campaign.body_html;
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
            subject: campaign.subject,
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
      } catch (emailErr: any) {
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

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    // Update campaign counts
    const { data: allContacts } = await supabase
      .from("outreach_contacts")
      .select("status")
      .eq("campaign_id", campaign_id);

    if (allContacts) {
      await supabase.from("outreach_campaigns").update({
        status: "sent",
        sent_count: allContacts.filter((c: any) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length,
        bounced_count: allContacts.filter((c: any) => c.status === "bounced").length,
        replied_count: allContacts.filter((c: any) => ["replied", "converted"].includes(c.status)).length,
        converted_count: allContacts.filter((c: any) => c.status === "converted").length,
        total_contacts: allContacts.length,
      }).eq("id", campaign_id);
    }

    return new Response(
      JSON.stringify({ sent: sentCount, bounced: bouncedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-outreach-emails error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
