import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isEmailAllowed, getTeamMemberFromEmail } from '@/types/opportunity';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  mustChangePassword: boolean;
  teamMemberName: string | null;
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
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const teamMemberName = getTeamMemberFromEmail(user?.email);

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
        
        setLoading(false);
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
          
          // Check if password change is required
          const needsPasswordChange = session?.user?.user_metadata?.must_change_password === true;
          setMustChangePassword(needsPasswordChange);
          
          // If user just changed password, clear the flag
          if (event === 'PASSWORD_RECOVERY') {
            setMustChangePassword(true);
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
        queryParams: {
          hd: 'merchanthaus.io', // Restrict to merchanthaus.io domain only
        },
      },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    // Check if email is allowed before signing in
    if (!isEmailAllowed(email)) {
      return { error: new Error('Access denied. Your email is not authorized to access this dashboard.') };
    }
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    // Check if email is allowed before signing up
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        mustChangePassword,
        teamMemberName,
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
