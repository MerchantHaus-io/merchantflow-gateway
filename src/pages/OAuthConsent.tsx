import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck } from 'lucide-react';

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

const oauth = () =>
  (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get('authorization_id') ?? '';
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError('Missing authorization_id in the request URL.');
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = '/login?next=' + encodeURIComponent(next);
        return;
      }
      if (active) setAccountEmail(sess.session.user.email ?? null);
      const { data, error: detailsError } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const switchAccount = async () => {
    const next = window.location.pathname + window.location.search;
    await supabase.auth.signOut();
    window.location.href = '/login?next=' + encodeURIComponent(next);
  };


  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error: decideError } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError('No redirect was returned by the authorization server.');
      return;
    }
    window.location.href = target;
  };

  return (
    <main className="light min-h-screen flex items-center justify-center bg-background px-4" data-theme="light">
      <div className="w-full max-w-md">
        {error ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-semibold text-foreground">Authorization unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">
              Close this window and start the connection again from your AI client.
            </p>
          </div>
        ) : !details ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs uppercase tracking-[0.2em]">Loading request</span>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Ops Terminal</span>
              <h1 className="text-2xl font-semibold text-foreground">
                Connect {details.client?.name ?? 'an app'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {details.client?.name ?? 'This client'} is requesting access to The Ops Terminal on your behalf.
                It will see only the data your account can already access.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Access runs as your user account. You can revoke it at any time by disconnecting the
                integration in the client that requested it.
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
                Deny
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
                {busy ? 'Working…' : 'Approve'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default OAuthConsent;
