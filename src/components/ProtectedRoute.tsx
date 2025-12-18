import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isEmailAllowed } from '@/types/opportunity';
import ForcePasswordChange from './ForcePasswordChange';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, mustChangePassword, signOut } = useAuth();
  const hasShownToast = useRef(false);

  // Handle unauthorized email sign out with feedback
  useEffect(() => {
    if (user && !isEmailAllowed(user.email) && !hasShownToast.current) {
      hasShownToast.current = true;
      toast.error('Access denied. Only @merchanthaus.io emails are allowed.');
      signOut();
    }
  }, [user, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user's email is allowed (also handled in useEffect for feedback)
  if (!isEmailAllowed(user.email)) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user must change password
  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};
