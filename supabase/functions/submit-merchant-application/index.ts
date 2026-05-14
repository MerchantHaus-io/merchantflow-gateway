import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// ─── Confirmation Email ───

const buildConfirmationEmailHtml = (firstName: string, serviceType: string, companyName?: string): string => {
  const serviceLabel = serviceType === "gateway_only"
    ? "Gateway"
    : serviceType === "document_submission"
    ? "Document Submission"
    : "Processing";

  const companyRef = companyName ? ` for <strong>${companyName}</strong>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 28px; text-align: center; }
    .header img { height: 32px; }
    .body { padding: 32px 28px; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #3f3f46; }
    .body p:last-child { margin-bottom: 0; }
    .body p strong { color: #18181b; }
    .highlight { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .highlight p { margin: 0; font-size: 14px; color: #166534; }
    .divider { height: 1px; background: #e4e4e7; margin: 24px 0; }
    .closing p { font-size: 15px; color: #3f3f46; margin: 0 0 4px; }
    .footer { text-align: center; padding: 20px 28px; border-top: 1px solid #f4f4f5; }
    .footer p { margin: 0; font-size: 12px; color: #a1a1aa; }
    .footer a { color: #71717a; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <img src="https://ops-terminal.lovable.app/images/merchanthaus-logo.png" alt="Merchant Haus" />
      </div>
      <div class="body">
        <p>Dear ${firstName},</p>
        <p>Thank you for submitting your <strong>${serviceLabel}</strong> application${companyRef} with Merchant Haus. We have successfully received your submission and all accompanying documentation.</p>

        <div class="highlight">
          <p>✅ Your application is now being reviewed by our team. You can expect to hear from us within <strong>1–2 business days</strong>.</p>
        </div>

        <p>During the review process, a member of our onboarding team may reach out if any additional information is needed. There is no action required from you at this time.</p>

        <div class="divider"></div>

        <p>If you have any questions in the meantime, please don't hesitate to contact us at <a href="mailto:onboarding@merchanthaus.io" style="color: #18181b; text-decoration: underline;">onboarding@merchanthaus.io</a>.</p>

        <div class="closing">
          <p>Kind regards,</p>
          <p><strong>The Merchant Haus Team</strong></p>
        </div>
      </div>
      <div class="footer">
        <p>Merchant Haus &bull; <a href="https://merchanthaus.io">merchanthaus.io</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

async function sendConfirmationEmail(
  firstName: string,
  email: string,
  serviceType: string,
  companyName?: string,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured — skipping confirmation email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <onboarding@merchanthaus.io>",
        to: [email],
        subject: `Application Received — ${companyName || "Your Submission"}`,
        html: buildConfirmationEmailHtml(firstName, serviceType, companyName),
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("Confirmation email error:", result);
    } else {
      console.log("Confirmation email sent to", email);
    }
  } catch (err) {
    console.error("Failed to send confirmation email:", err);
  }
}

// ─── Website Compliance Checklist Email ───

const buildComplianceChecklistEmailHtml = (firstName: string, businessName: string): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; background: #f4f4f5; }
    .wrapper { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 28px; text-align: center; }
    .header img { height: 32px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
    .body { padding: 32px 28px; }
    .body p { margin: 0 0 16px; font-size: 15px; color: #3f3f46; }
    .body p strong { color: #18181b; }
    .body h2 { font-size: 17px; color: #18181b; margin: 28px 0 12px; font-weight: 600; }
    .body h3 { font-size: 14px; color: #18181b; margin: 18px 0 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .body ul { margin: 0 0 16px; padding: 0; list-style: none; }
    .body ul li { position: relative; padding: 6px 0 6px 24px; font-size: 14.5px; color: #3f3f46; }
    .body ul li::before { content: ""; position: absolute; left: 0; top: 11px; width: 14px; height: 14px; border: 1.5px solid #a1a1aa; border-radius: 3px; background: #ffffff; }
    .body ul.plain li::before { display: none; }
    .body ul.plain li { padding-left: 16px; }
    .body ul.plain li::marker { content: "•"; }
    .callout { background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 14px 16px; margin: 20px 0; }
    .callout p { margin: 0; font-size: 14px; color: #78350f; }
    .highlight { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .highlight p { margin: 0; font-size: 14px; color: #166534; }
    .divider { height: 1px; background: #e4e4e7; margin: 24px 0; }
    .closing p { font-size: 15px; color: #3f3f46; margin: 0 0 4px; }
    .footer { text-align: center; padding: 20px 28px; border-top: 1px solid #f4f4f5; }
    .footer p { margin: 0; font-size: 12px; color: #a1a1aa; }
    .footer a { color: #71717a; text-decoration: none; }
    a.link { color: #18181b; text-decoration: underline; }
  </style>
</head>
<body>
  <span class="preheader">A short checklist to run through before our underwriting team reviews your website — most issues are easy fixes.</span>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <img src="https://ops-terminal.lovable.app/images/merchanthaus-logo.png" alt="Merchant Haus" />
      </div>
      <div class="body">
        <p>Hi ${firstName},</p>
        <p>Your application for <strong>${businessName}</strong> is in — thank you. Our underwriting team will begin their review shortly, and one of the things they'll look at is your website.</p>
        <p>Before they do, we want to give you a heads-up on what they check and where most merchants get tripped up. The card brands (Visa, Mastercard, Amex, Discover) require specific disclosures on every e-commerce site, and missing any of them is the single most common reason we come back asking for changes — which slows down your approval.</p>
        <p>Most of this is quick to fix. Run through the checklist below in the next day or two and your approval will move a lot faster.</p>

        <div class="divider"></div>

        <h2>The card brands require these on your website</h2>
        <p style="font-size: 14px; color: #52525b;">Every item below is a hard requirement from Visa / Mastercard / Amex / Discover for e-commerce merchants. Missing items will be flagged by underwriting.</p>

        <h3>Business identity</h3>
        <ul>
          <li>Your <strong>business name (DBA)</strong> displayed clearly, matching the name on your application</li>
          <li>Your <strong>physical business address</strong>, including country (P.O. boxes alone won't pass)</li>
          <li><strong>Customer service contact</strong> — a working email address <em>and</em> a working phone number</li>
          <li><strong>Card brand logos</strong> (Visa / Mastercard / Amex / Discover) shown at checkout in full color</li>
        </ul>

        <h3>Product &amp; transaction clarity</h3>
        <ul>
          <li>A <strong>clear description</strong> of what you're selling — product pages must describe the goods or services, not just a name and a price</li>
          <li><strong>Transaction currency</strong> stated explicitly (e.g. "Prices in USD")</li>
          <li><strong>Total cost shown before payment</strong> — subtotal, taxes, shipping, any fees. No surprise charges after the "Pay" button</li>
          <li><strong>Age-restriction gating</strong> if you sell anything age-restricted (alcohol, tobacco, supplements, financial services, etc.)</li>
        </ul>

        <h3>Policies — all must be live and linked from checkout</h3>
        <ul>
          <li><strong>Refund / Return policy</strong> — even if you don't offer refunds, you must say so explicitly. This is the #1 item underwriters flag.</li>
          <li><strong>Shipping / Delivery policy</strong> — timelines, carriers, what happens if delivery is delayed</li>
          <li><strong>Privacy policy</strong> — how you collect, use, store, and share customer data. CCPA-aligned if you have California customers.</li>
          <li><strong>Terms &amp; Conditions</strong> — the rules of engagement for buyers</li>
          <li><strong>Secure checkout statement</strong> — a short note on how you protect payment data</li>
        </ul>

        <h3>Security</h3>
        <ul>
          <li><strong>HTTPS on every page</strong> — not just checkout. The padlock icon must show throughout the site.</li>
          <li>No card data captured on pages that aren't on your payment processor's hosted form</li>
        </ul>

        <div class="divider"></div>

        <h2>Refund policy — get this one right</h2>
        <p>This is the item that causes the most delays, so it's worth its own section. Your refund policy needs to:</p>
        <ul class="plain" style="list-style: disc; padding-left: 20px;">
          <li>Be <strong>visible before checkout</strong> — a link in the footer alone is not enough. It should appear on your checkout page, near the "Pay" button, ideally with a checkbox or acknowledgment.</li>
          <li>State your <strong>timeframe</strong> — e.g. "refunds available within 30 days of purchase"</li>
          <li>State <strong>conditions</strong> — unused, original packaging, restocking fee, digital-goods exceptions</li>
          <li>State <strong>how refunds are issued</strong> — back to original payment method, store credit, etc.</li>
          <li>State <strong>how to request one</strong> — email, phone, portal, turnaround time</li>
        </ul>
        <div class="callout">
          <p>If your business genuinely does not offer refunds, that's allowed — but you must say so clearly and prominently. "All sales final" with no further context will not pass review.</p>
        </div>

        <div class="divider"></div>

        <h2>If you sell subscriptions, free trials, or anything recurring — read this carefully</h2>
        <p>Visa and Mastercard have strict rules here, and underwriting scrutiny is high. You must:</p>
        <ul>
          <li>Get <strong>express consent</strong> at enrollment — a pre-ticked box doesn't count</li>
          <li><strong>Immediately email</strong> the customer a confirmation showing the trial length, when billing starts, the amount, and the billing frequency</li>
          <li>Send a <strong>reminder at least 7 days before</strong> a free trial converts to paid, or before a price changes</li>
          <li>Provide a <strong>one-click online cancellation</strong> — regardless of how they signed up. A phone-only cancel path is not compliant.</li>
          <li>Use a <strong>descriptor like "TRIAL"</strong> on the first real charge after a free trial so it's recognizable on the cardholder's statement</li>
          <li>Display <strong>trial length, start date, recurring amount, and recurring date</strong> at the point of sale and on the receipt</li>
        </ul>
        <p style="font-size: 14px; color: #52525b;">If your model is subscription-heavy, underwriters will review your cancellation flow end-to-end. Make sure it works.</p>

        <div class="divider"></div>

        <h2>Things underwriters will flag — avoid these</h2>
        <ul class="plain" style="list-style: disc; padding-left: 20px;">
          <li><strong>Broken or empty pages.</strong> If a nav link goes to a 404 or a "Coming Soon" page, that's an automatic concern.</li>
          <li><strong>Mismatched names.</strong> If your website says "Acme Store" but your application says "Acme Holdings LLC," explain the relationship somewhere (About page, footer line).</li>
          <li><strong>Stock-photo-only product pages.</strong> Unique, accurate product imagery and descriptions look legitimate. Thin or generic pages don't.</li>
          <li><strong>Unrealistic claims.</strong> "Guaranteed results," "miracle," "cures," "get rich quick" — these raise fraud and chargeback risk flags.</li>
          <li><strong>No company information anywhere.</strong> No About page, no team, no address, no phone — underwriters treat this as a red flag.</li>
          <li><strong>Prices in multiple currencies without a clear primary.</strong> Pick one, state it clearly.</li>
          <li><strong>Checkout on a different domain</strong> from your main site without clear branding continuity.</li>
          <li><strong>Asking for more information than you need</strong> at checkout (ID scans, full SSN for non-credit purchases, etc.)</li>
        </ul>

        <div class="divider"></div>

        <h2>What happens next</h2>
        <p>Once our team begins their review, if they need any changes to your site, you'll receive a specific request through your portal — you'll see the request on your dashboard in real time and can update as you go.</p>
        <div class="highlight">
          <p>✅ Most merchants who work through this checklist in advance sail through review in <strong>3–5 business days</strong>.</p>
        </div>
        <p>If you have questions on any item, reply to this email and our onboarding team will walk you through it.</p>
        <p>Welcome to Merchant Haus.</p>

        <div class="closing" style="margin-top: 24px;">
          <p><strong>The Merchant Haus Team</strong></p>
          <p><a class="link" href="mailto:onboarding@merchanthaus.io">onboarding@merchanthaus.io</a></p>
        </div>
      </div>
      <div class="footer">
        <p>Merchant Haus &bull; <a href="https://merchanthaus.io">merchanthaus.io</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
};

async function sendComplianceChecklistEmail(
  firstName: string,
  email: string,
  businessName: string,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured — skipping compliance checklist email");
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Merchant Haus <onboarding@merchanthaus.io>",
        to: [email],
        subject: "Your application is in. Here's what underwriting will look at on your website.",
        html: buildComplianceChecklistEmailHtml(firstName, businessName),
        reply_to: "onboarding@merchanthaus.io",
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("Compliance checklist email error:", result);
    } else {
      console.log("Compliance checklist email sent to", email);
    }
  } catch (err) {
    console.error("Failed to send compliance checklist email:", err);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Validation Schemas ───

const text = (max: number) => z.string().trim().max(max);
const reqText = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const email = () => z.string().trim().email().max(255);
const phone = () =>
  z.string().trim().min(10, "Phone too short").max(20, "Phone too long");
const percent = () =>
  z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Invalid percentage").optional().or(z.literal(""));
const money = () =>
  z.string().trim().regex(/^[\d,]+(\.\d{1,2})?$/, "Invalid amount").optional().or(z.literal(""));

const PrincipalSchema = z.object({
  principal_first_name: reqText(100),
  principal_last_name: reqText(100),
  principal_title: reqText(100),
  ownership_percent: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/),
  principal_phone: optText(20),
  principal_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  principal_address_line1: optText(200),
  principal_address_line2: optText(200),
  principal_city: optText(100),
  principal_state: optText(50),
  principal_zip: optText(20),
  principal_country: optText(100),
  date_of_birth: reqText(20),
  ssn_full: z.string().trim().regex(/^\d{9}$/, "SSN must be exactly 9 digits"),
});

const FileSchema = z.object({
  name: z.string().min(1).max(500),
  size: z.number().max(10 * 1024 * 1024), // 10MB per file
  type: z.string().max(200).optional(),
  data: z.string(), // base64 encoded
  document_type: z.string().max(200),
});

const ProcessingSchema = z.object({
  service_type: z.literal("processing"),
  dba_name: reqText(200),
  product_description: reqText(2000),
  nature_of_business: reqText(500),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_phone: phone(),
  dba_contact_email: email(),
  dba_address_line1: reqText(200),
  dba_address_line2: optText(200),
  dba_city: reqText(100),
  dba_state: reqText(50),
  dba_zip: reqText(20),
  dba_country: optText(10),
  legal_entity_name: reqText(200),
  federal_tax_id: z.string().trim().min(1).max(20),
  ownership_type: reqText(100),
  business_formation_date: reqText(20),
  state_incorporated: reqText(50),
  tax_exempt: z.boolean().optional().default(false),
  legal_address_line1: reqText(200),
  legal_address_line2: optText(200),
  legal_city: reqText(100),
  legal_state: reqText(50),
  legal_zip: reqText(20),
  legal_country: optText(10),
  monthly_volume: reqText(50),
  average_transaction: reqText(50),
  high_ticket: reqText(50),
  percent_swiped: reqText(10),
  percent_keyed: reqText(10),
  percent_moto: reqText(10),
  percent_ecommerce: reqText(10),
  percent_b2b: optText(10),
  percent_b2c: optText(10),
  website_url: optText(500),
  sic_mcc_code: optText(20),
  principals: z.array(PrincipalSchema).min(1).max(5),
  bank_name: reqText(200),
  account_holder_name: reqText(200),
  routing_number: z.string().trim().regex(/^\d{9}$/, "Routing number must be 9 digits"),
  account_number: z.string().trim().regex(/^\d{4,17}$/, "Account number must be 4-17 digits"),
  merchant_agreement_accepted: z.literal(true, { errorMap: () => ({ message: "Agreement required" }) }),
  account_authorization_accepted: z.literal(true, { errorMap: () => ({ message: "Authorization required" }) }),
  beneficial_owner_certification: z.boolean(),
  additional_notes: optText(5000),
  pricing_plan: optText(50),
  files: z.array(FileSchema).max(20).optional(),
});

const GatewaySchema = z.object({
  service_type: z.literal("gateway_only"),
  dba_name: reqText(200),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_phone: phone(),
  dba_contact_email: email(),
  dba_address_line1: reqText(200),
  dba_address_line2: optText(200),
  dba_city: reqText(100),
  dba_state: reqText(50),
  dba_zip: reqText(20),
  dba_country: optText(10),
  username: reqText(100),
  current_processor: reqText(200),
  additional_notes: optText(5000),
  pricing_plan: optText(50),
  files: z.array(FileSchema).max(20).optional(),
});

const DocSubmissionSchema = z.object({
  service_type: z.literal("document_submission"),
  dba_contact_first_name: reqText(100),
  dba_contact_last_name: reqText(100),
  dba_contact_email: email(),
  additional_notes: optText(5000),
  files: z.array(FileSchema).max(20).optional(),
});

const InputSchema = z.discriminatedUnion("service_type", [
  ProcessingSchema,
  GatewaySchema,
  DocSubmissionSchema,
]);

// ─── File Upload Helper ───

async function uploadFiles(
  supabase: any,
  applicationId: string,
  files: z.infer<typeof FileSchema>[],
  clientIp: string,
  userAgent: string,
): Promise<{ uploaded: number; failed: number; errors: string[] }> {
  let uploaded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const file of files) {
    try {
      // Decode base64 to Uint8Array
      const binaryStr = atob(file.data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const filePath = `applications/${applicationId}/${Date.now()}_${file.name}`;
      const { error: storageError } = await supabase.storage
        .from("opportunity-documents")
        .upload(filePath, bytes, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (storageError) {
        console.error(`Storage upload failed for ${file.name}:`, storageError);
        errors.push(`${file.name}: ${storageError.message}`);
        failed++;
        continue;
      }

      const { error: dbError } = await supabase.from("application_documents").insert({
        application_id: applicationId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        content_type: file.type || null,
        document_type: file.document_type || "General Submission",
        ip_address: clientIp,
        user_agent: userAgent,
      });

      if (dbError) {
        console.error(`DB insert failed for ${file.name}:`, dbError);
        errors.push(`${file.name}: record failed`);
        failed++;
        continue;
      }

      uploaded++;
    } catch (e) {
      console.error(`File processing error for ${file.name}:`, e);
      errors.push(`${file.name}: processing failed`);
      failed++;
    }
  }

  return { uploaded, failed, errors };
}

// ─── Handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Strip any client-supplied client_ip — it is forgeable. Use trusted headers.
    const { client_ip: _ignoredIp, user_agent: bodyUserAgent, ...formData } = body;
    const parsed = InputSchema.parse(formData);
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || bodyUserAgent || "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const applicationId = crypto.randomUUID();
    const files = (parsed as any).files as z.infer<typeof FileSchema>[] | undefined;

    if (parsed.service_type === "document_submission") {
      const { error } = await supabase.from("applications").insert({
        id: applicationId,
        full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        email: parsed.dba_contact_email,
        service_type: "document_submission",
        status: "pending",
        notes: parsed.additional_notes || null,
      });
      if (error) throw error;

      // Upload files server-side
      let fileResult = { uploaded: 0, failed: 0, errors: [] as string[] };
      if (files && files.length > 0) {
        fileResult = await uploadFiles(supabase, applicationId, files, clientIp, userAgent);
      }

      // Send confirmation email (non-blocking)
      await sendConfirmationEmail(parsed.dba_contact_first_name, parsed.dba_contact_email, "document_submission");

      return new Response(
        JSON.stringify({ success: true, application_id: applicationId, files: fileResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (parsed.service_type === "gateway_only") {
      const { error } = await supabase.from("applications").insert({
        id: applicationId,
        full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        email: parsed.dba_contact_email,
        phone: parsed.dba_contact_phone,
        company_name: parsed.dba_name,
        service_type: "gateway_only",
        status: "pending",
        dba_name: parsed.dba_name,
        notes: `[Gateway Only] Processor: ${parsed.current_processor}. Username: ${parsed.username}. ${parsed.additional_notes || ""}`.trim(),
        address: parsed.dba_address_line1,
        address2: parsed.dba_address_line2 || null,
        city: parsed.dba_city,
        state: parsed.dba_state,
        zip: parsed.dba_zip,
        website: null,
      });
      if (error) throw error;

      // Record consent
      await supabase.from("merchant_consents").insert({
        application_id: applicationId,
        applicant_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
        applicant_email: parsed.dba_contact_email,
        consent_type: "merchant_agreement",
        ip_address: clientIp,
        user_agent: userAgent,
        terms_version: "1.0",
        beneficial_ownership_accepted: false,
        merchant_agreement_accepted: false,
        account_authorization_accepted: false,
      });

      // Upload files server-side
      let fileResult = { uploaded: 0, failed: 0, errors: [] as string[] };
      if (files && files.length > 0) {
        fileResult = await uploadFiles(supabase, applicationId, files, clientIp, userAgent);
      }

      // Send confirmation email (non-blocking)
      await sendConfirmationEmail(parsed.dba_contact_first_name, parsed.dba_contact_email, "gateway_only", parsed.dba_name);

      // Send website compliance checklist (M2 Wizard Submitted automation)
      await sendComplianceChecklistEmail(parsed.dba_contact_first_name, parsed.dba_contact_email, parsed.dba_name);

      return new Response(
        JSON.stringify({ success: true, application_id: applicationId, files: fileResult }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Processing flow ──

    // Validate tx mix = 100%
    const txMix = [parsed.percent_swiped, parsed.percent_keyed, parsed.percent_moto, parsed.percent_ecommerce]
      .map((v) => parseFloat(v) || 0)
      .reduce((a, b) => a + b, 0);
    if (Math.abs(txMix - 100) > 0.01) {
      return new Response(
        JSON.stringify({ error: `Transaction mix must equal 100% (currently ${txMix}%)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate b2b+b2c if both provided
    if (parsed.percent_b2b && parsed.percent_b2c) {
      const salesMix = (parseFloat(parsed.percent_b2b) || 0) + (parseFloat(parsed.percent_b2c) || 0);
      if (Math.abs(salesMix - 100) > 0.01) {
        return new Response(
          JSON.stringify({ error: `B2B + B2C must equal 100% (currently ${salesMix}%)` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate ownership = 100%
    const ownershipTotal = parsed.principals.reduce(
      (sum, p) => sum + (parseFloat(p.ownership_percent) || 0),
      0
    );
    if (Math.abs(ownershipTotal - 100) > 0.01) {
      return new Response(
        JSON.stringify({ error: `Ownership must total 100% (currently ${ownershipTotal}%)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Insert application
    const p0 = parsed.principals[0];
    const { error: appError } = await supabase.from("applications").insert({
      id: applicationId,
      full_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
      email: parsed.dba_contact_email,
      phone: parsed.dba_contact_phone,
      company_name: parsed.dba_name,
      service_type: "processing",
      status: "pending",
      dba_name: parsed.dba_name,
      nature_of_business: parsed.nature_of_business,
      monthly_volume: parsed.monthly_volume,
      notes: parsed.additional_notes || null,
      address: parsed.dba_address_line1,
      address2: parsed.dba_address_line2 || null,
      city: parsed.dba_city,
      state: parsed.dba_state,
      zip: parsed.dba_zip,
      website: parsed.website_url || null,
      legal_name: parsed.legal_entity_name,
      federal_tax_id: parsed.federal_tax_id,
      state_of_incorporation: parsed.state_incorporated,
      business_structure: parsed.ownership_type,
      date_established: parsed.business_formation_date,
      avg_ticket: parsed.average_transaction,
      high_ticket: parsed.high_ticket,
      products: parsed.product_description,
      in_person_percent: parsed.percent_swiped,
      keyed_percent: parsed.percent_keyed,
      ecommerce_percent: parsed.percent_ecommerce,
      owner_name: `${p0.principal_first_name} ${p0.principal_last_name}`.trim(),
      owner_title: p0.principal_title || null,
      owner_dob: p0.date_of_birth || null,
      owner_ssn_last4: p0.ssn_full ? p0.ssn_full.slice(-4) : null,
      owner_address: p0.principal_address_line1 || null,
      owner_city: p0.principal_city || null,
      owner_state: p0.principal_state || null,
      owner_zip: p0.principal_zip || null,
    });
    if (appError) throw appError;

    // 2. Insert merchant
    const { error: merchantError } = await supabase.from("merchants").insert({
      application_id: applicationId,
      dba_name: parsed.dba_name,
      product_description: parsed.product_description,
      nature_of_business: parsed.nature_of_business,
      dba_contact_first_name: parsed.dba_contact_first_name,
      dba_contact_last_name: parsed.dba_contact_last_name,
      dba_contact_phone: parsed.dba_contact_phone,
      dba_contact_email: parsed.dba_contact_email,
      dba_address_line1: parsed.dba_address_line1,
      dba_address_line2: parsed.dba_address_line2 || null,
      dba_city: parsed.dba_city,
      dba_state: parsed.dba_state,
      dba_zip: parsed.dba_zip,
      dba_country: parsed.dba_country || "US",
      legal_entity_name: parsed.legal_entity_name,
      federal_tax_id: parsed.federal_tax_id,
      ownership_type: parsed.ownership_type,
      business_formation_date: parsed.business_formation_date,
      state_incorporated: parsed.state_incorporated,
      tax_exempt: parsed.tax_exempt ?? false,
      legal_address_line1: parsed.legal_address_line1,
      legal_address_line2: parsed.legal_address_line2 || null,
      legal_city: parsed.legal_city,
      legal_state: parsed.legal_state,
      legal_zip: parsed.legal_zip,
      legal_country: parsed.legal_country || "US",
      monthly_volume: parsed.monthly_volume,
      average_transaction: parsed.average_transaction,
      high_ticket: parsed.high_ticket,
      percent_swiped: parsed.percent_swiped,
      percent_keyed: parsed.percent_keyed,
      percent_moto: parsed.percent_moto,
      percent_ecommerce: parsed.percent_ecommerce,
      percent_b2b: parsed.percent_b2b || null,
      percent_b2c: parsed.percent_b2c || null,
      website_url: parsed.website_url || null,
      sic_mcc_code: parsed.sic_mcc_code || null,
    });
    if (merchantError) console.error("Merchant insert error:", merchantError);

    // 3. Insert principals
    for (const principal of parsed.principals) {
      await supabase.from("principals").insert({
        application_id: applicationId,
        principal_first_name: principal.principal_first_name,
        principal_last_name: principal.principal_last_name,
        principal_title: principal.principal_title,
        ownership_percent: parseFloat(principal.ownership_percent) || 0,
        principal_phone: principal.principal_phone || null,
        principal_email: principal.principal_email || null,
        principal_address_line1: principal.principal_address_line1 || null,
        principal_address_line2: principal.principal_address_line2 || null,
        principal_city: principal.principal_city || null,
        principal_state: principal.principal_state || null,
        principal_zip: principal.principal_zip || null,
        principal_country: principal.principal_country || "US",
        date_of_birth: principal.date_of_birth,
        ssn_last4: principal.ssn_full ? principal.ssn_full.slice(-4) : null,
      });
    }

    // 4. Insert bank account
    await supabase.from("bank_accounts").insert({
      application_id: applicationId,
      bank_name: parsed.bank_name,
      account_holder_name: parsed.account_holder_name,
      account_last4: parsed.account_number ? parsed.account_number.slice(-4) : null,
    });

    // 5. Encrypt sensitive data
    const hasSensitive = parsed.principals.some((p) => p.ssn_full) || parsed.routing_number || parsed.account_number;
    if (hasSensitive) {
      const encryptPayload: Record<string, string> = { application_id: applicationId };
      if (parsed.principals[0]?.ssn_full) encryptPayload.ssn_full = parsed.principals[0].ssn_full;
      if (parsed.routing_number) encryptPayload.routing_number = parsed.routing_number;
      if (parsed.account_number) encryptPayload.account_number = parsed.account_number;

      try {
        await fetch(`${supabaseUrl}/functions/v1/encrypt-secrets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify(encryptPayload),
        });
      } catch (encErr) {
        console.error("Encryption call failed (non-blocking):", encErr);
      }
    }

    // 6. Record consent
    await supabase.from("merchant_consents").insert({
      application_id: applicationId,
      applicant_name: `${parsed.dba_contact_first_name} ${parsed.dba_contact_last_name}`.trim(),
      applicant_email: parsed.dba_contact_email,
      consent_type: "merchant_agreement",
      ip_address: clientIp,
      user_agent: userAgent,
      terms_version: "1.0",
      beneficial_ownership_accepted: parsed.beneficial_owner_certification,
      merchant_agreement_accepted: parsed.merchant_agreement_accepted,
      account_authorization_accepted: parsed.account_authorization_accepted,
    });

    // 7. Upload files server-side
    let fileResult = { uploaded: 0, failed: 0, errors: [] as string[] };
    if (files && files.length > 0) {
      fileResult = await uploadFiles(supabase, applicationId, files, clientIp, userAgent);
    }

    // 8. Send confirmation email (non-blocking)
    await sendConfirmationEmail(parsed.dba_contact_first_name, parsed.dba_contact_email, "processing", parsed.dba_name);

    // 9. Send website compliance checklist (M2 Wizard Submitted automation)
    await sendComplianceChecklistEmail(parsed.dba_contact_first_name, parsed.dba_contact_email, parsed.dba_name);

    return new Response(
      JSON.stringify({ success: true, application_id: applicationId, files: fileResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return new Response(
        JSON.stringify({ error: "Validation failed", issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.error("submit-merchant-application error:", err);
    return new Response(
      JSON.stringify({ error: (err as any)?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
