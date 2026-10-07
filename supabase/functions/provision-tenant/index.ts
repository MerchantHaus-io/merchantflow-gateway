/**
 * Tenant provisioning worker.
 *
 * Platform-admin only. Creates a tenant, records a provisioning run with one
 * row per step, executes the steps idempotently, and drives the tenant through
 *
 *   pending -> provisioning -> ready -> active
 *
 * Onboarding is deliberately part of the gate: a tenant reaches `ready` only
 * once every required setup-wizard step is complete AND the readiness assertion
 * re-queries the artifacts of the earlier steps. A step row saying "succeeded"
 * while its artifact is absent is exactly the corruption that assertion exists
 * to catch, so it never trusts the step rows.
 *
 * Retries reuse the same idempotency key and resume from the first step that is
 * not already `succeeded`.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Mirrors src/lib/tenantProvisioning.ts. Keep the two in step.
const STEPS = [
  "validate_request",
  "create_tenant",
  "default_settings",
  "onboarding_state",
  "invite_admin",
  "audit_event",
  "readiness_assert",
] as const;
type StepKey = (typeof STEPS)[number];

const REQUIRED_ONBOARDING_STEPS = ["branding", "sender_identity", "pricing", "team"];

const isValidSlug = (slug: string) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(slug);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Ctx {
  db: SupabaseClient;
  actorId: string;
  actorEmail: string;
}

async function audit(
  ctx: Ctx,
  tenantId: string | null,
  action: string,
  detail: Record<string, unknown> = {},
) {
  await ctx.db.from("tenant_audit_events").insert({
    tenant_id: tenantId,
    actor_user_id: ctx.actorId,
    actor_email: ctx.actorEmail,
    action,
    target_type: "tenant",
    target_id: tenantId,
    detail,
  });
}

/** Runs one step, recording start/finish and any failure on its row. */
async function runStep(
  ctx: Ctx,
  runId: string,
  tenantId: string,
  key: StepKey,
  fn: () => Promise<Record<string, unknown> | void>,
): Promise<void> {
  const { data: existing } = await ctx.db
    .from("tenant_provisioning_steps")
    .select("id,status")
    .eq("run_id", runId)
    .eq("step_key", key)
    .maybeSingle();

  if (existing?.status === "succeeded") return; // resume semantics

  const stepId = existing?.id;
  await ctx.db
    .from("tenant_provisioning_steps")
    .update({ status: "running", started_at: new Date().toISOString(), error: null })
    .eq("id", stepId);

  try {
    const detail = (await fn()) ?? {};
    await ctx.db
      .from("tenant_provisioning_steps")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        detail: detail as Record<string, unknown>,
      })
      .eq("id", stepId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.db
      .from("tenant_provisioning_steps")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", stepId);
    throw new Error(`${key}: ${message}`);
  }
}

/**
 * Executes every not-yet-succeeded step of a run. Called by both create and
 * retry, and again after the setup wizard completes so the readiness assertion
 * re-runs against the finished configuration.
 */
async function executeRun(ctx: Ctx, runId: string): Promise<{ status: string; error?: string }> {
  const { data: run, error } = await ctx.db
    .from("tenant_provisioning_runs")
    .select("id,tenant_id,payload,attempt,status")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error("Provisioning run not found");

  const tenantId = run.tenant_id as string;
  const payload = (run.payload ?? {}) as Record<string, string>;

  await ctx.db
    .from("tenant_provisioning_runs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // The tenant enters `provisioning` for the whole run; it leaves for `ready`
  // only from the readiness assertion.
  await ctx.db.from("tenants").update({ status: "provisioning" }).eq("id", tenantId).eq("status", "pending");
  await ctx.db.from("tenants").update({ status: "provisioning" }).eq("id", tenantId).eq("status", "failed");

  try {
    await runStep(ctx, runId, tenantId, "validate_request", async () => {
      if (!payload.name?.trim()) throw new Error("Organisation name is required");
      if (!isValidSlug(payload.slug ?? "")) throw new Error("Invalid workspace key");
      if (!isEmail(payload.admin_email ?? "")) throw new Error("Invalid administrator email");
      return { slug: payload.slug };
    });

    await runStep(ctx, runId, tenantId, "create_tenant", async () => {
      const { error: e } = await ctx.db
        .from("tenants")
        .update({
          name: payload.name,
          primary_contact_email: payload.admin_email,
          billing_email: payload.billing_email || payload.admin_email,
        })
        .eq("id", tenantId);
      if (e) throw new Error(e.message);
      return { tenant_id: tenantId };
    });

    await runStep(ctx, runId, tenantId, "default_settings", async () => {
      const { data: t } = await ctx.db.from("tenants").select("settings,branding").eq("id", tenantId).single();
      const settings = { ...(t?.settings ?? {}) } as Record<string, unknown>;
      settings.plan = payload.plan || "foundation";
      settings.timezone = settings.timezone ?? "America/Chicago";
      settings.currency = settings.currency ?? "USD";
      const branding = { ...(t?.branding ?? {}) } as Record<string, unknown>;
      branding.display_name = branding.display_name ?? payload.name;
      const { error: e } = await ctx.db.from("tenants").update({ settings, branding }).eq("id", tenantId);
      if (e) throw new Error(e.message);
      return { plan: settings.plan };
    });

    await runStep(ctx, runId, tenantId, "onboarding_state", async () => {
      const { data: existing } = await ctx.db
        .from("tenant_onboarding_state")
        .select("id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!existing) {
        const { error: e } = await ctx.db
          .from("tenant_onboarding_state")
          .insert({ tenant_id: tenantId, current_step: "welcome", completed_steps: [] });
        if (e) throw new Error(e.message);
      }
      return { required_steps: REQUIRED_ONBOARDING_STEPS };
    });

    await runStep(ctx, runId, tenantId, "invite_admin", async () => {
      const email = (payload.admin_email ?? "").toLowerCase();
      const { data: existing } = await ctx.db
        .from("tenant_invitations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", email)
        .is("revoked_at", null)
        .maybeSingle();
      if (existing) return { invitation_id: existing.id, reused: true };

      const { data: inv, error: e } = await ctx.db
        .from("tenant_invitations")
        .insert({ tenant_id: tenantId, email, role: "owner", invited_by: ctx.actorId })
        .select("id")
        .single();
      if (e) throw new Error(e.message);
      return { invitation_id: inv?.id };
    });

    await runStep(ctx, runId, tenantId, "audit_event", async () => {
      await audit(ctx, tenantId, "tenant.provisioned", { run_id: runId, slug: payload.slug });
      return {};
    });

    await runStep(ctx, runId, tenantId, "readiness_assert", async () => {
      // Re-query artifacts; never trust the step rows above.
      const [{ data: tenant }, { data: onboarding }, { data: invite }] = await Promise.all([
        ctx.db.from("tenants").select("id,name,slug,status,settings").eq("id", tenantId).maybeSingle(),
        ctx.db
          .from("tenant_onboarding_state")
          .select("completed_steps")
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        ctx.db
          .from("tenant_invitations")
          .select("id")
          .eq("tenant_id", tenantId)
          .is("revoked_at", null)
          .limit(1)
          .maybeSingle(),
      ]);

      const problems: string[] = [];
      if (!tenant) problems.push("tenant row missing");
      if (!tenant?.name?.trim()) problems.push("tenant has no name");
      if (!(tenant?.settings as Record<string, unknown>)?.plan) problems.push("no plan assigned");
      if (!onboarding) problems.push("setup wizard state missing");
      if (!invite) problems.push("no administrator invitation");

      const done = new Set<string>(((onboarding?.completed_steps ?? []) as string[]) ?? []);
      const missingSetup = REQUIRED_ONBOARDING_STEPS.filter((k) => !done.has(k));

      if (problems.length) throw new Error(problems.join("; "));

      if (missingSetup.length) {
        // Provisioned, but deliberately not Ready: setup is unfinished, so the
        // tenant must not be mistaken for an operational one.
        return { ready: false, awaiting_setup: missingSetup };
      }

      const { error: e } = await ctx.db.from("tenants").update({ status: "ready" }).eq("id", tenantId);
      if (e) throw new Error(e.message);
      await audit(ctx, tenantId, "tenant.ready", { run_id: runId });
      return { ready: true };
    });

    await ctx.db
      .from("tenant_provisioning_runs")
      .update({ status: "succeeded", finished_at: new Date().toISOString() })
      .eq("id", runId);

    const { data: t } = await ctx.db.from("tenants").select("status").eq("id", tenantId).maybeSingle();
    return { status: t?.status ?? "provisioning" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.db
      .from("tenant_provisioning_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    await ctx.db.from("tenants").update({ status: "failed" }).eq("id", tenantId).eq("status", "provisioning");
    await audit(ctx, tenantId, "tenant.provisioning_failed", { run_id: runId, error: message });
    return { status: "failed", error: message };
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const TEAM_ROLES = ["owner", "admin", "member"];

/**
 * Validates one wizard step's data and writes its real artifact, so a ticked
 * step always corresponds to configuration that exists. Throws on bad input.
 */
async function applyOnboardingStep(
  ctx: Ctx,
  tenantId: string,
  step: string,
  data: Record<string, unknown>,
  redirectTo?: string,
): Promise<Record<string, unknown>> {
  const { data: t } = await ctx.db.from("tenants").select("settings,branding").eq("id", tenantId).single();
  const settings = { ...((t?.settings ?? {}) as Record<string, unknown>) };
  const branding = { ...((t?.branding ?? {}) as Record<string, unknown>) };
  const str = (k: string) => String(data[k] ?? "").trim();

  if (step === "welcome" || step === "integrations") return {};

  if (step === "branding") {
    const displayName = str("display_name");
    if (!displayName) throw new Error("Display name is required");
    const primary = str("primary_color");
    if (primary && !HEX.test(primary)) throw new Error("Brand colour must be a hex value like #1A6BFF");
    const logo = str("logo_url");
    if (logo && !/^https:\/\//.test(logo)) throw new Error("Logo URL must start with https://");
    Object.assign(branding, { display_name: displayName, primary_color: primary || null, logo_url: logo || null });
    const { error } = await ctx.db.from("tenants").update({ branding }).eq("id", tenantId);
    if (error) throw new Error(error.message);
    await audit(ctx, tenantId, "tenant.branding_set", { display_name: displayName });
    return { display_name: displayName };
  }

  if (step === "sender_identity") {
    const fromName = str("from_name");
    const replyTo = str("reply_to").toLowerCase();
    const domain = str("sender_domain").toLowerCase();
    if (!fromName) throw new Error("Sender name is required");
    if (!isEmail(replyTo)) throw new Error("A valid reply-to address is required");
    if (!DOMAIN.test(domain)) throw new Error("Sender domain must look like mail.acmepayments.com");
    const replyDomain = replyTo.split("@")[1];
    if (replyDomain !== domain && !replyDomain.endsWith(`.${domain}`) && !domain.endsWith(`.${replyDomain}`)) {
      throw new Error("Reply-to address must belong to the sender domain");
    }
    settings.sender = { from_name: fromName, reply_to: replyTo, domain, verified: false };
    const { error } = await ctx.db.from("tenants").update({ settings }).eq("id", tenantId);
    if (error) throw new Error(error.message);
    await audit(ctx, tenantId, "tenant.sender_set", { domain });
    return { domain, verified: false };
  }

  if (step === "pricing") {
    const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
    if (!items.length) throw new Error("Add at least one priced item");
    let order = 10;
    for (const raw of items) {
      const code = String(raw.code ?? "").trim();
      const label = String(raw.label ?? "").trim();
      const cost = Number(raw.cost);
      const resale = Number(raw.resale);
      if (!code || !label) throw new Error("Every pricing item needs a name and code");
      if (!Number.isFinite(cost) || !Number.isFinite(resale) || cost < 0 || resale < 0) {
        throw new Error(`${label}: prices must be zero or more`);
      }
      if (resale < cost) throw new Error(`${label}: resale price is below cost`);
      const row = {
        tenant_id: tenantId,
        code,
        label,
        category: String(raw.category ?? "platform"),
        cadence: String(raw.cadence ?? "monthly"),
        cost,
        resale,
        active: true,
        sort_order: order,
      };
      order += 10;
      const { data: existing } = await ctx.db
        .from("tenant_pricing_items")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("code", code)
        .maybeSingle();
      const { error } = existing
        ? await ctx.db.from("tenant_pricing_items").update(row).eq("id", existing.id)
        : await ctx.db.from("tenant_pricing_items").insert(row);
      if (error) throw new Error(error.message);
    }
    settings.pricing_confirmed_at = new Date().toISOString();
    await ctx.db.from("tenants").update({ settings }).eq("id", tenantId);
    await audit(ctx, tenantId, "tenant.pricing_set", { items: items.length });
    return { items: items.length };
  }

  if (step === "team") {
    const invites = Array.isArray(data.invites) ? (data.invites as Record<string, unknown>[]) : [];
    const sent: string[] = [];
    for (const raw of invites) {
      const email = String(raw.email ?? "").trim().toLowerCase();
      const role = String(raw.role ?? "member");
      if (!email) continue;
      if (!isEmail(email)) throw new Error(`${email} is not a valid email`);
      if (!TEAM_ROLES.includes(role)) throw new Error(`Unknown role for ${email}`);

      const { data: member } = await ctx.db
        .from("tenant_memberships")
        .select("id,status")
        .eq("tenant_id", tenantId)
        .eq("email", email)
        .maybeSingle();
      if (member?.status === "active") continue;

      let userId: string | null = null;
      const { data: invited, error: invErr } = await ctx.db.auth.admin.inviteUserByEmail(
        email,
        redirectTo ? { redirectTo } : undefined,
      );
      if (invited?.user) userId = invited.user.id;
      else if (invErr && !/already been registered|already exists/i.test(invErr.message)) {
        throw new Error(`Could not invite ${email}: ${invErr.message}`);
      }

      const { data: openInvite } = await ctx.db
        .from("tenant_invitations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", email)
        .is("revoked_at", null)
        .maybeSingle();
      if (!openInvite) {
        const { error } = await ctx.db.from("tenant_invitations").insert({
          tenant_id: tenantId,
          email,
          role,
          token: crypto.randomUUID(),
          invited_by: ctx.actorId,
          expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        });
        if (error) throw new Error(error.message);
      }

      const membership = { tenant_id: tenantId, email, role, status: "invited", invited_by: ctx.actorId, user_id: userId };
      const { error: mErr } = member
        ? await ctx.db.from("tenant_memberships").update(membership).eq("id", member.id)
        : await ctx.db.from("tenant_memberships").insert(membership);
      if (mErr) throw new Error(mErr.message);
      sent.push(email);
    }

    const { data: owners } = await ctx.db
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("role", ["owner", "admin"])
      .in("status", ["invited", "active"])
      .limit(1);
    if (!owners?.length) throw new Error("Invite at least one owner or administrator");
    await audit(ctx, tenantId, "tenant.team_invited", { invited: sent });
    return { invited: sent };
  }

  throw new Error(`Unknown setup step "${step}"`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const {
      data: { user: caller },
      error: authError,
    } = await db.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    // Platform privilege comes from platform_admins only — never from a
    // tenant-scoped table, and never from an email string in this file.
    const { data: pa } = await db
      .from("platform_admins")
      .select("id")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!pa) return json({ error: "Platform administrator access required" }, 403);

    const ctx: Ctx = { db, actorId: caller.id, actorEmail: caller.email ?? "" };
    const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined> & {
      data?: Record<string, unknown>;
    };
    const action = body.action ?? "create";

    if (action === "create") {
      const name = (body.name ?? "").trim();
      const slug = (body.slug ?? "").trim().toLowerCase();
      const adminEmail = (body.admin_email ?? "").trim().toLowerCase();

      if (!name) return json({ error: "Organisation name is required" }, 400);
      if (!isValidSlug(slug)) {
        return json({ error: "Workspace key must be lowercase letters, numbers and hyphens" }, 400);
      }
      if (!isEmail(adminEmail)) return json({ error: "A valid administrator email is required" }, 400);

      const idempotencyKey =
        body.idempotency_key || (await sha256Hex(`${slug}:${adminEmail}`));

      // Duplicate request: return the existing run untouched.
      const { data: existingRun } = await db
        .from("tenant_provisioning_runs")
        .select("id,tenant_id,status")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existingRun) {
        if (existingRun.status === "failed") {
          const result = await executeRun(ctx, existingRun.id);
          return json({ run_id: existingRun.id, tenant_id: existingRun.tenant_id, resumed: true, ...result });
        }
        const { data: t } = await db.from("tenants").select("status").eq("id", existingRun.tenant_id).maybeSingle();
        return json({
          run_id: existingRun.id,
          tenant_id: existingRun.tenant_id,
          duplicate: true,
          status: t?.status,
        });
      }

      const { data: slugTaken } = await db.from("tenants").select("id").eq("slug", slug).maybeSingle();
      if (slugTaken) return json({ error: `Workspace key "${slug}" is already in use` }, 409);

      const { data: tenant, error: tErr } = await db
        .from("tenants")
        .insert({
          name,
          slug,
          status: "pending",
          primary_contact_email: adminEmail,
          created_by: caller.id,
        })
        .select("id")
        .single();
      if (tErr || !tenant) return json({ error: tErr?.message ?? "Could not create organisation" }, 400);

      const { data: run, error: rErr } = await db
        .from("tenant_provisioning_runs")
        .insert({
          tenant_id: tenant.id,
          idempotency_key: idempotencyKey,
          status: "pending",
          requested_by: caller.id,
          payload: {
            name,
            slug,
            admin_email: adminEmail,
            billing_email: (body.billing_email ?? "").trim().toLowerCase(),
            plan: body.plan ?? "foundation",
          },
        })
        .select("id")
        .single();
      if (rErr || !run) return json({ error: rErr?.message ?? "Could not queue provisioning" }, 400);

      await db.from("tenant_provisioning_steps").insert(
        STEPS.map((key, i) => ({
          run_id: run.id,
          tenant_id: tenant.id,
          step_key: key,
          step_order: i + 1,
          status: "pending",
        })),
      );

      const result = await executeRun(ctx, run.id);
      return json({ run_id: run.id, tenant_id: tenant.id, ...result }, result.status === "failed" ? 200 : 201);
    }

    if (action === "retry") {
      if (!body.run_id) return json({ error: "run_id is required" }, 400);
      const { data: run } = await db
        .from("tenant_provisioning_runs")
        .select("id,attempt")
        .eq("id", body.run_id)
        .maybeSingle();
      if (!run) return json({ error: "Provisioning run not found" }, 404);
      await db
        .from("tenant_provisioning_runs")
        .update({ attempt: (run.attempt ?? 1) + 1 })
        .eq("id", run.id);
      const result = await executeRun(ctx, run.id);
      return json({ run_id: run.id, ...result });
    }

    if (action === "onboarding_step") {
      const tenantId = body.tenant_id;
      const step = body.step;
      if (!tenantId || !step) return json({ error: "tenant_id and step are required" }, 400);

      const { data: state } = await db
        .from("tenant_onboarding_state")
        .select("id,completed_steps,data")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!state) return json({ error: "Setup wizard has not been opened for this organisation" }, 404);

      const undo = String(body.undo) === "true";
      let applied: Record<string, unknown> = {};
      if (!undo && body.data) {
        try {
          applied = await applyOnboardingStep(ctx, tenantId, step, body.data, body.redirect_to);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
      } else if (!undo && REQUIRED_ONBOARDING_STEPS.includes(step)) {
        return json({ error: "Fill in this step before marking it done" }, 400);
      }

      const completed = new Set<string>((state.completed_steps as string[]) ?? []);
      if (undo) completed.delete(step);
      else completed.add(step);

      const merged = {
        ...((state.data ?? {}) as Record<string, unknown>),
        ...(body.data ? { [step]: { ...body.data, applied } } : {}),
      };
      const remaining = REQUIRED_ONBOARDING_STEPS.filter((k) => !completed.has(k));

      await db
        .from("tenant_onboarding_state")
        .update({
          completed_steps: Array.from(completed),
          data: merged,
          current_step: remaining[0] ?? step,
          completed_at: remaining.length ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.id);

      // Re-run the tail of provisioning so readiness is asserted, never assumed.
      let status: string | undefined;
      if (!remaining.length) {
        const { data: run } = await db
          .from("tenant_provisioning_runs")
          .select("id")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (run) {
          await db
            .from("tenant_provisioning_steps")
            .update({ status: "pending", error: null })
            .eq("run_id", run.id)
            .eq("step_key", "readiness_assert");
          const result = await executeRun(ctx, run.id);
          status = result.status;
        }
      }
      return json({ ok: true, awaiting_setup: remaining, status });
    }

    if (action === "activate" || action === "suspend" || action === "reactivate") {
      const tenantId = body.tenant_id;
      if (!tenantId) return json({ error: "tenant_id is required" }, 400);
      const next = action === "suspend" ? "suspended" : "active";
      const { error: e } = await db
        .from("tenants")
        .update({
          status: next,
          suspended_reason: action === "suspend" ? body.reason ?? null : null,
        })
        .eq("id", tenantId);
      if (e) return json({ error: e.message }, 400);
      await audit(ctx, tenantId, `tenant.${action}`, { reason: body.reason ?? null });
      return json({ ok: true, status: next });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("provision-tenant failed", message);
    return json({ error: message }, 500);
  }
});
