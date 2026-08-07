/**
 * Post-login redirect ("?next=") helpers.
 *
 * A user who follows a deep link from email or Slack (e.g. /opportunities/:id)
 * while signed out gets bounced to the auth screen. Without capturing where
 * they were headed we drop them on the dashboard and they have to find the
 * record again. ProtectedRoute encodes the intended URL as ?next=... and the
 * auth screens honour it once the session resolves.
 */

/**
 * Validate a `next` value before navigating to it.
 *
 * Only same-origin relative paths are allowed — an attacker-supplied absolute
 * URL ("https://evil.example") or protocol-relative path ("//evil.example")
 * would otherwise turn our login screen into an open redirect.
 */
export const safeNext = (value: string | null | undefined): string | null => {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  // Guard against "/\evil.example", which some browsers normalise to "//".
  if (value.startsWith('/\\')) return null;
  return value;
};

/**
 * Build the auth-screen URL for a signed-out visitor, preserving where they
 * were trying to go. Returns a bare path when there is nothing worth keeping
 * (the root and the auth screens themselves would just be noise).
 */
export const authRedirectTo = (
  pathname: string,
  search = '',
  base: '/auth' | '/login' = '/auth',
): string => {
  const target = `${pathname}${search}`;
  if (!safeNext(target)) return base;
  if (pathname === '/' || pathname === base) return base;
  return `${base}?next=${encodeURIComponent(target)}`;
};
