/**
 * Payout runs — schedule and execute real payments to affiliate partners.
 *
 * A run collects every released credit up to a chosen pay date, drops partners
 * who have not reached their own minimum, and then gets executed once the bank
 * transfer has actually gone out. Executing a run releases those months: the
 * credits flip to paid and leave the partner's outstanding balance.
 *
 * Earnings themselves are gateway-only; nothing here shows our cost or margin.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Banknote, CalendarClock, ChevronDown, ChevronRight, Landmark, Loader2, RefreshCw, XCircle } from "lucide-react";
import {
  DEFAULT_MINIMUM_PAYOUT,
  RUN_STATUS_LABEL,
  fmtUsd,
  selectRunEntries,
} from "@/lib/affiliatePayouts";

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? (n as number) : 0;
};

const today = () => new Date().toISOString().slice(0, 10);

interface RunRow {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_amount: number | string | null;
  partner_count: number;
  minimum_payout: number | string | null;
  reference: string | null;
  notes: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface EntryRow {
  id: string;
  referrer_id: string;
  payout_run_id: string | null;
  amount: number | string | null;
  status: string;
  entry_type: string;
  period_start: string | null;
  period_end: string | null;
  payable_on: string | null;
  description: string | null;
}

interface PartnerRow {
  id: string;
  full_name: string;
  email: string | null;
  minimum_payout: number | string | null;
  bank_name: string | null;
  bank_account_last4: string | null;
}

export default function PayoutRuns() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [payDate, setPayDate] = useState(today());
  const [payTarget, setPayTarget] = useState<RunRow | null>(null);
  const [reference, setReference] = useState("");
  const [cancelTarget, setCancelTarget] = useState<RunRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [runRes, entryRes, partnerRes] = await Promise.all([
      supabase.from("referrer_payout_runs").select("*").order("created_at", { ascending: false }).limit(60),
      supabase
        .from("referrer_ledger_entries")
        .select("id, referrer_id, payout_run_id, amount, status, entry_type, period_start, period_end, payable_on, description")
        .neq("status", "void")
        .order("period_end", { ascending: false, nullsFirst: false })
        .limit(1000),
      supabase
        .from("referrers")
        .select("id, full_name, email, minimum_payout, bank_name, bank_account_last4")
        .order("full_name"),
    ]);
    if (runRes.error) toast.error("Could not load payout runs");
    setRuns((runRes.data ?? []) as RunRow[]);
    setEntries((entryRes.data ?? []) as EntryRow[]);
    setPartners((partnerRes.data ?? []) as PartnerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const partnerName = useCallback(
    (id: string) => partners.find((p) => p.id === id)?.full_name ?? "Partner",
    [partners],
  );

  const minimums = useMemo(
    () => new Map(partners.map((p) => [p.id, num(p.minimum_payout) || DEFAULT_MINIMUM_PAYOUT])),
    [partners],
  );

  /** Credits released and not yet attached to a run. */
  const unassigned = useMemo(
    () => entries.filter((e) => e.status === "payable" && !e.payout_run_id),
    [entries],
  );

  const preview = useMemo(() => selectRunEntries(unassigned, minimums, payDate), [unassigned, minimums, payDate]);

  const onHold = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.status !== "pending") continue;
      map.set(e.referrer_id, (map.get(e.referrer_id) ?? 0) + num(e.amount));
    }
    return map;
  }, [entries]);

  /** Create the run and attach the selected credits. Nothing is paid yet. */
  const scheduleRun = async () => {
    if (!preview.entryIds.length) {
      toast.info("Nothing is released for that pay date yet.");
      return;
    }
    setWorking("schedule");
    try {
      const included = unassigned.filter((e) => preview.entryIds.includes(e.id));
      const starts = included.map((e) => e.period_start).filter(Boolean) as string[];
      const ends = included.map((e) => e.period_end).filter(Boolean) as string[];
      const { data: run, error } = await supabase
        .from("referrer_payout_runs")
        .insert({
          period_start: starts.sort()[0] ?? payDate,
          period_end: ends.sort().slice(-1)[0] ?? payDate,
          status: "draft",
          minimum_payout: DEFAULT_MINIMUM_PAYOUT,
          total_amount: preview.total,
          partner_count: preview.perPartner.size,
          notes: `Scheduled to pay on ${payDate}`,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: attachError } = await supabase
        .from("referrer_ledger_entries")
        .update({ payout_run_id: run.id })
        .in("id", preview.entryIds);
      if (attachError) throw attachError;

      toast.success(
        `Run scheduled for ${payDate} — ${fmtUsd(preview.total)} across ${preview.perPartner.size} partner${preview.perPartner.size === 1 ? "" : "s"}.`,
      );
      setExpanded(run.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the run");
    } finally {
      setWorking(null);
    }
  };

  const approveRun = async (run: RunRow) => {
    setWorking(`approve-${run.id}`);
    const { error } = await supabase
      .from("referrer_payout_runs")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", run.id);
    setWorking(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Run approved — ready to send.");
    await load();
  };

  /** The transfer has gone out: release those months for every partner in it. */
  const executeRun = async () => {
    if (!payTarget) return;
    setWorking(`pay-${payTarget.id}`);
    try {
      const paidAt = new Date().toISOString();
      const { error: entryError } = await supabase
        .from("referrer_ledger_entries")
        .update({ status: "paid", paid_at: paidAt })
        .eq("payout_run_id", payTarget.id);
      if (entryError) throw entryError;

      const { error: runError } = await supabase
        .from("referrer_payout_runs")
        .update({ status: "paid", paid_at: paidAt, reference: reference.trim() || null })
        .eq("id", payTarget.id);
      if (runError) throw runError;

      toast.success("Payment recorded — partner balances updated.");
      setPayTarget(null);
      setReference("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the payment");
    } finally {
      setWorking(null);
    }
  };

  /** Cancel a scheduled run: the credits go back to the ready-to-pay pool. */
  const cancelRun = async () => {
    if (!cancelTarget) return;
    setWorking(`cancel-${cancelTarget.id}`);
    try {
      const { error: detach } = await supabase
        .from("referrer_ledger_entries")
        .update({ payout_run_id: null })
        .eq("payout_run_id", cancelTarget.id);
      if (detach) throw detach;
      const { error } = await supabase
        .from("referrer_payout_runs")
        .update({ status: "void" })
        .eq("id", cancelTarget.id);
      if (error) throw error;
      toast.success("Run cancelled — those months are ready to pay again.");
      setCancelTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the run");
    } finally {
      setWorking(null);
    }
  };

  if (roleLoading) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className="p-6 text-sm text-muted-foreground">You do not have access to partner payouts.</div>
      </AppLayout>
    );
  }

  const runEntries = (runId: string) => entries.filter((e) => e.payout_run_id === runId);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Payout runs</h1>
            <p className="text-sm text-muted-foreground">
              Schedule a payment date, then record the transfer to release each partner's outstanding months.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Schedule a run</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="pay-date" className="text-xs">Pay date</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value || today())}
                className="w-[170px]"
              />
            </div>
            <Button onClick={scheduleRun} disabled={working === "schedule" || !preview.entryIds.length} size="sm">
              {working === "schedule" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
              Schedule {preview.total > 0 ? fmtUsd(preview.total) : "run"}
            </Button>
            <p className="text-xs text-muted-foreground max-w-lg">
              Includes every released month up to that date. A partner under their minimum ({fmtUsd(DEFAULT_MINIMUM_PAYOUT)} by
              default) rolls over to the next run.
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead className="text-right">In this run</TableHead>
                  <TableHead className="text-right">Still on hold</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.perPartner.size === 0 && preview.heldBack.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nothing released for {payDate}. Build the outstanding months on the Affiliates page first.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {[...preview.perPartner.entries()].map(([id, amount]) => {
                      const p = partners.find((x) => x.id === id);
                      return (
                        <TableRow key={id}>
                          <TableCell className="text-sm font-medium">{partnerName(id)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p?.bank_name ? `${p.bank_name} ••${p.bank_account_last4 ?? "----"}` : "No bank details"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{fmtUsd(amount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {fmtUsd(onHold.get(id) ?? 0)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">Ready</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {preview.heldBack.map((h) => (
                      <TableRow key={`hold-${h.referrerId}`} className="opacity-70">
                        <TableCell className="text-sm">{partnerName(h.referrerId)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtUsd(0)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{fmtUsd(h.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            Under {fmtUsd(h.minimum)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Runs</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Created</TableHead>
                  <TableHead>Months covered</TableHead>
                  <TableHead>Partners</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      No payout runs yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.flatMap((run) => {
                    const open = expanded === run.id;
                    const rows = [
                      <TableRow key={run.id}>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(open ? null : run.id)}>
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(run.created_at), "d MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(run.period_start), "MMM yyyy")} – {format(parseISO(run.period_end), "MMM yyyy")}
                        </TableCell>
                        <TableCell className="text-sm">{run.partner_count}</TableCell>
                        <TableCell>
                          <Badge
                            variant={run.status === "paid" ? "secondary" : run.status === "void" ? "outline" : "default"}
                            className="text-[10px]"
                          >
                            {RUN_STATUS_LABEL[run.status] ?? run.status}
                          </Badge>
                          {run.notes && run.status !== "paid" ? (
                            <span className="block text-[10px] text-muted-foreground mt-1">{run.notes}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{run.reference ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{fmtUsd(run.total_amount)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {run.status === "draft" && (
                              <Button size="sm" variant="outline" onClick={() => void approveRun(run)} disabled={working === `approve-${run.id}`}>
                                Approve
                              </Button>
                            )}
                            {(run.status === "draft" || run.status === "approved") && (
                              <>
                                <Button size="sm" onClick={() => { setPayTarget(run); setReference(run.reference ?? ""); }}>
                                  Record payment
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setCancelTarget(run)}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {run.status === "paid" && run.paid_at && (
                              <span className="text-xs text-muted-foreground">
                                Paid {format(parseISO(run.paid_at), "d MMM yyyy")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>,
                    ];
                    if (open) {
                      const detail = runEntries(run.id);
                      rows.push(
                        <TableRow key={`${run.id}-detail`}>
                          <TableCell colSpan={8} className="bg-muted/40">
                            {detail.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No credits attached to this run.</p>
                            ) : (
                              <div className="py-2 space-y-1">
                                {detail.map((e) => (
                                  <div key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-medium min-w-[140px]">{partnerName(e.referrer_id)}</span>
                                    <span className="text-muted-foreground min-w-[80px]">
                                      {e.period_end ? format(parseISO(e.period_end), "MMM yyyy") : "—"}
                                    </span>
                                    <span className="text-muted-foreground flex-1">
                                      {(e.description ?? "").replace(/^.*—\s*/, "") || "Referral commission"}
                                    </span>
                                    <span className="tabular-nums font-medium">{fmtUsd(e.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>,
                      );
                    }
                    return rows;
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record the payment</DialogTitle>
            <DialogDescription>
              This releases every month in the run: {payTarget ? fmtUsd(payTarget.total_amount) : ""} across{" "}
              {payTarget?.partner_count ?? 0} partner{payTarget?.partner_count === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pay-ref" className="text-xs">Bank reference (optional)</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ACH batch or confirmation number" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={executeRun} disabled={!!working?.startsWith("pay-")}>
              {working?.startsWith("pay-") ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
            <AlertDialogDescription>
              The months in it go back to ready-to-pay and can be scheduled again. Nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancelRun}>Cancel run</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
