/**
 * Emails that must NEVER receive outgoing messages or trigger downstream
 * actions (DMs, notifications, push, campaigns, etc). Used by every
 * send-* / notification edge function as a hard short-circuit.
 *
 * Test / silent accounts:
 *  - darryn182@gmail.com  → owner test account, receives no outbound activity.
 */
export const BLOCKED_RECIPIENT_EMAILS: string[] = [
  "darryn182@gmail.com",
];

const norm = (v: unknown): string =>
  typeof v === "string" ? v.toLowerCase().trim() : "";

/** True when an individual email address should be silenced. */
export const isBlockedRecipient = (email?: string | null): boolean =>
  BLOCKED_RECIPIENT_EMAILS.includes(norm(email));

/** Remove blocked addresses from a recipient list (safe on undefined/null). */
export const stripBlockedRecipients = (
  emails: Array<string | null | undefined> | null | undefined,
): string[] => {
  if (!emails) return [];
  return emails
    .map(norm)
    .filter((e) => e.length > 0 && !BLOCKED_RECIPIENT_EMAILS.includes(e));
};
