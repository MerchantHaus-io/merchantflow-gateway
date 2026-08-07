/**
 * Small user-facing UI preferences, stored per browser.
 *
 * Kept in one module rather than scattered localStorage reads so the key
 * names and defaults live in a single place.
 */

const FULLSCREEN_PREF_KEY = 'pref:autoFullscreen';

/**
 * Whether to auto-enter fullscreen on the first click after login.
 *
 * Defaults to OFF (audit item #57). It used to be unconditional, which hijacks
 * the browser: it breaks multi-monitor work, hides the URL bar so a deal link
 * can't be copied, and re-triggers after the user presses Esc. Opt-in from
 * Settings instead.
 */
export const isAutoFullscreenEnabled = (): boolean => {
  try {
    return localStorage.getItem(FULLSCREEN_PREF_KEY) === 'true';
  } catch {
    return false;
  }
};

export const setAutoFullscreenEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(FULLSCREEN_PREF_KEY, String(enabled));
  } catch {
    /* private mode / quota — the preference simply doesn't persist */
  }
};

export { FULLSCREEN_PREF_KEY };
