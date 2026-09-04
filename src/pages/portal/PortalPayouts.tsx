import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { activeSupabase as supabase } from "@/integrations/supabase/activeClient";
import { useAuth } from "@/contexts/AuthContext";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { CalendarClock, Landmark, Wallet } from "lucide-react";
import {
  DEFAULT_MINIMUM_PAYOUT,
  LEDGER_LABEL,
  PAYABLE_HOLD_DAYS,
  STATUS_LABEL,
  clearsMinimum,
  fmtUsd,
  summariseLedger,
} from "@/lib/affiliatePayouts";

interface LedgerRow {
  id: string;
  entry_type: string;
  amount: number | string | null;
  status: string;
  period_start: string | null;
  period_end: string | null;
  payable_on: string | null;
  paid_at: string | null;
  description: string | null;
}

const dateLabel = (v: string | null) => (v ? format(parseISO(v), "d MMM yyyy") : "—");

/**
 * Partner-facing payouts view: what they have earned, what is still on hold,
 * what is due next and what has already been paid.
 */
export default function PortalPayouts() {
  const { referrer } = useAuth();

  const { data: ledger, isLoading } = useQuery({
    queryKey: ["portal-ledger", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase
        .from("referrer_ledger_entries")
        .select("id, entry_type, amount, status, period_start, period_end, payable_on, paid_at, description")
        .eq("referrer_id", referrer!.id)
        .order("period_end", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as LedgerRow[];
    },
  });

  const { data: bank } = useQuery({
    queryKey: ["portal-bank", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("bank_account_name, bank_name, bank_account_last4, minimum_payout")
        .eq("id", referrer!.id)
        .maybeSingle();
      return data;
    },
  });

  const rows = ledger ?? [];
  const summary = useMemo(() => summariseLedger(rows), [rows]);
  const minimum = Number(bank?.minimum_payout) || DEFAULT_MINIMUM_PAYOUT;
  const readyNow = clearsMinimum(summary.payable, minimum);
  const shortfall = Math.max(0, Math.round((minimum - summary.payable) * 100) / 100);

  const nextDue = useMemo(() => {
    const upcoming = rows
      .filter((r) => r.status === "pending" && r.payable_on)
      .map((r) => r.payable_on as string)
      .sort();
    return upcoming[0] ?? null;
  }, [rows]);

  return (
    <PortalLayout pageTitle="Payouts">
      <div className="space-y-5">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Your balance</div>
            <div className="text-2xl font-semibold mt-1">
              {isLoading ? <Skeleton className="h-7 w-24" /> : fmtUsd(summary.balance)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ready to pay</div>
            <div className="text-2xl font-semibold mt-1 text-emerald-600 dark:text-emerald-400">
              {fmtUsd(summary.payable)}
            </div>
            {readyNow ? (
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                Clears your {fmtUsd(minimum)} minimum — included in the next run
              </div>
            ) : summary.payable > 0 ? (
              <div className="text-[11px] text-muted-foreground mt-1">
                {fmtUsd(shortfall)} short of your {fmtUsd(minimum)} minimum — rolls over
              </div>
            ) : null}
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">On hold</div>
            <div className="text-2xl font-semibold mt-1">{fmtUsd(summary.pending)}</div>
            {nextDue && (
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Releases {dateLabel(nextDue)}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Paid to you</div>
            <div className="text-2xl font-semibold mt-1">{fmtUsd(summary.paid)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {fmtUsd(summary.lifetime)} earned to date
            </div>
          </Card>
        </div>

        <Card className="p-4 text-sm text-muted-foreground flex flex-wrap gap-x-6 gap-y-2">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Earnings for a month are released {PAYABLE_HOLD_DAYS} days after that month closes.
          </span>
          <span className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Paid by bank transfer{bank?.bank_account_last4 ? ` to ••••${bank.bank_account_last4}` : " — send us your bank details"}
            , minimum {fmtUsd(minimum)}.
          </span>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Statement</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Released</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No earnings yet. Submit a referral and your commission will appear here once the merchant is live.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {r.period_end ? format(parseISO(r.period_end), "MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{r.description ?? LEDGER_LABEL[r.entry_type] ?? r.entry_type}</div>
                        <div className="text-xs text-muted-foreground">{LEDGER_LABEL[r.entry_type] ?? r.entry_type}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "paid" ? "secondary" : "outline"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.status === "paid" ? dateLabel(r.paid_at) : dateLabel(r.payable_on)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtUsd(r.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </PortalLayout>
  );
}
