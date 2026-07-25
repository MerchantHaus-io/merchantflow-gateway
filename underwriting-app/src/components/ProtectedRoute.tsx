import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/spinner";

function FullScreenSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

/**
 * Gate for authenticated, org-scoped pages. Redirects to /login when signed out
 * and to /create-org when the user has no org yet. Wraps children in AppShell.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { loading: tenantLoading, needsOrg } = useTenant();

  if (authLoading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (tenantLoading) return <FullScreenSpinner />;
  if (needsOrg) return <Navigate to="/create-org" replace />;

  return <AppShell>{children}</AppShell>;
}
