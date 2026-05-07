import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Check, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

const evaluatePassword = (pw: string) => {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  const colors = [
    'bg-destructive',
    'bg-destructive',
    'bg-amber-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-emerald-600',
  ];
  return { checks, score, label: labels[score], colorClass: colors[score], percent: (score / 5) * 100 };
};
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { getFriendlyError } from '@/lib/friendly-errors';
import psTerminalLogo from '@/assets/ps-terminal-logo.png';
import merchantHausLogo from '@/assets/merchanthaus-logo.png';
import { isEmailAllowed } from '@/types/opportunity';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { supabase } from '@/integrations/supabase/client';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

const Auth = () => {
  const navigate = useNavigate();
  
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, mustChangePassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // Check if this is a password recovery flow
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setIsRecoveryMode(true);
    }
  }, []);

  useEffect(() => {
    if (user && !isRecoveryMode && !mustChangePassword) {
      // Verify user email is allowed before redirecting
      if (isEmailAllowed(user.email)) {
        navigate('/', { replace: true });
      }
    }
  }, [user, navigate, isRecoveryMode, mustChangePassword]);

  const validateInputs = () => {
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation Error',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      }
      return false;
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign in with Google. Please try again.',
        variant: 'destructive',
      });
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
      toast({
        title: 'Sign In Failed',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setIsLoading(true);
    const { error } = await signUpWithEmail(email, password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Sign Up Failed',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Account Created',
        description: 'You can now sign in with your credentials.',
      });
    }
  };

  const handlePasswordReset = async () => {
    try {
      emailSchema.parse(email);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Validation Error',
          description: error.errors[0].message,
          variant: 'destructive',
        });
      }
      return;
    }

    setIsResetting(true);
    const { error } = await resetPassword(email);
    setIsResetting(false);

    if (error) {
      toast({
        title: 'Password Reset Failed',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Check your email',
        description: 'We sent a password reset link to your inbox.',
      });
    }
  };

  // If in recovery mode or must change password, show the password change screen
  if (isRecoveryMode || mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return (
    <main
      className="light min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-4 relative overflow-hidden"
      data-theme="light"
      style={{ fontFamily: '"EB Garamond", Garamond, "Times New Roman", serif' }}
    >
      <style>{`
        @keyframes auth-sweep {
          0%   { transform: translateX(-110%); opacity: 0; }
          10%  { opacity: 1; }
          50%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        @keyframes ink-fade {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .auth-ink > * {
          opacity: 0;
          animation: ink-fade 700ms ease-out forwards;
        }
        .auth-ink > *:nth-child(1) { animation-delay: 120ms; }
        .auth-ink > *:nth-child(2) { animation-delay: 260ms; }
        .auth-ink > *:nth-child(3) { animation-delay: 400ms; }
        .auth-ink > *:nth-child(4) { animation-delay: 540ms; }
        .auth-ink > *:nth-child(5) { animation-delay: 680ms; }
        .auth-ink > *:nth-child(6) { animation-delay: 820ms; }
        .auth-ink > *:nth-child(7) { animation-delay: 960ms; }
      `}</style>

      {/* Animated rainbow sweep */}
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

      <div className="relative w-full max-w-sm auth-ink">
        <div className="text-center mb-8">
          <span className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground font-sans">
            merchanthaus.io · Operations Terminal
          </span>
          <h1 className="mt-3 text-3xl font-semibold text-foreground tracking-tight">
            Your private terminal
          </h1>
          <p className="mt-2 text-sm text-muted-foreground italic">
            Sign in to continue to your pipeline.
          </p>
        </div>

        <Button
          variant="outline"
          className="w-full mb-5 h-11 rounded-md font-sans text-sm font-medium"
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
            <span className="bg-background px-3 text-[10px] uppercase tracking-[0.28em] text-muted-foreground font-sans">
              or
            </span>
          </div>
        </div>

        <form onSubmit={handleEmailSignIn} className="space-y-4 font-sans">
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="text-xs font-medium text-foreground">Email</Label>
            <Input
              id="signin-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password" className="text-xs font-medium text-foreground">Password</Label>
            <div className="relative">
              <Input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password && (() => {
              const { checks, score, label, colorClass, percent } = evaluatePassword(password);
              const items: Array<[keyof typeof checks, string]> = [
                ['length', 'At least 8 characters'],
                ['upper', 'Uppercase letter'],
                ['lower', 'Lowercase letter'],
                ['number', 'Number'],
                ['symbol', 'Symbol'],
              ];
              return (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground">Strength</span>
                    <span className={score >= 4 ? 'text-emerald-600' : score >= 2 ? 'text-amber-600' : 'text-destructive'}>
                      {label}
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-foreground/10 overflow-hidden">
                    <div className={`h-full ${colorClass} transition-all duration-300`} style={{ width: `${percent}%` }} />
                  </div>
                  <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1">
                    {items.map(([key, text]) => (
                      <li
                        key={key}
                        className={`flex items-center gap-1.5 text-[10px] ${
                          checks[key] ? 'text-emerald-600' : 'text-muted-foreground'
                        }`}
                      >
                        {checks[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-50" />}
                        {text}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">Minimum 6 characters.</p>
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isResetting || isLoading}
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-50"
              >
                {isResetting ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full h-11 rounded-md text-sm font-medium" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>

      {/* Bottom Merchant Haus logo */}
      <div className="relative mt-12 flex items-center justify-center">
        <img
          src={merchantHausLogo}
          alt="Merchant Haus"
          width={180}
          height={44}
          className="h-10 w-auto opacity-80"
        />
      </div>
    </main>
  );
};

export default Auth;
