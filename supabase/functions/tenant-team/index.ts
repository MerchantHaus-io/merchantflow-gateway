/**
 * Per-organisation team management.
 *
 * An organisation admin (owner/admin membership on the tenant, status active)
 * may invite a colleague by email, change a member's role, or revoke access.
 * Platform admins may do the same for any tenant.
 *
 * Every authorisation decision is made here, from the caller's JWT and their
 * own membership row — never from anything in the request body. The tenant a
 * caller may act on is resolved server-side; a tenant_id in the body is only
 * accepted when it matches a tenant the caller actually administers.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const ROLES = ["owner", "admin", "member"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const {
      data: { user: caller },
      error: authError,
    } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
    const action = (body.action ?? "").trim();

    const { data: platformAdmin } = await db
      .from("platform_admins")
      .select("id")
      .eq("user_id", caller.id)
      .maybeSingle();

    // Resolve the tenant the caller is allowed to administer.
    let tenantId = (body.tenant_id ?? "").trim() || null;
    if (!platformAdmin) {
      const { data: memberships } = await db
        .from("tenant_memberships")
        .select("tenant_id,role,status,is_default")
        .eq("user_id", caller.id)
        .eq("status", "active")
        .in("role", ["owner", "admin"]);

      const admined = memberships ?? [];
      if (admined.length === 0) {
        return json({ error: "Organisation administrator access required" }, 403);
      }
      if (tenantId) {
        if (!admined.some((m) => m.tenant_id === tenantId)) {
          return json({ error: "Organisation administrator access required" }, 403);
        }
      } else {
        tenantId = (admined.find((m) => m.is_default) ?? admined[0]).tenant_id;
      }
    }
    if (!tenantId) return json({ error: "An organisation is required" }, 400);

    const audit = async (act: string, detail: Record<string, unknown>) => {
      await db.from("tenant_audit_events").insert({
        tenant_id: tenantId,
        actor_user_id: caller.id,
        actor_email: caller.email ?? "",
        action: act,
        target_type: "tenant_membership",
        target_id: tenantId,
        detail,
      });
    };

    if (action === "invite") {
      const email = (body.email ?? "").trim().toLowerCase();
      const role = (body.role ?? "member").trim();
      if (!isEmail(email)) return json({ error: "A valid email address is required" }, 400);
      if (!ROLES.includes(role as (typeof ROLES)[number])) {
        return json({ error: "Unknown role" }, 400);
      }

      const { data: existing } = await db
        .from("tenant_memberships")
        .select("id,status")
        .eq("tenant_id", tenantId)
        .eq("email", email)
        .maybeSingle();
      if (existing && existing.status === "active") {
        return json({ error: "That person is already on this team" }, 409);
      }

      // Send the invite email and, when the account already exists, just link it.
      const redirectTo = (body.redirect_to ?? "").trim() || undefined;
      let invitedUserId: string | null = null;
      const { data: invited, error: inviteError } = await db.auth.admin.inviteUserByEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (invited?.user) {
        invitedUserId = invited.user.id;
      } else if (inviteError && !/already been registered|already exists/i.test(inviteError.message)) {
        return json({ error: `Could not send the invite: ${inviteError.message}` }, 502);
      }

      const { data: invitation, error: invitationError } = await db
        .from("tenant_invitations")
        .insert({
          tenant_id: tenantId,
          email,
          role,
          token: crypto.randomUUID(),
          invited_by: caller.id,
          expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        })
        .select("id")
        .single();
      if (invitationError) return json({ error: invitationError.message }, 500);

      const membership = {
        tenant_id: tenantId,
        email,
        role,
        status: "invited",
        invited_by: caller.id,
        user_id: invitedUserId,
      };
      if (existing) {
        await db.from("tenant_memberships").update(membership).eq("id", existing.id);
      } else {
        const { error: membershipError } = await db.from("tenant_memberships").insert(membership);
        if (membershipError) return json({ error: membershipError.message }, 500);
      }

      await audit("team.invite", { email, role, invitation_id: invitation.id });
      return json({ ok: true, email, role });
    }

    if (action === "set_role") {
      const membershipId = (body.membership_id ?? "").trim();
      const role = (body.role ?? "").trim();
      if (!membershipId) return json({ error: "A team member is required" }, 400);
      if (!ROLES.includes(role as (typeof ROLES)[number])) {
        return json({ error: "Unknown role" }, 400);
      }

      const { data: target } = await db
        .from("tenant_memberships")
        .select("id,tenant_id,email,role,user_id")
        .eq("id", membershipId)
        .maybeSingle();
      if (!target || target.tenant_id !== tenantId) {
        return json({ error: "That team member is not in this organisation" }, 404);
      }
      if (target.user_id === caller.id && role !== "owner" && target.role === "owner") {
        return json({ error: "You cannot remove your own owner role" }, 400);
      }

      const { error } = await db.from("tenant_memberships").update({ role }).eq("id", membershipId);
      if (error) return json({ error: error.message }, 500);

      await audit("team.set_role", { email: target.email, from: target.role, to: role });
      return json({ ok: true });
    }

    if (action === "set_status") {
      const membershipId = (body.membership_id ?? "").trim();
      const status = (body.status ?? "").trim();
      if (!membershipId) return json({ error: "A team member is required" }, 400);
      if (!["active", "suspended", "revoked"].includes(status)) {
        return json({ error: "Unknown status" }, 400);
      }

      const { data: target } = await db
        .from("tenant_memberships")
        .select("id,tenant_id,email,status,user_id,role")
        .eq("id", membershipId)
        .maybeSingle();
      if (!target || target.tenant_id !== tenantId) {
        return json({ error: "That team member is not in this organisation" }, 404);
      }
      if (target.user_id === caller.id && status !== "active") {
        return json({ error: "You cannot revoke your own access" }, 400);
      }

      const { error } = await db
        .from("tenant_memberships")
        .update({ status })
        .eq("id", membershipId);
      if (error) return json({ error: error.message }, 500);

      await audit("team.set_status", { email: target.email, from: target.status, to: status });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("tenant-team failed", message);
    return json({ error: message }, 500);
  }
});
