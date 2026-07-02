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
  /** True for non-platform contacts (e.g. partner liaisons) — hidden from calendar columns. */
  isExternal?: boolean;
}

// ─── ROSTER ────────────────────────────────────────────────────────────────
// These are CODE DEFAULTS. The live roster is hydrated from the `team_roster`
// table at app startup via `hydrateTeamRosterFromDb()` so admins can rename
// people from the Team Roster settings page without a deploy.

export let TEAM_ROSTER: TeamMemberRecord[] = [
  {
    id: "jamie",
    email: "jamie@merchanthaus.io",
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
    email: "jessie@merchanthaus.io",
    aliases: ["support@merchanthaus.io"],
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
    id: "xavier",
    email: "xavier@merchanthaus.io",
    displayName: "Xavier Rooza",
    title: "Sales",
    active: true,
    colorToken: "border-border",
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
export const getActiveTeam = (): TeamMemberRecord[] =>
  TEAM_ROSTER.filter((m) => m.active).sort((a, b) => a.displayName.localeCompare(b.displayName));

/** Active *internal* team members — used for calendar columns / dashboards. */
export const getActiveInternalTeam = (): TeamMemberRecord[] =>
  getActiveTeam().filter((m) => !m.isExternal);

/** Active display names — use this for assignment dropdowns. */
export const getActiveTeamNames = (): string[] => getActiveTeam().map((m) => m.displayName);

/** All display names including inactive. */
export const getAllTeamNames = (): string[] => TEAM_ROSTER.map((m) => m.displayName);

// Live array proxies so existing imports (`ACTIVE_TEAM`, `ACTIVE_TEAM_NAMES`,
// `ALL_TEAM_NAMES`, `EMAIL_TO_DISPLAY_NAME`, `NAME_TO_EMAIL`) always reflect
// the current roster — even after DB hydration replaces it.
const liveArray = <T>(compute: () => T[]): T[] =>
  new Proxy([] as T[], {
    get(_t, prop, recv) {
      const arr = compute();
      const v = (arr as any)[prop];
      return typeof v === "function" ? v.bind(arr) : v;
    },
    has(_t, prop) { return prop in compute(); },
    ownKeys() { return Reflect.ownKeys(compute()); },
    getOwnPropertyDescriptor(_t, prop) { return Object.getOwnPropertyDescriptor(compute(), prop); },
  });

const liveObject = <V>(compute: () => Record<string, V>): Record<string, V> =>
  new Proxy({} as Record<string, V>, {
    get(_t, prop) { return compute()[prop as string]; },
    has(_t, prop) { return (prop as string) in compute(); },
    ownKeys() { return Object.keys(compute()); },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(compute(), prop);
    },
  });

export const ACTIVE_TEAM: TeamMemberRecord[] = liveArray(getActiveTeam);
export const ACTIVE_INTERNAL_TEAM: TeamMemberRecord[] = liveArray(getActiveInternalTeam);
export const ACTIVE_TEAM_NAMES: string[] = liveArray(getActiveTeamNames);
export const ALL_TEAM_NAMES: string[] = liveArray(getAllTeamNames);

/** Border-color class for a member's badge / kanban card stripe. */
export const colorTokenFor = (name: string | null | undefined): string => {
  const m = resolveMember(name);
  return m?.colorToken ?? "border-border";
};

const computeEmailToDisplayName = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const m of TEAM_ROSTER) {
    for (const e of allEmailsFor(m)) map[e] = m.displayName;
  }
  return map;
};
const computeNameToEmail = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const m of TEAM_ROSTER) {
    map[m.displayName] = m.email;
    m.legacyNames?.forEach((n) => (map[n] = m.email));
  }
  return map;
};

/** Email → display-name (live, reflects current roster). */
export const EMAIL_TO_DISPLAY_NAME = liveObject(computeEmailToDisplayName);
/** Display-name → primary email (live, reflects current roster). */
export const NAME_TO_EMAIL = liveObject(computeNameToEmail);

// ─── DB HYDRATION ──────────────────────────────────────────────────────────

let hydrated = false;
/** Loads the live roster from the `team_roster` table and replaces defaults. */
export const hydrateTeamRosterFromDb = async (): Promise<void> => {
  if (hydrated) return;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("team_roster")
      .select("id,email,display_name,title,active,color_token,legacy_names,aliases,sort_order,is_external")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return;
    setTeamRoster(
      data.map((r: any) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        title: r.title ?? "",
        active: r.active,
        colorToken: r.color_token ?? "border-border",
        legacyNames: r.legacy_names ?? [],
        aliases: r.aliases ?? [],
        isExternal: !!r.is_external,
      })),
    );
    hydrated = true;
  } catch {
    // keep code defaults on any failure
  }
};
