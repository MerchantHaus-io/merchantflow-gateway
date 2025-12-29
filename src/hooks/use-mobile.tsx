import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Initialize state directly
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });

  // Use ref to track current value without causing re-renders
  const isMobileRef = React.useRef<boolean>(isMobile);

  React.useEffect(() => {
    // Debounce resize handler to prevent rapid state updates during orientation change
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const handleResize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        const newIsMobile = window.innerWidth < MOBILE_BREAKPOINT;
        if (isMobileRef.current !== newIsMobile) {
          isMobileRef.current = newIsMobile;
          setIsMobile(newIsMobile);
        }
      }, 100); // Debounce for 100ms to let orientation change settle
    };
    
    // Listen to resize events which fire during orientation changes
    window.addEventListener("resize", handleResize);
    
    // Also set initial value correctly
    const initialValue = window.innerWidth < MOBILE_BREAKPOINT;
    if (isMobileRef.current !== initialValue) {
      isMobileRef.current = initialValue;
      setIsMobile(initialValue);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isMobile;
}
