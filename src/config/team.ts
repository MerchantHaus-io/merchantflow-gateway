/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TEAM ROSTER — Single source of truth for team member display names & emails
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  EDIT THIS FILE to change anyone's "Name Surname" everywhere in the CRM.
 *
 *  Every label, dropdown, mapping, badge, AI prompt and SOP reference resolves
 *  through the helpers below. Do NOT hardcode names elsewhere — import from
 *  "@/config/team" instead.
 *
 *  After changing a `displayName` here, run `applyTeamRename()` (or use the
 *  Settings → Team Roster admin tool) to backfill historical opportunity
 *  assignments in the database.
 */

export interface TeamMemberRecord {
  /** Stable internal id — never change this. */
  id: string;
  /** Primary email — used as the canonical key for assignment. */
  email: string;
  /** Additional emails that should also resolve to this person. */
  aliases?: string[];
  /** Full "Name Surname" — the only label shown in the UI. */
  displayName: string;
  /** Role / title shown in SOP, organogram, quotes. */
  title: string;
  /** True if this person can be assigned new work. */
  active: boolean;
  /** Tailwind border-color token (e.g. "border-team-jamie"). */
  colorToken: string;
  /** Historical names this person used — auto-mapped to displayName at runtime. */
  legacyNames?: string[];
}

// ─── ROSTER ────────────────────────────────────────────────────────────────
// These are CODE DEFAULTS. The live roster is hydrated from the `team_roster`
// table at app startup via `hydrateTeamRosterFromDb()` so admins can rename
// people from the Team Roster settings page without a deploy.

export let TEAM_ROSTER: TeamMemberRecord[] = [
  {
    id: "jamie",
    email: "jamie@merchanthaus.io",
    aliases: ["admin@merchanthaus.io"],
    displayName: "Jamie",
    title: "CEO",
    active: true,
    colorToken: "border-team-jamie",
  },
  {
    id: "darryn",
    email: "admin@merchanthaus.io",
    aliases: ["onboarding@merchanthaus.io", "darryn@merchanthaus.io"],
    displayName: "Darryn",
    title: "QA & Complex Sales / Tech",
    active: true,
    colorToken: "border-team-darryn",
  },
  {
    id: "yaseen",
    email: "support@merchanthaus.io",
    displayName: "Yaseen Sheik",
    title: "Support Lead",
    active: true,
    colorToken: "border-team-yaseen",
    legacyNames: ["Sheiky", "Yaseen"],
  },
  {
    id: "taryn",
    email: "taryn@merchanthaus.io",
    displayName: "Taryn Engledoe",
    title: "Affiliate & Partner Manager",
    active: true,
    colorToken: "border-team-taryn",
    legacyNames: ["Taryn"],
  },
  {
    id: "neil",
    email: "neil@nmi.com",
    displayName: "Neil",
    title: "NMI Support Liaison",
    active: true,
    colorToken: "border-team-neil",
  },
  {
    id: "wesley",
    email: "sales@merchanthaus.io",
    displayName: "Wesley",
    title: "Sales (inactive)",
    active: false,
    colorToken: "border-team-wesley",
  },
];

/** Listeners notified after the roster is replaced (so React views refresh). */
const listeners = new Set<() => void>();
export const subscribeToRosterChanges = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const notify = () => listeners.forEach((cb) => cb());

/** Replace the in-memory roster (called by hydrateTeamRosterFromDb + admin UI). */
export const setTeamRoster = (next: TeamMemberRecord[]): void => {
  TEAM_ROSTER = [...next];
  notify();
};

// ─── HELPERS ───────────────────────────────────────────────────────────────

/** All emails belonging to a member (primary + aliases), lower-cased. */
const allEmailsFor = (m: TeamMemberRecord): string[] =>
  [m.email, ...(m.aliases ?? [])].map((e) => e.toLowerCase());

/** Returns the canonical display name for any email, name, alias, or legacy name. */
export const resolveDisplayName = (
  input: string | null | undefined,
): string | null => {
  if (!input) return null;
  const key = String(input).trim().toLowerCase();
  if (!key) return null;

  for (const m of TEAM_ROSTER) {
    if (allEmailsFor(m).includes(key)) return m.displayName;
    if (m.displayName.toLowerCase() === key) return m.displayName;
    if (m.legacyNames?.some((n) => n.toLowerCase() === key)) return m.displayName;
    if (m.id === key) return m.displayName;
  }
  return null;
};

/** Returns the primary email for a display name (or legacy name). */
export const resolveEmail = (
  displayName: string | null | undefined,
): string | null => {
  if (!displayName) return null;
  const key = displayName.trim().toLowerCase();
  for (const m of TEAM_ROSTER) {
    if (m.displayName.toLowerCase() === key) return m.email;
    if (m.legacyNames?.some((n) => n.toLowerCase() === key)) return m.email;
    if (m.id === key) return m.email;
  }
  return null;
};

/** Returns the full member record for a display name, email, or legacy name. */
export const resolveMember = (
  input: string | null | undefined,
): TeamMemberRecord | null => {
  const name = resolveDisplayName(input);
  if (!name) return null;
  return TEAM_ROSTER.find((m) => m.displayName === name) ?? null;
};

/** Active team members (assignable). Sorted by display name. */
export const ACTIVE_TEAM = TEAM_ROSTER
  .filter((m) => m.active)
  .sort((a, b) => a.displayName.localeCompare(b.displayName));

/** Active display names — use this for assignment dropdowns. */
export const ACTIVE_TEAM_NAMES: string[] = ACTIVE_TEAM.map((m) => m.displayName);

/** All display names including inactive — use for legacy filters/badge colors. */
export const ALL_TEAM_NAMES: string[] = TEAM_ROSTER.map((m) => m.displayName);

/** Border-color class for a member's badge / kanban card stripe. */
export const colorTokenFor = (name: string | null | undefined): string => {
  const m = resolveMember(name);
  return m?.colorToken ?? "border-border";
};

/** Email → display-name lookup used by EMAIL_TO_USER consumers. */
export const EMAIL_TO_DISPLAY_NAME: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const m of TEAM_ROSTER) {
    for (const e of allEmailsFor(m)) map[e] = m.displayName;
  }
  return map;
})();

/** Display-name → primary email lookup used by NAME_TO_EMAIL consumers. */
export const NAME_TO_EMAIL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const m of TEAM_ROSTER) {
    map[m.displayName] = m.email;
    m.legacyNames?.forEach((n) => (map[n] = m.email));
  }
  return map;
})();
