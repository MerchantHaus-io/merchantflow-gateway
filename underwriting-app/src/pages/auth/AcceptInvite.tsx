import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

export default function AcceptInvite() {
  const { session } = useAuth();
  const { refresh } = useTenant();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");

  const accept = async () => {
    setStatus("working");
    const { error } = await supabase.rpc("accept_invite", { p_token: token });
    if (error) {
      setStatus("error");
      toast.error(error.message);
      return;
    }
    await refresh();
    toast.success("You've joined the workspace");
    navigate("/cases");
  };

  // Auto-accept once signed in with a token present.
  useEffect(() => {
    if (session && token && status === "idle") void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, token]);

  if (!token) return <Navigate to="/login" replace />;
  if (!session) {
    // Preserve the token through auth.
    return <Navigate to={`/login`} replace state={{ inviteToken: token }} />;
  }

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>Join the workspace you were invited to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "working" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Joining…
            </div>
          ) : (
            <Button className="w-full" onClick={() => void accept()}>Accept invite</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
