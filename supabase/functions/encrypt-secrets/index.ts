import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── AES-256-GCM helpers ──────────────────────────────────────────────

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get("ENCRYPTION_KEY");
  if (!keyHex || keyHex.length < 32) {
    throw new Error("ENCRYPTION_KEY not configured or too short");
  }
  // Use first 32 bytes (256 bits) of the key string, hashed for consistency
  const encoder = new TextEncoder();
  const rawKey = await crypto.subtle.digest("SHA-256", encoder.encode(keyHex));
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptValue(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  // Format: hex(iv):hex(ciphertext+tag)  — GCM appends the auth tag
  return `${toHex(iv.buffer)}:${toHex(encrypted)}`;
}

// ── Validation helpers ────────────────────────────────────────────────

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function isValidSSN(str: string): boolean {
  return /^\d{9}$/.test(str);
}

function isValidRoutingNumber(str: string): boolean {
  return /^\d{5,9}$/.test(str); // US: 9 digits, CA: 5+3=8 digits
}

function isValidAccountNumber(str: string): boolean {
  return /^\d{4,17}$/.test(str);
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { application_id, ssn_full, routing_number, account_number } =
      await req.json();

    // --- Input validation ---
    if (!application_id || typeof application_id !== "string" || !isValidUUID(application_id)) {
      return new Response(
        JSON.stringify({ error: "Valid application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ssn_full && !routing_number && !account_number) {
      return new Response(
        JSON.stringify({ error: "No sensitive values provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format validation
    if (ssn_full && !isValidSSN(ssn_full)) {
      return new Response(
        JSON.stringify({ error: "Invalid SSN format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (routing_number && !isValidRoutingNumber(routing_number)) {
      return new Response(
        JSON.stringify({ error: "Invalid routing number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (account_number && !isValidAccountNumber(account_number)) {
      return new Response(
        JSON.stringify({ error: "Invalid account number format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Verify application exists and is recent (< 24 hours) ---
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("created_at, status")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ageMs = Date.now() - new Date(app.created_at).getTime();
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    if (ageMs > MAX_AGE_MS) {
      return new Response(
        JSON.stringify({ error: "Application submission window expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Check for duplicate submissions ---
    const { data: existing } = await supabase
      .from("application_secrets")
      .select("application_id")
      .eq("application_id", application_id)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Secrets already stored for this application" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Encrypt and store ---
    const encKey = await getEncryptionKey();

    const ssnEnc = ssn_full ? await encryptValue(ssn_full, encKey) : null;
    const routingEnc = routing_number
      ? await encryptValue(routing_number, encKey)
      : null;
    const accountEnc = account_number
      ? await encryptValue(account_number, encKey)
      : null;

    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    console.log(`Encrypt request: app_id=${application_id}, ip=${clientIp}, has_ssn=${!!ssn_full}`);

    const { error } = await supabase.from("application_secrets").insert({
      application_id,
      ssn_enc: ssnEnc,
      routing_enc: routingEnc,
      account_enc: accountEnc,
      key_version: 1,
    });

    if (error) {
      console.error("Failed to store encrypted secrets:", error);
      return new Response(
        JSON.stringify({ error: "Failed to store secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Encrypt secrets error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
