import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  if (allowServiceRole && serviceRoleKey && token === serviceRoleKey) {
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
