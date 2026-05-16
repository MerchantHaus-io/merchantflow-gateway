import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Phone } from "lucide-react";
import { playNotificationSound } from "@/hooks/useNotificationSound";

/**
 * Listens to realtime call_logs inserts for ringing incoming calls
 * and shows a toast notification with option to navigate to the contact.
 */
export const IncomingCallToast = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const channel = supabase
      .channel('incoming-call-listener')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_logs',
          filter: 'direction=eq.incoming',
        },
        (payload) => {
          const call = payload.new as any;
          if (call.status !== 'ringing') return;

          const caller = call.phone_number || 'Unknown number';

          // Play urgent ringtone
          const ringtone = playNotificationSound('call') as { stop: () => void } | undefined;

          toast(`📞 Incoming call from ${caller}`, {
            description: 'Click to view contact',
            duration: 10000,
            onDismiss: () => ringtone?.stop(),
            onAutoClose: () => ringtone?.stop(),
            action: call.opportunity_id
              ? {
                  label: 'View',
                  onClick: () => {
                    ringtone?.stop();
                    navigate(`/opportunities/${call.opportunity_id}`);
                  },
                }
              : call.contact_id
              ? {
                  label: 'View',
                  onClick: () => {
                    ringtone?.stop();
                    navigate('/contacts');
                  },
                }
              : undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  return null;
};
