import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Banknote, CalendarRange, Landmark, Loader2, RefreshCw, Wallet } from "lucide-react";
import {
  DEFAULT_BONUS_AMOUNT,
  DEFAULT_BONUS_MILESTONE,
  DEFAULT_MINIMUM_PAYOUT,
  bonusesDue,
  clearsMinimum,
  fmtUsd,
  payableOnFor,
} from "@/lib/affiliatePayouts";


interface BalanceRow {
  referrer_id: string;
  full_name: string;
  email: string | null;
  active: boolean | null;
  attribution_only: boolean | null;
  minimum_payout: number | null;
  pending_amount: number | null;
  payable_amount: number | null;
  paid_amount: number | null;
  balance_amount: number | null;
  lifetime_amount: number | null;
  last_paid_at: string | null;
  last_period_end: string | null;
}

interface PayoutRun {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_amount: number | null;
  partner_count: number | null;
  reference: string | null;
  paid_at: string | null;
  created_at: string;
}

interface PeriodOption {
  id: string;
  period_start: string;
  period_end: string;
}

interface MonthRow {
  id: string;
  referrer_id: string;
  account_id: string | null;
  amount: number | string | null;
  status: string;
  period_start: string | null;
  period_end: string | null;
  payable_on: string | null;
  description: string | null;
  entry_type: string;
}


interface BankForm {
  bank_account_name: string;
  bank_name: string;
  bank_routing_last4: string;
  bank_account_last4: string;
  minimum_payout: number;
  payout_notes: string;
}

const emptyBank: BankForm = {
  bank_account_name: "",
  bank_name: "",
  bank_routing_last4: "",
  bank_account_last4: "",
  minimum_payout: DEFAULT_MINIMUM_PAYOUT,
  payout_notes: "",
};

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v) || 0);

const periodLabel = (start: string, end: string) =>
  `${format(parseISO(start), "d MMM yyyy")} – ${format(parseISO(end), "d MMM yyyy")}`;

/**
 * Admin view of the affiliate payout programme: live balance per partner, the
 * month-by-month gateway earnings behind those balances, credit generation and
 * monthly payout runs. Partners earn on the gateway margin only — processing
 * residuals never form part of a payout.
 */
export function AffiliatePayoutsPanel() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [runs, setRuns] = useState<PayoutRun[]>([]);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const [bankTarget, setBankTarget] = useState<BalanceRow | null>(null);
  const [bankForm, setBankForm] = useState<BankForm>(emptyBank);
  const [payTarget, setPayTarget] = useState<PayoutRun | null>(null);
  const [payReference, setPayReference] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [balanceRes, runRes, periodRes, monthRes] = await Promise.all([
      supabase.from("referrer_balances").select("*").order("balance_amount", { ascending: false }),
      supabase.from("referrer_payout_runs").select("*").order("period_end", { ascending: false }).limit(24),
      supabase.from("commission_periods").select("id, period_start, period_end").order("period_end", { ascending: false }).limit(24),
      supabase
        .from("referrer_ledger_entries")
        .select("id, referrer_id, account_id, amount, status, period_start, period_end, payable_on, description, entry_type")
        .neq("status", "void")
        .order("period_end", { ascending: false, nullsFirst: false })
        .limit(500),
    ]);
    if (balanceRes.error) toast.error("Could not load partner balances");
    setBalances(((balanceRes.data ?? []) as unknown[] as BalanceRow[]).filter((b) => !!b.referrer_id));
    setRuns((runRes.data ?? []) as PayoutRun[]);
    setMonths((monthRes.data ?? []) as MonthRow[]);
    const periodRows = (periodRes.data ?? []) as PeriodOption[];
    setPeriods(periodRows);
    setPeriodId((prev) => prev || periodRows[0]?.id || "");
    setLoading(false);
  }, []);


  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return balances.reduce(
      (acc, b) => ({
        pending: acc.pending + num(b.pending_amount),
        payable: acc.payable + num(b.payable_amount),
        paid: acc.paid + num(b.paid_amount),
        owed: acc.owed + num(b.balance_amount),
      }),
      { pending: 0, payable: 0, paid: 0, owed: 0 },
    );
  }, [balances]);

  const selectedPeriod = periods.find((p) => p.id === periodId) ?? null;

  /** Earnings grouped per partner, newest month first. */
  const monthsByPartner = useMemo(() => {
    const map = new Map<string, MonthRow[]>();
    for (const m of months) {
      const list = map.get(m.referrer_id) ?? [];
      list.push(m);
      map.set(m.referrer_id, list);
    }
    return map;
  }, [months]);

  /**
   * Build (or backdate) every month a referred merchant has been billed for the
   * gateway, and release anything whose 30-day hold has passed. Idempotent.
   */
  const buildOutstanding = async () => {
    setWorking("backdate");
    try {
      const { data, error } = await supabase.rpc("build_referrer_ledger");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const inserted = num(row?.inserted);
      const promoted = num(row?.promoted);
      if (!inserted && !promoted) {
        toast.info("No new months to add — every referred merchant is up to date.");
      } else {
        toast.success(
          `${inserted} month${inserted === 1 ? "" : "s"} added, ${promoted} released for payment.`,
        );
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the outstanding months");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Turn the selected month's gateway margin into partner credits, then top up
   * any milestone bonuses earned since the last run. Credits are idempotent:
   * one per (partner, merchant, month).
   */
  const generateCredits = async () => {
    if (!selectedPeriod) {
      toast.error("Pick a commission month first");
      return;
    }
    setWorking("generate");
    try {
      const { data: records, error } = await supabase
        .from("referrer_commission_records")
        .select("record_id, referrer_id, account_id, company_name, payout, period_start, period_end")
        .eq("period_id", selectedPeriod.id);
      if (error) throw error;

      const rows = (records ?? []).filter((r) => r.referrer_id && num(r.payout) > 0);
      const recordIds = rows.map((r) => r.record_id as string);

      const { data: existing } = recordIds.length
        ? await supabase
            .from("referrer_ledger_entries")
            .select("commission_record_id")
            .in("commission_record_id", recordIds)
        : { data: [] as { commission_record_id: string | null }[] };
      const seen = new Set((existing ?? []).map((e) => e.commission_record_id));
      // A month accrued by the backdating routine already covers this merchant.
      const seenMonths = new Set(
        months
          .filter((m) => m.entry_type === "commission" && m.account_id)
          .map((m) => `${m.referrer_id}|${m.account_id}|${m.period_start}`),
      );

      const inserts = rows
        .filter((r) => !seen.has(r.record_id as string))
        .filter((r) => !seenMonths.has(`${r.referrer_id}|${r.account_id}|${r.period_start}`))
        .map((r) => ({
          referrer_id: r.referrer_id as string,
          entry_type: "commission",
          amount: num(r.payout),
          period_start: r.period_start as string,
          period_end: r.period_end as string,
          payable_on: payableOnFor(r.period_end as string),
          account_id: (r.account_id as string) ?? null,
          commission_record_id: r.record_id as string,
          description: `Gateway referral commission — ${r.company_name ?? "merchant"}`,
        }));

      if (inserts.length) {
        const { error: insertError } = await supabase.from("referrer_ledger_entries").insert(inserts);
        if (insertError) throw insertError;
      }

      const bonusCount = await generateBonuses(selectedPeriod);
      toast.success(
        `${inserts.length} commission credit${inserts.length === 1 ? "" : "s"} and ${bonusCount} bonus credit${bonusCount === 1 ? "" : "s"} added.`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate credits");
    } finally {
      setWorking(null);
    }
  };


  /** $500 for every 5 merchants boarded, counted once per milestone. */
  const generateBonuses = async (period: PeriodOption): Promise<number> => {
    const { data: partners } = await supabase
      .from("referrers")
      .select("id, bonus_amount, bonus_milestone_count")
      .eq("active", true);

    const { data: won } = await supabase
      .from("opportunities")
      .select("referrer_id, account_id, stage")
      .eq("stage", "closed_won")
      .not("referrer_id", "is", null);

    const { data: bonusEntries } = await supabase
      .from("referrer_ledger_entries")
      .select("referrer_id")
      .eq("entry_type", "bonus");

    const boarded = new Map<string, Set<string>>();
    for (const o of won ?? []) {
      if (!o.referrer_id || !o.account_id) continue;
      const set = boarded.get(o.referrer_id) ?? new Set<string>();
      set.add(o.account_id);
      boarded.set(o.referrer_id, set);
    }
    const awarded = new Map<string, number>();
    for (const b of bonusEntries ?? []) {
      awarded.set(b.referrer_id, (awarded.get(b.referrer_id) ?? 0) + 1);
    }

    const inserts: {
      referrer_id: string;
      entry_type: string;
      amount: number;
      period_start: string;
      period_end: string;
      payable_on: string;
      description: string;
    }[] = [];
    for (const p of partners ?? []) {
      const milestone = num(p.bonus_milestone_count) || DEFAULT_BONUS_MILESTONE;
      const amount = num(p.bonus_amount) || DEFAULT_BONUS_AMOUNT;
      const due = bonusesDue(boarded.get(p.id)?.size ?? 0, awarded.get(p.id) ?? 0, milestone);
      for (let i = 0; i < due; i += 1) {
        inserts.push({
          referrer_id: p.id,
          entry_type: "bonus",
          amount,
          period_start: period.period_start,
          period_end: period.period_end,
          payable_on: payableOnFor(period.period_end),
          description: `Milestone bonus — ${milestone} merchants boarded`,
        });
      }
    }
    if (!inserts.length) return 0;
    const { error } = await supabase.from("referrer_ledger_entries").insert(inserts);
    if (error) throw error;
    return inserts.length;
  };

  /** Batch every ready-to-pay credit that clears each partner's minimum. */
  const createRun = async () => {
    setWorking("run");
    try {
      const { data: entries, error } = await supabase
        .from("referrer_ledger_entries")
        .select("id, referrer_id, amount, period_start, period_end")
        .eq("status", "payable")
        .is("payout_run_id", null);
      if (error) throw error;
      if (!entries?.length) {
        toast.info("Nothing is ready to pay yet.");
        return;
      }

      const minimums = new Map(balances.map((b) => [b.referrer_id, num(b.minimum_payout) || DEFAULT_MINIMUM_PAYOUT]));
      const byPartner = new Map<string, { ids: string[]; total: number }>();
      for (const e of entries) {
        const bucket = byPartner.get(e.referrer_id) ?? { ids: [], total: 0 };
        bucket.ids.push(e.id);
        bucket.total += num(e.amount);
        byPartner.set(e.referrer_id, bucket);
      }

      const included: string[] = [];
      let total = 0;
      let partnerCount = 0;
      for (const [partnerId, bucket] of byPartner) {
        if (!clearsMinimum(bucket.total, minimums.get(partnerId) ?? DEFAULT_MINIMUM_PAYOUT)) continue;
        included.push(...bucket.ids);
        total += bucket.total;
        partnerCount += 1;
      }
      if (!included.length) {
        toast.info("No partner has reached their minimum payout yet — balances roll over.");
        return;
      }

      const starts = entries.map((e) => e.period_start).filter(Boolean) as string[];
      const ends = entries.map((e) => e.period_end).filter(Boolean) as string[];
      const { data: run, error: runError } = await supabase
        .from("referrer_payout_runs")
        .insert({
          period_start: starts.sort()[0] ?? new Date().toISOString().slice(0, 10),
          period_end: ends.sort().slice(-1)[0] ?? new Date().toISOString().slice(0, 10),
          status: "approved",
          minimum_payout: DEFAULT_MINIMUM_PAYOUT,
          total_amount: Math.round(total * 100) / 100,
          partner_count: partnerCount,
          approved_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (runError) throw runError;

      const { error: attachError } = await supabase
        .from("referrer_ledger_entries")
        .update({ payout_run_id: run.id })
        .in("id", included);
      if (attachError) throw attachError;

      toast.success(`Payout run created — ${fmtUsd(total)} across ${partnerCount} partner${partnerCount === 1 ? "" : "s"}.`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the payout run");
    } finally {
      setWorking(null);
    }
  };

  const markPaid = async () => {
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
        .update({ status: "paid", paid_at: paidAt, reference: payReference.trim() || null })
        .eq("id", payTarget.id);
      if (runError) throw runError;

      toast.success("Payout run marked as paid.");
      setPayTarget(null);
      setPayReference("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark the run paid");
    } finally {
      setWorking(null);
    }
  };

  const openBank = async (row: BalanceRow) => {
    const { data } = await supabase
      .from("referrers")
      .select("bank_account_name, bank_name, bank_routing_last4, bank_account_last4, minimum_payout, payout_notes")
      .eq("id", row.referrer_id)
      .maybeSingle();
    setBankForm({
      bank_account_name: data?.bank_account_name ?? "",
      bank_name: data?.bank_name ?? "",
      bank_routing_last4: data?.bank_routing_last4 ?? "",
      bank_account_last4: data?.bank_account_last4 ?? "",
      minimum_payout: num(data?.minimum_payout) || DEFAULT_MINIMUM_PAYOUT,
      payout_notes: data?.payout_notes ?? "",
    });
    setBankTarget(row);
  };

  const saveBank = async () => {
    if (!bankTarget) return;
    setWorking("bank");
    const { error } = await supabase
      .from("referrers")
      .update({
        payout_method: "ach",
        bank_account_name: bankForm.bank_account_name.trim() || null,
        bank_name: bankForm.bank_name.trim() || null,
        bank_routing_last4: bankForm.bank_routing_last4.replace(/\D/g, "").slice(-4) || null,
        bank_account_last4: bankForm.bank_account_last4.replace(/\D/g, "").slice(-4) || null,
        minimum_payout: bankForm.minimum_payout,
        payout_notes: bankForm.payout_notes.trim() || null,
      })
      .eq("id", bankTarget.referrer_id);
    setWorking(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Payout details saved.");
    setBankTarget(null);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Owed to partners</div>
          <div className="text-xl font-semibold mt-1">{fmtUsd(totals.owed)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Ready to pay</div>
          <div className="text-xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">{fmtUsd(totals.payable)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">On hold (30 days)</div>
          <div className="text-xl font-semibold mt-1">{fmtUsd(totals.pending)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Paid to date</div>
          <div className="text-xl font-semibold mt-1">{fmtUsd(totals.paid)}</div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 min-w-[240px]">
            <Label className="text-xs">Commission month</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a month" />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {periodLabel(p.period_start, p.period_end)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={buildOutstanding} disabled={working === "backdate"} size="sm">
            {working === "backdate" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarRange className="h-4 w-4 mr-2" />}
            Build outstanding months
          </Button>
          <Button onClick={generateCredits} disabled={working === "generate" || !periodId} size="sm" variant="outline">
            {working === "generate" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Generate credits
          </Button>
          <Button onClick={createRun} disabled={working === "run"} size="sm" variant="outline">
            {working === "run" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Banknote className="h-4 w-4 mr-2" />}
            Create payout run
          </Button>
          <p className="text-xs text-muted-foreground max-w-md">
            Partners earn on the gateway only — half of our gateway margin per referred merchant, capped per merchant each
            month. Building outstanding months backdates every month a referred merchant has been billed. Earnings become
            payable 30 days after the month ends, and runs include only partners whose ready-to-pay balance reaches{" "}
            {fmtUsd(DEFAULT_MINIMUM_PAYOUT)}; anything below rolls over.
          </p>
        </div>
      </Card>


      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Partner balances</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">On hold</TableHead>
                <TableHead className="text-right">Ready to pay</TableHead>
                <TableHead className="text-right">Balance owed</TableHead>
                <TableHead className="text-right">Paid to date</TableHead>
                <TableHead>Last payment</TableHead>
                <TableHead className="text-right">Payout details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Loading balances…
                  </TableCell>
                </TableRow>
              ) : balances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No partners yet.
                  </TableCell>
                </TableRow>
              ) : (
                balances.map((b) => (
                  <TableRow key={b.referrer_id}>
                    <TableCell>
                      <div className="font-medium">{b.full_name}</div>
                      <div className="text-xs text-muted-foreground">{b.email ?? "No login"}</div>
                      {!b.active && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {b.attribution_only ? "Attribution only" : "Pending approval"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUsd(b.pending_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                      {fmtUsd(b.payable_amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmtUsd(b.balance_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtUsd(b.paid_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.last_paid_at ? format(parseISO(b.last_paid_at), "d MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openBank(b)}>
                        <Landmark className="h-4 w-4 mr-1" />
                        Bank
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Month-by-month earnings (gateway only)</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Released</TableHead>
                <TableHead className="text-right">Partner share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Loading earnings…
                  </TableCell>
                </TableRow>
              ) : months.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nothing accrued yet. Assign an affiliate to a live gateway account, then build the outstanding months.
                  </TableCell>
                </TableRow>
              ) : (
                balances.flatMap((b) =>
                  (monthsByPartner.get(b.referrer_id) ?? []).map((m, i) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">
                        {i === 0 ? <span className="font-medium">{b.full_name}</span> : <span className="text-muted-foreground">↳</span>}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {m.period_end ? format(parseISO(m.period_end), "MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(m.description ?? "").replace(/^.*—\s*/, "") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.status === "paid" ? "secondary" : "outline"} className="text-[10px]">
                          {m.status === "pending" ? "On hold" : m.status === "payable" ? "Ready to pay" : m.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {m.payable_on ? format(parseISO(m.payable_on), "d MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtUsd(m.amount)}</TableCell>
                    </TableRow>
                  )),
                )
              )}
            </TableBody>
          </Table>
        </div>
      </Card>



      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Payout runs</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Partners</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No payout runs yet.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{periodLabel(r.period_start, r.period_end)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "paid" ? "secondary" : "outline"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.partner_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtUsd(r.total_amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayTarget(r);
                            setPayReference("");
                          }}
                        >
                          Mark paid
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!bankTarget} onOpenChange={(o) => !o && setBankTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payout details — {bankTarget?.full_name}</DialogTitle>
            <DialogDescription>
              Bank transfer (ACH). Store only the last four digits here; full account numbers are never kept in the CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bank_account_name">Account holder</Label>
              <Input
                id="bank_account_name"
                value={bankForm.bank_account_name}
                onChange={(e) => setBankForm((f) => ({ ...f, bank_account_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">Bank</Label>
              <Input
                id="bank_name"
                value={bankForm.bank_name}
                onChange={(e) => setBankForm((f) => ({ ...f, bank_name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="routing4">Routing (last 4)</Label>
                <Input
                  id="routing4"
                  inputMode="numeric"
                  maxLength={4}
                  value={bankForm.bank_routing_last4}
                  onChange={(e) => setBankForm((f) => ({ ...f, bank_routing_last4: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="account4">Account (last 4)</Label>
                <Input
                  id="account4"
                  inputMode="numeric"
                  maxLength={4}
                  value={bankForm.bank_account_last4}
                  onChange={(e) => setBankForm((f) => ({ ...f, bank_account_last4: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minimum_payout">Minimum payout (USD)</Label>
              <Input
                id="minimum_payout"
                type="number"
                min={0}
                step={5}
                value={bankForm.minimum_payout}
                onChange={(e) => setBankForm((f) => ({ ...f, minimum_payout: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout_notes">Notes</Label>
              <Input
                id="payout_notes"
                value={bankForm.payout_notes}
                onChange={(e) => setBankForm((f) => ({ ...f, payout_notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankTarget(null)}>
              Cancel
            </Button>
            <Button onClick={saveBank} disabled={working === "bank"}>
              {working === "bank" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark payout run as paid</DialogTitle>
            <DialogDescription>
              {payTarget ? `${fmtUsd(payTarget.total_amount)} across ${payTarget.partner_count ?? 0} partner(s).` : ""} Add
              the bank transfer reference for the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pay_reference">Payment reference</Label>
            <Input
              id="pay_reference"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="ACH batch / transfer ID"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={markPaid} disabled={!!working?.startsWith("pay-")}>
              {working?.startsWith("pay-") && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Mark paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
