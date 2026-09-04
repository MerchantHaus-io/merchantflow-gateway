import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import {
  summarizePartnerActivity,
  formatMinutes,
  type PartnerActivitySummary,
  type PartnerSessionRow,
  type PartnerLike,
} from "@/lib/partnerActivity";

/**
 * Partner portal engagement: how often each affiliate signs in and how long
 * they stay. Reads `user_sessions` (admin-only select policy) and attributes
 * rows to affiliates by linked auth user or email.
 */
export function PartnerActivityPanel() {
  const [rows, setRows] = useState<PartnerActivitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [partnersRes, sessionsRes] = await Promise.all([
      supabase
        .from("referrers")
        .select("id, full_name, email, auth_user_id, active, attribution_only")
        .order("full_name"),
      supabase
        .from("user_sessions")
        .select("user_id, user_email, logged_in_at, logged_out_at, duration_minutes")
        .order("logged_in_at", { ascending: false })
        .limit(1000),
    ]);

    if (partnersRes.error || sessionsRes.error) {
      setError(partnersRes.error?.message ?? sessionsRes.error?.message ?? "Could not load activity");
      setLoading(false);
      return;
    }

    const partners = ((partnersRes.data ?? []) as (PartnerLike & { attribution_only?: boolean | null })[])
      // Attribution-only names have no login, so they'd only add empty rows.
      .filter((p) => !p.attribution_only);

    setRows(summarizePartnerActivity(partners, (sessionsRes.data ?? []) as PartnerSessionRow[]));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(
    () => ({
      active: rows.filter((r) => r.logins > 0).length,
      logins: rows.reduce((sum, r) => sum + r.logins, 0),
      minutes: rows.reduce((sum, r) => sum + r.totalMinutes, 0),
    }),
    [rows]
  );

  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Portal activity
          </h2>
          <p className="text-sm text-muted-foreground">
            Sign-ins and time spent in the partner portal. Admin “Login as” views are not counted.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Partners who signed in</div>
          <div className="text-xl font-semibold">{totals.active}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Total sign-ins</div>
          <div className="text-xl font-semibold">{totals.logins}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Total time in portal</div>
          <div className="text-xl font-semibold">{formatMinutes(totals.minutes)}</div>
        </div>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Partner</TableHead>
              <TableHead className="text-right">Sign-ins</TableHead>
              <TableHead className="text-right">Total time</TableHead>
              <TableHead className="text-right">Avg. per visit</TableHead>
              <TableHead>Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  Loading activity…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-sm text-muted-foreground">
                  No partners yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.referrerId}>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="text-xs text-muted-foreground">{row.email}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.logins > 0 ? row.logins : <Badge variant="outline">Never</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMinutes(row.totalMinutes)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMinutes(row.averageMinutes)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.lastLoginAt ? format(new Date(row.lastLoginAt), "d MMM yyyy HH:mm") : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
