import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert,
  Loader2,
  Database,
  KeyRound,
  Rocket,
  HardDrive,
  Server,
  Globe,
  CheckCircle2,
  Copy,
  ExternalLink,
  Download,
  AlertTriangle,
} from "lucide-react";

type Step = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  intro: string;
  tasks: { id: string; label: string; detail?: string; code?: string; danger?: boolean }[];
};

const STEPS: Step[] = [
  {
    id: "provision",
    title: "1. Provision the new Supabase project",
    icon: Server,
    intro:
      "Create the destination project in an organization you own before touching anything else.",
    tasks: [
      { id: "org", label: "Create a new project in your Supabase organization (US region to match users)." },
      {
        id: "api",
        label: "From Settings → API, capture Project URL, anon key, service_role key, and Project ref.",
        detail: "Store in a password manager. Never paste secret values into Lovable chat.",
      },
      {
        id: "db",
        label: "From Settings → Database, capture the pooled + direct connection strings and DB password.",
      },
    ],
  },
  {
    id: "schema",
    title: "2. Replay the schema",
    icon: Database,
    intro:
      "The supabase/migrations/*.sql files in this repo are the source of truth: tables, RLS, GRANTs, functions, triggers.",
    tasks: [
      {
        id: "cli",
        label: "Option A — Supabase CLI",
        code: "supabase link --project-ref <new-project-ref>\nsupabase db push",
      },
      {
        id: "script",
        label: "Option B — helper script in this repo",
        code: "export DATABASE_URL='postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres'\n./scripts/apply-migrations.sh",
      },
      {
        id: "verify",
        label: "Verify: 71 public tables, RLS enabled on all, policies + GRANTs present.",
      },
    ],
  },
  {
    id: "buckets",
    title: "3. Recreate storage buckets",
    icon: HardDrive,
    intro: "Match the source project's public/private settings exactly.",
    tasks: [
      { id: "avatars", label: "Create bucket `avatars` — Public." },
      { id: "opps", label: "Create bucket `opportunity-documents` — Private." },
      { id: "chat", label: "Create bucket `chat-attachments` — Private." },
    ],
  },
  {
    id: "functions",
    title: "4. Deploy edge functions",
    icon: Rocket,
    intro:
      "~80 functions under supabase/functions/*. supabase/config.toml carries per-function verify_jwt overrides — keep it as-is.",
    tasks: [
      {
        id: "deploy",
        label: "Deploy every function to the new project.",
        code: 'for f in supabase/functions/*/; do\n  name=$(basename "$f")\n  [ "$name" = "_shared" ] && continue\n  supabase functions deploy "$name" --project-ref <new-project-ref>\ndone',
      },
    ],
  },
  {
    id: "secrets",
    title: "5. Recreate edge function secrets",
    icon: KeyRound,
    intro:
      "Set in Supabase → Project Settings → Edge Functions → Secrets. Values come from you / the original providers.",
    tasks: [
      {
        id: "auto",
        label: "Supabase auto-provides these — do NOT set manually.",
        detail:
          "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEY(S), SUPABASE_SECRET_KEYS.",
      },
      {
        id: "resend",
        label: "RESEND_API_KEY — from resend.com",
      },
      {
        id: "google",
        label:
          "GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_MAIL_API_KEY, GOOGLE_DRIVE_API_KEY — from Google Cloud Console. Update authorized redirect URIs to the new function URLs.",
      },
      { id: "nmi", label: "NMI_API_KEY — from NMI partner portal." },
      { id: "kurv", label: "KURV_API_ENV, KURV_API_USERNAME, KURV_API_PASSWORD — from EMS Corporate." },
      { id: "quo", label: "QUO_API_KEY — from OpenPhone/Quo." },
      {
        id: "portal",
        label:
          "PORTAL_SUPABASE_URL, PORTAL_SUPABASE_ANON_KEY, PORTAL_SERVICE_ROLE_KEY, PORTAL_WEBHOOK_SECRET — from the merchant portal project.",
      },
      {
        id: "vapid",
        label: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — reuse existing to preserve subscribers, else regenerate.",
      },
      {
        id: "encryption",
        danger: true,
        label: "ENCRYPTION_KEY — reuse via the Lovable support export in step 6.",
        detail:
          "⚠ Regenerating this key makes previously encrypted application_secrets rows unreadable forever.",
      },
      {
        id: "lovable-key",
        label:
          "LOVABLE_API_KEY is Cloud-only. To keep AI features, either retain a Lovable Cloud footprint or swap ai-assistant/polish-email/analyze-statement/classify-document/generate-profile-avatars to direct OpenAI/Gemini keys.",
      },
    ],
  },
  {
    id: "data",
    title: "6. Data export (Lovable support)",
    icon: Download,
    intro:
      "The DB URL and service_role for the Cloud-managed project aren't exposed, so the data dump must come from Lovable.",
    tasks: [
      { id: "cloud-tab", label: "Try Cloud tab → Advanced settings → Export data first." },
      {
        id: "support",
        label:
          "If insufficient, email Lovable support and request: pg_dump of the public schema (data + sequences), copies of the three buckets, current ENCRYPTION_KEY, current VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY.",
      },
      {
        id: "load",
        label: "Load the dump into the new project after step 2 completes; upload bucket contents into step 3 buckets.",
      },
    ],
  },
  {
    id: "app",
    title: "7. Point the app at the new project",
    icon: Globe,
    intro: "Update the frontend env vars consumed by src/integrations/supabase/client.ts.",
    tasks: [
      {
        id: "env",
        label: "Set the four VITE_ vars from .env.production.example.",
        code: 'VITE_SUPABASE_URL="https://<new-ref>.supabase.co"\nVITE_SUPABASE_PUBLISHABLE_KEY="<new-anon-key>"\nVITE_SUPABASE_PROJECT_ID="<new-ref>"\nVITE_VAPID_PUBLIC_KEY="<matching-vapid-public>"',
      },
      {
        id: "hosting",
        label:
          "Choose hosting: (A) deploy off Lovable to Netlify/Vercel for a clean cut, or (B) connect the Supabase Integration in Lovable to your new project.",
        detail: "Once Lovable Cloud is enabled on a project it cannot be disabled on that specific project — option A is the true cutover.",
      },
    ],
  },
  {
    id: "verify",
    title: "8. Post-cutover verification",
    icon: CheckCircle2,
    intro: "Confirm the migration before decommissioning the Cloud instance.",
    tasks: [
      { id: "staging", label: "Re-run migrations against a staging copy first." },
      {
        id: "smoke",
        label:
          "Smoke test: email/password + Google auth, pipeline CRUD, quote acceptance, NMI/Kurv/Quo webhooks, Gmail sync, portal magic links, push notifications.",
      },
      {
        id: "callbacks",
        label: "Update every third-party callback URL (Google OAuth, NMI, Quo, Resend, Portal webhooks) to the new function base URL.",
      },
      {
        id: "rotate",
        label: "Rotate ENCRYPTION_KEY only after confirming no encrypted rows remain.",
      },
      {
        id: "decommission",
        label: "Contact Lovable support to decommission the Cloud instance (self-service disable is not available).",
      },
    ],
  },
];

const STORAGE_KEY = "migration-checklist-v1";

export default function MigrationChecklist() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, loading } = useUserRole();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
  }, [checked]);

  const { total, done } = useMemo(() => {
    const all = STEPS.flatMap((s) => s.tasks.map((t) => `${s.id}.${t.id}`));
    return { total: all.length, done: all.filter((k) => checked[k]).length };
  }, [checked]);

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Command copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const resetAll = () => {
    if (confirm("Reset all checklist progress?")) setChecked({});
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" /> Admin access required
              </CardTitle>
              <CardDescription>
                The infrastructure migration checklist is restricted to administrators.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/")}>Back to dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:p-6">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Admin · Infrastructure</Badge>
            <Badge variant="secondary">Runbook</Badge>
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">
            Supabase migration checklist
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Move this app off Lovable Cloud onto a Supabase project you fully own. Work top-to-bottom.
            Progress is saved to this browser.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="flex-1 min-w-[240px]">
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {done} of {total} tasks complete
                </span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} />
            </div>
            <Button variant="outline" size="sm" onClick={resetAll}>
              Reset progress
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/docs/MIGRATION.md" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> docs/MIGRATION.md
              </a>
            </Button>
          </div>
        </header>

        {/* Constraints */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Read this first</AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>
              This app runs on Lovable Cloud, which manages the backend. The current project ref,
              dashboard access, service_role key, and DB password are not exposed — not to you, not
              to the Lovable agent. A native Supabase org-to-org transfer is not available.
            </p>
            <p>
              The migration is therefore a rebuild-and-replay into a fresh project you own, plus a
              data export requested from Lovable support in step 6.
            </p>
          </AlertDescription>
        </Alert>

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const stepDone = step.tasks.every((t) => checked[`${step.id}.${t.id}`]);
            return (
              <Card key={step.id} className={stepDone ? "border-primary/40" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 rounded-md p-2 ${
                          stepDone
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{step.title}</CardTitle>
                        <CardDescription className="mt-1">{step.intro}</CardDescription>
                      </div>
                    </div>
                    {stepDone && (
                      <Badge className="shrink-0" variant="default">
                        Done
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {step.tasks.map((task) => {
                    const key = `${step.id}.${task.id}`;
                    const isChecked = !!checked[key];
                    return (
                      <div
                        key={key}
                        className={`rounded-md border p-3 transition-colors ${
                          isChecked ? "border-primary/30 bg-primary/5" : "border-border"
                        } ${task.danger ? "border-destructive/30" : ""}`}
                      >
                        <label className="flex cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggle(key)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 space-y-2">
                            <p
                              className={`text-sm font-medium leading-snug ${
                                isChecked ? "text-muted-foreground line-through" : ""
                              }`}
                            >
                              {task.label}
                            </p>
                            {task.detail && (
                              <p className="text-xs text-muted-foreground">{task.detail}</p>
                            )}
                            {task.code && (
                              <div className="relative">
                                <pre className="overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                                  <code>{task.code}</code>
                                </pre>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="absolute right-1 top-1 h-6 px-2"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    copy(task.code!);
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </label>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {pct === 100 && (
          <Alert className="border-primary/50 bg-primary/5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertTitle>Migration complete</AlertTitle>
            <AlertDescription>
              Every task is checked. Confirm smoke tests pass in the new environment before
              decommissioning the Lovable Cloud instance.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </AppLayout>
  );
}
