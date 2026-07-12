/**
 * Users who should not appear in team directories, presence lists,
 * assignee pickers, chat rosters, or the office simulator to OTHER users.
 * They still see themselves and continue to work normally.
 */
export const HIDDEN_USER_EMAILS: string[] = [
  "darryn182@gmail.com",
];

const normalize = (email?: string | null) =>
  (email ?? "").toLowerCase().trim();

export const isHiddenUser = (email?: string | null): boolean =>
  HIDDEN_USER_EMAILS.includes(normalize(email));

/**
 * Filter a list of profile-like rows so hidden users are removed for everyone
 * except the hidden user themselves.
 */
export function filterVisibleProfiles<T extends { email?: string | null }>(
  rows: T[] | null | undefined,
  viewerEmail?: string | null,
): T[] {
  if (!rows) return [];
  const viewer = normalize(viewerEmail);
  return rows.filter((row) => {
    const rowEmail = normalize(row.email);
    if (!rowEmail) return true;
    if (rowEmail === viewer) return true;
    return !HIDDEN_USER_EMAILS.includes(rowEmail);
  });
}
