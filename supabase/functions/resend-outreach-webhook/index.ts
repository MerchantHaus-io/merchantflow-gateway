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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    console.log("Resend webhook received:", JSON.stringify(payload));

    const eventType = payload.type;
    const eventData = payload.data;

    if (!eventType || !eventData) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailId = eventData.email_id;
    if (!emailId) {
      console.log("No email_id in webhook payload, skipping");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the outreach contact by resend_message_id
    const { data: contact, error: findErr } = await supabase
      .from("outreach_contacts")
      .select("id, campaign_id, status")
      .eq("resend_message_id", emailId)
      .single();

    if (findErr || !contact) {
      console.log("No matching outreach contact for email_id:", emailId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process based on event type
    if (eventType === "email.bounced" && contact.status !== "bounced") {
      await supabase
        .from("outreach_contacts")
        .update({
          status: "bounced",
          bounced_at: new Date().toISOString(),
          bounce_reason: eventData.bounce?.message || "Email bounced",
        })
        .eq("id", contact.id);

    } else if (eventType === "email.complained" && contact.status !== "bounced") {
      await supabase
        .from("outreach_contacts")
        .update({
          status: "bounced",
          bounced_at: new Date().toISOString(),
          bounce_reason: "Spam complaint",
        })
        .eq("id", contact.id);

    } else if (eventType === "email.delivery_delayed") {
      console.log("Delivery delayed for:", emailId);
    }

    // Recalculate campaign counts
    const { data: allContacts } = await supabase
      .from("outreach_contacts")
      .select("status")
      .eq("campaign_id", contact.campaign_id);

    if (allContacts) {
      await supabase.from("outreach_campaigns").update({
        sent_count: allContacts.filter((c: any) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length,
        bounced_count: allContacts.filter((c: any) => c.status === "bounced").length,
        replied_count: allContacts.filter((c: any) => ["replied", "converted"].includes(c.status)).length,
        converted_count: allContacts.filter((c: any) => c.status === "converted").length,
      }).eq("id", contact.campaign_id);
    }

    return new Response(JSON.stringify({ ok: true, processed: eventType }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("resend-outreach-webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
