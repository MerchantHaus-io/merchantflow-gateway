import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotificationOptions {
  isChatOpen: boolean;
  currentChannelId?: string;
  currentDMUserId?: string;
}

export const useChatNotifications = ({ isChatOpen, currentChannelId, currentDMUserId }: NotificationOptions) => {
  const { user } = useAuth();
  const permissionGranted = useRef(false);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        permissionGranted.current = true;
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          permissionGranted.current = permission === 'granted';
        });
      }
    }
  }, []);

  const showNotification = useCallback((title: string, body: string, onClick?: () => void) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    // Don't show if document is focused and chat is open
    if (document.hasFocus() && isChatOpen) {
      return;
    }

    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'chat-message',
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      onClick?.();
    };

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }, [isChatOpen]);

  // Listen for new channel messages
  useEffect(() => {
    if (!user) return;

    const channelSubscription = supabase
      .channel('chat-notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            user_id: string;
            user_name: string | null;
            user_email: string;
            content: string;
            channel_id: string;
          };

          // Don't notify for own messages
          if (newMessage.user_id === user.id) return;

          // Don't notify if chat is open and viewing this channel
          if (isChatOpen && currentChannelId === newMessage.channel_id) return;

          // Get channel name
          const { data: channel } = await supabase
            .from('chat_channels')
            .select('name')
            .eq('id', newMessage.channel_id)
            .single();

          const senderName = newMessage.user_name || newMessage.user_email.split('@')[0];
          const channelName = channel?.name || 'Unknown channel';

          showNotification(
            `New message in #${channelName}`,
            `${senderName}: ${newMessage.content.substring(0, 100)}${newMessage.content.length > 100 ? '...' : ''}`
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelSubscription);
    };
  }, [user, isChatOpen, currentChannelId, showNotification]);

  // Listen for new direct messages
  useEffect(() => {
    if (!user) return;

    const dmSubscription = supabase
      .channel('chat-notifications-dm')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string;
            sender_id: string;
            receiver_id: string;
            content: string;
          };

          // Only notify if we're the receiver
          if (newMessage.receiver_id !== user.id) return;

          // Don't notify if chat is open and viewing this DM
          if (isChatOpen && currentDMUserId === newMessage.sender_id) return;

          // Get sender profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', newMessage.sender_id)
            .single();

          const senderName = profile?.full_name || profile?.email?.split('@')[0] || 'Someone';

          showNotification(
            `New message from ${senderName}`,
            newMessage.content.substring(0, 100) + (newMessage.content.length > 100 ? '...' : '')
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dmSubscription);
    };
  }, [user, isChatOpen, currentDMUserId, showNotification]);

  // Request permission function for manual trigger
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      return false;
    }
    
    const permission = await Notification.requestPermission();
    permissionGranted.current = permission === 'granted';
    return permission === 'granted';
  }, []);

  return {
    requestPermission,
    isSupported: 'Notification' in window,
    permissionStatus: 'Notification' in window ? Notification.permission : 'denied',
  };
};
