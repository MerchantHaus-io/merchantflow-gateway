// Send a MerchantHaus invoice or receipt PDF to the merchant.
// Mirrors send-quote-email styling (dark gradient header, no emojis).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { requireRole } from "../_shared/require-auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BillingDocEmailRequest {
  to: string[];
  docType: "invoice" | "receipt";
  docNumber: string;
  merchantName: string;
  total: number;
  pdfBase64: string;
  pdfFilename: string;
  dueLabel?: string;
  sender: { name: string; email: string; title: string };
}

const sanitizeSubject = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const buildHtml = (req: BillingDocEmailRequest) => {
  const isInvoice = req.docType === "invoice";
  const eyebrow = isInvoice ? "MERCHANTHAUS · INVOICE" : "MERCHANTHAUS · RECEIPT";
  const headline = isInvoice ? `Invoice for ${req.merchantName}` : `Payment received — ${req.merchantName}`;
  const bodyCopy = isInvoice
    ? `Your MerchantHaus billing statement is attached as a PDF. Payment instructions and the full itemized fee schedule are included inside.`
    : `Thank you for your payment. Your receipt is attached for your records.`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#101216;margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#101216;color:#fff;padding:24px;border-radius:12px 12px 0 0;">
      <div style="font-size:11px;letter-spacing:1.6px;color:#c81030;font-weight:700;">${eyebrow}</div>
      <h1 style="margin:8px 0 0;font-size:24px;letter-spacing:-0.3px;font-weight:700;">${headline}</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:0.7;font-family:'SF Mono',ui-monospace,monospace;">${req.docNumber}</p>
    </div>
    <div style="background:#ffffff;padding:28px 24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      <p style="margin:0 0 12px;">Hello,</p>
      <p style="margin:0 0 16px;">${bodyCopy}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;margin:16px 0;">
        <tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;">Document</td><td style="padding:12px 16px;text-align:right;font-weight:600;">${req.docNumber}</td></tr>
        <tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;border-top:1px solid #e5e7eb;">${isInvoice ? "Amount due" : "Amount paid"}</td><td style="padding:12px 16px;text-align:right;font-weight:700;border-top:1px solid #e5e7eb;">${fmt(req.total)}</td></tr>
        ${isInvoice && req.dueLabel ? `<tr><td style="padding:12px 16px;color:#6e747c;font-size:13px;border-top:1px solid #e5e7eb;">Due</td><td style="padding:12px 16px;text-align:right;border-top:1px solid #e5e7eb;">${req.dueLabel}</td></tr>` : ""}
      </table>
      <p style="margin:24px 0 4px;">Kind regards,</p>
      <p style="margin:0;font-weight:600;">${req.sender.name}</p>
      <p style="margin:0;color:#6e747c;font-size:13px;">${req.sender.title} · MerchantHaus LLC</p>
      <p style="margin:0;color:#6e747c;font-size:13px;">${req.sender.email}</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;letter-spacing:0.4px;">
      MERCHANTHAUS LLC · 1209 MOUNTAIN ROAD PL NE STE N, ALBUQUERQUE, NM 87110
    </p>
  </div>
</body></html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Authorization: this function was world-callable with no check.
  const denied = await requireRole(req, corsHeaders, ["staff", "admin"]);
  if (denied) return denied;
  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
    const body = (await req.json()) as BillingDocEmailRequest;
    if (!body.to?.length || !body.pdfBase64) throw new Error("Missing required fields");

    const subject = sanitizeSubject(
      body.docType === "invoice"
        ? `MerchantHaus Invoice ${body.docNumber} — ${body.merchantName}`
        : `MerchantHaus Receipt ${body.docNumber} — ${body.merchantName}`,
    );

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MerchantHaus <billing@merchanthaus.io>",
        to: body.to,
        cc: body.sender?.email ? [body.sender.email] : [],
        reply_to: body.sender?.email || "billing@merchanthaus.io",
        subject,
        html: buildHtml(body),
        attachments: [
          { filename: body.pdfFilename || `${body.docNumber}.pdf`, content: body.pdfBase64 },
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
    console.error("send-billing-doc error", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
