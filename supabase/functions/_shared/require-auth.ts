import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Constant-time string comparison.
 *
 * A plain `a === b` on a secret short-circuits at the first differing byte,
 * so response timing leaks a prefix oracle an attacker can walk to recover
 * the key one character at a time. Compare every byte regardless.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Fold the length difference into the result rather than returning early,
  // so a wrong-length guess is not distinguishable by timing either.
  let diff = ea.length ^ eb.length;
  const len = Math.max(ea.length, eb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Require either an authenticated Supabase user JWT OR the project's
 * service-role key in the Authorization header. Returns null when authorized,
 * or a Response (401) to short-circuit the handler.
 *
 * Usage:
 *   const unauth = await requireAuth(req, corsHeaders);
 *   if (unauth) return unauth;
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>,
  opts: { allowServiceRole?: boolean; adminEmails?: string[] } = {}
): Promise<Response | null> {
  const allowServiceRole = opts.allowServiceRole ?? true;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (allowServiceRole && serviceRoleKey && timingSafeEqual(token, serviceRoleKey)) {
    return null;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (opts.adminEmails && opts.adminEmails.length > 0) {
    const email = (data.user.email ?? "").toLowerCase();
    if (!opts.adminEmails.map((e) => e.toLowerCase()).includes(email)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return null;
}

/**
 * Authorization, not just authentication.
 *
 * requireAuth() with no `adminEmails` proves only that the caller holds *a*
 * valid session — an external referral partner passes it as easily as an
 * admin. Privileged functions need a role check, and hardcoding an email array
 * per function (as several currently do) means the roster drifts out of sync.
 *
 * This resolves the caller's roles from public.user_roles, the same table the
 * RLS gate uses, so there is one source of truth.
 *
 * Returns null when authorized, or a Response (401/403) to short-circuit.
 */
export async function requireRole(
  req: Request,
  corsHeaders: Record<string, string>,
  roles: string[],
  opts: { allowServiceRole?: boolean } = {}
): Promise<Response | null> {
  const allowServiceRole = opts.allowServiceRole ?? true;
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return deny(401, "Unauthorized");

  const token = authHeader.replace("Bearer ", "").trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (allowServiceRole && serviceRoleKey && timingSafeEqual(token, serviceRoleKey)) {
    return null;
  }

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return deny(401, "Unauthorized");

  // Role lookup needs to see all rows, so it runs with the service role.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: rows, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  if (roleError) {
    // Fail closed: an unreadable role table must not grant access.
    console.error("[requireRole] role lookup failed:", roleError.message);
    return deny(403, "Forbidden");
  }

  const held = new Set((rows ?? []).map((r: { role: string }) => r.role));
  if (!roles.some((r) => held.has(r))) return deny(403, "Forbidden");

  return null;
}
