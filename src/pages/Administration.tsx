import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { BroadcastAckPanel } from "@/components/BroadcastAckPanel";
import { AgendaManager } from "@/components/admin/AgendaManager";
import { AdminPopupManager } from "@/components/admin/AdminPopupManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Clock, LogIn, LogOut as LogOutIcon, Shield } from "lucide-react";
import { format, formatDistanceStrict } from "date-fns";

interface SessionRow {
  id: string;
  user_email: string;
  logged_in_at: string;
  logged_out_at: string | null;
  duration_minutes: number | null;
}

const Administration = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !isAdmin) {
      navigate("/");
      return;
    }

    const fetchSessions = async () => {
      const { data } = await supabase
        .from("user_sessions")
        .select("*")
        .order("logged_in_at", { ascending: false })
        .limit(100);
      if (data) setSessions(data as SessionRow[]);
      setLoading(false);
    };

    fetchSessions();

    const channel = supabase
      .channel("session-tracking")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_sessions" }, () => fetchSessions())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, isAdmin, roleLoading, navigate]);

  if (roleLoading || !isAdmin) return null;

  const latestByUser = new Map<string, SessionRow>();
  sessions.forEach((s) => {
    if (!latestByUser.has(s.user_email)) latestByUser.set(s.user_email, s);
  });

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return "—";
    if (minutes < 1) return "< 1 min";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? `${m}m` : `${h}h ${m}m`;
  };

  const isOnline = (session: SessionRow) => !session.logged_out_at;

  return (
    <AppLayout pageTitle="Administration">
      <div className="p-4 md:p-6 space-y-6">
        {/* Admin overview badge */}
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Administration Panel</h1>
          <Badge variant="outline" className="text-[10px]">Admin Only</Badge>
        </div>

        {/* Broadcast Acknowledgments */}
        <BroadcastAckPanel />

        {/* Admin Popup Notifications */}
        <AdminPopupManager />

        {/* Agenda / Ideation Management */}
        <AgendaManager />

        {/* Team Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Status
            </CardTitle>
            <CardDescription>Current online status based on latest session</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(latestByUser.entries()).map(([email, session]) => {
                const name = email.split("@")[0];
                const displayName = name.charAt(0).toUpperCase() + name.slice(1);
                const online = isOnline(session);
                return (
                  <div key={email} className="flex items-center justify-between py-3 px-4 rounded-md border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${online ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
                      <div>
                        <p className="text-sm font-medium">{displayName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {online
                            ? `Since ${format(new Date(session.logged_in_at), "HH:mm")}`
                            : session.logged_out_at
                              ? `Last seen ${formatDistanceStrict(new Date(session.logged_out_at), new Date(), { addSuffix: true })}`
                              : "No data"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={online ? "default" : "outline"} className={online ? "bg-green-600/20 text-green-600 border-green-600/30 text-[10px]" : "text-[10px]"}>
                      {online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                );
              })}
              {latestByUser.size === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-4">No session data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Login History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Login History
            </CardTitle>
            <CardDescription>Recent login sessions with duration tracking</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No sessions recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Logged In</TableHead>
                      <TableHead>Logged Out</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium capitalize">{s.user_email.split("@")[0]}</TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            <LogIn className="h-3 w-3 text-green-500" />
                            {format(new Date(s.logged_in_at), "dd MMM HH:mm")}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.logged_out_at ? (
                            <div className="flex items-center gap-1.5">
                              <LogOutIcon className="h-3 w-3 text-muted-foreground" />
                              {format(new Date(s.logged_out_at), "dd MMM HH:mm")}
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{formatDuration(s.duration_minutes)}</TableCell>
                        <TableCell>
                          {isOnline(s) ? (
                            <Badge className="bg-green-600/20 text-green-600 border-green-600/30 text-[10px]">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Ended</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Administration;
