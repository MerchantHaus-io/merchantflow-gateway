import { useEffect } from 'react';

/**
 * Opt a page into chrome-free printing.
 *
 * The print stylesheet hides `nav, aside, header, [data-app-chrome]` only under
 * `body.print-chrome-off`. Those elements are ancestors of the page content,
 * so the flag has to live on <body> — a class on the page's own container
 * can't reach them with a descendant selector.
 */
export function usePrintChromeOff(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add('print-chrome-off');
    return () => document.body.classList.remove('print-chrome-off');
  }, [enabled]);
}

/**
 * Any print — the browser's Ctrl+P or a page's own `window.print()` button —
 * should drop the app chrome, not just the SOP page. Scoping the stylesheet to
 * a class meant every other printable page came out with the icon rail, the
 * header and the floating docks stamped over the content.
 *
 * Mounted once from the app shell; pages that already call usePrintChromeOff
 * keep working because the class add/remove is idempotent per-listener here.
 */
export function useGlobalPrintChromeOff() {
  useEffect(() => {
    const on = () => document.body.classList.add('print-chrome-off');
    const off = () => document.body.classList.remove('print-chrome-off');
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);
}
