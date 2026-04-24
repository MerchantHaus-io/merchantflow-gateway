import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TARGET_MAILBOX = "sales@merchanthaus.io";
const DISMISS_KEY = "gmail-reconnect-banner-dismissed-sales";
// Re-show 30 minutes after dismissal so the user isn't nagged constantly,
// but also doesn't miss it for the rest of the session.
const DISMISS_TTL_MS = 30 * 60 * 1000;

type Status = "loading" | "ok" | "expired" | "missing";

export function GmailReconnectBanner() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [connecting, setConnecting] = useState(false);

  const isTargetUser = user?.email?.toLowerCase() === TARGET_MAILBOX;
  // The Integrations page already shows the same prompt — don't double up there.
  const onIntegrationsPage = location.pathname.startsWith("/integrations");

  // Check dismissal state on mount / user change
  useEffect(() => {
    if (!isTargetUser) return;
    try {
      const raw = sessionStorage.getItem(DISMISS_KEY);
      if (!raw) {
        setDismissed(false);
        return;
      }
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
        setDismissed(true);
      } else {
        sessionStorage.removeItem(DISMISS_KEY);
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, [isTargetUser]);

  // Fetch token status
  useEffect(() => {
    let cancelled = false;
    if (!isTargetUser) {
      setStatus("loading");
      return;
    }

    const fetchStatus = async () => {
      const { data, error } = await supabase
        .from("google_calendar_tokens")
        .select("expires_at")
        .eq("user_email", TARGET_MAILBOX)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        // Don't block UI on read errors — just skip the banner.
        console.warn("GmailReconnectBanner: failed to load token status", error);
        setStatus("ok");
        return;
      }

      if (!data) {
        setStatus("missing");
        setExpiresAt(null);
        return;
      }

      const exp = new Date(data.expires_at);
      setExpiresAt(exp);
      setStatus(exp.getTime() < Date.now() ? "expired" : "ok");
    };

    fetchStatus();
    // Re-poll every 5 minutes so the banner appears once a token expires
    // mid-session without requiring a page reload.
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isTargetUser, user?.id]);

  const handleReconnect = async () => {
    if (!user?.email || !user?.id) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
        body: { user_email: user.email, user_id: user.id },
      });
      if (error || !data?.url) {
        toast.error("Failed to start Google reconnect.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Google reconnect.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  if (
    !isTargetUser ||
    onIntegrationsPage ||
    dismissed ||
    status === "loading" ||
    status === "ok"
  ) {
    return null;
  }

  const expiredLabel =
    status === "missing"
      ? "Gmail isn't connected for this mailbox."
      : expiresAt
      ? `Gmail authorization expired ${expiresAt.toLocaleString()}.`
      : "Gmail authorization has expired.";

  return (
    <div
      className={cn(
        "flex-shrink-0 border-b border-destructive/30",
        "bg-destructive/10 backdrop-blur-sm",
        "px-4 lg:px-6 py-2.5"
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-semibold text-destructive">Action required:</span>{" "}
          <span className="text-foreground/90">
            {expiredLabel} Inbound merchant emails and document attachments won't sync until you reconnect{" "}
            <strong>{TARGET_MAILBOX}</strong>.
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleReconnect}
            disabled={connecting}
            className="h-8"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", connecting && "animate-spin")} />
            Reconnect {TARGET_MAILBOX}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/integrations")}
            className="h-8"
          >
            Details
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
