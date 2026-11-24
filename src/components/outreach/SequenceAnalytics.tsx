import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Phone, Linkedin, HelpCircle, EyeOff } from 'lucide-react';
import { sequenceMetrics, type AnalyticsContact, type AnalyticsEnrollment, type AnalyticsTouch } from '@/lib/outreachAnalytics';

/**
 * HubSpot-style sequence performance for the 12-touch cadence.
 * Presentational only: the caller passes rows it already loaded. Not wired into a page yet.
 * Opens/clicks are not tracked anywhere in outreach, so they are labelled as such rather than shown.
 */
type Props = {
  enrollments: AnalyticsEnrollment[];
  touches: AnalyticsTouch[];
  contacts?: AnalyticsContact[];
  /** Clock for overdue tasks; defaults to render time. */
  now?: Date;
};

const pct = (r: number) => `${Math.round(r * 100)}%`;

const CHANNELS: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  call: { icon: Phone, label: 'Call' },
  linkedin: { icon: Linkedin, label: 'LinkedIn' },
};

function Bar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="flex items-center gap-2 min-w-24">
      <div className="h-2 w-16 shrink-0 rounded-full bg-muted overflow-hidden" role="presentation">
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs tabular-nums">{pct(value)}</span>
    </div>
  );
}

export function SequenceAnalytics({ enrollments, touches, contacts, now }: Props) {
  const nowMs = (now ?? new Date()).getTime();
  const m = useMemo(() => sequenceMetrics(enrollments, touches, new Date(nowMs), contacts ?? []), [enrollments, touches, contacts, nowMs]);
  const maxReplies = Math.max(1, ...m.steps.map(s => s.repliesAfterThisStep));

  const kpis: { label: string; value: string; hint: string }[] = [
    { label: 'Enrolled', value: String(m.enrolled), hint: `${m.paused} paused · ${m.finished} finished · ${m.stopped} stopped (bounced/converted) · ${m.notInterested} not interested` },
    { label: 'Active', value: String(m.active), hint: 'Still in the cadence' },
    { label: 'Reply rate', value: pct(m.replyRate), hint: `${m.replied} replied · ${m.positiveOrMaybe} positive/maybe · ${m.notInterested} not interested` },
    { label: 'Meetings booked', value: String(m.meetingsBooked), hint: `${pct(m.meetingRate)} of enrolled` },
    { label: 'Overdue tasks', value: String(m.overdueTasks), hint: 'Next step past its due time' },
  ];

  return (
    <section aria-labelledby="sequence-performance-heading" className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sequence-performance-heading" className="text-lg font-semibold">Sequence performance</h2>
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><EyeOff className="h-3 w-3" aria-hidden="true" />Opens not tracked · Clicks not tracked</p>
      </div>

      <div role="list" aria-label="Sequence totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(k => (
          <Card key={k.label} role="listitem" className="min-w-0">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
              <p className="text-xs text-muted-foreground break-words">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="min-w-0">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base">Step performance</CardTitle>
          <CardDescription>
            Completion counts only steps that are done, skipped or already due; steps not yet due are left out.
            Each reply is credited to the step that captured it, or to the last step completed before it arrived.
            {m.unattributedReplies > 0 && ` ${m.unattributedReplies} ${m.unattributedReplies === 1 ? 'reply' : 'replies'} came before any completed step.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* The shadcn Table wraps itself in an overflow-auto div, so the table scrolls inside the card at 360px. */}
          <Table className="min-w-[560px]">
            <TableCaption className="sr-only">Per-step completion and replies for the 12-step cadence</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Step</TableHead>
                <TableHead scope="col">Day</TableHead>
                <TableHead scope="col">Channel</TableHead>
                <TableHead scope="col" className="text-right">Completed</TableHead>
                <TableHead scope="col" className="text-right">Skipped</TableHead>
                <TableHead scope="col" className="text-right">Pending</TableHead>
                <TableHead scope="col">Completion</TableHead>
                <TableHead scope="col">Replies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.steps.map(s => {
                const ch = s.channel ? CHANNELS[s.channel] : undefined;
                const Icon = ch?.icon ?? HelpCircle;
                const channelLabel = ch?.label ?? s.channel ?? 'Not scheduled';
                return (
                  <TableRow key={s.touchNumber}>
                    <TableHead scope="row" className="font-medium text-foreground">
                      <span className="whitespace-nowrap">{s.touchNumber}/{m.steps.length}</span>
                      {s.title && <span className="block text-xs font-normal text-muted-foreground max-w-48 truncate" title={s.title}>{s.title}</span>}
                    </TableHead>
                    <TableCell className="tabular-nums">{s.workingDay ?? '—'}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs whitespace-nowrap"><Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />{channelLabel}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.skipped}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.pending}</TableCell>
                    <TableCell><Bar value={s.completionRate} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-12 shrink-0 rounded-full bg-muted overflow-hidden" role="presentation">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(s.repliesAfterThisStep / maxReplies) * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{s.repliesAfterThisStep}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

export default SequenceAnalytics;
