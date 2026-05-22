import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { getFriendlyError } from '@/lib/friendly-errors';
import { useTheme } from '@/contexts/ThemeContext';
import logoDark from '@/assets/ps-terminal-logo.png';
import logoLight from '@/assets/ps-terminal-logo.png';

const ForcePasswordChange = () => {
  const { updatePassword, user, teamMemberName } = useAuth();
  const { theme } = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      toast.success('Password updated successfully!');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <img src={theme === 'dark' ? logoDark : logoLight} alt="Ops Terminal" className="h-14 w-auto" />
        </div>

        <div className="bg-card border-[3px] border-foreground/80 rounded-2xl p-8 neo-shadow">
          <h1 className="text-3xl font-black text-center mb-2 tracking-tight text-foreground">
            Welcome{teamMemberName ? `, ${teamMemberName}` : ''}!
          </h1>
          <p className="text-center text-muted-foreground mb-8 font-medium">
            For security, please set a new password to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="font-bold text-xs uppercase tracking-wider">Email</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ''}
                disabled
                className="border-[2.5px] border-foreground/20 rounded-xl h-12 bg-muted font-medium"
              />
            </div>

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
                className="border-[2.5px] border-foreground/40 rounded-xl h-12 bg-background font-medium neo-shadow-xs neo-input transition-all"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-primary text-primary-foreground border-[2.5px] border-foreground/80 rounded-xl font-black text-base neo-shadow-sm neo-interactive"
              disabled={isLoading}
            >
              <Lock className="mr-2 h-4 w-4" />
              {isLoading ? 'Updating...' : 'Set New Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
