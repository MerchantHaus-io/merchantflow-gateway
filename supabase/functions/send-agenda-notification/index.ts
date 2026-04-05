import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, description, category, submittedByEmail } = await req.json();

    if (!title || !submittedByEmail) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryLabel: Record<string, string> = {
      agenda: "Meeting Agenda Item",
      business_improvement: "Business Improvement",
      crm_enhancement: "CRM Enhancement",
      website_update: "Website Update",
      general_ideation: "General Ideation",
    };

    const subject = `Agenda Submission: ${title}`.replace(/[\r\n]/g, "");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">New Agenda Submission</h1>
          <p style="color: #a1a1aa; margin: 8px 0 0 0; font-size: 13px;">MerchantHaus Operations</p>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #18181b; font-size: 15px; margin: 0 0 16px 0;">Hi Jamie,</p>
          <p style="color: #3f3f46; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
            A new ${categoryLabel[category] || "agenda item"} has been submitted for the next meeting.
          </p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
            <p style="color: #18181b; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">${title}</p>
            ${description ? `<p style="color: #52525b; font-size: 13px; line-height: 1.5; margin: 0 0 12px 0;">${description}</p>` : ""}
            <p style="color: #71717a; font-size: 12px; margin: 0;">
              <strong>Category:</strong> ${categoryLabel[category] || category}<br/>
              <strong>Submitted by:</strong> ${submittedByEmail}
            </p>
          </div>
          <p style="color: #71717a; font-size: 12px; margin: 20px 0 0 0;">
            View and manage this item in the Administration panel.
          </p>
        </div>
      </div>
    `;

    if (RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "it@merchanthaus.io",
          to: ["admin@merchanthaus.io"],
          subject,
          html,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
