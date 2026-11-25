import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CsvContactReview } from './CsvContactReview';
import { TaskQueue } from './TaskQueue';
import { ActivityTimeline } from './ActivityTimeline';
import { SequenceAnalytics } from './SequenceAnalytics';
import { buildQueue, queueCounts, type QueueChannelFilter, type QueueItem, type QueueScope } from '@/lib/outreachQueue';
import { eligibleForResearch, researchBatch, streamResearch } from '@/lib/outreachResearch';
import { canCreateDeal, createDealFromOutreach, type ConvertClient } from '@/lib/outreachConvert';
import { Link } from 'react-router-dom';
import { Mail, Phone, Linkedin, Upload, UserPlus, Search, RefreshCw, ArrowRight, Pause, Play, Check, SkipForward, CalendarClock, Sparkles, ExternalLink, Send, Square, AlertCircle } from 'lucide-react';
import { guessMapping, previewCsv, readCsv, nextTouch, ctDate, ctInputToUtc, emailIssue, type CsvField } from '@/lib/outreachCadence';
import { toast } from 'sonner';

type Contact = Tables<'outreach_contacts'>;
type Enrollment = Tables<'outreach_enrollments'>;
type Touch = Tables<'outreach_touches'>;
type Team = { user_id: string; email: string; name: string };
type View = 'contacts' | 'queue' | 'performance';
const channelIcon = { email: Mail, call: Phone, linkedin: Linkedin };
/** Most contacts one "Research & draft list" click will research. */
const BULK_RESEARCH_LIMIT = 25;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
async function execute(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('outreach-execute', { body });
  if (error) {
    let message = error.message;
    if ('context' in error && error.context instanceof Response) { const details = await error.context.json().catch(() => ({})); message = details.error || message; }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function TeamSelect({ team, value, onChange }: { team: Team[]; value: string; onChange: (v: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label="Assigned teammate"><SelectValue placeholder="Choose teammate" /></SelectTrigger><SelectContent>{team.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}</SelectContent></Select>;
}

export function CadenceWorkspace({ campaignId, contacts, importFile, onImportFileRead }: { campaignId: string; contacts: Contact[]; importFile?: File | null; onImportFileRead?: (file: File | null) => void }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const upload = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState('mine'); const [filter, setFilter] = useState('due'); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false); const [existing, setExisting] = useState('new');
  const [assignee, setAssignee] = useState(''); const [startOn, setStartOn] = useState(today()); const [timezone, setTimezone] = useState('America/New_York');
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', company: '', phone: '', website: '', linkedin: '' });
  const [csv, setCsv] = useState<ReturnType<typeof readCsv> | null>(null);
  const [mapping, setMapping] = useState<Record<CsvField, string>>(guessMapping([]));
  const [busy, setBusy] = useState(false); const [importReport, setImportReport] = useState<string[]>([]);
  const [defaultReviewed, setDefaultReviewed] = useState(false);
  const [progress, setProgress] = useState('');
  const [importedEmails, setImportedEmails] = useState<string[]>([]);
  const [view, setView] = useState<View>('contacts');
  const [queueScope, setQueueScope] = useState<QueueScope>('mine'); const [queueChannel, setQueueChannel] = useState<QueueChannelFilter>('all');
  const [clock, setClock] = useState(() => Date.now());
  const [bulkConfirm, setBulkConfirm] = useState(false); const [bulkStatus, setBulkStatus] = useState('');
  const bulkAbort = useRef<AbortController | null>(null);
  useEffect(() => { const id = window.setInterval(() => setClock(Date.now()), 60000); return () => window.clearInterval(id); }, []);
  useEffect(() => () => bulkAbort.current?.abort(), []);
  // The queue panel stays mounted while hidden (forceMount) so a session survives a look at
  // another tab. Its j/k/arrow shortcuts listen on window, so stop just those keys at document
  // (after React handlers, before window) while the queue tab is not showing. No preventDefault:
  // native scrolling and Radix arrow navigation are untouched.
  useEffect(() => {
    if (view === 'queue') return;
    const guard = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'j' || key === 'k' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') e.stopPropagation();
    };
    document.addEventListener('keydown', guard);
    return () => document.removeEventListener('keydown', guard);
  }, [view]);
  useEffect(() => {
    if (!importFile) return;
    let active = true;
    (async () => {
      try {
        if (importFile.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB');
        const parsed = readCsv(await importFile.text());
        if (active) { setCsv(parsed); setMapping(guessMapping(parsed.headers)); setImportReport([]); setDefaultReviewed(false); setImportedEmails([]); }
      } catch (e) { if (active) toast.error(e instanceof Error ? e.message : 'CSV could not be read'); }
      finally { if (active) onImportFileRead?.(null); }
    })();
    return () => { active = false; };
  }, [importFile, onImportFileRead]);
  const teamQuery = useQuery({ queryKey: ['outreach-team', campaignId], queryFn: async () => (await execute({ action: 'team' })).team as Team[], staleTime: 60000 });
  const team = teamQuery.data || [];
  useEffect(() => { if (!assignee && team.length) setAssignee(team.find(m => m.user_id === user?.id)?.user_id || team[0].user_id); }, [team, user?.id, assignee]);
  const dataQuery = useQuery({ queryKey: ['outreach-execution', campaignId], queryFn: async () => {
    const [enrollments, touches] = await Promise.all([
      supabase.from('outreach_enrollments').select('*').eq('campaign_id', campaignId).order('created_at').limit(500),
      supabase.from('outreach_touches').select('*,outreach_enrollments!inner(campaign_id)').eq('outreach_enrollments.campaign_id', campaignId).order('touch_number').limit(6000),
    ]);
    if (enrollments.error) throw enrollments.error; if (touches.error) throw touches.error;
    return { enrollments: enrollments.data, touches: touches.data as Touch[] };
  } });
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['outreach-execution', campaignId] }), client.invalidateQueries({ queryKey: ['outreach-contacts', campaignId] })]); };
  const enrollments = dataQuery.data?.enrollments || [];
  const touches = dataQuery.data?.touches || [];
  const rows = enrollments.map(e => ({ e, c: contacts.find(c => c.id === e.contact_id), steps: touches.filter(t => t.enrollment_id === e.id), next: nextTouch(touches.filter(t => t.enrollment_id === e.id)) }));
  const visible = rows.filter(r => {
    if (scope === 'mine' && r.e.assigned_user_id !== user?.id) return false;
    if (filter === 'due' && !(r.e.status === 'active' && r.next && new Date(r.next.due_at) <= new Date())) return false;
    if (filter === 'upcoming' && !(r.e.status === 'active' && r.next && new Date(r.next.due_at) > new Date())) return false;
    if (['paused', 'replied', 'completed'].includes(filter) && r.e.status !== filter) return false;
    return [r.c?.email, r.c?.company, r.c?.first_name, r.e.assigned_email].some(v => v?.toLowerCase().includes(search.toLowerCase()));
  }).sort((a, b) => (a.next?.due_at || '').localeCompare(b.next?.due_at || ''));
  const current = rows.find(r => r.e.id === selected);
  const queueData = dataQuery.data;
  const queueItems = useMemo(() => buildQueue(queueData?.enrollments || [], queueData?.touches || [], contacts, { userId: user?.id, scope: queueScope, now: new Date(clock), channel: queueChannel, window: 'due' }), [queueData, contacts, user?.id, queueScope, queueChannel, clock]);
  const queueTotals = useMemo(() => queueCounts(queueData?.enrollments || [], queueData?.touches || [], contacts, { userId: user?.id, scope: queueScope, now: new Date(clock), channel: queueChannel, window: 'due' }), [queueData, contacts, user?.id, queueScope, queueChannel, clock]);
  const renderTask = (item: QueueItem) => {
    const row = rows.find(r => r.e.id === item.enrollmentId);
    if (!row) return <p className="text-sm text-muted-foreground">This contact is no longer in the cadence.</p>;
    return <ContactCadence key={item.touchId} enrollment={row.e} contact={row.c} touches={row.steps} team={team} userId={user?.id} refresh={refresh} />;
  };
  const bulkEligible = visible.filter(r => eligibleForResearch(r.e).ok).length;
  const bulkRunning = !!bulkStatus;
  async function researchList() {
    // Snapshot of the rows in the current filter at the moment the user confirmed.
    const list = visible.map(r => r.e);
    const names = new Map(visible.map(r => [r.e.id, r.c?.company || r.c?.email || 'contact']));
    const total = Math.min(list.filter(e => eligibleForResearch(e).ok).length, BULK_RESEARCH_LIMIT);
    if (!total) { toast.info('No contacts in this view need research'); return; }
    const controller = new AbortController(); bulkAbort.current = controller;
    let started = 0;
    setBulkStatus(`Researching 1 of ${total}`);
    try {
      const result = await researchBatch(list, { limit: BULK_RESEARCH_LIMIT, signal: controller.signal, onItem: event => { if (event.outcome === 'running') setBulkStatus(`Researching ${++started} of ${total} · ${names.get(event.id) || 'contact'}`); } });
      const low = result.done.filter(d => d.personalisation === 'low').length;
      const summary = `${result.done.length} researched${low ? ` (${low} low personalisation: add a detail before sending)` : ''} · ${result.failed.length} failed · ${result.skipped.length} skipped · ${result.remaining} remaining`;
      const firstFailure = result.failed[0] ? `${names.get(result.failed[0].id) || 'Contact'}: ${result.failed[0].message}` : '';
      const description = [summary, firstFailure].filter(Boolean).join('\n');
      if (result.stoppedReason === 'denied') toast.error(`Research stopped: ${result.stoppedMessage || 'AI provider denied the request'}`, { description });
      else if (result.stoppedReason === 'aborted') toast.info('List research stopped; no messages were sent', { description });
      else if (result.failed.length) toast.warning('List research finished with failures; no messages were sent', { description });
      else toast.success('List research finished; drafts saved, no messages were sent', { description });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'List research failed'); }
    finally { bulkAbort.current = null; setBulkStatus(''); await refresh(); }
  }
  const preview = useMemo(() => csv ? previewCsv(csv.headers, csv.rows, mapping, [...contacts.map(c => c.email), ...importedEmails]) : null, [csv, mapping, contacts, importedEmails]);
  const available = contacts.filter(c => !enrollments.some(e => e.contact_id === c.id) && !['replied', 'opted_out', 'bounced', 'converted'].includes(c.status));
  async function enroll() {
    setBusy(true);
    try {
      const data = await execute({ action: 'enroll', campaign_id: campaignId, assigned_user_id: assignee, start_on: startOn, timezone, website: form.website, linkedin: form.linkedin, ...(existing === 'new' ? { contact: { email: form.email, first_name: form.first_name, last_name: form.last_name, company: form.company, phone: form.phone } } : { contact_id: existing }) });
      await refresh(); setAddOpen(false); setSelected(data.enrollment_id); setFilter('all'); toast.success('Contact enrolled — twelve touches scheduled');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Enrolment failed'); } finally { setBusy(false); }
  }
  async function importContacts() {
    if (!preview || busy || (preview.warnings.length && !defaultReviewed)) return;
    setBusy(true); const report: string[] = []; const imported: string[] = []; let count = 0;
    let processed = 0;
    // Serial bounded batches preserve per-row results; retries never silently send contact emails.
    for (const row of preview.accepted) {
      setProgress(`Processing ${++processed} of ${preview.accepted.length}`);
      const owner = row.assignee ? team.find(m => m.email.toLowerCase() === row.assignee.toLowerCase() || m.name.toLowerCase() === row.assignee.toLowerCase())?.user_id : assignee;
      if (!owner) { report.push(`${row.email}: unknown assignee`); continue; }
      try {
        const result = await execute({ action: 'enroll', campaign_id: campaignId, assigned_user_id: owner, start_on: startOn, timezone: row.timezone || timezone, website: row.website, linkedin: row.linkedin, import_data: row, contact: { email: row.email, first_name: row.first_name, last_name: row.last_name, company: row.company, phone: row.phone } });
        imported.push(row.email); if (result.existing) report.push(`${row.email}: already enrolled`); else count++;
      } catch (e) { report.push(`${row.email}: ${e instanceof Error ? e.message : 'Failed'}`); }
    }
    setImportReport([`${count} enrolled; ${report.length + preview.issues.length} skipped`, ...preview.issues, ...report]);
    setImportedEmails(previous => [...previous, ...imported]);
    try { await refresh(); setFilter('all'); if (count) toast.success(`${count} contacts enrolled`); else toast.info('No new contacts enrolled — review the import results'); }
    catch { toast.error('Contacts saved; refresh the list to see the latest results'); }
    finally { setBusy(false); setProgress(''); }
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-border pb-4">
      {[
        ['Active', enrollments.filter(e => e.status === 'active').length],
        ['Due now', rows.filter(r => r.e.status === 'active' && r.next && new Date(r.next.due_at) <= new Date()).length],
        ['Touches completed', touches.filter(t => t.status === 'completed').length],
        ['Replies', enrollments.filter(e => e.status === 'replied').length],
        ['Meetings', touches.filter(t => t.outcome === 'meeting_booked').length],
      ].map(([label, count]) => <div key={label}><p className="text-2xl font-semibold text-foreground">{count}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}
    </div>
    <Tabs value={view} onValueChange={v => setView(v as View)} className="space-y-5">
    <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto" aria-label="Cadence view">
      <TabsTrigger value="contacts" className="text-xs sm:text-sm">Contacts</TabsTrigger>
      <TabsTrigger value="queue" className="gap-1 px-1.5 text-xs sm:px-3 sm:text-sm" aria-label={queueTotals.due ? `Task queue, ${queueTotals.due} due` : 'Task queue'}><span className="sm:hidden">Queue</span><span className="hidden sm:inline">Task queue</span>{queueTotals.due ? <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-primary sm:text-xs" aria-hidden="true">{queueTotals.due > 99 ? '99+' : queueTotals.due}</span> : null}</TabsTrigger>
      <TabsTrigger value="performance" className="text-xs sm:text-sm">Performance</TabsTrigger>
    </TabsList>
    {(dataQuery.isError || teamQuery.isError) && <div role="alert" className="flex gap-2 text-destructive"><AlertCircle className="h-4 w-4" />{dataQuery.error?.message || teamQuery.error?.message}<Button variant="link" onClick={() => { dataQuery.refetch(); teamQuery.refetch(); }}>Retry</Button></div>}
    {bulkRunning && <div className="flex flex-wrap items-center gap-2 border border-border rounded-md p-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
      <p role="status" className="min-w-0 flex-1 text-sm text-primary break-words">{bulkStatus}</p>
      <Button size="sm" variant="outline" aria-label="Stop list research" onClick={() => bulkAbort.current?.abort()}><Square className="h-3 w-3" />Stop</Button>
      <p className="w-full text-xs text-muted-foreground">Up to {BULK_RESEARCH_LIMIT} contacts per run · nothing is sent</p>
    </div>}
    <TabsContent value="contacts" className="mt-0 space-y-5">
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex border border-border rounded-md"><Button size="sm" variant={scope === 'mine' ? 'secondary' : 'ghost'} onClick={() => setScope('mine')}>Mine</Button><Button size="sm" variant={scope === 'team' ? 'secondary' : 'ghost'} onClick={() => setScope('team')}>Team</Button></div>
      <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-36" aria-label="Cadence status"><SelectValue /></SelectTrigger><SelectContent>{[['due', 'Due now'], ['upcoming', 'Upcoming'], ['all', 'All contacts'], ['paused', 'Paused'], ['replied', 'Replied'], ['completed', 'Completed']].map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent></Select>
      <div className="relative min-w-40 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search cadence" className="pl-9" placeholder="Company, contact or teammate" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Button variant="outline" size="icon" title="Refresh cadence" aria-label="Refresh cadence" onClick={refresh}><RefreshCw /></Button>
      <Button variant="outline" onClick={() => { setImportReport([]); upload.current?.click(); }}><Upload className="h-4 w-4" />CSV</Button>
      <Button variant="outline" disabled={bulkRunning || dataQuery.isLoading || !visible.length} onClick={() => setBulkConfirm(true)} title={`AI research for up to ${BULK_RESEARCH_LIMIT} contacts in this view`}><Sparkles className="h-4 w-4" />Research & draft list</Button>
      <Button onClick={() => setAddOpen(true)} disabled={!team.length}><UserPlus className="h-4 w-4" />Enrol contact</Button>
      <input ref={upload} type="file" accept=".csv,text/csv" className="hidden" aria-label="Upload cadence CSV" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB'); const parsed = readCsv(await file.text()); setCsv(parsed); setMapping(guessMapping(parsed.headers)); setDefaultReviewed(false); setImportedEmails([]); } catch (e) { toast.error(e instanceof Error ? e.message : 'CSV could not be read'); }
        if (upload.current) upload.current.value = '';
      }} />
    </div>
    {dataQuery.isLoading ? <div className="py-12 text-center text-muted-foreground">Loading cadence…</div> : !visible.length ? <div className="py-12 border-y border-border text-center"><Mail className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><h3 className="font-semibold">{enrollments.length ? 'No contacts in this view' : 'No contacts enrolled'}</h3><Button variant="link" onClick={() => enrollments.length ? setFilter('all') : setAddOpen(true)}>{enrollments.length ? 'All contacts' : 'Enrol first contact'}<ArrowRight className="h-4 w-4" /></Button></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Company / contact</TableHead><TableHead>Next touch</TableHead><TableHead>Due</TableHead><TableHead>Assigned to</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{visible.map(({ e, c, steps, next }) => {
      const Icon = channelIcon[next?.channel as keyof typeof channelIcon] || Check;
      return <TableRow key={e.id}><TableCell className="max-w-64"><p className="font-semibold break-words">{c?.company || c?.email}</p><p className="text-xs text-muted-foreground break-words">{[c?.first_name, c?.last_name].filter(Boolean).join(' ')} · {c?.email}</p></TableCell><TableCell><span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary shrink-0" />{next ? `${next.touch_number}/12 · ${next.channel === 'call' ? 'Quo call' : next.channel}` : 'Finished'}</span></TableCell><TableCell className="text-xs whitespace-nowrap">{next ? ctDate(next.due_at) : '—'}</TableCell><TableCell className="text-xs">{team.find(m => m.user_id === e.assigned_user_id)?.name || e.assigned_email}</TableCell><TableCell className="text-xs">{steps.filter(t => ['completed', 'skipped'].includes(t.status)).length}/12</TableCell><TableCell><Badge variant={e.status === 'active' ? 'secondary' : 'outline'}>{e.status}</Badge></TableCell><TableCell><Button size="icon" variant="ghost" aria-label={`Open cadence for ${c?.company || c?.email}`} title="Open contact cadence" onClick={() => setSelected(e.id)}><ArrowRight /></Button></TableCell></TableRow>;
    })}</TableBody></Table></div>}
    </TabsContent>
    <TabsContent value="queue" forceMount aria-labelledby={undefined} aria-label="Task queue" className="mt-0 data-[state=inactive]:hidden">
      <TaskQueue items={queueItems} counts={queueTotals} scope={queueScope} onScope={setQueueScope} channel={queueChannel} onChannel={setQueueChannel} renderTask={renderTask} onExit={() => setView('contacts')} loading={dataQuery.isFetching} />
    </TabsContent>
    <TabsContent value="performance" className="mt-0">
      {dataQuery.isLoading ? <div className="py-12 text-center text-muted-foreground" role="status">Loading performance…</div> : <SequenceAnalytics enrollments={enrollments} touches={touches} contacts={contacts} now={new Date(clock)} />}
    </TabsContent>
    </Tabs>
    <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}><AlertDialogContent className="max-h-[90dvh] overflow-y-auto"><AlertDialogHeader><AlertDialogTitle>Research & draft this list?</AlertDialogTitle><AlertDialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">
      <p>AI researches each company and contact in the current view, one at a time, and writes the 12 cadence drafts. This uses AI credits.</p>
      <p>Nothing is sent. Every email still needs Approve & send, and drafts you have edited are kept.</p>
      <p>{bulkEligible} of {visible.length} contacts in this view can be researched. Up to {BULK_RESEARCH_LIMIT} run per click; the rest stay for the next run. Contacts already researched, without a public HTTPS website, or not active or paused are skipped.</p>
    </div></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!bulkEligible} onClick={() => { setBulkConfirm(false); void researchList(); }}><Sparkles className="h-4 w-4" />Research {Math.min(bulkEligible, BULK_RESEARCH_LIMIT)} {Math.min(bulkEligible, BULK_RESEARCH_LIMIT) === 1 ? 'contact' : 'contacts'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Enrol contact</DialogTitle><DialogDescription>12 touches · 24 working days</DialogDescription></DialogHeader>
      <Label>Contact</Label><Select value={existing} onValueChange={setExisting}><SelectTrigger aria-label="Contact to enrol"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">New contact</SelectItem>{available.map(c => <SelectItem key={c.id} value={c.id}>{c.company || c.email} · {c.email}</SelectItem>)}</SelectContent></Select>
      {existing === 'new' && <div className="grid grid-cols-2 gap-3">{(['first_name', 'last_name', 'email', 'company', 'phone'] as const).map(f => <div key={f} className={f === 'email' ? 'col-span-2' : ''}><Label htmlFor={`cadence-${f}`}>{f.replace(/_/g, ' ')}</Label><Input id={`cadence-${f}`} type={f === 'email' ? 'email' : 'text'} value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })} /></div>)}</div>}
      <div className="grid gap-3">{(['website', 'linkedin'] as const).map(f => <div key={f}><Label htmlFor={`cadence-${f}`}>{f === 'website' ? 'Company website' : 'LinkedIn profile'}</Label><Input id={`cadence-${f}`} value={form[f]} placeholder="https://" onChange={e => setForm({ ...form, [f]: e.target.value })} /></div>)}</div>
      <Label>Assigned to</Label><TeamSelect team={team} value={assignee} onChange={setAssignee} />
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="cadence-start">Start date · Cape Town</Label><Input id="cadence-start" type="date" value={startOn} onChange={e => setStartOn(e.target.value)} /></div><div><Label>Contact timezone</Label><Select value={timezone} onValueChange={setTimezone}><SelectTrigger aria-label="Contact timezone"><SelectValue /></SelectTrigger><SelectContent>{['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'].map(z => <SelectItem value={z} key={z}>{z.split('/')[1].replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div></div>
      <Button onClick={enroll} loading={busy} disabled={!assignee || !startOn || (existing === 'new' && !form.email)}>Enrol in 12-touch cadence</Button>
    </DialogContent></Dialog>
    <Dialog open={!!csv} onOpenChange={v => { if (!busy && !v) setCsv(null); }}><DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}><DialogHeader><DialogTitle>CSV import review</DialogTitle><DialogDescription>{csv?.rows.length} rows · {preview?.accepted.length} ready · {preview?.issues.length} skipped</DialogDescription></DialogHeader>
      {csv && <CsvContactReview headers={csv.headers} mapping={mapping} onMapping={value => { setMapping(value); setDefaultReviewed(false); }} contacts={preview?.accepted || []} busy={busy} />}
      <fieldset disabled={busy} className="grid min-w-0 gap-3 sm:grid-cols-3"><div className="min-w-0"><Label>Default assignee</Label><TeamSelect team={team} value={assignee} onChange={setAssignee} /></div><div className="min-w-0"><Label htmlFor="csv-start">Start date · Cape Town</Label><Input id="csv-start" type="date" value={startOn} onChange={e => setStartOn(e.target.value)} /></div><div className="min-w-0"><Label>Default timezone</Label><Select disabled={busy} value={timezone} onValueChange={value => { setTimezone(value); setDefaultReviewed(false); }}><SelectTrigger aria-label="Default contact timezone"><SelectValue /></SelectTrigger><SelectContent>{['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'].map(z => <SelectItem key={z} value={z}>{z.split('/')[1]}</SelectItem>)}</SelectContent></Select></div></fieldset>
      {!!preview?.warnings.length && <div className="space-y-2 border-y border-border py-3"><div className="max-h-28 overflow-auto text-sm text-muted-foreground">{preview.warnings.map(w => <p key={w}>{w}</p>)}</div><div className="flex items-start gap-2"><Checkbox id="csv-default-reviewed" disabled={busy} checked={defaultReviewed} onCheckedChange={v => setDefaultReviewed(v === true)} /><Label htmlFor="csv-default-reviewed">Use {timezone} for these contacts</Label></div></div>}
      {!!(importReport.length || preview?.issues.length) && <div role="status" className="text-xs text-muted-foreground max-h-28 overflow-auto">{(importReport.length ? importReport : preview?.issues || []).map((r, i) => <p key={i}>{r}</p>)}</div>}
      {progress && <p role="status" className="text-sm text-muted-foreground">{progress}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCsv(null)}>Done</Button><Button loading={busy} disabled={busy || !preview?.accepted.length || !assignee || !startOn || (!!preview?.warnings.length && !defaultReviewed)} onClick={importContacts}><Upload className="h-4 w-4" />Import and enrol {preview?.accepted.length || 0}</Button></div>
    </DialogContent></Dialog>
    <Sheet open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><SheetContent className="z-[60] w-full sm:max-w-2xl overflow-y-auto pb-32"><SheetHeader><SheetTitle className="pr-8 break-words">{current?.c?.company || current?.c?.email || 'Contact cadence'}</SheetTitle><SheetDescription className="break-words">{current?.c?.email} · {current?.e.status}</SheetDescription></SheetHeader>{current && <ContactCadence key={current.e.id} enrollment={current.e} contact={current.c} touches={current.steps} team={team} userId={user?.id} refresh={refresh} />}</SheetContent></Sheet>
  </section>;
}

function ContactCadence({ enrollment, contact, touches, team, userId, refresh }: { enrollment: Enrollment; contact?: Contact; touches: Touch[]; team: Team[]; userId?: string; refresh: () => Promise<void> }) {
  const uid = useId();
  const next = nextTouch(touches);
  const [touchId, setTouchId] = useState(next?.id || touches[0]?.id);
  const touch = touches.find(t => t.id === touchId);
  const [subject, setSubject] = useState(touch?.subject || ''); const [draft, setDraft] = useState(touch?.draft_text || '');
  const [notes, setNotes] = useState(''); const [outcome, setOutcome] = useState('no_answer'); const [reply, setReply] = useState(''); const [providerRef, setProviderRef] = useState('');
  const [snooze, setSnooze] = useState(''); const [reason, setReason] = useState(''); const [handoffId, setHandoffId] = useState(team.find(t => t.name.toLowerCase().includes('darryn'))?.user_id || '');
  const [busy, setBusy] = useState(false); const [aiStatus, setAiStatus] = useState(''); const abort = useRef<AbortController | null>(null);
  const [website, setWebsite] = useState(enrollment.website_url || ''); const [linkedin, setLinkedin] = useState(enrollment.linkedin_url || '');
  useEffect(() => { setSubject(touch?.subject || ''); setDraft(touch?.draft_text || ''); setNotes(touch?.notes || ''); setReply(touch?.reply_word_for_word || ''); setOutcome(touch?.channel === 'linkedin' ? 'connected' : 'no_answer'); }, [touch?.id, touch?.updated_at]);
  useEffect(() => () => abort.current?.abort(), []);
  const mine = enrollment.assigned_user_id === userId;
  const actionable = mine && enrollment.status === 'active' && touch?.id === next?.id && touch.status === 'pending';
  const due = touch && new Date(touch.due_at) <= new Date();
  async function task(work: () => Promise<unknown>, success: string) { setBusy(true); try { await work(); await refresh(); toast.success(success); } catch (e) { toast.error(e instanceof Error ? e.message : 'Action failed'); } finally { setBusy(false); } }
  async function updateTouch(values: Record<string, unknown>) { if (!touch) return; const { error } = await supabase.from('outreach_touches').update(values).eq('id', touch.id).eq('enrollment_id', enrollment.id); if (error) throw error; }
  async function ai() {
    abort.current = new AbortController(); setAiStatus('Researching company…'); setBusy(true);
    try {
      const { saved, personalisation } = await streamResearch(enrollment.id, { signal: abort.current.signal, onProgress: setAiStatus });
      if (personalisation === 'low') toast.warning(`${saved} drafts saved with low personalisation`, { description: 'The website gave nothing specific to cite. Add a detail to each email before sending.' });
      else if (saved === 0) toast.info('No drafts changed', { description: 'Every draft has been edited or completed; your edits were preserved.' });
      else toast.success(`${saved} drafts saved; existing edits preserved`);
    } catch (e) { if (e instanceof Error && e.name === 'AbortError') toast.info('Research stopped'); else toast.error(e instanceof Error ? e.message : 'Research failed'); }
    finally { setAiStatus(''); setBusy(false); abort.current = null; await refresh(); }
  }
  const research = (enrollment.research || {}) as { summary?: string; facts?: { detail: string; source: string; about?: string }[] };
  const factGroups = [
    { label: 'Company', facts: (research.facts || []).filter(f => f.about !== 'person') },
    { label: 'Person', facts: (research.facts || []).filter(f => f.about === 'person') },
  ].filter(g => g.facts.length);
  const names = useMemo(() => Object.fromEntries(team.map(m => [m.user_id, m.name])), [team]);
  return <div className="mt-5 space-y-5">
    <div className="flex flex-wrap items-center gap-2"><TeamSelect team={team} value={enrollment.assigned_user_id} onChange={v => task(async () => { const { error } = await supabase.from('outreach_enrollments').update({ assigned_user_id: v }).eq('id', enrollment.id); if (error) throw error; }, 'Assignment updated')} /><Button variant="outline" disabled={busy || !['active', 'paused'].includes(enrollment.status)} onClick={() => task(async () => { const { error } = await supabase.from('outreach_enrollments').update({ status: enrollment.status === 'active' ? 'paused' : 'active' }).eq('id', enrollment.id); if (error) throw error; }, 'Cadence updated')}>{enrollment.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{enrollment.status === 'paused' ? 'Resume' : 'Pause'}</Button><Button variant="outline" disabled={busy} onClick={() => task(async () => { const data = await execute({ action: 'check_replies', enrollment_id: enrollment.id }); if (data.replied) toast.info(data.message); }, 'Reply check complete')}><RefreshCw className="h-4 w-4" />Check replies</Button></div>
    <div className="border-y border-border py-4 space-y-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold flex gap-2"><Sparkles className="h-4 w-4 text-primary" />Company research</h3>{aiStatus ? <Button size="sm" variant="outline" onClick={() => abort.current?.abort()}><Square className="h-3 w-3" />Stop</Button> : <Button size="sm" variant="outline" disabled={busy || !enrollment.website_url || !['active', 'paused'].includes(enrollment.status)} onClick={ai}><Sparkles className="h-3 w-3" />Research & draft</Button>}</div>
      <div className="grid gap-2"><Input aria-label="Company website for research" value={website} placeholder="Company website · https://" onChange={e => setWebsite(e.target.value)} /><Input aria-label="LinkedIn profile for cadence" value={linkedin} placeholder="LinkedIn profile · https://" onChange={e => setLinkedin(e.target.value)} /><Button size="sm" variant="ghost" disabled={busy} onClick={() => task(async () => { for (const url of [website, linkedin]) { if (url && new URL(url).protocol !== 'https:') throw new Error('Use HTTPS links'); } const { error } = await supabase.from('outreach_enrollments').update({ website_url: website || null, linkedin_url: linkedin || null }).eq('id', enrollment.id); if (error) throw error; }, 'Company links saved')}>Save company links</Button></div>
      {aiStatus && <p role="status" className="text-xs text-primary animate-pulse motion-reduce:animate-none">{aiStatus}</p>}{enrollment.research_error && <p role="alert" className="text-xs text-destructive break-words">{enrollment.research_error}</p>}
      {research.summary && <p className="text-sm text-muted-foreground">{research.summary}</p>}
      {factGroups.map(g => <div key={g.label} className="space-y-2"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h4>{g.facts.map((f, i) => <div key={i} className="text-xs space-y-1"><p className="break-words">{f.detail}</p>{typeof f.source === 'string' && f.source.startsWith('https://') && <a href={f.source} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{f.source}<ExternalLink className="inline h-3 w-3 ml-1" /></a>}</div>)}</div>)}
    </div>
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{touches.map(t => { const Icon = channelIcon[t.channel as keyof typeof channelIcon]; return <Button key={t.id} variant={touch?.id === t.id ? 'secondary' : 'outline'} className="h-16 flex-col gap-1 text-xs" title={t.title} onClick={() => setTouchId(t.id)}><span className="flex items-center gap-1"><Icon className="h-3 w-3" />{t.touch_number} · Day {t.working_day}</span><span className="text-muted-foreground text-[10px]">{t.status}</span></Button>; })}</div>
    {touch && <div className="space-y-3"><div><Badge variant="outline">Touch {touch.touch_number}/12</Badge><h3 className="mt-2 font-semibold">{touch.title}</h3><p className="text-xs text-muted-foreground">{ctDate(touch.due_at)}{touch.thread_touch ? ` · Reply to touch ${touch.thread_touch}` : ''}</p></div>
      {touch.channel === 'email' && <><p className="text-xs break-words"><span className="text-muted-foreground">From </span>{enrollment.assigned_email}<span className="text-muted-foreground"> · To </span>{contact?.email}</p><Label htmlFor={`${uid}-touch-subject`}>Subject</Label><Input id={`${uid}-touch-subject`} value={subject} disabled={touch.status !== 'pending'} onChange={e => setSubject(e.target.value)} /></>}
      <Label htmlFor={`${uid}-touch-draft`}>{touch.channel === 'call' ? 'Call / voicemail script' : touch.channel === 'linkedin' ? 'LinkedIn message / engagement note' : 'Email preview'}</Label><Textarea id={`${uid}-touch-draft`} rows={7} value={draft} disabled={touch.status !== 'pending'} onChange={e => setDraft(e.target.value)} className="resize-y" />
      {touch.channel === 'email' && <p className="text-xs text-muted-foreground">{draft.trim() ? draft.trim().split(/\s+/).length : 0}/89 words{emailIssue(subject, draft) ? ` · ${emailIssue(subject, draft)}` : ''}</p>}
      {touch.channel === 'call' && <div className="flex flex-wrap gap-2 items-center"><Button variant="outline" disabled={!actionable || !due || busy || !contact?.phone} onClick={() => { if (!contact?.phone) return; const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent); window.location.href = mobile ? `openphone://dial?number=${encodeURIComponent(contact.phone)}` : `tel:${contact.phone.replace(/[^+\d]/g, '')}`; toast.info('Select Quo as your calling app; record the outcome after the call'); }}><Phone className="h-4 w-4" />Open Quo call</Button><span className="text-xs text-muted-foreground">{contact?.phone || 'No phone number'}</span></div>}
      {touch.channel === 'linkedin' && enrollment.linkedin_url?.startsWith('https://') && <Button asChild variant="outline"><a href={enrollment.linkedin_url} target="_blank" rel="noopener noreferrer"><Linkedin className="h-4 w-4" />Open LinkedIn<ExternalLink className="h-3 w-3" /></a></Button>}
      <Label htmlFor={`${uid}-touch-notes`}>Notes / outcome</Label><Textarea id={`${uid}-touch-notes`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      {touch.channel !== 'email' && <><Select value={outcome} onValueChange={setOutcome}><SelectTrigger aria-label="Touch outcome"><SelectValue /></SelectTrigger><SelectContent>{[['no_answer', 'No answer'], ['voicemail', 'Voicemail left'], ['connected', 'Connected / engaged'], ['meeting_booked', 'Meeting booked'], ['positive', 'Positive reply'], ['maybe', 'Maybe / interested later'], ['not_interested', 'Not interested'], ['replied', 'Other reply']].map(([v, label]) => <SelectItem key={v} value={v} disabled={touch.touch_number === 6 && v === 'voicemail'}>{label}</SelectItem>)}</SelectContent></Select><Input aria-label="Provider call reference" placeholder="Quo call reference (optional)" value={providerRef} onChange={e => setProviderRef(e.target.value)} /></>}
      <Label htmlFor={`${uid}-touch-reply`}>Reply · exact words</Label><Textarea id={`${uid}-touch-reply`} rows={2} value={reply} onChange={e => setReply(e.target.value)} />
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !reply.trim() || !['active', 'paused'].includes(enrollment.status)} onClick={() => task(async () => { const { error } = await supabase.from('outreach_contacts').update({ status: 'replied', reply_snippet: reply, replied_at: new Date().toISOString() }).eq('id', enrollment.contact_id); if (error) throw error; }, 'Reply recorded; remaining outreach stopped')}>Record reply & stop</Button><Button variant="outline" disabled={busy || touch.status !== 'pending'} onClick={() => task(() => updateTouch({ subject, draft_text: draft, notes }), 'Draft saved')}><Check className="h-4 w-4" />Save draft</Button>
        {touch.channel === 'email' ? <Button disabled={busy || !actionable || !due || !!emailIssue(subject, draft)} onClick={() => task(async () => { const result = await execute({ action: 'send', enrollment_id: enrollment.id, touch_id: touch.id, subject, draft_text: draft }); if (result.replied) throw new Error(result.message); }, 'Email sent from the assigned person')}><Send className="h-4 w-4" />Approve & send</Button> : <Button disabled={busy || !actionable || !due || (['positive', 'maybe', 'replied', 'not_interested'].includes(outcome) && !reply.trim())} onClick={() => task(() => execute({ action: 'complete', enrollment_id: enrollment.id, touch_id: touch.id, outcome, notes, reply, provider_ref: providerRef }), 'Outcome saved')}><Check className="h-4 w-4" />Log completed touch</Button>}
      </div>
      {enrollment.status === 'active' && <div className="border-t border-border pt-3 space-y-2"><Label htmlFor={`${uid}-touch-reason`}>Skip / snooze reason</Label><Input id={`${uid}-touch-reason`} value={reason} onChange={e => setReason(e.target.value)} /><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !actionable || !reason.trim()} onClick={() => task(() => updateTouch({ status: 'skipped', notes: `${notes}\n${ctDate(new Date().toISOString())} — Skipped: ${reason}` }), 'Touch skipped')}><SkipForward className="h-4 w-4" />Skip</Button><Input aria-label="Snooze until (CT)" type="datetime-local" value={snooze} onChange={e => setSnooze(e.target.value)} className="w-48" /><Button variant="outline" disabled={busy || !actionable || !snooze || !reason.trim()} onClick={() => task(async () => { if (new Date(ctInputToUtc(snooze)) <= new Date()) throw new Error('Choose a future time'); await updateTouch({ due_at: ctInputToUtc(snooze), notes: `${notes}\n${ctDate(new Date().toISOString())} — Snoozed: ${reason}` }); }, 'Next step rescheduled')}><CalendarClock className="h-4 w-4" />Snooze</Button></div></div>}
      {touch.completed_at && <p className="text-xs text-muted-foreground">Completed {ctDate(touch.completed_at)} · {touch.outcome}{touch.provider_message_id ? ` · ${touch.provider_message_id}` : ''}</p>}
    </div>}
    {enrollment.status === 'replied' && <div className="border-t border-border pt-4 space-y-3"><h3 className="font-semibold">Warm reply · 15-minute call handoff</h3><p className="text-sm text-muted-foreground break-words">{contact?.reply_snippet}</p><TeamSelect team={team} value={handoffId} onChange={setHandoffId} /><Button disabled={busy || !handoffId} onClick={() => task(() => execute({ action: 'handoff', enrollment_id: enrollment.id, recipient_id: handoffId, reply: reply || contact?.reply_snippet || 'Positive/maybe reply — arrange a 15-minute call' }), 'Handoff notification delivered')}><ArrowRight className="h-4 w-4" />Notify handoff owner</Button></div>}
    {contact?.opportunity_id
      ? <div className="border-t border-border pt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">In the pipeline as a discovery deal.</p><Button asChild variant="outline" size="sm"><Link to={`/opportunities/${contact.opportunity_id}`}>Open deal<ArrowRight className="h-4 w-4" /></Link></Button></div>
      : contact && canCreateDeal(contact, enrollment.status, touches.map(t => t.outcome)) && <div className="border-t border-border pt-4 space-y-2"><h3 className="font-semibold">Move to pipeline</h3><p className="text-sm text-muted-foreground">Creates the account, contact and a discovery deal, and stops this sequence.</p><Button disabled={busy} onClick={() => task(async () => {
          const { data: campaign } = await supabase.from('outreach_campaigns').select('name').eq('id', enrollment.campaign_id).maybeSingle();
          await createDealFromOutreach(supabase as unknown as ConvertClient, contact, campaign?.name || 'Outreach sequence');
        }, `${contact.company || contact.email} added to the pipeline`)}><ArrowRight className="h-4 w-4" />Create deal</Button></div>}
    <div className="border-t border-border pt-4 space-y-3"><h3 className="text-sm font-semibold">Activity</h3><ActivityTimeline enrollment={enrollment} contact={contact} touches={touches} names={names} /></div>
  </div>;
}
