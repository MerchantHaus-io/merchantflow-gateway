import { useState, useEffect, useRef, useCallback } from 'react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  data: T;
  onSave: (data: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export const useAutoSave = <T>({
  data,
  onSave,
  delay = 800,
  enabled = true,
}: UseAutoSaveOptions<T>) => {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialDataRef = useRef<string>(JSON.stringify(data));
  const isFirstRender = useRef(true);

  // Always-fresh refs so callbacks below stay stable (no infinite reset loop)
  const dataRef = useRef(data);
  const onSaveRef = useRef(onSave);
  const enabledRef = useRef(enabled);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const save = useCallback(async () => {
    if (!enabledRef.current) return;

    const snapshot = dataRef.current;
    setStatus('saving');
    try {
      await onSaveRef.current(snapshot);
      // Mark this snapshot as the new baseline so we don't re-save unchanged data
      initialDataRef.current = JSON.stringify(snapshot);
      setStatus('saved');
      setTimeout(() => setStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (error) {
      setStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, []);

  useEffect(() => {
    // Skip auto-save on first render after a reset/mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      initialDataRef.current = JSON.stringify(data);
      return;
    }

    // Don't save if data hasn't changed from baseline
    const currentData = JSON.stringify(data);
    if (currentData === initialDataRef.current) {
      return;
    }

    if (!enabled) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, save]);

  // Reset initial data when enabling (e.g., when dialog opens / edit mode starts)
  // Stable reference — does NOT depend on `data`, so callers can safely put it
  // in a useEffect dep array without creating an infinite reset loop.
  const resetInitialData = useCallback(() => {
    initialDataRef.current = JSON.stringify(dataRef.current);
    isFirstRender.current = true;
    setStatus('idle');
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Mark current data as saved (prevents re-save of same data)
  const markSaved = useCallback(() => {
    initialDataRef.current = JSON.stringify(dataRef.current);
  }, []);

  return { status, resetInitialData, cancel, markSaved };
};
