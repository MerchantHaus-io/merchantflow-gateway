import { useEffect, useRef, useCallback } from 'react';
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
  const hasRequestedFullscreen = useRef(false);

  // Auto-enter fullscreen on first user interaction after login
  const requestFullscreen = useCallback(() => {
    if (hasRequestedFullscreen.current) return;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      hasRequestedFullscreen.current = true;
      document.documentElement.requestFullscreen().catch(() => {
        // Silently fail if browser blocks it
      });
    }
    // Clean up listeners after first attempt
    document.removeEventListener('click', requestFullscreen);
    document.removeEventListener('touchstart', requestFullscreen);
  }, []);

  useEffect(() => {
    if (user && isEmailAllowed(user.email) && !document.fullscreenElement) {
      document.addEventListener('click', requestFullscreen, { once: true });
      document.addEventListener('touchstart', requestFullscreen, { once: true });
      return () => {
        document.removeEventListener('click', requestFullscreen);
        document.removeEventListener('touchstart', requestFullscreen);
      };
    }
  }, [user, requestFullscreen]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <img
          src="/favicon.png"
          alt="Ops Terminal"
          className="w-[180px] h-auto animate-pulse"
        />
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
