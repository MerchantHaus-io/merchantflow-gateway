import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, ExternalLink, Loader2, RefreshCw, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface RunRow {
  id: string;
  kind: "snapshot" | "flush";
  status: "running" | "success" | "error";
  started_at: string;
  finished_at: string | null;
  drive_file_name: string | null;
  drive_web_link: string | null;
  bytes: number | null;
  rows_flushed: number | null;
  error: string | null;
}

export function BackupStatusCard() {
  const [lastSnap, setLastSnap] = useState<RunRow | null>(null);
  const [lastFlush, setLastFlush] = useState<RunRow | null>(null);
  const [queueDepth, setQueueDepth] = useState<number>(0);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    const [{ data: snap }, { data: flush }, { count }, { data: rec }] = await Promise.all([
      supabase.from("backup_runs").select("*").eq("kind", "snapshot").eq("status", "success").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("backup_runs").select("*").eq("kind", "flush").eq("status", "success").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("backup_change_queue").select("*", { count: "exact", head: true }).is("flushed_at", null),
      supabase.from("backup_runs").select("*").order("started_at", { ascending: false }).limit(10),
    ]);
    setLastSnap(snap as RunRow | null);
    setLastFlush(flush as RunRow | null);
    setQueueDepth(count ?? 0);
    setRecent((rec ?? []) as RunRow[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("backup-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "backup_runs" }, load)
      .subscribe();
    const t = setInterval(load, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const runNow = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke("backup-snapshot-to-drive", { body: { source: "manual" } });
      if (error) throw error;
      toast({ title: "Snapshot started", description: "Uploading to Google Drive..." });
      setTimeout(load, 2000);
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const fmtBytes = (n: number | null) => {
    if (!n) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CloudUpload className="h-4 w-4" />
              Google Drive Backups
            </CardTitle>
            <CardDescription>
              Hourly full snapshots + real-time change stream to admin@merchanthaus.io Drive
            </CardDescription>
          </div>
          <Button size="sm" onClick={runNow} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Run snapshot now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Last snapshot</p>
            <p className="text-sm font-medium mt-1">
              {lastSnap ? formatDistanceToNow(new Date(lastSnap.started_at), { addSuffix: true }) : "Never"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{fmtBytes(lastSnap?.bytes ?? null)}</p>
            {lastSnap?.drive_web_link && (
              <a href={lastSnap.drive_web_link} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 mt-1">
                Open in Drive <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Last flush</p>
            <p className="text-sm font-medium mt-1">
              {lastFlush ? formatDistanceToNow(new Date(lastFlush.started_at), { addSuffix: true }) : "Never"}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{lastFlush?.rows_flushed ?? 0} rows</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Change queue</p>
            <p className="text-sm font-medium mt-1 flex items-center gap-2">
              <Database className="h-3.5 w-3.5" />
              {queueDepth} pending
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Flushes every 10s</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Recent runs</p>
          <div className="space-y-1">
            {recent.length === 0 && <p className="text-xs text-muted-foreground">No runs yet</p>}
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded border border-border/60">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">{r.kind}</Badge>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                  </span>
                  {r.error && <span className="text-destructive truncate max-w-xs">{r.error}</span>}
                </div>
                <Badge
                  className={`text-[10px] ${
                    r.status === "success" ? "bg-green-600/20 text-green-600 border-green-600/30" :
                    r.status === "error" ? "bg-destructive/20 text-destructive border-destructive/30" :
                    "bg-amber-500/20 text-amber-600 border-amber-500/30"
                  }`}
                  variant="outline"
                >
                  {r.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
