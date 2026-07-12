import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { getFriendlyError } from '@/lib/friendly-errors';
import merchantHausLogo from '@/assets/merchanthaus-logo.png';
import { isEmailAllowed } from '@/types/opportunity';
import ForcePasswordChange from '@/components/ForcePasswordChange';

const credSchema = z.object({
  email: z.string().trim().email({ message: 'Enter a valid email' }).max(255),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }).max(72),
});

const Auth = () => {
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, mustChangePassword, userRole } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') setIsRecoveryMode(true);
  }, []);

  // Dev/preview auto-login: only runs on localhost or id-preview--*.lovable.app.
  // Production hosts (ops-terminal.lovable.app, custom domains) are blocked
  // both client-side and by the edge function's origin check.
  useEffect(() => {
    if (user || isRecoveryMode) return;
    const host = window.location.hostname;
    const isPreview =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^id-preview--[a-z0-9-]+\.lovable\.app$/.test(host);
    if (!isPreview) return;
    if (sessionStorage.getItem('dev-autologin-attempted') === '1') return;
    sessionStorage.setItem('dev-autologin-attempted', '1');

    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data, error } = await supabase.functions.invoke('dev-autologin-credentials');
        if (error || !data?.email || !data?.password) return;
        await signInWithEmail(data.email, data.password);
      } catch (err) {
        console.warn('[dev-autologin] skipped', err);
      }
    })();
  }, [user, isRecoveryMode, signInWithEmail]);

  useEffect(() => {
    if (user && !isRecoveryMode && !mustChangePassword) {
      if (userRole === 'internal' || isEmailAllowed(user.email)) {
        navigate('/', { replace: true });
      } else if (userRole === 'referrer') {
        navigate('/affiliate', { replace: true });
      }
    }
  }, [user, navigate, isRecoveryMode, mustChangePassword, userRole]);

  const validate = () => {
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: 'Validation Error', description: parsed.error.issues[0].message, variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch {
      toast({ title: 'Error', description: 'Failed to sign in with Google.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await signUpWithEmail(email, password);
        if (error) throw error;
        toast({ title: 'Account Created', description: 'You can now sign in with your credentials.' });
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      toast({
        title: mode === 'signup' ? 'Sign Up Failed' : 'Sign In Failed',
        description: getFriendlyError(err),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    try {
      credSchema.shape.email.parse(email);
    } catch (err: any) {
      toast({ title: 'Validation Error', description: err.issues?.[0]?.message ?? 'Enter a valid email', variant: 'destructive' });
      return;
    }
    setIsResetting(true);
    const { error } = await resetPassword(email);
    setIsResetting(false);
    if (error) {
      toast({ title: 'Password Reset Failed', description: getFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Check your email', description: 'We sent a password reset link to your inbox.' });
    }
  };

  if (isRecoveryMode || mustChangePassword) return <ForcePasswordChange />;

  return (
    <main
      className="auth-page min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
    >
      <style>{`
        @keyframes auth-sweep {
          0%   { transform: translateX(-110%); opacity: 0; }
          10%  { opacity: 1; }
          50%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
      `}</style>

      {/* Animated rainbow sweep — matches Daily Spread exactly */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -inset-x-1/4"
        style={{
          background:
            'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 8%, rgba(255,210,140,0.85) 22%, rgba(255,120,180,0.8) 38%, rgba(140,90,255,0.8) 52%, rgba(80,180,255,0.85) 66%, rgba(120,255,200,0.8) 78%, rgba(255,255,255,0.9) 92%, rgba(255,255,255,0) 100%)',
          filter: 'blur(40px) saturate(1.1)',
          mixBlendMode: 'screen',
          animation: 'auth-sweep 2.6s cubic-bezier(0.22, 1, 0.36, 1) 1 forwards',
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-6">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground normal-case-none">
            merchanthaus.io
          </span>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Your Operations Terminal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in or create an account to continue.
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'signin' | 'signup')}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Register</TabsTrigger>
          </TabsList>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <fieldset disabled={isLoading} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="!text-sm !font-medium !tracking-normal !normal-case text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 bg-white border border-slate-300 rounded-md px-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="!text-sm !font-medium !tracking-normal !normal-case text-foreground">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 bg-white border border-slate-300 rounded-md px-3 pr-10 text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={isResetting}
                      className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {isResetting ? 'Sending…' : 'Forgot password?'}
                    </button>
                  )}
                </div>
              </div>
              <TabsContent value="signin" className="m-0">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</>) : 'Sign in'}
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="m-0">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account…</>) : 'Create account'}
                </Button>
              </TabsContent>
            </fieldset>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center">
              <span className="px-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground" style={{ background: '#ffffff' }}>or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-10 bg-background text-foreground border-2 border-foreground/40 hover:bg-accent hover:text-accent-foreground"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </Button>
        </Tabs>
      </div>

    </main>
  );
};

export default Auth;
