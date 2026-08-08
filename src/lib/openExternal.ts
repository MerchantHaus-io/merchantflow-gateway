import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

/**
 * Open a URL outside the app (#146).
 *
 * `window.open(url, "_blank")` is wrong in the Capacitor WebView: it either
 * does nothing or hands the user to the system browser with no way back to the
 * app. Both outcomes are dead ends for links we hand people mid-task — the
 * public Client Request Form, the NMI status page.
 *
 * On native this opens the in-app browser, which has a Done button that
 * returns to exactly where they were. On the web it stays a normal new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
