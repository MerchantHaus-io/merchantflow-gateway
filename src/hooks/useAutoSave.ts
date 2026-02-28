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

  const save = useCallback(async () => {
    if (!enabled) return;
    
    setStatus('saving');
    try {
      await onSave(data);
      setStatus('saved');
      // Reset to idle after showing "saved" for 2 seconds
      setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      setStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, [data, onSave, enabled]);

  useEffect(() => {
    // Skip auto-save on first render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      initialDataRef.current = JSON.stringify(data);
      return;
    }

    // Don't save if data hasn't changed from initial
    const currentData = JSON.stringify(data);
    if (currentData === initialDataRef.current) {
      return;
    }

    if (!enabled) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, save]);

  // Reset initial data when enabling (e.g., when dialog opens)
  const resetInitialData = useCallback(() => {
    initialDataRef.current = JSON.stringify(data);
    isFirstRender.current = true;
    setStatus('idle');
  }, [data]);

  // Cancel any pending auto-save
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Mark current data as saved (prevents re-save of same data)
  const markSaved = useCallback(() => {
    initialDataRef.current = JSON.stringify(data);
  }, [data]);

  return { status, resetInitialData, cancel, markSaved };
};
