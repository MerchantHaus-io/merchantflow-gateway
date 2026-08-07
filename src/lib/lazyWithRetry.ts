import { lazy, ComponentType } from 'react';

/**
 * `lazy()` wrapper that survives a deploy.
 *
 * Every page in this app is code-split, and a service worker (public/sw.js)
 * caches the chunks. After a deploy the hashed chunk filenames change, so a
 * tab that has been open across the deploy asks for a URL that no longer
 * exists — the dynamic import rejects with a ChunkLoadError and the user gets
 * the generic error screen (or a white page) on their next navigation.
 *
 * The fix is a one-shot hard reload: fetch the fresh index.html, get the new
 * chunk names, carry on. We record the attempt in sessionStorage so a chunk
 * that is genuinely missing (a bad build) surfaces as a real error on the
 * second pass instead of pinning the tab in a reload loop.
 */

const RELOAD_KEY = 'chunk-reload-attempted';

const isChunkLoadError = (error: unknown): boolean => {
  if (!error) return false;
  const name = (error as { name?: string }).name ?? '';
  const message = (error as { message?: string }).message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk .* failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // A clean load means any earlier staleness is resolved.
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (error) {
      if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        // Reloading is async; block here so React never sees a rejected
        // promise and flashes the error boundary on the way out.
        await new Promise(() => {});
      }
      throw error;
    }
  });
}
