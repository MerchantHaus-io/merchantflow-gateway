import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    || `org-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CreateOrgPage() {
  const { session } = useAuth();
  const { org, refresh } = useTenant();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  if (org) return <Navigate to="/cases" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // Unique slug: append a short suffix to avoid collisions across tenants.
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabase.rpc("bootstrap_org", { p_name: name, p_slug: slug });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    await refresh();
    setBusy(false);
    toast.success("Workspace created");
    navigate("/cases");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            Name your ISO / agency. You can add branding and teammates afterward in Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Payments" required />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
              Create workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
