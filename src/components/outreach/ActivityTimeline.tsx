import { useMemo } from 'react';
import type { Tables } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Mail, Phone, Linkedin, SkipForward, CalendarClock, MessageSquareReply, Sparkles, UserPlus, CircleStop, type LucideIcon } from 'lucide-react';
import { buildTimeline, type ActivityKind } from '@/lib/outreachActivity';
import { ctDate } from '@/lib/outreachCadence';
import { cn } from '@/lib/utils';

type Props = {
  enrollment: Tables<'outreach_enrollments'>;
  contact: Tables<'outreach_contacts'> | null | undefined;
  touches: Tables<'outreach_touches'>[];
  /** Optional user id -> display name, used to show who completed a touch. */
  names?: Record<string, string>;
  className?: string;
};

const KIND: Record<ActivityKind, { icon: LucideIcon; label: string; tone: string }> = {
  email_sent: { icon: Mail, label: 'Email', tone: 'text-amber-500' },
  call: { icon: Phone, label: 'Call', tone: 'text-blue-500' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', tone: 'text-sky-600' },
  skipped: { icon: SkipForward, label: 'Skipped', tone: 'text-muted-foreground' },
  snoozed: { icon: CalendarClock, label: 'Snoozed', tone: 'text-muted-foreground' },
  reply: { icon: MessageSquareReply, label: 'Reply', tone: 'text-green-600' },
  research: { icon: Sparkles, label: 'Research', tone: 'text-purple-500' },
  enrolled: { icon: UserPlus, label: 'Enrolled', tone: 'text-primary' },
  stopped: { icon: CircleStop, label: 'Status', tone: 'text-destructive' },
};

/** Presentational, read-only activity history for one cadence contact. */
export function ActivityTimeline({ enrollment, contact, touches, names, className }: Props) {
  const events = useMemo(() => buildTimeline(enrollment, touches, contact, names), [enrollment, touches, contact, names]);
  if (!events.length) return <p className={cn('text-sm text-muted-foreground', className)}>No activity yet</p>;
  return <ol className={cn('relative space-y-4 border-l border-border pl-6', className)} aria-label="Cadence activity">
    {events.map((event, i) => {
      const { icon: Icon, label, tone } = KIND[event.kind];
      return <li key={`${event.kind}-${event.at}-${i}`} className="relative">
        <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background" aria-hidden="true"><Icon className={cn('h-3.5 w-3.5', tone)} /></span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">{label}: </span>
          <p className="text-sm font-medium break-words">{event.title}</p>
          {event.outcome && <Badge variant="outline" className="text-xs">{event.outcome}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground"><time dateTime={event.at}>{ctDate(event.at)}</time>{event.by ? ` · ${event.by}` : ''}</p>
        {event.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{event.detail}</p>}
      </li>;
    })}
  </ol>;
}
