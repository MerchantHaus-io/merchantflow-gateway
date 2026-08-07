import { useEffect, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isEmailAllowed } from '@/types/opportunity';
import { authRedirectTo } from '@/lib/nextPath';
import { isAutoFullscreenEnabled } from '@/lib/uiPreferences';
import merchantHausLogo from '@/assets/merchant-haus-logo-full.png';
import ForcePasswordChange from './ForcePasswordChange';
import { toast } from 'sonner';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// ProtectedRoute is mounted per-route, so it unmounts and remounts on every
// navigation — any useRef guard resets with it. These flags therefore live in
// sessionStorage, which survives navigation but not a new tab or a fresh login.
const FULLSCREEN_KEY = 'fullscreen-requested';
const ACCESS_DENIED_KEY = 'access-denied-toast-shown';

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, mustChangePassword, signOut, userRole, roleUnavailable } = useAuth();
  const location = useLocation();

  // Auto-enter fullscreen on first user interaction after login.
  // Opt-in via Settings and off by default — see isAutoFullscreenEnabled().
  const requestFullscreen = useCallback(() => {
    if (sessionStorage.getItem(FULLSCREEN_KEY)) return;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      // Record the attempt before awaiting: if the user presses Esc we must not
      // re-prompt on the next page + next click.
      sessionStorage.setItem(FULLSCREEN_KEY, '1');
      document.documentElement.requestFullscreen().catch(() => {
        // Silently fail if browser blocks it
      });
    }
    document.removeEventListener('click', requestFullscreen);
    document.removeEventListener('touchstart', requestFullscreen);
  }, []);

  useEffect(() => {
    if (!isAutoFullscreenEnabled()) return;
    if (sessionStorage.getItem(FULLSCREEN_KEY)) return;
    if (user && isEmailAllowed(user.email) && !document.fullscreenElement) {
      document.addEventListener('click', requestFullscreen, { once: true });
      document.addEventListener('touchstart', requestFullscreen, { once: true });
      return () => {
        document.removeEventListener('click', requestFullscreen);
        document.removeEventListener('touchstart', requestFullscreen);
      };
    }
  }, [user, requestFullscreen]);

  // Handle truly unauthorized users (neither internal nor referrer).
  // `roleUnavailable` means the profile lookup errored — that is "unknown",
  // not "denied", so we must not sign the user out over a transient blip.
  useEffect(() => {
    if (
      user &&
      !loading &&
      userRole === null &&
      !roleUnavailable &&
      !sessionStorage.getItem(ACCESS_DENIED_KEY)
    ) {
      sessionStorage.setItem(ACCESS_DENIED_KEY, '1');
      toast.error('Access denied. Your account is not authorized.');
      signOut();
    }
  }, [user, loading, userRole, roleUnavailable, signOut]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {/* #97: was /favicon.png scaled to 180px — a favicon upscaled ~4x is
            visibly soft on a retina display. Use the full-resolution logo. */}
        <img
          src={merchantHausLogo}
          alt="Ops Terminal"
          className="w-[180px] h-auto animate-pulse"
        />
      </div>
    );
  }

  // Preserve where the user was heading so a deep link from email or Slack
  // survives the sign-in round trip.
  if (!user) {
    return <Navigate to={authRedirectTo(location.pathname, location.search)} replace />;
  }

  // Role lookup failed rather than returning "no profile" — offer a retry
  // instead of bouncing the user to the sign-in screen.
  if (roleUnavailable && userRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-lg font-semibold text-foreground">Couldn't verify your access</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't reach the server to confirm your account. Check your connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Referrers belong on the portal, not the internal CRM
  if (userRole === 'referrer') {
    return <Navigate to="/affiliate" replace />;
  }

  // Anyone else without a recognized role gets bounced
  if (userRole !== 'internal') {
    return <Navigate to={authRedirectTo(location.pathname, location.search)} replace />;
  }

  // Check if user must change password
  if (mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};
