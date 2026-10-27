import { Link } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Phase 0 placeholder. Stripe Checkout/Portal + PlanGate enforcement land in
// Phase 1; this surfaces the plan/trial state already tracked on the org.
export default function BillingPage() {
  const { org } = useTenant();
  if (!org) return null;

  const trialEnds = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const daysLeft = trialEnds
    ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 864e5))
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <nav className="flex gap-3 text-sm text-muted-foreground">
          <Link to="/settings" className="hover:text-foreground">Settings</Link>
          <Link to="/settings/members" className="hover:text-foreground">Members</Link>
        </nav>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan</CardTitle>
          <CardDescription>Subscription management arrives in Phase 1 (Stripe).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current plan</span>
            <Badge variant="secondary">{org.plan}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant="outline">{org.subscription_status}</Badge>
          </div>
          {daysLeft != null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Trial</span>
              <span>{daysLeft} day{daysLeft === 1 ? "" : "s"} left</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
