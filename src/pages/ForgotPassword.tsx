import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import { getFriendlyError } from '@/lib/friendly-errors';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import logoDark from '@/assets/logo-dark.png';
import logoLight from '@/assets/logo-light.png';

const emailSchema = z.string().email('Please enter a valid email address');

const ForgotPassword = () => {
  const { resetPassword } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(email);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
      return;
    }

    setIsLoading(true);
    const { error } = await resetPassword(email);
    setIsLoading(false);

    if (error) {
      toast.error(getFriendlyError(error));
    } else {
      setIsEmailSent(true);
      toast.success('Password reset email sent!');
    }
  };

  // Success state - email sent
  if (isEmailSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-500/20 border-[3px] border-green-500 rounded-2xl flex items-center justify-center neo-shadow-sm">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-foreground mb-2">Check Your Email</h1>
            <p className="text-muted-foreground font-medium mb-6">
              We've sent a password reset link to <strong className="text-foreground">{email}</strong>.
              Click the link in the email to reset your password.
            </p>
            <p className="text-sm text-muted-foreground font-medium mb-6 bg-background border-[2px] border-foreground/20 rounded-xl p-3">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={() => setIsEmailSent(false)}
                className="w-full h-12 border-[2.5px] border-foreground/60 rounded-xl font-bold neo-shadow-sm neo-interactive"
              >
                Try Again
              </Button>
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <img src={theme === 'dark' ? logoDark : logoLight} alt="Ops Terminal" className="h-14 w-auto" />
        </div>

        <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/20 border-[3px] border-primary rounded-2xl flex items-center justify-center">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-center mb-2 tracking-tight text-foreground">
            Forgot Password?
          </h1>
          <p className="text-center text-muted-foreground mb-8 font-medium">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold text-xs uppercase tracking-wider">Email Address</Label>
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
            <Button
              type="submit"
              className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
              disabled={isLoading}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
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

export default ForgotPassword;
