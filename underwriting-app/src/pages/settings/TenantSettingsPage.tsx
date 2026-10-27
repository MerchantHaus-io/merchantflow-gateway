import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export default function TenantSettingsPage() {
  const { org, settings, role, refresh } = useTenant();
  const isAdmin = role === "owner" || role === "admin";
  const [productName, setProductName] = useState(settings?.product_name ?? "");
  const [primaryColor, setPrimaryColor] = useState(settings?.primary_color ?? "");
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url ?? "");
  const [threshold, setThreshold] = useState(
    String((settings?.house_rules as Record<string, unknown>)?.foundation_tier_threshold ?? 50000),
  );
  const [busy, setBusy] = useState(false);

  if (!org || !settings) return null;

  const save = async () => {
    setBusy(true);
    const house = { ...(settings.house_rules as Record<string, unknown>) };
    const n = Number(threshold);
    if (!Number.isNaN(n)) house.foundation_tier_threshold = n;
    const { error } = await supabase
      .from("org_settings")
      .update({
        product_name: productName || "Underwriting",
        primary_color: primaryColor || null,
        logo_url: logoUrl || null,
        house_rules: house as unknown as Json,
      })
      .eq("org_id", org.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("Settings saved");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <Link to="/settings/members" className="hover:text-foreground">Members</Link>
          <Link to="/settings/billing" className="hover:text-foreground">Billing</Link>
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Branding</CardTitle>
          <CardDescription>
            Your product name, color, and logo. Changes apply across the app immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pn">Product name</Label>
            <Input id="pn" value={productName} onChange={(e) => setProductName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc">Primary color (hex or "H S% L%")</Label>
            <Input id="pc" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#2563eb" disabled={!isAdmin} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lu">Logo URL</Label>
            <Input id="lu" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" disabled={!isAdmin} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Underwriting rules</CardTitle>
          <CardDescription>House rules the AI review applies for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ft">Foundation tier threshold ($ monthly volume)</Label>
            <Input id="ft" value={threshold} onChange={(e) => setThreshold(e.target.value)} disabled={!isAdmin} />
            <p className="text-xs text-muted-foreground">
              At or below this monthly volume, processing history isn't required.
            </p>
          </div>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Button onClick={save} disabled={busy}>Save settings</Button>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners and admins can change settings.</p>
      )}
    </div>
  );
}
