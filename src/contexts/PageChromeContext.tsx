import { createContext, useContext, useRef, useState, ReactNode, MutableRefObject } from 'react';

/**
 * Plumbing that lets the persistent app chrome (header, icon rail, docks) live
 * ABOVE the router, while individual pages still supply their own title,
 * header actions and "new application" handler.
 *
 * Why this exists
 * ---------------
 * Every one of the 47 internal pages used to render its own <AppLayout>, so
 * the header, icon rail, FloatingChat and the tri-tab dock were unmounted and
 * rebuilt on every single navigation — which is why clicking a menu item felt
 * like a full page reload. AppShell now renders that chrome once, as a layout
 * route, and only the routed content swaps.
 *
 * Pages can't pass props upward to a layout that sits above them, so:
 *
 *  - the page header is delivered by PORTAL into a slot AppShell exposes.
 *    A portal updates naturally as the page re-renders, with no state
 *    synchronisation and no effect that could loop on a changing ReactNode.
 *  - onNewApplication is stored in a ref rather than state, so registering it
 *    never triggers a re-render of the shell.
 */

interface PageChrome {
  /** The DOM node AppShell exposes for the page header bar. */
  headerSlot: HTMLElement | null;
  setHeaderSlot: (el: HTMLElement | null) => void;
  /** Latest page-supplied "new application" handler, if any. */
  newApplicationRef: MutableRefObject<(() => void) | undefined>;
}

const PageChromeContext = createContext<PageChrome | null>(null);

export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const newApplicationRef = useRef<(() => void) | undefined>(undefined);

  return (
    <PageChromeContext.Provider value={{ headerSlot, setHeaderSlot, newApplicationRef }}>
      {children}
    </PageChromeContext.Provider>
  );
}

/**
 * Returns null outside a PageChromeProvider rather than throwing, so a page
 * rendered outside the shell (or in a test) still works — it just doesn't get
 * a header.
 */
export function usePageChrome(): PageChrome | null {
  return useContext(PageChromeContext);
}
