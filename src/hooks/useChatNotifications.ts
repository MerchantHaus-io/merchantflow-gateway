import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationOptions {
  isChatOpen: boolean;
  currentChannelId?: string;
  currentDMUserId?: string;
}

// Notification sound - using a subtle ping
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log('Could not play notification sound');
  }
};

export const useChatNotifications = ({ isChatOpen, currentChannelId, currentDMUserId }: NotificationOptions) => {
  const { user } = useAuth();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatNotificationsEnabled') !== 'false';
    }
    return true;
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatSoundEnabled') !== 'false';
    }
    return true;
  });
  const notificationQueue = useRef<Array<{ title: string; body: string; tag: string }>>([]);
  const isProcessingQueue = useRef(false);

  // Check and request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setPermissionGranted(true);
      } else if (Notification.permission !== 'denied') {
        // Auto-request permission after a short delay
        const timer = setTimeout(() => {
          Notification.requestPermission().then(permission => {
            setPermissionGranted(permission === 'granted');
          });
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Sync with localStorage changes from Settings page
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'chatNotificationsEnabled') {
        setNotificationsEnabled(e.newValue !== 'false');
      }
      if (e.key === 'chatSoundEnabled') {
        setSoundEnabled(e.newValue !== 'false');
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save notification preference
  useEffect(() => {
    localStorage.setItem('chatNotificationsEnabled', String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Process notification queue to avoid notification spam
  const processNotificationQueue = useCallback(() => {
    if (isProcessingQueue.current || notificationQueue.current.length === 0) return;
    
    isProcessingQueue.current = true;
    const notification = notificationQueue.current.shift();
    
    if (notification && 'Notification' in window && Notification.permission === 'granted') {
      const notif = new Notification(notification.title, {
        body: notification.body,
        icon: '/favicon.ico',
        tag: notification.tag,
        requireInteraction: false,
        silent: false,
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
        // Dispatch custom event to open chat
        window.dispatchEvent(new CustomEvent('openFloatingChat'));
      };

      // Auto-close after 5 seconds
      setTimeout(() => notif.close(), 5000);
    }
    
    // Process next notification after a delay
    setTimeout(() => {
      isProcessingQueue.current = false;
      processNotificationQueue();
    }, 1000);
  }, []);

  const showNotification = useCallback((title: string, body: string, tag = 'chat-message') => {
    if (!notificationsEnabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Don't show if document is focused and chat is open
    if (document.hasFocus() && isChatOpen) return;

    // Add to queue
    notificationQueue.current.push({ title, body, tag });
    
    // Play sound if enabled and document is not focused
    if (soundEnabled && !document.hasFocus()) {
      playNotificationSound();
    }
    
    processNotificationQueue();
  }, [isChatOpen, notificationsEnabled, soundEnabled, processNotificationQueue]);

  // NOTE: Realtime message subscriptions removed - IncomingMessageToast
  // and FloatingChat already handle toasts and sound for incoming messages.
  // This hook now only manages browser Notification API permissions and preferences.

  // Request permission function for manual trigger
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return false;
    }
    
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setPermissionGranted(granted);
    return granted;
  }, []);

  // Toggle notifications on/off
  const toggleNotifications = useCallback(() => {
    setNotificationsEnabled(prev => !prev);
  }, []);

  return {
    requestPermission,
    toggleNotifications,
    notificationsEnabled,
    soundEnabled,
    isSupported: 'Notification' in window,
    permissionStatus: 'Notification' in window ? Notification.permission : 'denied',
    permissionGranted,
  };
};
