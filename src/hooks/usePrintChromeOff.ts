import { useEffect } from 'react';

/**
 * Opt a page into chrome-free printing.
 *
 * The print stylesheet hides `nav, aside, header` only under
 * `body.print-chrome-off`. Those elements are ancestors of the page content,
 * so the flag has to live on <body> — a class on the page's own container
 * can't reach them with a descendant selector.
 *
 * Previously the print rule was unscoped, so printing anything other than the
 * SOP page silently lost its header and navigation.
 */
export function usePrintChromeOff(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add('print-chrome-off');
    return () => document.body.classList.remove('print-chrome-off');
  }, [enabled]);
}
