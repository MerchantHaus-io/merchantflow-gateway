import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCount {
  total: number;
  byChannel: Record<string, number>;
}

export const useUnreadMessages = () => {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<UnreadCount>({ total: 0, byChannel: {} });
  const [lastReadTimestamps, setLastReadTimestamps] = useState<Record<string, string>>({});

  // Load last read timestamps from localStorage
  useEffect(() => {
    if (!user) return;

    const stored = localStorage.getItem(`chat_last_read_${user.id}`);
    if (stored) {
      try {
        setLastReadTimestamps(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse last read timestamps:', e);
      }
    }
  }, [user]);

  // Fetch unread message counts
  const fetchUnreadCounts = useCallback(async () => {
    if (!user) return;

    try {
      // Get all channels
      const { data: channels } = await supabase
        .from('chat_channels')
        .select('id');

      if (!channels) return;

      const byChannel: Record<string, number> = {};
      let total = 0;

      // For each channel, count messages after last read timestamp
      for (const channel of channels) {
        const lastRead = lastReadTimestamps[channel.id];

        // If user has never read this channel, don't count any historical messages as unread
        if (!lastRead) {
          byChannel[channel.id] = 0;
          continue;
        }

        let query = supabase
          .from('chat_messages')
          .select('id', { count: 'exact' })
          .eq('channel_id', channel.id)
          .neq('user_id', user.id)
          .gt('created_at', lastRead);

        const { count } = await query;
        const unread = count || 0;

        if (unread > 0) {
          byChannel[channel.id] = unread;
          total += unread;
        }
      }

      setUnreadCount({ total, byChannel });
    } catch (error) {
      console.error('Error fetching unread counts:', error);
    }
  }, [user, lastReadTimestamps]);

  // Initial fetch and subscribe to new messages
  useEffect(() => {
    if (!user) return;

    fetchUnreadCounts();

    // Subscribe to new messages
    const channel = supabase
      .channel('unread-messages-counter')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const newMsg = payload.new as { user_id: string; channel_id: string };
          // Only count messages from other users
          if (newMsg.user_id !== user.id) {
            setUnreadCount(prev => ({
              total: prev.total + 1,
              byChannel: {
                ...prev.byChannel,
                [newMsg.channel_id]: (prev.byChannel[newMsg.channel_id] || 0) + 1
              }
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnreadCounts]);

  // Mark channel as read
  const markChannelAsRead = useCallback((channelId: string) => {
    if (!user) return;

    const now = new Date().toISOString();
    const updated = { ...lastReadTimestamps, [channelId]: now };

    setLastReadTimestamps(updated);
    localStorage.setItem(`chat_last_read_${user.id}`, JSON.stringify(updated));

    // Update counts
    setUnreadCount(prev => {
      const channelUnread = prev.byChannel[channelId] || 0;
      const newByChannel = { ...prev.byChannel };
      delete newByChannel[channelId];

      return {
        total: Math.max(0, prev.total - channelUnread),
        byChannel: newByChannel
      };
    });
  }, [user, lastReadTimestamps]);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    if (!user) return;

    const now = new Date().toISOString();
    const updated: Record<string, string> = {};

    Object.keys(unreadCount.byChannel).forEach(channelId => {
      updated[channelId] = now;
    });

    setLastReadTimestamps(prev => ({ ...prev, ...updated }));
    localStorage.setItem(`chat_last_read_${user.id}`, JSON.stringify({ ...lastReadTimestamps, ...updated }));

    setUnreadCount({ total: 0, byChannel: {} });
  }, [user, lastReadTimestamps, unreadCount.byChannel]);

  return {
    unreadCount: unreadCount.total,
    unreadByChannel: unreadCount.byChannel,
    markChannelAsRead,
    markAllAsRead,
    refetch: fetchUnreadCounts
  };
};
