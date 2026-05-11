import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ForcePasswordChange from './ForcePasswordChange';
import { toast } from 'sonner';

interface ReferrerRouteProps {
  children: React.ReactNode;
}

/**
 * Guards the /portal/* routes. Only referrers (and, for support/preview, internal
 * staff) may proceed. Anyone else is bounced to the auth page.
 */
export const ReferrerRoute = ({ children }: ReferrerRouteProps) => {
  const { user, loading, mustChangePassword, signOut, userRole } = useAuth();
  const hasShownToast = useRef(false);

  useEffect(() => {
    if (user && !loading && userRole === null && !hasShownToast.current) {
      hasShownToast.current = true;
      toast.error('Access denied. Your account is not authorized.');
      signOut();
    }
  }, [user, loading, userRole, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <img
          src="/favicon.png"
          alt="Referrer Portal"
          className="w-[180px] h-auto animate-pulse"
        />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Internal staff can preview the portal (e.g. for support); referrers see it natively.
  if (userRole !== 'referrer' && userRole !== 'internal') {
    return <Navigate to="/auth" replace />;
  }

  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};
