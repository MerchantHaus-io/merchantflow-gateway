import { useEffect } from "react";

/**
 * The app's cross-tree UI signals, in one typed place (#116, #117).
 *
 * These were bare `window.dispatchEvent(new CustomEvent("openDialler"))` calls
 * scattered across the mobile dock and the header — untyped, unlisted, with no
 * way to know whether anything was listening. Worse, the ⌘K trigger
 * synthesised a fake KeyboardEvent (`new KeyboardEvent("keydown", {key: "k",
 * ctrlKey: true})`) so it was coupled to whatever the command palette happened
 * to bind, could not be feature-detected, and would break silently if that
 * shortcut ever changed.
 *
 * Still events rather than a context, because the emitters and the listeners
 * sit in unrelated branches of the tree and a context would mean threading a
 * provider through all of them. What this adds is the part that was missing: a
 * closed set of names, type-checked call sites, and a dev warning when nothing
 * is listening.
 */
export interface AppEventMap {
  /** Open the ⌘K command palette. */
  openCommandPalette: void;
  openNoticeBoard: void;
  openDialler: void;
  openFloatingChat: void;
  openOfficeSimulator: void;
  /** A dock app opened — the mobile dock closes its fan. */
  dockAppOpened: void;
  /** …and closed again, so the tri-tab dock can restore itself. */
  dockAppClosed: void;
}

export type AppEventName = keyof AppEventMap;

const listenerCounts = new Map<AppEventName, number>();

export function emitAppEvent(name: AppEventName): void {
  if (import.meta.env.DEV && !listenerCounts.get(name)) {
    console.warn(
      `[appEvents] "${name}" was emitted with no listener mounted. ` +
        "The component that handles it is probably not rendered on this route.",
    );
  }
  window.dispatchEvent(new CustomEvent(name));
}

/** Subscribe for the lifetime of the component. */
export function useAppEvent(name: AppEventName, handler: () => void): void {
  useEffect(() => {
    listenerCounts.set(name, (listenerCounts.get(name) ?? 0) + 1);
    const wrapped = () => handler();
    window.addEventListener(name, wrapped);
    return () => {
      window.removeEventListener(name, wrapped);
      listenerCounts.set(name, Math.max(0, (listenerCounts.get(name) ?? 1) - 1));
    };
    // handler is intentionally a dependency: callers pass stable callbacks or
    // accept a re-subscribe, which is cheap.
  }, [name, handler]);
}
