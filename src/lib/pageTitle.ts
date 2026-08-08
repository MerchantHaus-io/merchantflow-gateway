/**
 * The current page's title, published by AppLayout and consumed by the shell.
 *
 * Why a store rather than context (#104, #111)
 * -------------------------------------------
 * The shell mounts once and must not re-render when a page navigates — that
 * was the whole point of moving the chrome above the router. Putting the title
 * in PageChromeContext would re-render ShellChrome, and therefore <Outlet />
 * and the whole page, every time a title was published.
 *
 * An external store lets exactly one leaf component (RouteTitle) subscribe.
 * The shell itself never re-renders.
 *
 * The pathname is stored alongside the title so a stale title can't leak: a
 * page that renders no AppLayout, or supplies no pageTitle, simply doesn't
 * match the current path and is treated as untitled.
 */

export const APP_NAME = "Ops Terminal";

interface TitleEntry {
  path: string;
  title: string;
}

// Shared frozen empty value: useSyncExternalStore compares snapshots by
// identity and will loop forever if getSnapshot returns a fresh object.
const EMPTY: TitleEntry = { path: "", title: "" };

let entry: TitleEntry = EMPTY;
const listeners = new Set<() => void>();

export function setPageTitle(path: string, title: string): void {
  if (entry.path === path && entry.title === title) return;
  entry = title ? { path, title } : EMPTY;
  listeners.forEach((l) => l());
}

export function subscribePageTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPageTitleEntry(): TitleEntry {
  return entry;
}

/** Server snapshot for useSyncExternalStore — no title during SSR/prerender. */
export function getPageTitleServerEntry(): TitleEntry {
  return EMPTY;
}
