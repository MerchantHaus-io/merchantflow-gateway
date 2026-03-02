import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const now = new Date().toISOString();

    // Find campaigns that are due to send
    const { data: dueCampaigns, error } = await supabase
      .from("outreach_campaigns")
      .select("id")
      .eq("status", "draft")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", now);

    if (error) throw error;

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return new Response(JSON.stringify({ message: "No campaigns due", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing ${dueCampaigns.length} scheduled campaigns`);

    // Also check cadence steps that are due
    const { data: dueSteps } = await supabase
      .from("cadence_steps")
      .select("campaign_id, step_number, delay_days");

    // Trigger send for each due campaign (step 1)
    for (const campaign of dueCampaigns) {
      try {
        await supabase.functions.invoke("send-outreach-emails", {
          body: { campaign_id: campaign.id, step_number: 1, scheduled_trigger: true },
        });
      } catch (err) {
        console.error(`Failed to trigger campaign ${campaign.id}:`, err);
      }
    }

    // Auto-send cadence follow-ups for "sent" campaigns
    if (dueSteps && dueSteps.length > 0) {
      // Group by campaign
      const stepsByCampaign: Record<string, typeof dueSteps> = {};
      for (const step of dueSteps) {
        if (!stepsByCampaign[step.campaign_id]) stepsByCampaign[step.campaign_id] = [];
        stepsByCampaign[step.campaign_id].push(step);
      }

      for (const [campaignId, steps] of Object.entries(stepsByCampaign)) {
        for (const step of steps) {
          // Find contacts eligible for this step (sent previous step, delay_days elapsed)
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - step.delay_days);

          const { data: eligible } = await supabase
            .from("outreach_contacts")
            .select("id")
            .eq("campaign_id", campaignId)
            .eq("current_step", step.step_number - 1)
            .eq("status", "sent")
            .lte("last_step_sent_at", cutoff.toISOString())
            .limit(1);

          if (eligible && eligible.length > 0) {
            try {
              await supabase.functions.invoke("send-outreach-emails", {
                body: { campaign_id: campaignId, step_number: step.step_number, scheduled_trigger: true },
              });
              console.log(`Triggered step ${step.step_number} for campaign ${campaignId}`);
            } catch (err) {
              console.error(`Failed step ${step.step_number} for ${campaignId}:`, err);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: dueCampaigns.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("process-scheduled-campaigns error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
