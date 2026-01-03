import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotificationEmailRequest {
  type: "stage_change" | "task_assignment" | "opportunity_assignment";
  recipientEmail: string;
  recipientName?: string;
  data: Record<string, unknown>;
}

const getEmailSubject = (type: string, data: Record<string, unknown>): string => {
  switch (type) {
    case "stage_change":
      return `Stage Update: ${data.accountName || "Opportunity"} moved to ${data.newStage}`;
    case "task_assignment":
      return `New Task Assigned: ${data.taskTitle}`;
    case "opportunity_assignment":
      return `Opportunity Assigned: ${data.accountName}`;
    default:
      return "Notification from Ops Terminal";
  }
};

const getEmailHtml = (type: string, recipientName: string, data: Record<string, unknown>): string => {
  const greeting = `<p>Hi ${recipientName || "there"},</p>`;
  
  switch (type) {
    case "stage_change":
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 14px; font-weight: 500; }
            .badge-old { background: #fee2e2; color: #dc2626; }
            .badge-new { background: #dcfce7; color: #16a34a; }
            .arrow { margin: 0 8px; color: #6b7280; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 20px;">📊 Stage Update</h1>
            </div>
            <div class="content">
              ${greeting}
              <p>An opportunity has moved to a new stage:</p>
              <p><strong>${data.accountName || "Unknown Account"}</strong></p>
              <p>
                <span class="badge badge-old">${data.oldStage || "N/A"}</span>
                <span class="arrow">→</span>
                <span class="badge badge-new">${data.newStage}</span>
              </p>
              ${data.changedBy ? `<p style="font-size: 14px; color: #6b7280;">Changed by: ${data.changedBy}</p>` : ""}
              <div class="footer">
                <p>This is an automated notification from Ops Terminal.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
    case "task_assignment":
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .task-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .priority { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
            .priority-high { background: #fee2e2; color: #dc2626; }
            .priority-medium { background: #fef3c7; color: #d97706; }
            .priority-low { background: #dbeafe; color: #2563eb; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 20px;">📋 New Task Assigned</h1>
            </div>
            <div class="content">
              ${greeting}
              <p>You have been assigned a new task:</p>
              <div class="task-card">
                <h3 style="margin: 0 0 8px 0;">${data.taskTitle}</h3>
                ${data.description ? `<p style="margin: 0 0 8px 0; color: #6b7280;">${data.description}</p>` : ""}
                ${data.priority ? `<span class="priority priority-${data.priority}">${String(data.priority).charAt(0).toUpperCase() + String(data.priority).slice(1)} Priority</span>` : ""}
                ${data.dueDate ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #6b7280;">Due: ${data.dueDate}</p>` : ""}
              </div>
              ${data.assignedBy ? `<p style="font-size: 14px; color: #6b7280;">Assigned by: ${data.assignedBy}</p>` : ""}
              <div class="footer">
                <p>This is an automated notification from Ops Terminal.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
    case "opportunity_assignment":
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .opp-card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; }
            .stage { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; background: #dbeafe; color: #2563eb; }
            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 20px;">🎯 Opportunity Assigned</h1>
            </div>
            <div class="content">
              ${greeting}
              <p>You have been assigned to an opportunity:</p>
              <div class="opp-card">
                <h3 style="margin: 0 0 8px 0;">${data.accountName || "Unknown Account"}</h3>
                ${data.contactName ? `<p style="margin: 0 0 8px 0;">Contact: ${data.contactName}</p>` : ""}
                ${data.stage ? `<span class="stage">${data.stage}</span>` : ""}
              </div>
              <div class="footer">
                <p>This is an automated notification from Ops Terminal.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;
      
    default:
      return `
        <!DOCTYPE html>
        <html>
        <body>
          <p>${greeting}</p>
          <p>You have a new notification.</p>
        </body>
        </html>
      `;
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, recipientEmail, recipientName, data }: NotificationEmailRequest = await req.json();

    console.log(`Sending ${type} email notification to ${recipientEmail}`);
    console.log("Data:", JSON.stringify(data));

    if (!recipientEmail) {
      console.error("No recipient email provided");
      return new Response(
        JSON.stringify({ error: "Recipient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = getEmailSubject(type, data);
    const html = getEmailHtml(type, recipientName || "", data);

    // Send email using Resend API directly
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ops Terminal <onboarding@resend.dev>",
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailData);
      return new Response(
        JSON.stringify({ error: emailData.message || "Failed to send email" }),
        { status: emailResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully:", emailData);

    return new Response(JSON.stringify(emailData), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
