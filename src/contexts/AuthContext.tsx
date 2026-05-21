import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  referrer: ReferrerProfile | null;
  signInWithGoogle: () => Promise<void>;
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

const getRedirectUrl = (path?: string) => {
  const envRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL;
  let baseUrl: string;

  if (envRedirect) {
    baseUrl = formatRedirectUrl(envRedirect);
  } else if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';

    if (isLocalHost) {
      baseUrl = formatRedirectUrl(window.location.origin);
    } else {
      baseUrl = DEFAULT_REDIRECT_URL;
    }
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
      setReferrerChecked(true);
      return;
    }
    // Skip the lookup for known-internal emails to avoid a wasted query.
    if (isEmailAllowed(currentUser.email)) {
      setReferrer(null);
      setReferrerChecked(true);
      return;
    }
    const cols = 'id, full_name, email, phone, active, commission_rate, monthly_cap_per_merchant, clawback_window_days, bonus_amount, bonus_milestone_count';
    // Primary lookup: auth_user_id link
    let { data } = await supabase
      .from('referrers')
      .select(cols)
      .eq('auth_user_id', currentUser.id)
      .eq('active', true)
      .maybeSingle();
    // Fallback: match by email (covers impersonation magic-links and unlinked rows)
    if (!data && currentUser.email) {
      const { data: byEmail } = await supabase
        .from('referrers')
        .select(cols)
        .ilike('email', currentUser.email)
        .eq('active', true)
        .maybeSingle();
      data = byEmail ?? null;
    }
    setReferrer((data as ReferrerProfile | null) ?? null);
    setReferrerChecked(true);
  };

  useEffect(() => {
    let isMounted = true;

    // Check for existing session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);

        // Check if password change is required
        const needsPasswordChange = session?.user?.user_metadata?.must_change_password === true;
        setMustChangePassword(needsPasswordChange);

        // Resolve referrer profile (if any) so role-based routing has data on first paint
        loadReferrerProfile(session?.user ?? null).finally(() => {
          if (isMounted) setLoading(false);
        });
      }
    }).catch(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    // Set up auth state listener for future changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);

          // Re-resolve referrer profile whenever the auth state changes
          loadReferrerProfile(session?.user ?? null);

          // Check if password change is required
          const needsPasswordChange = session?.user?.user_metadata?.must_change_password === true;
          setMustChangePassword(needsPasswordChange);
          
          // If user just changed password, clear the flag
          if (event === 'PASSWORD_RECOVERY') {
            setMustChangePassword(true);
          }

          // Track login sessions + store Google tokens + auto-sync
          if (event === 'SIGNED_IN' && session?.user) {
            // Login jingle is an internal-staff thing; skip it for external referrers.
            const jingleKey = `login_jingle_played:${session.user.id}`;
            if (!sessionStorage.getItem(jingleKey) && isEmailAllowed(session.user.email)) {
              sessionStorage.setItem(jingleKey, '1');
              playLoginJingle();
            }

            // Track login session
            supabase.from('user_sessions').insert({
              user_id: session.user.id,
              user_email: session.user.email || '',
            }).then(() => {
              supabase.from('user_sessions')
                .select('id')
                .eq('user_id', session.user.id)
                .is('logged_out_at', null)
                .order('logged_in_at', { ascending: false })
                .limit(1)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    localStorage.setItem('current_session_id', data.id);
                  }
                });
            });

            // Store Google provider token for Calendar + Gmail sync
            const providerToken = session.provider_token;
            const providerRefreshToken = session.provider_refresh_token;
            if (providerToken && session.user.email) {
              const tokenData = {
                user_email: session.user.email,
                user_id: session.user.id,
                access_token: providerToken,
                refresh_token: providerRefreshToken || '',
                expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
                scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly',
                updated_at: new Date().toISOString(),
              };
              supabase.from('google_calendar_tokens')
                .upsert(tokenData, { onConflict: 'user_email' })
                .then(() => {
                  // Auto-sync calendars and emails in background
                  supabase.functions.invoke('google-calendar-sync', {
                    body: { user_email: session.user.email },
                  }).catch(() => {});
                  supabase.functions.invoke('google-gmail-sync', {
                    body: { user_email: session.user.email },
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
          
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl(),
        scopes: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly',
        queryParams: {
          hd: 'merchanthaus.io',
          access_type: 'offline',
          prompt: 'select_account',
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
