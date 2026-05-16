import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SendMessageOptions {
  table: 'chat_messages' | 'direct_messages';
  data: Record<string, unknown>;
  optimisticId?: string;
}

interface RetryableMessage {
  id: string;
  options: SendMessageOptions;
  attempts: number;
  lastAttempt: number;
}

/**
 * Debounced callback hook - prevents rapid successive calls
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;
}

/**
 * Throttled callback hook - limits call frequency
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  limit: number
): T {
  const lastCallRef = useRef<number>(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCallRef.current >= limit) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    },
    [limit]
  ) as T;
}

/**
 * Connection status hook for realtime subscriptions
 */
export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const handleConnectionChange = useCallback((status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => {
    switch (status) {
      case 'SUBSCRIBED':
        setIsConnected(true);
        setIsReconnecting(false);
        reconnectAttempts.current = 0;
        break;
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
      case 'CLOSED':
        setIsConnected(false);
        if (reconnectAttempts.current < maxReconnectAttempts) {
          setIsReconnecting(true);
          reconnectAttempts.current++;
        } else {
          setIsReconnecting(false);
          toast.error('Connection lost. Please refresh the page.');
        }
        break;
    }
  }, []);

  return {
    isConnected,
    isReconnecting,
    handleConnectionChange,
    reconnectAttempts: reconnectAttempts.current,
  };
}

/**
 * Message sending with retry logic and optimistic updates
 */
export function useMessageSender() {
  const [pendingMessages, setPendingMessages] = useState<Map<string, RetryableMessage>>(new Map());
  const [isSending, setIsSending] = useState(false);
  const retryQueueRef = useRef<RetryableMessage[]>([]);
  const isProcessingRetryRef = useRef(false);

  const generateOptimisticId = useCallback(() => {
    return `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const processRetryQueue = useCallback(async () => {
    if (isProcessingRetryRef.current || retryQueueRef.current.length === 0) return;
    
    isProcessingRetryRef.current = true;
    const message = retryQueueRef.current[0];
    
    if (!message) {
      isProcessingRetryRef.current = false;
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const backoffTime = Math.min(1000 * Math.pow(2, message.attempts), 16000);
    const timeSinceLastAttempt = Date.now() - message.lastAttempt;
    
    if (timeSinceLastAttempt < backoffTime) {
      setTimeout(() => {
        isProcessingRetryRef.current = false;
        processRetryQueue();
      }, backoffTime - timeSinceLastAttempt);
      return;
    }

    try {
       
      const { error } = await supabase
        .from(message.options.table)
        .insert(message.options.data as any);

      if (error) throw error;

      // Success - remove from queue and pending
      retryQueueRef.current.shift();
      setPendingMessages(prev => {
        const next = new Map(prev);
        next.delete(message.id);
        return next;
      });
    } catch (error) {
      message.attempts++;
      message.lastAttempt = Date.now();

      if (message.attempts >= 3) {
        // Max retries reached - remove and notify
        retryQueueRef.current.shift();
        setPendingMessages(prev => {
          const next = new Map(prev);
          next.delete(message.id);
          return next;
        });
        toast.error('Failed to send message. Please try again.');
      }
    }

    isProcessingRetryRef.current = false;
    
    if (retryQueueRef.current.length > 0) {
      setTimeout(processRetryQueue, 1000);
    }
  }, []);

  const sendMessage = useCallback(async <T extends Record<string, unknown>>(
    options: SendMessageOptions,
    onOptimisticUpdate?: (id: string, data: T) => void
  ): Promise<{ success: boolean; id?: string; error?: Error }> => {
    const optimisticId = options.optimisticId || generateOptimisticId();
    
    setIsSending(true);

    // Trigger optimistic update
    if (onOptimisticUpdate) {
      onOptimisticUpdate(optimisticId, options.data as T);
    }

    try {
       
      const { data, error } = await supabase
        .from(options.table)
        .insert(options.data as any)
        .select()
        .single();

      if (error) throw error;

      setIsSending(false);
      return { success: true, id: data?.id };
    } catch (error) {
      // Add to retry queue
      const retryableMessage: RetryableMessage = {
        id: optimisticId,
        options,
        attempts: 1,
        lastAttempt: Date.now(),
      };

      retryQueueRef.current.push(retryableMessage);
      setPendingMessages(prev => new Map(prev).set(optimisticId, retryableMessage));

      // Start retry processing
      setTimeout(processRetryQueue, 2000);

      setIsSending(false);
      return { success: false, id: optimisticId, error: error as Error };
    }
  }, [generateOptimisticId, processRetryQueue]);

  const cancelPendingMessage = useCallback((id: string) => {
    retryQueueRef.current = retryQueueRef.current.filter(m => m.id !== id);
    setPendingMessages(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return {
    sendMessage,
    cancelPendingMessage,
    pendingMessages,
    isSending,
    hasPendingMessages: pendingMessages.size > 0,
  };
}

/**
 * Typing indicator with proper debouncing
 */
export function useTypingIndicator(
  channelRef: React.MutableRefObject<ReturnType<typeof supabase.channel> | null>,
  userName: string,
  debounceMs = 2000
) {
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const startTyping = useCallback(() => {
    if (!channelRef.current) return;

    // Only send if not already typing
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      channelRef.current.track({ typing: true, name: userName });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, debounceMs);
  }, [channelRef, userName, debounceMs]);

  const stopTyping = useCallback(() => {
    if (!channelRef.current) return;

    if (isTypingRef.current) {
      isTypingRef.current = false;
      channelRef.current.track({ typing: false, name: userName });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [channelRef, userName]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return { startTyping, stopTyping, isTyping: isTypingRef.current };
}

/**
 * Scroll position management with "new messages" indicator
 */
export function useScrollPosition(threshold = 100) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const nearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    setIsNearBottom(nearBottom);
    
    if (nearBottom) {
      setNewMessageCount(0);
    }
  }, [threshold]);

  const scrollToBottom = useCallback((smooth = true) => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setNewMessageCount(0);
  }, []);

  const incrementNewMessages = useCallback(() => {
    if (!isNearBottom) {
      setNewMessageCount(prev => prev + 1);
    }
  }, [isNearBottom]);

  return {
    scrollRef,
    isNearBottom,
    newMessageCount,
    handleScroll,
    scrollToBottom,
    incrementNewMessages,
  };
}

/**
 * Message validation
 */
export function validateMessage(content: string, maxLength = 5000): { valid: boolean; error?: string } {
  const trimmed = content.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  if (trimmed.length > maxLength) {
    return { valid: false, error: `Message exceeds ${maxLength} characters` };
  }
  
  // Check for only whitespace/newlines
  if (!/\S/.test(trimmed)) {
    return { valid: false, error: 'Message cannot contain only whitespace' };
  }
  
  return { valid: true };
}

/**
 * Format message timestamp intelligently
 */
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) {
    return `${date.toLocaleDateString([], { weekday: 'short' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
