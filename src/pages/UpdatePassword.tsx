import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { getFriendlyError } from '@/lib/friendly-errors';
import { useTheme } from '@/contexts/ThemeContext';
import logoDark from '@/assets/logo-dark.png';
import logoLight from '@/assets/logo-light.png';

const UpdatePassword = () => {
  const navigate = useNavigate();
  const { updatePassword, user, session } = useAuth();
  const { theme } = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    // Check hash fragments (implicit flow)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hashType = hashParams.get('type');

    // Check query params for PKCE code
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (hashType === 'recovery' || session) {
      setIsValidSession(true);
      return;
    }

    // If there's a PKCE code, wait for the auth state change to exchange it
    if (code) {
      // Don't set invalid yet — Supabase will exchange the code automatically
      return;
    }

    // No recovery indicators found
    setIsValidSession(false);
  }, [session]);

  // Listen for PASSWORD_RECOVERY event from Supabase auth
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const { error } = await updatePassword(newPassword);
    setIsLoading(false);

    if (error) {
      toast.error(getFriendlyError(error));
    } else {
      setIsSuccess(true);
      toast.success('Password updated successfully!');
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-500/20 border-[3px] border-green-500 rounded-2xl flex items-center justify-center neo-shadow-sm">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Password Updated!</h1>
            <p className="text-muted-foreground font-medium mb-8">
              Your password has been successfully updated. You can now sign in with your new password.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
            >
              Continue to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Invalid session - no recovery token
  if (isValidSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-yellow-500/20 border-[3px] border-yellow-500 rounded-2xl flex items-center justify-center neo-shadow-sm">
                <AlertTriangle className="h-10 w-10 text-yellow-500" />
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Invalid or Expired Link</h1>
            <p className="text-muted-foreground font-medium mb-8">
              This password reset link is invalid or has expired. Please request a new password reset link.
            </p>
            <div className="space-y-3">
              <Link to="/forgot-password">
                <Button className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive">
                  Request New Reset Link
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  variant="ghost"
                  className="w-full h-12 rounded-xl font-bold"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <img src={theme === 'dark' ? logoDark : logoLight} alt="Ops Terminal" className="h-14 w-auto" />
        </div>

        <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/20 border-[3px] border-primary rounded-2xl flex items-center justify-center">
              <Lock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center mb-2 tracking-tight text-foreground">
            Set New Password
          </h1>
          <p className="text-center text-muted-foreground mb-8 font-medium">
            Please enter your new password below.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {user?.email && (
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold text-xs uppercase tracking-wider">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="border-[2.5px] border-foreground/20 rounded-xl h-12 bg-muted font-medium"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-bold text-xs uppercase tracking-wider">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                  disabled={isLoading}
                  className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                Password must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-bold text-xs uppercase tracking-wider">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={8}
                disabled={isLoading}
                className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login">
              <Button variant="ghost" className="text-muted-foreground font-bold rounded-xl">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdatePassword;
