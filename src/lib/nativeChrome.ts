import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Keeps the chrome *outside* the web view in step with the active theme —
 * the native status bar (#149) and the mobile browser's own toolbar (#180).
 *
 * Both were hardcoded: capacitor.config.ts pinned every native surface to
 * #0F172A, a midnight blue that matches none of the fourteen themes, so a
 * light-theme user got a dark status bar; and index.html declared no
 * theme-color at all, so mobile browser chrome stayed default white above a
 * dark app.
 *
 * The colour is read from the live `--background` token rather than a lookup
 * table, so a new theme variant is covered the moment it is defined.
 */

/** `--background` is stored as a bare `H S% L%` triple, as Tailwind expects. */
function hslTripleToHex(triple: string): string | null {
  const parts = triple.trim().split(/[\s/]+/);
  if (parts.length < 3) return null;

  const h = Number.parseFloat(parts[0]);
  const s = Number.parseFloat(parts[1]) / 100;
  const l = Number.parseFloat(parts[2]) / 100;
  if (![h, s, l].every(Number.isFinite)) return null;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
    [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The current theme's page background as a hex string. */
export function currentThemeColor(): string | null {
  if (typeof window === "undefined") return null;
  const triple = getComputedStyle(document.documentElement).getPropertyValue("--background");
  return triple ? hslTripleToHex(triple) : null;
}

function applyBrowserThemeColor(hex: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = hex;
}

/**
 * Point the native status bar and the browser theme colour at the active
 * theme. Safe to call on every theme change; a no-op for the status bar off
 * native.
 */
export function syncNativeChrome(mode: "dark" | "light"): void {
  const hex = currentThemeColor();
  if (!hex) return;

  applyBrowserThemeColor(hex);

  if (!Capacitor.isNativePlatform()) return;

  // Style.Dark means "light content on a dark bar", which is what a dark
  // theme wants — the naming is the reverse of what it reads like.
  void StatusBar.setStyle({ style: mode === "dark" ? Style.Dark : Style.Light }).catch(() => {});
  // iOS ignores this; Android needs it.
  void StatusBar.setBackgroundColor({ color: hex }).catch(() => {});
}

/**
 * Dismiss the native splash once the app has actually painted (#150).
 *
 * launchShowDuration was a fixed 2500ms with launchAutoHide, so a cold start
 * showed the Capacitor splash for 2.5s regardless of whether the app was ready
 * — then the HTML splash, then ProtectedRoute's logo pulse. Three loading
 * screens in a row. The config now keeps the splash up until this is called.
 */
export function hideNativeSplash(): void {
  if (!Capacitor.isNativePlatform()) return;
  void SplashScreen.hide().catch(() => {});
}
