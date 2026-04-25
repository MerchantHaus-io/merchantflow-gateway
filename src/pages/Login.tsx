import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import { preloadAudioFile } from '@/hooks/useNotificationSound';

import merchantHausLogo from '@/assets/merchanthaus-logo.png';
import { isEmailAllowed } from '@/types/opportunity';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

const Login = () => {
  const navigate = useNavigate();
  
  const { user, signInWithGoogle, signInWithEmail, mustChangePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Warm the login jingle so it plays instantly after auth
    preloadAudioFile('/sounds/login-jingle.wav', 0.25);
  }, []);

  useEffect(() => {
    if (user && !mustChangePassword) {
      if (isEmailAllowed(user.email)) {
        navigate('/', { replace: true });
      }
    }
  }, [user, navigate, mustChangePassword]);

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
    <div className="light min-h-screen flex items-center justify-center bg-white text-black p-4" data-theme="light">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <img src={merchantHausLogo} alt="Merchant Haus" width={293} height={72} fetchPriority="high" className="h-[4.5rem] w-auto" />
        </div>

        <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow">
          <h1 className="text-3xl font-black text-center mb-1 tracking-tight text-foreground">
            Welcome Back
          </h1>
          <p className="text-center text-muted-foreground mb-8 font-medium">
            Sign in to access your dashboard
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

          <form onSubmit={handleEmailSignIn} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold text-xs uppercase tracking-wider">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="font-bold text-xs uppercase tracking-wider">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm font-bold text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t-[2.5px] border-dashed border-foreground/20 text-center space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              Don't have an account?{' '}
              <Link to="/auth" className="text-primary font-bold hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
