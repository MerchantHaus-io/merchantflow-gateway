/**
 * Webhook payload verification.
 *
 * `quo-webhook` and `resend-outreach-webhook` run with verify_jwt = false and
 * previously accepted any payload from anyone — a forged POST was
 * indistinguishable from a real delivery.
 *
 * Both helpers follow the convention `support-inbound-email` already uses:
 * enforce when the secret is configured, warn loudly when it is not. That
 * makes rollout zero-downtime — deploy first, set the secret second, and
 * enforcement switches on without a window where real deliveries bounce.
 *
 * ⚠️ Until the corresponding secret is set, these endpoints remain open.
 * Setting it is what activates the protection.
 */

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  const ea = encoder.encode(a);
  const eb = encoder.encode(b);
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Svix-style signature, as used by Resend.
 *
 * Signs `${id}.${timestamp}.${body}` with the base64 portion of a `whsec_`
 * secret, and sends one or more `v1,<sig>` values in `svix-signature`.
 *
 * @param rawBody the exact request body string — re-serialising JSON changes
 *                the bytes and breaks the signature.
 */
export async function verifySvixSignature(
  req: Request,
  rawBody: string,
  secretEnvVar: string,
  toleranceSeconds = 300,
): Promise<VerifyResult> {
  const secret = Deno.env.get(secretEnvVar);
  if (!secret) {
    console.warn(
      `[webhook] ${secretEnvVar} is not set — accepting unverified payload. ` +
        `This endpoint is open until the secret is configured.`,
    );
    return { ok: true, reason: "unconfigured" };
  }

  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing svix headers" };
  }

  // Reject replays of an old, legitimately-signed delivery.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSeconds) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let expected: string;
  try {
    // The whsec_ payload is base64; sign with the decoded bytes.
    const decoded = atob(key);
    expected = await hmacSha256Base64(decoded, `${id}.${timestamp}.${rawBody}`);
  } catch {
    expected = await hmacSha256Base64(key, `${id}.${timestamp}.${rawBody}`);
  }

  // Header may carry several space-separated versioned signatures.
  const provided = signature
    .split(" ")
    .map((part) => (part.startsWith("v1,") ? part.slice(3) : null))
    .filter((v): v is string => v !== null);

  if (provided.some((sig) => timingSafeEqual(sig, expected))) return { ok: true };
  return { ok: false, reason: "signature mismatch" };
}

/**
 * Shared-secret header check, for providers without a documented signature
 * scheme. Accepts the secret in `x-webhook-secret` or a `?secret=` query param.
 */
export function verifySharedSecret(req: Request, secretEnvVar: string): VerifyResult {
  const secret = Deno.env.get(secretEnvVar);
  if (!secret) {
    console.warn(
      `[webhook] ${secretEnvVar} is not set — accepting unverified payload. ` +
        `This endpoint is open until the secret is configured.`,
    );
    return { ok: true, reason: "unconfigured" };
  }

  const provided =
    req.headers.get("x-webhook-secret") ??
    new URL(req.url).searchParams.get("secret") ??
    "";

  if (provided && timingSafeEqual(provided, secret)) return { ok: true };
  return { ok: false, reason: "bad or missing shared secret" };
}

/** 401 response for a failed verification. */
export function rejectWebhook(result: VerifyResult, corsHeaders: Record<string, string>): Response {
  console.error(`[webhook] rejected: ${result.reason}`);
  return new Response(JSON.stringify({ error: "Invalid signature" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
