/**
 * Per-IP rate limiting for the public, unauthenticated intake endpoints
 * (`submit-merchant-application`, `submit-scoping-request`,
 * `submit-support-ticket`, `send-contact-form-email`, `accept-quote`).
 *
 * These necessarily run with verify_jwt = false — an anonymous visitor has no
 * session — so they are the one surface a stranger can hit at will. Without a
 * limit, a single script can fill the CRM with junk applications or burn the
 * Resend quota.
 *
 * Backed by a Postgres table rather than in-memory state: edge functions are
 * horizontally scaled and short-lived, so an in-process Map would reset
 * constantly and count only a fraction of traffic.
 *
 * Fails OPEN. A rate limiter that blocks real merchant applications when the
 * database hiccups is worse than the abuse it prevents — this protects a
 * signup form, not a vault.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Best-effort client IP. Supabase sits behind a proxy, so the socket address
 * is useless; x-forwarded-for's first entry is the original client.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Count requests from this IP for this endpoint inside the window and decide
 * whether to allow another.
 *
 * @param limit  max requests permitted per window
 * @param windowSeconds length of the sliding window
 */
export async function checkRateLimit(
  req: Request,
  endpoint: string,
  limit = 5,
  windowSeconds = 300,
): Promise<RateLimitResult> {
  const ip = clientIp(req);
  if (ip === "unknown") {
    // Can't attribute the request; don't punish it.
    return { allowed: true, remaining: limit };
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count, error } = await supabase
      .from("rate_limit_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("endpoint", endpoint)
      .gte("created_at", since);

    if (error) {
      console.error("[rate-limit] lookup failed, allowing:", error.message);
      return { allowed: true, remaining: limit };
    }

    const used = count ?? 0;
    if (used >= limit) {
      console.warn(`[rate-limit] ${endpoint} blocked ${ip}: ${used}/${limit} in ${windowSeconds}s`);
      return { allowed: false, remaining: 0, retryAfterSeconds: windowSeconds };
    }

    // Record this attempt. Not awaited-on for correctness — a lost write costs
    // one slot of accuracy, which is cheaper than failing the request.
    await supabase.from("rate_limit_events").insert({ ip, endpoint });

    return { allowed: true, remaining: limit - used - 1 };
  } catch (err) {
    console.error("[rate-limit] unexpected failure, allowing:", err);
    return { allowed: true, remaining: limit };
  }
}

/** 429 response with Retry-After. */
export function tooManyRequests(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again shortly." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSeconds ?? 300),
      },
    },
  );
}

/**
 * Honeypot check. Public forms render a field hidden from humans via CSS; a
 * bot that fills every input trips it. Returns true when the submission looks
 * automated.
 */
export function isHoneypotTripped(body: Record<string, unknown>): boolean {
  for (const field of ["_hp", "website_url", "fax_number"]) {
    const v = body[field];
    if (typeof v === "string" && v.trim() !== "") {
      console.warn(`[honeypot] tripped on ${field}`);
      return true;
    }
  }
  return false;
}
