/**
 * The last handful of pages this user actually visited (#156).
 *
 * The mobile launcher lists forty-plus destinations in a flat grid with no
 * ordering by use, so finding the three pages a rep opens all day means
 * scanning the lot. A "Recent" row at the top costs one localStorage key.
 *
 * Stored as URLs only — the labels and icons come from navigation.ts, so a
 * renamed page doesn't leave a stale entry behind.
 */

const STORAGE_KEY = "recent-pages";
export const MAX_RECENT = 6;

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export function getRecentPages(): string[] {
  return read();
}

export function recordPageVisit(url: string): void {
  if (!url || url === "/") return;
  const next = [url, ...read().filter((u) => u !== url)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota. Recents are a convenience, not a feature to fail on.
  }
}
