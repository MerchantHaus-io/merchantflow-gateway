import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Gauge, RefreshCw, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "America/Chicago";
const fmt = (iso: string) => `${format(toZonedTime(new Date(iso), TZ), "dd MMM yyyy HH:mm:ss")} CT`;

const RANGES = [
  { value: "1h", label: "Last hour", hours: 1 },
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "all", label: "All time", hours: 0 },
];

interface ClientErrorRow {
  id: number;
  created_at: string;
  error_id: string | null;
  message: string | null;
  route: string | null;
  url: string | null;
  user_email: string | null;
  source: string | null;
  release: string | null;
  stack: string | null;
}

interface RateLimitRow {
  id: number;
  created_at: string;
  ip: string | null;
  endpoint: string | null;
}

const Observability = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();

  const [tab, setTab] = useState("errors");
  const [range, setRange] = useState("24h");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [errors, setErrors] = useState<ClientErrorRow[]>([]);
  const [limits, setLimits] = useState<RateLimitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !isAdmin) navigate("/");
  }, [user, isAdmin, roleLoading, navigate]);

  const since = useMemo(() => {
    const r = RANGES.find((x) => x.value === range);
    if (!r || r.hours === 0) return null;
    return new Date(Date.now() - r.hours * 3600_000).toISOString();
  }, [range]);

  const load = async () => {
    setLoading(true);
    const q = query.trim();

    let eq = supabase.from("client_errors").select("*").order("created_at", { ascending: false }).limit(300);
    if (since) eq = eq.gte("created_at", since);
    if (source !== "all") eq = eq.eq("source", source);
    if (q) eq = eq.or(`message.ilike.%${q}%,route.ilike.%${q}%,url.ilike.%${q}%,user_email.ilike.%${q}%,error_id.ilike.%${q}%`);

    let rq = supabase.from("rate_limit_events").select("*").order("created_at", { ascending: false }).limit(300);
    if (since) rq = rq.gte("created_at", since);
    if (q) rq = rq.or(`endpoint.ilike.%${q}%,ip.ilike.%${q}%`);

    const [{ data: e }, { data: r }] = await Promise.all([eq, rq]);
    setErrors((e ?? []) as ClientErrorRow[]);
    setLimits((r ?? []) as RateLimitRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (roleLoading || !isAdmin) return;
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, query, source, roleLoading, isAdmin]);

  const sources = useMemo(
    () => Array.from(new Set(errors.map((e) => e.source).filter(Boolean) as string[])).sort(),
    [errors]
  );

  const topEndpoints = useMemo(() => {
    const map = new Map<string, number>();
    limits.forEach((l) => map.set(l.endpoint ?? "unknown", (map.get(l.endpoint ?? "unknown") ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [limits]);

  if (roleLoading || !isAdmin) return null;

  return (
    <AppLayout pageTitle="Observability">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Observability</h1>
          <Badge variant="outline" className="text-[10px]">Admin Only</Badge>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Filters</CardTitle>
            <CardDescription>Search by merchant, user, app source, route or endpoint, then narrow by time.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Merchant / app, email, route, endpoint, message…"
                className="pl-8 h-9"
              />
            </div>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-9 w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="h-9 w-full sm:w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Refresh</span>
            </Button>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="errors" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Client errors
              <Badge variant="outline" className="ml-1 text-[10px]">{errors.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="limits" className="gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> Rate limits
              <Badge variant="outline" className="ml-1 text-[10px]">{limits.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="errors" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Client errors</CardTitle>
                <CardDescription>Front-end exceptions reported by the terminal. Click a row for the stack trace.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                ) : errors.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No errors in this range</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Message</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errors.map((e) => (
                          <Fragment key={e.id}>
                            <TableRow
                              className="cursor-pointer"
                              onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                            >
                              <TableCell className="whitespace-nowrap text-xs font-mono">{fmt(e.created_at)}</TableCell>
                              <TableCell className="max-w-[380px] truncate text-sm">{e.message ?? "—"}</TableCell>
                              <TableCell className="text-xs font-mono">{e.route ?? "—"}</TableCell>
                              <TableCell className="text-xs">{e.user_email ?? "anonymous"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{e.source ?? "app"}</Badge>
                              </TableCell>
                            </TableRow>
                            {expanded === e.id && (
                              <TableRow key={`${e.id}-detail`}>
                                <TableCell colSpan={5} className="bg-muted/30">
                                  <div className="space-y-2 py-2 text-xs">
                                    <p><span className="text-muted-foreground">Error ID:</span> <span className="font-mono">{e.error_id ?? "—"}</span></p>
                                    <p className="break-all"><span className="text-muted-foreground">URL:</span> {e.url ?? "—"}</p>
                                    <p><span className="text-muted-foreground">Release:</span> {e.release ?? "—"}</p>
                                    {e.stack && (
                                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border p-3 font-mono text-[11px]">{e.stack}</pre>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="limits" className="mt-4 space-y-4">
            {topEndpoints.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Most throttled endpoints</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {topEndpoints.map(([ep, n]) => (
                    <Badge key={ep} variant="outline" className="font-mono text-[10px]">{ep} · {n}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Rate limit events</CardTitle>
                <CardDescription>Requests rejected by endpoint throttling.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
                ) : limits.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No rate limit events in this range</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Endpoint</TableHead>
                          <TableHead>IP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {limits.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="whitespace-nowrap text-xs font-mono">{fmt(l.created_at)}</TableCell>
                            <TableCell className="text-xs font-mono">{l.endpoint ?? "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{l.ip ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Observability;
