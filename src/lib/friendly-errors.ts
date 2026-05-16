/**
 * Maps raw Supabase / Postgres / network error codes and messages
 * to plain-English explanations for end-users.
 */

const ERROR_MAP: Record<string, string> = {
  // ── Postgres / PostgREST ──
  '23505': 'An application with this email already exists. Please use a different email or contact us.',
  '23503': 'A required reference was missing. Please check your entries and try again.',
  '23502': 'Some required fields are missing. Please fill in all required fields.',
  '23514': 'One or more values are outside the allowed range. Please review your entries.',
  '42501': 'You do not have permission to perform this action.',
  '42P01': 'Something went wrong on our end. Please try again later.',
  'PGRST301': 'You do not have permission to perform this action.',
  'PGRST204': 'Something went wrong on our end. Please try again later.',

  // ── Auth / JWT ──
  'invalid_grant': 'Your session has expired. Please sign in again.',
  'user_not_found': 'No account found with that email address.',
  'email_not_confirmed': 'Please verify your email address before signing in.',
  'invalid_credentials': 'The email or password you entered is incorrect.',
  'signup_disabled': 'New account registration is currently disabled.',
  'over_request_rate_limit': 'Too many attempts. Please wait a moment and try again.',
  'over_email_send_rate_limit': 'Too many emails sent. Please wait a few minutes and try again.',

  // ── Network / fetch ──
  'FetchError': 'Unable to reach the server. Please check your internet connection and try again.',
  'AbortError': 'The request took too long. Please try again.',
  'TypeError': 'Unable to reach the server. Please check your internet connection and try again.',

  // ── Edge function responses ──
  'validation_failed': 'Some fields are invalid. Please review the highlighted errors.',
};

/** Partial-match patterns for error.message fallback */
const MESSAGE_PATTERNS: Array<[RegExp, string]> = [
  [/duplicate key/i, 'This record already exists. Please use different details or contact us.'],
  [/violates foreign key/i, 'A required reference was missing. Please check your entries.'],
  [/violates not-null/i, 'A required field is empty. Please fill in all required fields.'],
  [/violates check constraint/i, 'One or more values are outside the allowed range.'],
  [/permission denied/i, 'You do not have permission to perform this action.'],
  [/JWT expired/i, 'Your session has expired. Please sign in again.'],
  [/rate limit/i, 'Too many attempts. Please wait a moment and try again.'],
  [/network/i, 'Unable to reach the server. Please check your internet connection.'],
  [/timeout/i, 'The request took too long. Please try again.'],
  [/unexpected token/i, 'Server returned an unexpected response. Please try again shortly.'],
  [/failed to fetch/i, 'Unable to reach the server. Please check your internet connection.'],
  [/load failed/i, 'Unable to reach the server. Please check your internet connection.'],
  [/<!doctype/i, 'Server returned an unexpected response. Please try again shortly.'],
];

const FALLBACK = 'Something went wrong. Please try again. If the problem persists, contact support@merchanthaus.io.';

/**
 * Convert any error object into a user-friendly message.
 * Accepts Supabase error objects, generic Error instances, or plain strings.
 */
export function getFriendlyError(error: any): string {
  if (!error) return FALLBACK;

  // Extract code and message from various shapes
  const code: string | undefined =
    (error as unknown)?.code ?? (error as unknown)?.error_code ?? (error as unknown)?.status_code?.toString();
  const message: string =
    (error as unknown)?.message ?? (error as unknown)?.error_description ?? (error as unknown)?.msg ?? String(error);

  // 1. Direct code match
  if (code && ERROR_MAP[code]) {
    return ERROR_MAP[code];
  }

  // 2. Direct message key match (e.g. "invalid_grant")
  const messageKey = message.replace(/\s/g, '_').toLowerCase();
  if (ERROR_MAP[messageKey]) {
    return ERROR_MAP[messageKey];
  }

  // 3. Pattern match on message
  for (const [pattern, friendly] of MESSAGE_PATTERNS) {
    if (pattern.test(message)) {
      return friendly;
    }
  }

  // 4. Fallback
  return FALLBACK;
}
