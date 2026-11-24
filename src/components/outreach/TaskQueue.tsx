import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, Phone, Linkedin, ListChecks, Play, ChevronLeft, ChevronRight, SkipForward, X, CheckCircle2, ArrowLeft } from 'lucide-react';
import { ctDate } from '@/lib/outreachCadence';
import { advance, type QueueCounts, type QueueItem, type QueueScope, type QueueChannelFilter } from '@/lib/outreachQueue';

/**
 * HubSpot-style task queue. Presentational only: the parent builds `items`
 * and `counts` with buildQueue()/queueCounts() and supplies `renderTask`,
 * which renders the working surface (send email, log call, ...) for one task.
 * When a task is completed, skipped or snoozed the parent refetches and the
 * task drops out of `items`; the queue then advances on its own.
 */
export type TaskQueueProps = {
  items: QueueItem[];
  counts: QueueCounts;
  scope: QueueScope;
  onScope: (scope: QueueScope) => void;
  channel: QueueChannelFilter;
  onChannel: (channel: QueueChannelFilter) => void;
  renderTask: (item: QueueItem) => ReactNode;
  onExit: () => void;
  loading?: boolean;
};

const channelIcon: Record<string, typeof Mail> = { email: Mail, call: Phone, linkedin: Linkedin };
const channelLabel: Record<string, string> = { email: 'Email', call: 'Call', linkedin: 'LinkedIn' };
const CHANNELS: QueueChannelFilter[] = ['all', 'email', 'call', 'linkedin'];

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !!target.closest('[role="textbox"],[role="combobox"],[role="listbox"],[role="menu"]');
}

function ChannelTag({ channel }: { channel: string }) {
  const Icon = channelIcon[channel] || Mail;
  return <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />{channel === 'call' ? 'Quo call' : channelLabel[channel] || channel}</span>;
}

export function TaskQueue({ items, counts, scope, onScope, channel, onChannel, renderTask, onExit, loading = false }: TaskQueueProps) {
  // Execution session: the queue as it stood when "Start" was pressed.
  const [session, setSession] = useState<QueueItem[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Session tasks the queue has seen leave. Kept in state (never recomputed from
  // a single render) and only grown from an `items` list delivered while not
  // loading, so a refetch that briefly empties `items` cannot end the session.
  const [finished, setFinished] = useState<string[]>([]);

  const liveIds = useMemo(() => new Set(items.map(i => i.touchId)), [items]);
  const finishedSet = useMemo(() => new Set(finished), [finished]);

  useEffect(() => {
    if (!session || loading) return;
    const gone = session.filter(s => !liveIds.has(s.touchId) && !finishedSet.has(s.touchId)).map(s => s.touchId);
    if (gone.length) setFinished(prev => [...prev, ...gone.filter(id => !prev.includes(id))]);
  }, [session, loading, liveIds, finishedSet]);

  // Auto-advance once the current task is confirmed finished (or the pointer was lost).
  useEffect(() => {
    if (!session || loading) return;
    if (currentId && session.some(s => s.touchId === currentId) && !finishedSet.has(currentId)) return;
    const next = advance(session, currentId, finished);
    const nextId = next < 0 ? null : session[next].touchId;
    if (nextId !== currentId) setCurrentId(nextId);
  }, [session, currentId, loading, finished, finishedSet]);

  const remaining = session ? session.filter(s => !finishedSet.has(s.touchId)).length : 0;
  const pointer = session && currentId ? session.findIndex(s => s.touchId === currentId) : -1;
  // If the pointer is lost while tasks remain, show the first unfinished task until the effect catches up.
  const index = session && pointer < 0 && remaining > 0 ? session.findIndex(s => !finishedSet.has(s.touchId)) : pointer;
  const complete = !!session && remaining === 0;

  const start = (from?: string) => {
    if (!items.length) return;
    setSession(items);
    setFinished([]);
    setCurrentId(from && liveIds.has(from) ? from : items[0].touchId);
  };
  const exitSession = () => { setSession(null); setCurrentId(null); setFinished([]); };

  const step = useCallback((direction: 1 | -1) => {
    if (!session || index < 0) return;
    for (let i = index + direction; i >= 0 && i < session.length; i += direction) {
      if (!finishedSet.has(session[i].touchId)) { setCurrentId(session[i].touchId); return; }
    }
  }, [session, index, finishedSet]);
  const skipForNow = useCallback(() => {
    if (!session || index < 0) return;
    const next = advance(session, session[index].touchId, finished);
    if (next >= 0) setCurrentId(session[next].touchId);
  }, [session, index, finished]);

  const hasPrevious = !!session && index > 0 && session.slice(0, index).some(s => !finishedSet.has(s.touchId));
  const hasNext = !!session && index >= 0 && session.slice(index + 1).some(s => !finishedSet.has(s.touchId));

  useEffect(() => {
    if (!session || complete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'j' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (key === 'k' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, complete, step]);

  if (session) {
    if (complete) {
      return <section className="space-y-5" aria-label="Task queue">
        <div className="py-12 border-y border-border text-center" role="status">
          <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="font-semibold">Queue complete</h3>
          <p className="text-sm text-muted-foreground">{finished.length} {finished.length === 1 ? 'task' : 'tasks'} cleared from the queue.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={exitSession}><ArrowLeft className="h-4 w-4" />Back to queue</Button>
            <Button onClick={() => { exitSession(); onExit(); }}>Exit</Button>
          </div>
        </div>
      </section>;
    }
    const current = items.find(i => i.touchId === session[index].touchId) || session[index];
    const done = finished.length;
    return <section className="space-y-4" aria-label="Task queue">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" aria-live="polite">Task {index + 1} of {session.length}</p>
          <p className="text-xs text-muted-foreground" role="status">{loading ? 'Refreshing…' : `${done} cleared · ${remaining} left`}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={exitSession} aria-label="Exit task queue"><X className="h-4 w-4" />Exit</Button>
      </div>
      <Progress value={session.length ? (done / session.length) * 100 : 0} aria-label={`${done} of ${session.length} tasks done`} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold break-words">{current.company || current.email || current.contactName}</p>
          <p className="text-xs text-muted-foreground break-words">{current.contactName}{current.email ? ` · ${current.email}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Touch {current.touchNumber}/12</Badge>
          {current.overdue && <Badge variant="destructive">Overdue</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><ChannelTag channel={current.channel} /><span>{current.title}</span><span className="whitespace-nowrap">{ctDate(current.dueAt)}</span></div>
      <div className="border-y border-border py-4" key={current.touchId}>{renderTask(current)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => step(-1)} disabled={!hasPrevious} aria-label="Previous task (K)"><ChevronLeft className="h-4 w-4" />Previous</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={skipForNow} disabled={remaining < 2} aria-label="Skip for now, task stays in the queue"><SkipForward className="h-4 w-4" />Skip for now</Button>
          <Button variant="outline" size="sm" onClick={() => step(1)} disabled={!hasNext} aria-label="Next task (J)">Next<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="hidden sm:block text-xs text-muted-foreground">Keyboard: J or Right arrow for next, K or Left arrow for previous.</p>
    </section>;
  }

  return <section className="space-y-5" aria-label="Task queue">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <p className="text-2xl font-semibold text-foreground">{counts.due} due · <span className={counts.overdue ? 'text-destructive' : undefined}>{counts.overdue} overdue</span></p>
        <p className="text-xs text-muted-foreground">{counts.today} due by end of today (CT)</p>
      </div>
      <Button onClick={() => start()} disabled={loading || !items.length}><Play className="h-4 w-4" />Start {items.length} {items.length === 1 ? 'task' : 'tasks'}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex border border-border rounded-md" role="group" aria-label="Queue owner">
        <Button size="sm" variant={scope === 'mine' ? 'secondary' : 'ghost'} aria-pressed={scope === 'mine'} onClick={() => onScope('mine')}>Mine</Button>
        <Button size="sm" variant={scope === 'team' ? 'secondary' : 'ghost'} aria-pressed={scope === 'team'} onClick={() => onScope('team')}>Team</Button>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Channel filter">
        {CHANNELS.map(c => {
          const Icon = c === 'all' ? ListChecks : channelIcon[c];
          const n = c === 'all' ? counts.byChannel.email + counts.byChannel.call + counts.byChannel.linkedin : counts.byChannel[c];
          return <Button key={c} size="sm" variant={channel === c ? 'secondary' : 'outline'} aria-pressed={channel === c} onClick={() => onChannel(c)}>
            <Icon className="h-4 w-4" aria-hidden="true" />{c === 'all' ? 'All' : channelLabel[c]}<span className="text-xs text-muted-foreground">{n}</span>
          </Button>;
        })}
      </div>
    </div>
    {loading ? <div className="py-12 text-center text-muted-foreground" role="status">Loading tasks…</div>
      : !items.length ? <div className="py-12 border-y border-border text-center">
        <CheckCircle2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-semibold">No tasks in this view</h3>
        <p className="text-sm text-muted-foreground">{channel !== 'all' ? 'Try another channel or ' : 'Try '}{scope === 'mine' ? 'the team queue.' : 'again later.'}</p>
        <Button variant="link" onClick={onExit}>Back to cadence</Button>
      </div>
      : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Company / contact</TableHead><TableHead>Task</TableHead><TableHead className="hidden sm:table-cell">Due</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{items.map(item => <TableRow key={item.touchId}>
          <TableCell className="max-w-64"><p className="font-semibold break-words">{item.company || item.email || item.contactName}</p><p className="text-xs text-muted-foreground break-words">{item.contactName}{item.email ? ` · ${item.email}` : ''}</p></TableCell>
          <TableCell><ChannelTag channel={item.channel} /><p className="text-xs text-muted-foreground">{item.touchNumber}/12 · {item.title}</p><p className="sm:hidden text-xs text-muted-foreground">{ctDate(item.dueAt)}</p></TableCell>
          <TableCell className="hidden sm:table-cell text-xs whitespace-nowrap">{ctDate(item.dueAt)}{item.overdue && <Badge variant="destructive" className="ml-2">Overdue</Badge>}</TableCell>
          <TableCell><Button size="sm" variant="ghost" onClick={() => start(item.touchId)} aria-label={`Start queue at ${item.contactName}`}><Play className="h-4 w-4" /></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
  </section>;
}
