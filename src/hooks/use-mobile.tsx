import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Initialize with actual value to prevent hydration issues and unnecessary re-renders
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    
    mql.addEventListener("change", onChange);
    
    // Only update if different from initial value
    const currentIsMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (currentIsMobile !== isMobile) {
      setIsMobile(currentIsMobile);
    }
    
    return () => mql.removeEventListener("change", onChange);
  }, []); // Empty deps - only run once on mount

  return isMobile;
}
