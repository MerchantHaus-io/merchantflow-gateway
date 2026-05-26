// Send a generated MerchantHaus quote PDF to a merchant client.
// Receives a base64-encoded PDF and sends via Resend with branded HTML body.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QuoteEmailRequest {
  to: string;
  ccSender?: boolean;
  clientName: string;
  businessName: string;
  tierName: string;
  monthlyTotal: string;
  quoteNumber: string;
  pdfBase64: string;
  pdfFilename: string;
  acceptUrl?: string;
  validThroughLabel?: string;
  sender: {
    name: string;
    title: string;
    email: string;
    phone: string;
  };
}

const sanitizeSubject = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const buildHtml = (req: QuoteEmailRequest) => `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#101216;margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#101216;color:#fff;padding:24px;border-radius:12px 12px 0 0;">
      <div style="font-size:11px;letter-spacing:1.6px;color:#c81030;font-weight:700;">MERCHANTHAUS · GATEWAY QUOTE</div>
      <h1 style="margin:8px 0 0;font-size:24px;letter-spacing:-0.3px;font-weight:700;">For ${req.businessName}</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.7;font-family:'SF Mono',ui-monospace,monospace;">${req.quoteNumber}</p>
    </div>
    <div style="background:#ffffff;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      <p style="margin:0 0 12px;">Hello ${req.clientName || "there"},</p>
      <p style="margin:0 0 16px;">
        Your tailored MerchantHaus Gateway quote is attached as a PDF. You can sign instantly using the secure link below, or print, sign, and return the PDF if you prefer.
      </p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;">Plan</td><td style="padding:12px 16px;text-align:right;font-weight:600;">${req.tierName}</td></tr>
        <tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;border-top:1px solid #e5e7eb;">Monthly Total</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${req.monthlyTotal}</td></tr>
        ${req.validThroughLabel ? `<tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;border-top:1px solid #e5e7eb;">Valid through</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e5e7eb;">${req.validThroughLabel}</td></tr>` : ""}
      </table>

      ${
        req.acceptUrl
          ? `<div style="margin:24px 0;">
              <a href="${req.acceptUrl}" style="display:inline-block;background:#101216;color:#ffffff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.2px;border-left:3px solid #c81030;">Accept &amp; Sign Online &rarr;</a>
              <p style="margin:10px 0 0;color:#6e747c;font-size:12px;">Or copy this link: <span style="font-family:'SF Mono',ui-monospace,monospace;color:#101216;">${req.acceptUrl}</span></p>
            </div>`
          : ""
      }

      <p style="margin:16px 0 8px;font-size:13px;color:#6e747c;">
        Acceptance constitutes the Merchant's agreement to the MerchantHaus Gateway Platform &amp; Services Agreement. The full Fee Schedule, billing cadence, dispute and termination terms, and PCI obligations are detailed inside the attached PDF.
      </p>
      <p style="margin:24px 0 4px;">Kind regards,</p>
      <p style="margin:0;font-weight:600;">${req.sender.name}</p>
      <p style="margin:0;color:#6e747c;font-size:13px;">${req.sender.title} &middot; MerchantHaus LLC</p>
      <p style="margin:0;color:#6e747c;font-size:13px;">${[req.sender.email, req.sender.phone].filter((s) => s && s.trim()).join(" &middot; ")}</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;letter-spacing:0.4px;">
      MERCHANTHAUS LLC &middot; 1209 MOUNTAIN ROAD PL NE STE N, ALBUQUERQUE, NM 87110
    </p>
  </div>
</body></html>`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const body = (await req.json()) as QuoteEmailRequest;
    if (!body.to || !body.pdfBase64) throw new Error("Missing required fields");

    const subject = sanitizeSubject(
      `Your MerchantHaus Gateway Quote — ${body.businessName} (${body.tierName})`,
    );

    const cc = body.ccSender && body.sender?.email ? [body.sender.email] : [];

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MerchantHaus <sales@merchanthaus.io>",
        to: [body.to],
        cc,
        reply_to: body.sender?.email || "sales@merchanthaus.io",
        subject,
        html: buildHtml(body),
        attachments: [
          {
            filename: body.pdfFilename || "quote.pdf",
            content: body.pdfBase64,
          },
        ],
      }),
    });

    const json = await resp.json();
    if (!resp.ok) {
      console.error("Resend error", json);
      return new Response(JSON.stringify({ error: json }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: json.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-quote-email error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
