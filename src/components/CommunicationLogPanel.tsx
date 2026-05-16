import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  MessageCircle, MessageSquare, Clock, ChevronDown, ChevronUp, Send
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface CommunicationLogPanelProps {
  contactId?: string;
  opportunityId?: string;
  accountId?: string;
  maxItems?: number;
}

interface CallEntry {
  kind: 'call';
  id: string;
  quo_call_id: string | null;
  direction: string;
  status: string;
  duration: number;
  phone_number: string | null;
  summary: string[] | null;
  next_steps: string[] | null;
  created_at: string;
  contact_name?: string;
  account_name?: string;
}

interface MessageEntry {
  kind: 'sms';
  id: string;
  quo_message_id: string | null;
  direction: string;
  status: string;
  phone_number: string | null;
  content: string | null;
  created_at: string;
  contact_name?: string;
  account_name?: string;
}

type CommEntry = CallEntry | MessageEntry;

export const CommunicationLogPanel = ({
  contactId,
  opportunityId,
  accountId,
  maxItems = 20,
}: CommunicationLogPanelProps) => {
  const [entries, setEntries] = useState<CommEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'calls' | 'messages'>('all');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      // Fetch calls
      let callQuery = supabase
        .from('call_logs')
        .select('id, quo_call_id, direction, status, duration, phone_number, summary, next_steps, created_at, contact_id, contacts(first_name, last_name, accounts(name))')
        .order('created_at', { ascending: false })
        .limit(maxItems);
      if (contactId) callQuery = callQuery.eq('contact_id', contactId);
      if (opportunityId) callQuery = callQuery.eq('opportunity_id', opportunityId);
      if (accountId) callQuery = callQuery.eq('account_id', accountId);

      // Fetch messages
      let msgQuery = supabase
        .from('message_logs')
        .select('id, quo_message_id, direction, status, phone_number, content, created_at, contact_id, contacts(first_name, last_name, accounts(name))')
        .order('created_at', { ascending: false })
        .limit(maxItems);
      if (contactId) msgQuery = msgQuery.eq('contact_id', contactId);
      if (opportunityId) msgQuery = msgQuery.eq('opportunity_id', opportunityId);
      if (accountId) msgQuery = msgQuery.eq('account_id', accountId);

      const [callRes, msgRes] = await Promise.all([callQuery, msgQuery]);

      const calls: CommEntry[] = (callRes.data || []).map((c: any) => ({
        kind: 'call' as const,
        id: c.id,
        quo_call_id: c.quo_call_id,
        direction: c.direction,
        status: c.status,
        duration: c.duration || 0,
        phone_number: c.phone_number,
        summary: c.summary,
        next_steps: c.next_steps,
        created_at: c.created_at,
        contact_name: c.contacts ? `${c.contacts.first_name || ''} ${c.contacts.last_name || ''}`.trim() : undefined,
        account_name: c.contacts?.accounts?.name,
      }));

      const messages: CommEntry[] = (msgRes.data || []).map((m: any) => ({
        kind: 'sms' as const,
        id: m.id,
        quo_message_id: m.quo_message_id,
        direction: m.direction,
        status: m.status,
        phone_number: m.phone_number,
        content: m.content,
        created_at: m.created_at,
        contact_name: m.contacts ? `${m.contacts.first_name || ''} ${m.contacts.last_name || ''}`.trim() : undefined,
        account_name: m.contacts?.accounts?.name,
      }));

      const combined = [...calls, ...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setEntries(combined);
      setLoading(false);
    };

    fetchAll();

    // Realtime subscriptions for both tables
    const callChannel = supabase
      .channel('comm-log-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, () => fetchAll())
      .subscribe();

    const msgChannel = supabase
      .channel('comm-log-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_logs' }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(callChannel);
      supabase.removeChannel(msgChannel);
    };
  }, [contactId, opportunityId, accountId, maxItems]);

  const filtered = tab === 'all' ? entries : entries.filter(e => tab === 'calls' ? e.kind === 'call' : e.kind === 'sms');

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getIcon = (entry: CommEntry) => {
    if (entry.kind === 'sms') {
      return entry.direction === 'incoming'
        ? <MessageCircle className="h-4 w-4 text-primary" />
        : <Send className="h-4 w-4 text-accent-foreground" />;
    }
    const call = entry as CallEntry;
    if (call.status === 'missed') return <PhoneMissed className="h-4 w-4 text-destructive" />;
    if (call.direction === 'incoming') return <PhoneIncoming className="h-4 w-4 text-primary" />;
    return <PhoneOutgoing className="h-4 w-4 text-accent-foreground" />;
  };

  const getStatusBadge = (entry: CommEntry) => {
    if (entry.kind === 'sms') {
      const msg = entry as MessageEntry;
      if (msg.status === 'received') return <Badge variant="secondary" className="text-xs">Received</Badge>;
      if (msg.status === 'delivered') return <Badge variant="default" className="text-xs">Delivered</Badge>;
      return <Badge variant="outline" className="text-xs">{msg.status}</Badge>;
    }
    const call = entry as CallEntry;
    switch (call.status) {
      case 'completed': return <Badge variant="secondary" className="text-xs">Completed</Badge>;
      case 'ringing': return <Badge variant="outline" className="text-xs border-primary text-primary">Ringing</Badge>;
      case 'missed': return <Badge variant="destructive" className="text-xs">Missed</Badge>;
      default: return <Badge variant="outline" className="text-xs">{call.status}</Badge>;
    }
  };

  const callCount = entries.filter(e => e.kind === 'call').length;
  const msgCount = entries.filter(e => e.kind === 'sms').length;

  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="all" className="text-xs">All ({entries.length})</TabsTrigger>
          <TabsTrigger value="calls" className="text-xs">
            <Phone className="h-3 w-3 mr-1" />Calls ({callCount})
          </TabsTrigger>
          <TabsTrigger value="messages" className="text-xs">
            <MessageSquare className="h-3 w-3 mr-1" />SMS ({msgCount})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No communication history yet</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "border rounded-lg transition-colors hover:bg-muted/50 cursor-pointer",
                  expandedId === entry.id && "bg-muted/50"
                )}
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div className="flex items-center gap-3 p-3">
                  {getIcon(entry)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {entry.contact_name || entry.phone_number || 'Unknown'}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {entry.kind === 'call' ? 'Call' : 'SMS'}
                      </Badge>
                      {getStatusBadge(entry)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
                      {entry.kind === 'call' && (entry as CallEntry).duration > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration((entry as CallEntry).duration)}
                          </span>
                        </>
                      )}
                      {entry.kind === 'sms' && (entry as MessageEntry).content && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[200px]">
                            {(entry as MessageEntry).content!.slice(0, 50)}
                            {(entry as MessageEntry).content!.length > 50 ? '…' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {((entry.kind === 'call' && ((entry as CallEntry).summary || (entry as CallEntry).next_steps)) ||
                    (entry.kind === 'sms' && (entry as MessageEntry).content)) && (
                    expandedId === entry.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                {expandedId === entry.id && (
                  <div className="px-3 pb-3 border-t pt-2 space-y-2">
                    {entry.kind === 'sms' && (entry as MessageEntry).content && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Message</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{(entry as MessageEntry).content}</p>
                      </div>
                    )}
                    {entry.kind === 'call' && (entry as CallEntry).summary && (entry as CallEntry).summary!.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                        <ul className="text-xs space-y-1">
                          {(entry as CallEntry).summary!.map((s, i) => (
                            <li key={i} className="text-foreground">• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {entry.kind === 'call' && (entry as CallEntry).next_steps && (entry as CallEntry).next_steps!.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Next Steps</p>
                        <ul className="text-xs space-y-1">
                          {(entry as CallEntry).next_steps!.map((s, i) => (
                            <li key={i} className="text-foreground">• {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {entry.phone_number && (
                      <p className="text-[11px] text-muted-foreground">
                        {entry.direction === 'incoming' ? 'From' : 'To'}: {entry.phone_number}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
