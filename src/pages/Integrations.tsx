import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, RefreshCw, Mail, Calendar as CalendarIcon, Plug } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type GoogleToken = {
  user_email: string;
  expires_at: string;
  scopes: string | null;
};

// Mailboxes the team relies on for inbound merchant docs / sync
const TRACKED_MAILBOXES: { email: string; label: string; purpose: string }[] = [
  { email: "sales@merchanthaus.io", label: "Sales", purpose: "Inbound merchant referrals & document attachments" },
  { email: "darryn@merchanthaus.io", label: "Darryn", purpose: "QA, complex sales & underwriting correspondence" },
  { email: "admin@merchanthaus.io", label: "Admin", purpose: "Internal coordination & calendar invitations" },
  { email: "onboarding@merchanthaus.io", label: "Onboarding", purpose: "Merchant onboarding correspondence" },
];

function getTokenStatus(token: GoogleToken | undefined): "missing" | "expired" | "expiring" | "active" {
  if (!token) return "missing";
  const expiresAt = new Date(token.expires_at).getTime();
  const now = Date.now();
  if (expiresAt < now) return "expired";
  // Warn 24h before expiry — refresh tokens normally rotate, but stale refresh tokens can fail silently
  if (expiresAt - now < 24 * 60 * 60 * 1000) return "expiring";
  return "active";
}

export default function Integrations() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<GoogleToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, []);

  async function fetchTokens() {
    setLoading(true);
    const { data, error } = await supabase
      .from("google_calendar_tokens")
      .select("user_email, expires_at, scopes");
    if (error) {
      console.error("Failed to load tokens", error);
      toast.error("Failed to load integration status");
    }
    setTokens((data as GoogleToken[]) || []);
    setLoading(false);
  }

  async function handleConnect(mailbox: string) {
    if (user?.email?.toLowerCase() !== mailbox.toLowerCase()) {
      toast.error(
        `You're signed in as ${user?.email}. Please sign in to the CRM as ${mailbox} first, then return here to reconnect.`,
        { duration: 8000 }
      );
      return;
    }
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
        body: { user_email: user?.email, user_id: user?.id },
      });
      if (error || !data?.url) {
        toast.error("Failed to start Google connection.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Google connection.");
    } finally {
      setConnecting(false);
    }
  }

  // Find the sales@ token specifically for the prominent banner
  const salesToken = tokens.find(
    (t) => t.user_email.toLowerCase() === "sales@merchanthaus.io"
  );
  const salesStatus = getTokenStatus(salesToken);
  const showSalesBanner = !loading && (salesStatus === "expired" || salesStatus === "missing" || salesStatus === "expiring");

  // Other mailboxes that need attention (besides sales@ which gets its own banner)
  const otherExpired = TRACKED_MAILBOXES
    .filter((m) => m.email !== "sales@merchanthaus.io")
    .map((m) => ({ ...m, token: tokens.find((t) => t.user_email.toLowerCase() === m.email.toLowerCase()) }))
    .filter((m) => {
      const s = getTokenStatus(m.token);
      return s === "expired" || s === "missing";
    });

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <PageHeader
          title="Integrations"
          description="Connected services that power email, calendar and document sync"
          icon={Plug}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Prominent sales@ reconnect banner */}
          {showSalesBanner && (
            <Alert
              variant={salesStatus === "expiring" ? "default" : "destructive"}
              className="border-2 shadow-lg"
            >
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="text-base font-semibold">
                {salesStatus === "missing" && "sales@merchanthaus.io is not connected"}
                {salesStatus === "expired" && "sales@merchanthaus.io Gmail token has expired"}
                {salesStatus === "expiring" && "sales@merchanthaus.io Gmail token expires soon"}
              </AlertTitle>
              <AlertDescription className="mt-2 space-y-3">
                <p className="text-sm">
                  {salesStatus === "missing" && (
                    <>The Sales mailbox isn't linked to the CRM. Inbound merchant emails and attachments from <strong>sales@merchanthaus.io</strong> won't sync until it's connected.</>
                  )}
                  {salesStatus === "expired" && (
                    <>
                      The Google authorization for <strong>sales@merchanthaus.io</strong> expired{" "}
                      {salesToken ? formatDistanceToNow(new Date(salesToken.expires_at), { addSuffix: true }) : ""}.
                      New merchant emails and document attachments will not be pulled into opportunities until it's reconnected.
                    </>
                  )}
                  {salesStatus === "expiring" && (
                    <>
                      The Google authorization for <strong>sales@merchanthaus.io</strong> expires{" "}
                      {salesToken ? formatDistanceToNow(new Date(salesToken.expires_at), { addSuffix: true }) : "soon"}.
                      Reconnect now to avoid sync interruptions.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => handleConnect("sales@merchanthaus.io")}
                    disabled={connecting}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${connecting ? "animate-spin" : ""}`} />
                    Reconnect sales@merchanthaus.io
                  </Button>
                  {user?.email?.toLowerCase() !== "sales@merchanthaus.io" && (
                    <span className="text-xs opacity-80">
                      You'll need to sign in to the CRM as <strong>sales@merchanthaus.io</strong> first.
                    </span>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Secondary banner for other expired mailboxes */}
          {otherExpired.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Other mailboxes need attention</AlertTitle>
              <AlertDescription className="mt-2">
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {otherExpired.map((m) => (
                    <li key={m.email}>
                      <strong>{m.email}</strong> —{" "}
                      {getTokenStatus(m.token) === "missing"
                        ? "not connected"
                        : `expired ${formatDistanceToNow(new Date(m.token!.expires_at), { addSuffix: true })}`}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Google Workspace card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    <CalendarIcon className="h-5 w-5" />
                    Google Workspace
                  </CardTitle>
                  <CardDescription>
                    Gmail sync (incoming merchant emails & attachments) and Calendar sync (team events)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading mailbox status…</p>
              ) : (
                TRACKED_MAILBOXES.map((mb) => {
                  const token = tokens.find(
                    (t) => t.user_email.toLowerCase() === mb.email.toLowerCase()
                  );
                  const status = getTokenStatus(token);
                  return (
                    <div
                      key={mb.email}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border bg-card"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{mb.email}</span>
                          {status === "active" && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </Badge>
                          )}
                          {status === "expiring" && (
                            <Badge variant="outline" className="gap-1 text-xs border-warning text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              Expiring soon
                            </Badge>
                          )}
                          {status === "expired" && (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              Expired
                            </Badge>
                          )}
                          {status === "missing" && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              Not connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{mb.purpose}</p>
                        {token && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Token {status === "expired" ? "expired" : "expires"}{" "}
                            {format(new Date(token.expires_at), "PPp")} (
                            {formatDistanceToNow(new Date(token.expires_at), { addSuffix: true })})
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={status === "active" ? "outline" : "default"}
                        onClick={() => handleConnect(mb.email)}
                        disabled={connecting}
                        className="gap-2 shrink-0"
                      >
                        <RefreshCw className={`h-4 w-4 ${connecting ? "animate-spin" : ""}`} />
                        {status === "missing" ? "Connect" : "Reconnect"}
                      </Button>
                    </div>
                  );
                })
              )}
              <p className="text-xs text-muted-foreground pt-2">
                To reconnect a mailbox you must first sign in to the CRM with that Google account, then click Reconnect.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
