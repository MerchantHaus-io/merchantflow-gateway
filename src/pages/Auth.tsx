import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import psTerminalLogo from '@/assets/ps-terminal-logo.png';
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
      let description = error.message;
      if (error.message === 'Invalid login credentials') {
        description = 'Invalid email or password. Please try again.';
      } else if (error.message.toLowerCase().includes('fetch')) {
        description = 'Network error. Please check your connection and try again.';
      }
      toast({
        title: 'Sign In Failed',
        description,
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
      let description = error.message;
      if (error.message.includes('already registered')) {
        description = 'This email is already registered. Please sign in instead.';
      } else if (error.message.toLowerCase().includes('fetch')) {
        description = 'Network error. Please check your connection and try again.';
      }
      toast({
        title: error.message.includes('already registered') ? 'Account Exists' : 'Sign Up Failed',
        description,
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
        description: error.message || 'Unable to send reset email. Please try again.',
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow">
          <div className="flex items-center justify-center mb-6">
            <img src={psTerminalLogo} alt="PS Terminal" className="h-[4.5rem] w-auto" />
          </div>
          <p className="text-center text-muted-foreground mb-8 font-medium">
            Sign in to access your pipeline
          </p>

          <Button
            variant="outline"
            className="w-full mb-6 border-[2.5px] border-foreground/60 rounded-xl h-12 font-bold neo-shadow-sm neo-interactive"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-[2.5px] border-dashed border-foreground/20" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                or
              </span>
            </div>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-14 border-[2.5px] border-foreground/60 rounded-xl p-1.5 bg-background">
              <TabsTrigger
                value="signin"
                className="rounded-lg font-black text-sm uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="rounded-lg font-black text-sm uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="min-h-[280px]">
              <form onSubmit={handleEmailSignIn} className="space-y-5 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="font-bold text-xs uppercase tracking-wider">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="font-bold text-xs uppercase tracking-wider">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="px-0 text-sm font-bold text-primary"
                      onClick={handlePasswordReset}
                      disabled={isResetting || isLoading}
                    >
                      {isResetting ? 'Sending reset link...' : 'Forgot password?'}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="min-h-[280px]">
              <form onSubmit={handleEmailSignUp} className="space-y-5 mt-6">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="font-bold text-xs uppercase tracking-wider">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="font-bold text-xs uppercase tracking-wider">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Auth;
