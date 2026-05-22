import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { preloadAudioFile } from '@/hooks/useNotificationSound';

import merchantHausLogo from '@/assets/merchanthaus-logo.png';
import { isEmailAllowed } from '@/types/opportunity';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

const Login = () => {
  const navigate = useNavigate();

  const { user, signInWithGoogle, signInWithEmail, mustChangePassword, userRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    preloadAudioFile('/sounds/login-jingle.wav', 0.25);
  }, []);

  useEffect(() => {
    if (user && !mustChangePassword) {
      if (userRole === 'internal' || isEmailAllowed(user.email)) {
        navigate('/', { replace: true });
      } else if (userRole === 'referrer') {
        navigate('/affiliate', { replace: true });
      }
    }
  }, [user, navigate, mustChangePassword, userRole]);

  const validateInputs = () => {
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch (error) {
      toast.error('Failed to sign in with Google. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setIsLoading(true);
    const { error } = await signInWithEmail(email, password);
    setIsLoading(false);

    if (error) {
      let description = error.message;
      if (error.message === 'Invalid login credentials') {
        description = 'Invalid email or password. Please try again.';
      } else if (error.message.toLowerCase().includes('fetch')) {
        description = 'Network error. Please check your connection and try again.';
      }
      toast.error(description);
    }
  };

  return (
    <main
      className="light min-h-screen flex flex-col items-center justify-center bg-background px-4 relative overflow-hidden"
      data-theme="light"
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
        <fieldset disabled={isLoading} aria-busy={isLoading} className="contents">
        {isLoading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm animate-fade-in"
          >
            <div className="flex items-center gap-2 rounded-full bg-background border border-border px-4 py-2 shadow-md">
              <Loader2 className="h-4 w-4 animate-spin text-foreground" />
              <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Signing in
              </span>
            </div>
          </div>
        )}
        <div className="text-center mb-6">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Ops Terminal</span>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your dashboard.</p>
        </div>

        <Button
          variant="outline"
          className="w-full mb-5"
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

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                disabled={isLoading}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
              <Link
                to="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/auth" className="text-foreground hover:underline underline-offset-2">
            Sign up
          </Link>
        </p>
        </fieldset>
      </div>

      <div className="relative mt-10 flex items-center justify-center [perspective:1000px]">
        <img
          src={merchantHausLogo}
          alt="Merchant Haus"
          width={220}
          height={54}
          fetchPriority="high"
          className="h-12 w-auto opacity-90 logo-tilt"
        />
      </div>
    </main>
  );
};

export default Login;
