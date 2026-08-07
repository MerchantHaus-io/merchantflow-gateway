import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, Session } from '@supabase/supabase-js';
import { activeSupabase as supabase } from '@/integrations/supabase/activeClient';
import { isEmailAllowed, getTeamMemberFromEmail } from '@/types/opportunity';
import { playLoginJingle } from '@/hooks/useNotificationSound';

export interface ReferrerProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  active: boolean;
  commission_rate: number;
  monthly_cap_per_merchant: number;
  clawback_window_days: number;
  bonus_amount: number;
  bonus_milestone_count: number;
  tier?: 'standard' | 'premium' | null;
}

export type UserRole = 'internal' | 'referrer' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mustChangePassword: boolean;
  teamMemberName: string | null;
  userRole: UserRole;
  /**
   * True when the referrer lookup errored rather than returning "no row".
   * Callers should treat this as "role unknown, try again", NOT "access
   * denied" — a transient network blip must not sign a valid user out.
   */
  roleUnavailable: boolean;
  referrer: ReferrerProfile | null;
  signInWithGoogle: (redirectPath?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const DEFAULT_REDIRECT_URL = 'https://ops-terminal.merchant.haus/';

const formatRedirectUrl = (url: string) => (url.endsWith('/') ? url : `${url}/`);

/**
 * Hosts allowed to receive an auth redirect at their own origin. Anything not
 * matched here falls back to production, so a hostile host can never be handed
 * a session. Preview and staging deploys are included so auth actually works
 * there instead of bouncing the tester to production.
 */
const isTrustedAuthHost = (host: string) =>
  host === 'localhost' ||
  host === '127.0.0.1' ||
  host === 'ops-terminal.merchant.haus' ||
  host.endsWith('.lovable.app') ||
  host.endsWith('.lovableproject.com') ||
  host.endsWith('.netlify.app');

const getRedirectUrl = (path?: string) => {
  const envRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL;
  let baseUrl: string;

  if (envRedirect) {
    baseUrl = formatRedirectUrl(envRedirect);
  } else if (typeof window !== 'undefined' && isTrustedAuthHost(window.location.hostname)) {
    baseUrl = formatRedirectUrl(window.location.origin);
  } else {
    baseUrl = DEFAULT_REDIRECT_URL;
  }

  // Append path if provided (e.g., for password reset redirecting to /update-password)
  if (path) {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
  }
  return baseUrl;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [referrerChecked, setReferrerChecked] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [referrer, setReferrer] = useState<ReferrerProfile | null>(null);
  // Distinguishes "lookup errored" from "no profile exists" — see #11.
  const [referrerLookupFailed, setReferrerLookupFailed] = useState(false);
  const queryClient = useQueryClient();

  const teamMemberName = getTeamMemberFromEmail(user?.email);

  // Determined from email allowlist (internal) and the loaded referrer profile.
  const userRole: UserRole = isEmailAllowed(user?.email)
    ? 'internal'
    : referrer
      ? 'referrer'
      : null;

  // Combined loading: we're loading until auth resolves AND, if there's a user,
  // the referrer-profile lookup has completed. This prevents a race where
  // ReferrerRoute reads userRole === null before the referrer row arrives and
  // wrongly bounces a freshly-magic-linked referrer back to /auth.
  const loading = authLoading || (!!user && !isEmailAllowed(user.email) && !referrerChecked);

  // Fetch referrer profile for an authenticated user (no-op for internal staff).
  const loadReferrerProfile = async (currentUser: User | null) => {
    if (!currentUser) {
      setReferrer(null);
      setReferrerLookupFailed(false);
      setReferrerChecked(true);
      return;
    }
    // Skip the lookup for known-internal emails to avoid a wasted query.
    if (isEmailAllowed(currentUser.email)) {
      setReferrer(null);
      setReferrerLookupFailed(false);
      setReferrerChecked(true);
      return;
    }
    const cols = 'id, full_name, email, phone, active, commission_rate, monthly_cap_per_merchant, clawback_window_days, bonus_amount, bonus_milestone_count, tier';
    // Primary lookup: auth_user_id link
    const { data, error } = await supabase
      .from('referrers')
      .select(cols)
      .eq('auth_user_id', currentUser.id)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      // A transient failure is NOT the same as "no profile". Leaving the
      // previous value in place stops a blip from collapsing userRole to null
      // and signing the user out with "Access denied".
      console.error('[auth] referrer profile lookup failed:', error);
      setReferrerLookupFailed(true);
      setReferrerChecked(true);
      return;
    }

    let profile = data as ReferrerProfile | null;

    // Fallback: match by email (covers impersonation magic-links and rows an
    // admin has not linked yet). `.eq` rather than `.ilike` — an email local
    // part containing % or _ would otherwise act as a wildcard and match
    // somebody else's referrer row.
    if (!profile && currentUser.email) {
      const { data: byEmail, error: byEmailError } = await supabase
        .from('referrers')
        .select(cols)
        .eq('email', currentUser.email.toLowerCase())
        .eq('active', true)
        .maybeSingle();
      if (byEmailError) {
        console.error('[auth] referrer email fallback failed:', byEmailError);
        setReferrerLookupFailed(true);
        setReferrerChecked(true);
        return;
      }
      profile = byEmail as ReferrerProfile | null;
    }

    setReferrerLookupFailed(false);
    setReferrer(profile ?? null);
    setReferrerChecked(true);
  };

  useEffect(() => {
    let isMounted = true;
    // getSession() and onAuthStateChange both fire on boot with the same user.
    // Track the last user we resolved a profile for so we don't run the lookup
    // twice and race two `setAuthLoading(false)` calls against each other.
    let resolvedForUserId: string | null | undefined;

    const resolveProfile = (nextUser: User | null) => {
      if (resolvedForUserId === (nextUser?.id ?? null)) return Promise.resolve();
      resolvedForUserId = nextUser?.id ?? null;
      if (nextUser) setReferrerChecked(false);
      else setReferrerChecked(true);
      return loadReferrerProfile(nextUser);
    };

    // Check for existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);

        // Check if password change is required
        const needsPasswordChange = session?.user?.user_metadata?.must_change_password === true;
        setMustChangePassword(needsPasswordChange);

        // Resolve referrer profile (if any) so role-based routing has data on first paint
        resolveProfile(session?.user ?? null).finally(() => {
          if (isMounted) setAuthLoading(false);
        });
      }
    }).catch(() => {
      if (isMounted) {
        setAuthLoading(false);
        setReferrerChecked(true);
      }
    });

    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);

          // Check if password change is required. This is the only source of
          // truth for the flag — a PASSWORD_RECOVERY event used to force it to
          // true here, which trapped anyone following a normal reset link in
          // the ForcePasswordChange screen. Don't reintroduce that.
          const needsPasswordChange = session?.user?.user_metadata?.must_change_password === true;
          setMustChangePassword(needsPasswordChange);

          // NOTE: Supabase warns that calling back into the auth-aware client
          // from inside this callback can deadlock the auth lock. Everything
          // that touches the DB, edge functions, or the profile lookup is
          // therefore deferred to a macrotask so the callback returns first.
          setTimeout(() => {
            if (!isMounted) return;

            resolveProfile(session?.user ?? null);

            // Track login sessions + store Google tokens + auto-sync
            if (event === 'SIGNED_IN' && session?.user) {
              const signedInUser = session.user;

              // A fresh sign-in clears the per-tab guards from the previous user.
              sessionStorage.removeItem('access-denied-toast-shown');
              sessionStorage.removeItem('fullscreen-requested');

              // Login jingle is an internal-staff thing; skip it for external referrers.
              const jingleKey = `login_jingle_played:${signedInUser.id}`;
              if (!sessionStorage.getItem(jingleKey) && isEmailAllowed(signedInUser.email)) {
                sessionStorage.setItem(jingleKey, '1');
                playLoginJingle();
              }

              // Track login session. Return the inserted id directly — the old
              // insert-then-requery pattern let two tabs signing in at once
              // pick up each other's row.
              supabase.from('user_sessions')
                .insert({
                  user_id: signedInUser.id,
                  user_email: signedInUser.email || '',
                })
                .select('id')
                .single()
                .then(({ data, error }) => {
                  if (error) {
                    console.error('[auth] failed to record login session:', error);
                    return;
                  }
                  if (data) localStorage.setItem('current_session_id', data.id);
                });

              // Store Google provider token for Calendar + Gmail sync
              const providerToken = session.provider_token;
              const providerRefreshToken = session.provider_refresh_token;
              if (providerToken && signedInUser.email) {
                // Prefer the real lifetime Google returned; only fall back to
                // the one-hour default when the session carries no expiry.
                const expiresAt = session.expires_at
                  ? new Date(session.expires_at * 1000).toISOString()
                  : new Date(Date.now() + 3600 * 1000).toISOString();
                const tokenData = {
                  user_email: signedInUser.email,
                  user_id: signedInUser.id,
                  access_token: providerToken,
                  refresh_token: providerRefreshToken || '',
                  expires_at: expiresAt,
                  scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly',
                  updated_at: new Date().toISOString(),
                };
                supabase.from('google_calendar_tokens')
                  .upsert(tokenData, { onConflict: 'user_email' })
                  .then(({ error }) => {
                    if (error) {
                      console.error('[auth] failed to store Google token:', error);
                      return;
                    }
                    // Auto-sync calendars and emails in background
                    supabase.functions.invoke('google-calendar-sync', {
                      body: { user_email: signedInUser.email },
                    }).catch(() => {});
                    supabase.functions.invoke('google-gmail-sync', {
                      body: { user_email: signedInUser.email },
                    }).catch(() => {});
                  });
              }
            }

            if (event === 'SIGNED_OUT') {
              const sessionId = localStorage.getItem('current_session_id');
              if (sessionId) {
                supabase.from('user_sessions')
                  .update({ logged_out_at: new Date().toISOString() })
                  .eq('id', sessionId)
                  .then(() => {
                    localStorage.removeItem('current_session_id');
                  });
              }
            }
          }, 0);

          setAuthLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async (redirectPath?: string) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl(redirectPath),
        scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly',

        queryParams: {
          hd: 'merchanthaus.io',
          access_type: 'offline',
          // 'consent' (not 'select_account'): Google only returns a refresh
          // token on first consent, so reconnects were landing with an empty
          // refresh_token and no way to renew Gmail/Calendar access.
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    // No pre-check: external referrers won't match isEmailAllowed but should still
    // be allowed to authenticate. Role-based gating happens post-auth in ProtectedRoute.
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    // Self-signup is still restricted to internal staff. Referrers are admin-provisioned.
    if (!isEmailAllowed(email)) {
      return { error: new Error('Access denied. Your email is not authorized to access this dashboard.') };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl(),
      },
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl('/update-password'),
    });
    return { error };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false }
    });
    
    if (!error) {
      setMustChangePassword(false);
    }
    
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Session may already be invalidated server-side (e.g. admin sign-out-all)
    }
    // Always clear local state regardless of server response
    setUser(null);
    setSession(null);
    setMustChangePassword(false);
    setReferrer(null);
    setReferrerLookupFailed(false);
    // Without this the next user on this browser sees a flash of the previous
    // user's opportunities/tickets before the refetch lands.
    queryClient.clear();
    localStorage.removeItem('current_session_id');
    sessionStorage.removeItem('access-denied-toast-shown');
    sessionStorage.removeItem('fullscreen-requested');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        mustChangePassword,
        teamMemberName,
        userRole,
        roleUnavailable: referrerLookupFailed,
        referrer,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
