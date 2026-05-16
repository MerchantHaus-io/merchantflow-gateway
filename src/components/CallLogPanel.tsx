import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface CallLog {
  id: string;
  quo_call_id: string | null;
  direction: string;
  status: string;
  duration: number;
  phone_number: string | null;
  participants: string[] | null;
  answered_at: string | null;
  completed_at: string | null;
  summary: string[] | null;
  next_steps: string[] | null;
  notes: string | null;
  created_at: string;
  contact_id: string | null;
}

interface CallLogPanelProps {
  contactId?: string;
  opportunityId?: string;
  accountId?: string;
  maxItems?: number;
  compact?: boolean;
}

export const CallLogPanel = ({
  contactId,
  opportunityId,
  accountId,
  maxItems = 10,
  compact = false,
}: CallLogPanelProps) => {
  const [calls, setCalls] = useState<(CallLog & { contact_name?: string; account_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCalls = async () => {
      let query = supabase
        .from('call_logs')
        .select('*, contacts(first_name, last_name, account_id, accounts(name))')
        .order('created_at', { ascending: false })
        .limit(maxItems);

      if (contactId) query = query.eq('contact_id', contactId);
      if (opportunityId) query = query.eq('opportunity_id', opportunityId);
      if (accountId) query = query.eq('account_id', accountId);

      const { data, error } = await query;
      if (!error && data) {
        setCalls(data.map((c: any) => ({
          ...c,
          contact_name: c.contacts ? `${c.contacts.first_name || ''} ${c.contacts.last_name || ''}`.trim() : undefined,
          account_name: c.contacts?.accounts?.name,
        })));
      }
      setLoading(false);
    };

    fetchCalls();

    // Real-time subscription
    const channel = supabase
      .channel('call-logs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call_logs' },
        () => fetchCalls()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId, opportunityId, accountId, maxItems]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No call history yet</p>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getCallIcon = (direction: string, status: string) => {
    if (status === 'missed' || (status === 'completed' && !direction)) {
      return <PhoneMissed className="h-4 w-4 text-destructive" />;
    }
    if (direction === 'incoming') {
      return <PhoneIncoming className="h-4 w-4 text-green-500" />;
    }
    return <PhoneOutgoing className="h-4 w-4 text-blue-500" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="text-xs">Completed</Badge>;
      case 'ringing':
        return <Badge className="text-xs bg-amber-500/20 text-amber-600 border-amber-500/30">Ringing</Badge>;
      case 'missed':
        return <Badge variant="destructive" className="text-xs">Missed</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-1">
      {calls.map((call) => (
        <div
          key={call.id}
          className={cn(
            "border rounded-lg transition-colors hover:bg-muted/50 cursor-pointer",
            expandedCallId === call.id && "bg-muted/50"
          )}
          onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
        >
          <div className="flex items-center gap-3 p-3">
            {getCallIcon(call.direction, call.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">
                  {call.contact_name || call.phone_number || 'Unknown'}
                </span>
                {getStatusBadge(call.status)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span>{formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}</span>
                {call.duration > 0 && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(call.duration)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {(call.summary || call.next_steps) && (
              expandedCallId === call.id
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {expandedCallId === call.id && (call.summary || call.next_steps) && (
            <div className="px-3 pb-3 border-t pt-2 space-y-2">
              {call.summary && call.summary.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                  <ul className="text-xs space-y-1">
                    {call.summary.map((s, i) => (
                      <li key={i} className="text-foreground">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {call.next_steps && call.next_steps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Next Steps</p>
                  <ul className="text-xs space-y-1">
                    {call.next_steps.map((s, i) => (
                      <li key={i} className="text-foreground">• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
