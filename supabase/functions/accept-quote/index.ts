// Public quote acceptance endpoint.
//
// Called by the public /q/:token page in this app. No JWT — security is
// the unguessable `acceptance_token` issued at send time. Validates the
// token + expiry, writes the immutable audit row, flips the quote status
// to 'accepted', and notifies the assigned CRM owner so they can generate
// the contract (operator-driven per design decision).
//
// Hardened against:
//   - expired or unknown tokens (404)
//   - already-accepted quotes (409 — do not double-record)
//   - missing signatory fields (400)
//   - merchant tampering with line items (we ignore client-side prices and
//     recompute / hash from the persisted quotes.lines_snapshot)
//
// The Resend notification is best-effort: if email fails the acceptance
// still records — the audit trail is the source of truth.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type AcceptRequest =
  | { action: "load"; token: string }
  | {
      action?: "accept"; // default
      token: string;
      signatory_name: string;
      signatory_title?: string;
      signatory_email: string;
      authority_to_bind: boolean;
      agreed_to_msa: boolean;
      terms_version?: string;
      ach?: {
        account_holder?: string;
        routing?: string;        // full routing — we only store last 4
        account?: string;        // full account — we only store last 4
        account_type?: "checking" | "savings";
        bank_name?: string;
        authorized?: boolean;
      };
      notes?: string;
    };

const last4 = (s?: string): string | null => {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

// Web Crypto SHA-256 → hex
async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Load handler — return quote for public display ──────────────────────
// Returns a safe subset (no internal margin/cost fields) for the acceptance UI.
async function handleLoad(
  token: string,
  supabase: ReturnType<typeof createClient>,
) {
  if (!token) return json({ error: "Missing token" }, 400);

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, tier_id, tier_name, billing_cycle, monthly_resale, annual_resale, valid_until, acceptance_token_expires_at, client_business_name, client_contact_name, client_email, client_phone, client_monthly_volume, client_average_ticket, sender_name, sender_title, sender_company, sender_email, sender_phone, lines_snapshot, sent_at",
    )
    .eq("acceptance_token", token)
    .maybeSingle();

  if (error) {
    console.error("accept-quote load error", error);
    return json({ error: "Lookup failed" }, 500);
  }
  if (!quote) return json({ error: "Quote not found or token invalid" }, 404);

  const now = Date.now();
  const exp = quote.acceptance_token_expires_at
    ? new Date(quote.acceptance_token_expires_at).getTime()
    : (quote.valid_until ? new Date(quote.valid_until).getTime() : null);
  if (exp && exp < now) {
    return json({ error: "This quote link has expired", expired: true }, 410);
  }
  if (quote.status === "accepted") {
    return json({ quote, already_accepted: true }, 200);
  }
  if (quote.status === "rejected" || quote.status === "expired") {
    return json({ error: `Quote is ${quote.status}` }, 409);
  }
  return json({ quote, already_accepted: false }, 200);
}

// ─── Accept handler — record acceptance ──────────────────────────────────
async function handleAccept(
  body: Extract<AcceptRequest, { action?: "accept" }>,
  req: Request,
  supabase: ReturnType<typeof createClient>,
) {
  const {
    token,
    signatory_name,
    signatory_title,
    signatory_email,
    authority_to_bind,
    agreed_to_msa,
    terms_version,
    ach,
    notes,
  } = body;

  if (!token) return json({ error: "Missing token" }, 400);
  if (!signatory_name?.trim()) return json({ error: "Signatory name required" }, 400);
  if (!signatory_email?.trim()) return json({ error: "Signatory email required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signatory_email)) {
    return json({ error: "Signatory email is not a valid address" }, 400);
  }
  if (!authority_to_bind) return json({ error: "Authority-to-bind confirmation required" }, 400);
  if (!agreed_to_msa) return json({ error: "Master Agreement acceptance required" }, 400);

  // Load the quote
  const { data: quote, error: loadErr } = await supabase
    .from("quotes")
    .select(
      "id, quote_number, status, client_business_name, client_email, sender_email, sender_name, opportunity_id, account_id, contact_id, valid_until, acceptance_token_expires_at, lines_snapshot, monthly_resale, annual_resale, tier_name, billing_cycle",
    )
    .eq("acceptance_token", token)
    .maybeSingle();

  if (loadErr) {
    console.error("accept-quote POST load error", loadErr);
    return json({ error: "Lookup failed" }, 500);
  }
  if (!quote) return json({ error: "Quote not found or token invalid" }, 404);

  // Validate state
  const exp = quote.acceptance_token_expires_at
    ? new Date(quote.acceptance_token_expires_at).getTime()
    : (quote.valid_until ? new Date(quote.valid_until).getTime() : null);
  if (exp && exp < Date.now()) {
    return json({ error: "This quote link has expired" }, 410);
  }
  if (quote.status === "accepted") {
    return json({ error: "Quote already accepted", already_accepted: true }, 409);
  }
  if (quote.status === "rejected" || quote.status === "expired") {
    return json({ error: `Quote is ${quote.status}` }, 409);
  }

  // Hash the fee schedule snapshot — locks in exactly what was accepted
  const feeScheduleHash = await sha256(
    JSON.stringify(quote.lines_snapshot ?? []),
  );

  // Capture client IP / UA (best-effort behind proxies)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    null;
  const ua = req.headers.get("user-agent") || null;

  // Insert audit row
  const acceptanceRow = {
    quote_id: quote.id,
    signatory_name: signatory_name.trim(),
    signatory_title: signatory_title?.trim() || null,
    signatory_email: signatory_email.trim().toLowerCase(),
    authority_to_bind: true,
    agreed_to_msa: true,
    ip_address: ip,
    user_agent: ua,
    fee_schedule_hash: feeScheduleHash,
    terms_version: terms_version || null,
    ach_authorized: !!ach?.authorized,
    ach_account_holder: ach?.account_holder?.trim() || null,
    ach_routing_last4: last4(ach?.routing),
    ach_account_last4: last4(ach?.account),
    ach_account_type: ach?.account_type || null,
    ach_bank_name: ach?.bank_name?.trim() || null,
    notes: notes?.trim() || null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("quote_acceptances")
    .insert(acceptanceRow)
    .select()
    .single();

  if (insertErr) {
    console.error("accept-quote insert error", insertErr);
    return json({ error: "Failed to record acceptance" }, 500);
  }

  // Flip the quote status to 'accepted' (DB trigger sets accepted_at)
  const { error: updateErr } = await supabase
    .from("quotes")
    .update({ status: "accepted" })
    .eq("id", quote.id);

  if (updateErr) {
    console.error("accept-quote status update failed", updateErr);
    // Don't abort — the audit row is the source of truth and a re-run can reconcile.
  }

  // Notify the CRM owner (best-effort)
  if (RESEND_API_KEY && quote.sender_email) {
    const subject = `Quote ${quote.quote_number} accepted by ${quote.client_business_name ?? "merchant"} — ready to generate contract`;
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "MerchantHaus <notifications@merchanthaus.io>",
          to: [quote.sender_email],
          reply_to: signatory_email,
          subject,
          html: ownerNotificationHtml({
            quoteNumber: quote.quote_number,
            businessName: quote.client_business_name ?? "—",
            tierName: quote.tier_name ?? "",
            billingCycle: quote.billing_cycle ?? "monthly",
            monthlyResale: quote.monthly_resale ?? 0,
            annualResale: quote.annual_resale ?? 0,
            signatory: {
              name: signatory_name,
              title: signatory_title ?? "",
              email: signatory_email,
            },
            ip,
            ua,
            ach_authorized: !!ach?.authorized,
            ach_last4: last4(ach?.account),
            feeScheduleHash,
          }),
        }),
      });
    } catch (err) {
      console.error("accept-quote owner notification email failed", err);
    }
  }

  // Confirmation to merchant (best-effort)
  if (RESEND_API_KEY && quote.client_email) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "MerchantHaus <sales@merchanthaus.io>",
          to: [quote.client_email],
          reply_to: quote.sender_email ?? "sales@merchanthaus.io",
          subject: `Acceptance confirmed — MerchantHaus Quote ${quote.quote_number}`,
          html: merchantConfirmationHtml({
            quoteNumber: quote.quote_number,
            signatoryName: signatory_name,
            senderName: quote.sender_name ?? "",
            senderEmail: quote.sender_email ?? "",
          }),
        }),
      });
    } catch (err) {
      console.error("accept-quote merchant confirmation email failed", err);
    }
  }

  return json({
    ok: true,
    acceptance_id: inserted.id,
    quote_id: quote.id,
    accepted_at: inserted.accepted_at,
  });
}

// ─── Email bodies ────────────────────────────────────────────────────────

function ownerNotificationHtml(p: {
  quoteNumber: string;
  businessName: string;
  tierName: string;
  billingCycle: string;
  monthlyResale: number;
  annualResale: number;
  signatory: { name: string; title: string; email: string };
  ip: string | null;
  ua: string | null;
  ach_authorized: boolean;
  ach_last4: string | null;
  feeScheduleHash: string;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(n);
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#101216;background:#f4f5f7;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#101216;color:#fff;padding:20px 24px;">
      <div style="font-size:11px;letter-spacing:1.6px;color:#c81030;font-weight:700;">QUOTE ACCEPTED</div>
      <div style="font-size:22px;margin-top:6px;font-weight:700;">${p.businessName}</div>
      <div style="font-size:13px;opacity:0.7;margin-top:4px;font-family:'SF Mono',ui-monospace,monospace;">${p.quoteNumber}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 12px;">${p.signatory.name}${p.signatory.title ? ` (${p.signatory.title})` : ""} just accepted this quote. Below is the audit summary — review and generate the Merchant Services Agreement when you're ready.</p>

      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <tr><td style="padding:8px 0;color:#6e747c;width:160px;">Plan</td><td style="padding:8px 0;font-weight:600;">${p.tierName} — ${p.billingCycle}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">Monthly recurring</td><td style="padding:8px 0;font-weight:600;border-top:1px solid #e5e7eb;">${fmt(p.monthlyResale)}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">Annualized</td><td style="padding:8px 0;font-weight:600;border-top:1px solid #e5e7eb;">${fmt(p.annualResale)}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">Signatory email</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;">${p.signatory.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">IP / UA</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-family:'SF Mono',ui-monospace,monospace;font-size:11px;">${p.ip ?? "—"}<br>${(p.ua ?? "—").substring(0, 80)}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">ACH at accept</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;">${p.ach_authorized ? `Authorized · acct ****${p.ach_last4 ?? "????"}` : "Not provided — capture in onboarding"}</td></tr>
        <tr><td style="padding:8px 0;color:#6e747c;border-top:1px solid #e5e7eb;">Fee schedule hash</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-family:'SF Mono',ui-monospace,monospace;font-size:11px;">${p.feeScheduleHash.substring(0, 16)}…</td></tr>
      </table>

      <div style="background:#f8f5f5;border-left:3px solid #c81030;padding:12px 16px;border-radius:4px;margin-top:16px;">
        <div style="font-size:11px;letter-spacing:1.4px;color:#6e747c;font-weight:700;">NEXT</div>
        <div style="margin-top:4px;font-size:13px;">Open this quote in the CRM to generate the Merchant Services Agreement with the accepted Fee Schedule attached as Exhibit A.</div>
      </div>
    </div>
  </div>
</body></html>`;
}

function merchantConfirmationHtml(p: {
  quoteNumber: string;
  signatoryName: string;
  senderName: string;
  senderEmail: string;
}) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#101216;background:#f4f5f7;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#101216;color:#fff;padding:20px 24px;">
      <div style="font-size:11px;letter-spacing:1.6px;color:#c81030;font-weight:700;">ACCEPTANCE CONFIRMED</div>
      <div style="font-size:20px;margin-top:6px;font-weight:700;">Thank you, ${p.signatoryName}.</div>
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">We've received your acceptance of MerchantHaus quote <strong>${p.quoteNumber}</strong>. A copy of the signed quote and the supporting Master Agreement will arrive shortly from ${p.senderName || "your MerchantHaus contact"}.</p>
      <p style="margin:0 0 12px;">Gateway provisioning typically begins within five (5) business days. We'll reach out with onboarding next steps — including any remaining ACH authorization or processor configuration.</p>
      <p style="margin:16px 0 4px;color:#6e747c;font-size:13px;">Questions? Reply to this email or contact ${p.senderEmail || "sales@merchanthaus.io"}.</p>
    </div>
  </div>
</body></html>`;
}

// ─── Router ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("accept-quote: missing SUPABASE_URL / SERVICE_ROLE_KEY env");
    return json({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }
    const body = (await req.json().catch(() => null)) as AcceptRequest | null;
    if (!body || !body.token) {
      return json({ error: "Missing token" }, 400);
    }
    if (body.action === "load") {
      return await handleLoad(body.token, supabase);
    }
    return await handleAccept(body, req, supabase);
  } catch (err) {
    console.error("accept-quote unhandled", err);
    return json({ error: String(err) }, 500);
  }
});
