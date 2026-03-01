import { useRef, useCallback, useEffect, useState } from "react";

interface PullToRefreshOptions {
  /** The scrollable element to attach to. If null, uses window. */
  containerRef?: React.RefObject<HTMLElement>;
  /** Distance in px the user must pull to trigger refresh */
  threshold?: number;
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void> | void;
  /** Disable the gesture */
  disabled?: boolean;
}

export function usePullToRefresh({
  containerRef,
  threshold = 80,
  onRefresh,
  disabled = false,
}: PullToRefreshOptions) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getScrollTop = useCallback(() => {
    if (containerRef?.current) return containerRef.current.scrollTop;
    return window.scrollY || document.documentElement.scrollTop;
  }, [containerRef]);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (disabled || isRefreshing) return;
      if (getScrollTop() <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [disabled, isRefreshing, getScrollTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || disabled || isRefreshing) return;
      const deltaY = e.touches[0].clientY - startY.current;
      if (deltaY > 0 && getScrollTop() <= 0) {
        // Dampen the pull (feels more natural)
        setPullDistance(Math.min(deltaY * 0.4, threshold * 1.5));
      } else {
        pulling.current = false;
        setPullDistance(0);
      }
    },
    [disabled, isRefreshing, threshold, getScrollTop]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || disabled) {
      setPullDistance(0);
      pulling.current = false;
      return;
    }

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
    pulling.current = false;
  }, [disabled, pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const target = containerRef?.current || document;
    target.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    target.addEventListener("touchmove", handleTouchMove as EventListener, { passive: true });
    target.addEventListener("touchend", handleTouchEnd as EventListener);

    return () => {
      target.removeEventListener("touchstart", handleTouchStart as EventListener);
      target.removeEventListener("touchmove", handleTouchMove as EventListener);
      target.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, isRefreshing };
}
