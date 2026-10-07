/**
 * Organisations (tenants) — platform admin console.
 *
 * Create an ISO workspace, watch the provisioning run land step by step, work
 * through the setup wizard, and see the workspace flip to Ready and then Active.
 * Every write goes through the `provision-tenant` worker; this screen only
 * reads and renders.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  ONBOARDING_STEPS,
  RUN_STATUS_LABEL,
  TENANT_STATUS_LABEL,
  isValidSlug,
  onboardingProgress,
  slugify,
  stepLabel,
} from "@/lib/tenantProvisioning";
import { TenantSetupWizard } from "@/components/admin/TenantSetupWizard";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_legacy: boolean;
  primary_contact_email: string | null;
  created_at: string;
  activated_at: string | null;
  suspended_reason: string | null;
}

interface RunRow {
  id: string;
  tenant_id: string;
  status: string;
  attempt: number;
  error: string | null;
  created_at: string;
}

interface StepRow {
  id: string;
  run_id: string;
  tenant_id: string;
  step_key: string;
  step_order: number;
  status: string;
  error: string | null;
}

interface OnboardingRow {
  tenant_id: string;
  current_step: string;
  completed_steps: string[] | null;
  completed_at: string | null;
}

const statusTone = (status: string): string => {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "ready":
      return "bg-teal-500/15 text-teal-600 border-teal-500/30";
    case "provisioning":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "failed":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "suspended":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const stepIcon = (status: string) => {
  if (status === "succeeded") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
};

export default function Tenants() {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", admin_email: "", billing_email: "" });
  const [wizardFor, setWizardFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, r, s, o] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("tenant_provisioning_runs").select("*").order("created_at", { ascending: false }),
      supabase.from("tenant_provisioning_steps").select("*").order("step_order", { ascending: true }),
      supabase.from("tenant_onboarding_state").select("tenant_id,current_step,completed_steps,completed_at"),
    ]);
    setTenants((t.data ?? []) as TenantRow[]);
    setRuns((r.data ?? []) as RunRow[]);
    setSteps((s.data ?? []) as StepRow[]);
    setOnboarding((o.data ?? []) as OnboardingRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setIsPlatformAdmin(false);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("platform_admins")
        .select("id")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      const ok = Boolean(data);
      setIsPlatformAdmin(ok);
      if (ok) await load();
      else setLoading(false);
    };
    init();
  }, [load]);

  const call = useCallback(
    async (body: Record<string, unknown>, key: string) => {
      setBusy(key);
      try {
        const { data, error } = await supabase.functions.invoke("provision-tenant", { body });
        if (error) {
          let detail = error.message;
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.text === "function") {
            const text = await ctx.text().catch(() => "");
            try {
              detail = (JSON.parse(text) as { error?: string }).error || text || detail;
            } catch {
              detail = text || detail;
            }
          }
          throw new Error(detail);
        }
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
        return data as Record<string, unknown>;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const submitCreate = async () => {
    const slug = form.slug.trim() || slugify(form.name);
    if (!form.name.trim()) return toast.error("Give the organisation a name");
    if (!isValidSlug(slug)) return toast.error("Workspace key must be lowercase letters, numbers and hyphens");
    if (!form.admin_email.trim()) return toast.error("An administrator email is required");
    try {
      const res = await call(
        {
          action: "create",
          name: form.name.trim(),
          slug,
          admin_email: form.admin_email.trim(),
          billing_email: form.billing_email.trim(),
        },
        "create",
      );
      if (res.status === "failed") toast.error(`Setup stopped: ${res.error ?? "unknown reason"}`);
      else toast.success("Organisation created — now run the setup wizard");
      setCreateOpen(false);
      setForm({ name: "", slug: "", admin_email: "", billing_email: "" });
      setExpanded(res.tenant_id as string);
      if (res.status !== "failed") setWizardFor(res.tenant_id as string);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the organisation");
    }
  };

  const toggleStep = async (tenantId: string, step: string, done: boolean) => {
    try {
      const res = await call(
        { action: "onboarding_step", tenant_id: tenantId, step, undo: done ? "true" : "false" },
        `${tenantId}:${step}`,
      );
      if (res.status === "ready") toast.success("Setup complete — the organisation is Ready");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the setup wizard");
    }
  };

  const lifecycle = async (tenantId: string, action: "activate" | "suspend" | "reactivate" | "retry", runId?: string) => {
    try {
      await call(action === "retry" ? { action, run_id: runId } : { action, tenant_id: tenantId }, `${tenantId}:${action}`);
      toast.success(
        action === "retry" ? "Setup re-run" : action === "suspend" ? "Organisation suspended" : "Organisation active",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  };

  const byTenant = useMemo(() => {
    return (id: string) => {
      const run = runs.find((r) => r.tenant_id === id);
      return {
        run,
        steps: run ? steps.filter((s) => s.run_id === run.id) : [],
        onboarding: onboarding.find((o) => o.tenant_id === id),
      };
    };
  }, [runs, steps, onboarding]);

  if (isPlatformAdmin === false) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card className="p-8 text-center">
            <h1 className="font-mono text-lg uppercase tracking-wide">Organisations</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Only platform administrators can create and manage organisations.
            </p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-mono text-xl uppercase tracking-wide">
              <Building2 className="h-5 w-5" /> Organisations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each organisation is a separate ISO workspace with its own accounts, deals and merchants.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New organisation
            </Button>
          </div>
        </header>

        {loading && !tenants.length ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading organisations…</Card>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => {
              const { run, steps: runSteps, onboarding: ob } = byTenant(t.id);
              const progress = onboardingProgress(ob?.completed_steps);
              const open = expanded === t.id;
              return (
                <Card key={t.id} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : t.id)}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent hover:text-accent-foreground"
                  >
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm uppercase tracking-wide">{t.name}</span>
                        <span className="text-xs text-muted-foreground">/{t.slug}</span>
                        {t.is_legacy && <Badge variant="outline" className="text-[10px]">Original</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {t.primary_contact_email ?? "No contact email"} · created{" "}
                        {format(parseISO(t.created_at), "d MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!progress.complete && t.status !== "active" && (
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          Setup {progress.requiredDone}/{progress.requiredTotal}
                        </span>
                      )}
                      <Badge variant="outline" className={statusTone(t.status)}>
                        {TENANT_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </div>
                  </button>

                  {open && (
                    <div className="grid gap-6 border-t border-border p-4 md:grid-cols-2">
                      <section>
                        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Setup run{run ? ` · ${RUN_STATUS_LABEL[run.status] ?? run.status}` : ""}
                        </h2>
                        {!run ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No setup run recorded — this workspace predates automated setup.
                          </p>
                        ) : (
                          <>
                            <ul className="mt-2 space-y-1.5">
                              {runSteps.map((s) => (
                                <li key={s.id} className="flex items-start gap-2 text-sm">
                                  {stepIcon(s.status)}
                                  <span className="flex-1">
                                    {stepLabel(s.step_key)}
                                    {s.error && (
                                      <span className="block text-xs text-destructive">{s.error}</span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {run.error && (
                              <p className="mt-2 text-xs text-destructive">{run.error}</p>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              disabled={busy === `${t.id}:retry`}
                              onClick={() => lifecycle(t.id, "retry", run.id)}
                            >
                              {busy === `${t.id}:retry` ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Re-run setup
                            </Button>
                          </>
                        )}
                      </section>

                      <section>
                        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Setup wizard
                        </h2>
                        {!ob ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            The wizard has not been opened for this workspace.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {ONBOARDING_STEPS.map((step) => {
                              const done = (ob.completed_steps ?? []).includes(step.key);
                              const key = `${t.id}:${step.key}`;
                              return (
                                <li key={step.key} className="flex items-start gap-2">
                                  <Checkbox
                                    id={key}
                                    checked={done}
                                    disabled={busy === key || (step.required && !done)}
                                    onCheckedChange={() =>
                                      step.required && !done ? setWizardFor(t.id) : toggleStep(t.id, step.key, done)
                                    }
                                  />
                                  <Label htmlFor={key} className="cursor-pointer text-sm font-normal leading-tight">
                                    {step.label}
                                    {step.required && <span className="ml-1 text-destructive">*</span>}
                                    <span className="block text-xs text-muted-foreground">{step.help}</span>
                                  </Label>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {ob && !progress.complete && (
                            <Button size="sm" variant="outline" onClick={() => setWizardFor(t.id)}>
                              <PlayCircle className="mr-2 h-4 w-4" /> Run setup wizard
                            </Button>
                          )}
                          {t.status === "ready" && (
                            <Button size="sm" disabled={busy === `${t.id}:activate`} onClick={() => lifecycle(t.id, "activate")}>
                              <PlayCircle className="mr-2 h-4 w-4" /> Activate
                            </Button>
                          )}
                          {t.status === "active" && !t.is_legacy && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy === `${t.id}:suspend`}
                              onClick={() => lifecycle(t.id, "suspend")}
                            >
                              <PauseCircle className="mr-2 h-4 w-4" /> Suspend
                            </Button>
                          )}
                          {t.status === "suspended" && (
                            <Button
                              size="sm"
                              disabled={busy === `${t.id}:reactivate`}
                              onClick={() => lifecycle(t.id, "reactivate")}
                            >
                              <PlayCircle className="mr-2 h-4 w-4" /> Reactivate
                            </Button>
                          )}
                        </div>
                        {t.suspended_reason && (
                          <p className="mt-2 text-xs text-muted-foreground">Suspended: {t.suspended_reason}</p>
                        )}
                      </section>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New organisation</DialogTitle>
            <DialogDescription>
              Creates the workspace and runs setup. It reaches Ready once the wizard's required steps are done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="t-name">Organisation name</Label>
              <Input
                id="t-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    name: e.target.value,
                    slug: f.slug || slugify(e.target.value),
                  }))
                }
                placeholder="Acme Payments"
              />
            </div>
            <div>
              <Label htmlFor="t-slug">Workspace key</Label>
              <Input
                id="t-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="acme-payments"
              />
            </div>
            <div>
              <Label htmlFor="t-admin">Administrator email</Label>
              <Input
                id="t-admin"
                type="email"
                value={form.admin_email}
                onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))}
                placeholder="owner@acmepayments.com"
              />
            </div>
            <div>
              <Label htmlFor="t-billing">Billing email (optional)</Label>
              <Input
                id="t-billing"
                type="email"
                value={form.billing_email}
                onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
                placeholder="billing@acmepayments.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={busy === "create"}>
              {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create and run setup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(() => {
        const wt = tenants.find((x) => x.id === wizardFor);
        if (!wt) return null;
        return (
          <TenantSetupWizard
            key={wt.id}
            open
            onOpenChange={(o) => !o && setWizardFor(null)}
            tenant={wt}
            completed={byTenant(wt.id).onboarding?.completed_steps ?? []}
            call={call}
            onChanged={load}
          />
        );
      })()}
    </AppLayout>
  );
}
