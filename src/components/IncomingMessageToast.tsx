import { useEffect, useRef } from 'react';
import { emitAppEvent } from '@/lib/appEvents';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { playNotificationSound, wasMessageSoundPlayed, markMessageSoundPlayed } from '@/hooks/useNotificationSound';

/**
 * Listens for new chat_messages and direct_messages via realtime
 * and shows on-screen toast pop-ups for the current user.
 */
export function IncomingMessageToast() {
  const { user } = useAuth();
  const userIdRef = useRef(user?.id);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    // Listen for new channel messages
    const channelSub = supabase
      .channel('toast-channel-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const msg = payload.new as {
            user_id: string;
            user_name: string | null;
            user_email: string;
            content: string;
            channel_id: string;
          };

          // Don't show toast for own messages
          if (msg.user_id === userIdRef.current) return;

          const msgId = (payload.new as any).id;

          // Skip sound if FloatingChat already played it
          if (!wasMessageSoundPlayed(msgId)) {
            markMessageSoundPlayed(msgId);
            playNotificationSound('message');
          }

          const senderName = msg.user_name || msg.user_email?.split('@')[0] || 'Someone';
          const preview = msg.content?.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content;

          toast(senderName, {
            description: preview,
            icon: <MessageCircle className="h-4 w-4 text-primary" />,
            duration: 5000,
            action: {
              label: 'Open',
              onClick: () => {
                emitAppEvent('openFloatingChat');
              },
            },
          });
        }
      )
      .subscribe();

    // Listen for new direct messages TO this user
    const dmSub = supabase
      .channel('toast-direct-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as {
            sender_id: string;
            content: string;
          };

          // Look up sender name
          let senderName = 'Someone';
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', msg.sender_id)
            .maybeSingle();

          if (profile) {
            senderName = profile.full_name || profile.email?.split('@')[0] || 'Someone';
          }

          const dmId = (payload.new as any).id;

          // Skip sound if already played
          if (!wasMessageSoundPlayed(dmId)) {
            markMessageSoundPlayed(dmId);
            playNotificationSound('message');
          }

          const preview = msg.content?.length > 80 ? msg.content.slice(0, 80) + '…' : msg.content;

          toast(`DM from ${senderName}`, {
            description: preview,
            icon: <MessageCircle className="h-4 w-4 text-primary" />,
            duration: 5000,
            action: {
              label: 'Open',
              onClick: () => {
                emitAppEvent('openFloatingChat');
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channelSub);
      supabase.removeChannel(dmSub);
    };
  }, [user]);

  return null;
}