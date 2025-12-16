import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isEmailAllowed } from '@/types/opportunity';
import ForcePasswordChange from './ForcePasswordChange';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, mustChangePassword, signOut } = useAuth();

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

  // Check if user's email is allowed
  if (!isEmailAllowed(user.email)) {
    // Sign out unauthorized user
    signOut();
    return <Navigate to="/auth" replace />;
  }

  // Check if user must change password
  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};
