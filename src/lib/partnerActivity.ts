/**
 * Partner portal activity aggregation.
 *
 * Pure helpers so the numbers shown on the Affiliates page are testable and
 * identical wherever they are rendered. Sessions come from `user_sessions`
 * (written on sign-in and kept fresh by the portal heartbeat).
 */

export interface PartnerSessionRow {
  user_id: string | null;
  user_email: string | null;
  logged_in_at: string | null;
  logged_out_at: string | null;
  duration_minutes: number | null;
}

export interface PartnerLike {
  id: string;
  full_name: string | null;
  email: string | null;
  auth_user_id?: string | null;
  active?: boolean | null;
}

export interface PartnerActivitySummary {
  referrerId: string;
  name: string;
  email: string | null;
  logins: number;
  totalMinutes: number;
  averageMinutes: number;
  lastLoginAt: string | null;
}

const normEmail = (email: string | null | undefined) =>
  email ? email.trim().toLowerCase() : null;

/** Minutes attributable to one session; never negative, never NaN. */
export function sessionMinutes(row: PartnerSessionRow): number {
  if (typeof row.duration_minutes === 'number' && Number.isFinite(row.duration_minutes)) {
    return Math.max(0, Math.round(row.duration_minutes));
  }
  if (row.logged_in_at && row.logged_out_at) {
    const start = new Date(row.logged_in_at).getTime();
    const end = new Date(row.logged_out_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.round((end - start) / 60000);
    }
  }
  return 0;
}

/**
 * Group sessions per partner. A session belongs to a partner when its
 * `user_id` matches the linked auth user, or (fallback, for rows an admin has
 * not linked yet) when the email matches case-insensitively.
 */
export function summarizePartnerActivity(
  partners: PartnerLike[],
  sessions: PartnerSessionRow[]
): PartnerActivitySummary[] {
  const byAuthId = new Map<string, PartnerLike>();
  const byEmail = new Map<string, PartnerLike>();
  for (const p of partners) {
    if (p.auth_user_id) byAuthId.set(p.auth_user_id, p);
    const email = normEmail(p.email);
    if (email && !byEmail.has(email)) byEmail.set(email, p);
  }

  const acc = new Map<string, PartnerActivitySummary>();
  const ensure = (p: PartnerLike): PartnerActivitySummary => {
    const existing = acc.get(p.id);
    if (existing) return existing;
    const created: PartnerActivitySummary = {
      referrerId: p.id,
      name: p.full_name ?? p.email ?? 'Partner',
      email: p.email ?? null,
      logins: 0,
      totalMinutes: 0,
      averageMinutes: 0,
      lastLoginAt: null,
    };
    acc.set(p.id, created);
    return created;
  };

  for (const session of sessions) {
    const partner =
      (session.user_id ? byAuthId.get(session.user_id) : undefined) ??
      byEmail.get(normEmail(session.user_email) ?? '');
    if (!partner) continue;
    const row = ensure(partner);
    row.logins += 1;
    row.totalMinutes += sessionMinutes(session);
    if (
      session.logged_in_at &&
      (!row.lastLoginAt || new Date(session.logged_in_at) > new Date(row.lastLoginAt))
    ) {
      row.lastLoginAt = session.logged_in_at;
    }
  }

  const rows = partners.map((p) => ensure(p));
  for (const row of rows) {
    row.averageMinutes = row.logins > 0 ? Math.round(row.totalMinutes / row.logins) : 0;
  }

  return rows.sort((a, b) => {
    if (b.logins !== a.logins) return b.logins - a.logins;
    return a.name.localeCompare(b.name);
  });
}

/** "3h 12m" / "42m" / "—" */
export function formatMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
