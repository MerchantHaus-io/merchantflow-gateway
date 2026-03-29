import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, Users, ExternalLink, Link2, CheckCircle2, Loader2, Mail, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  attendees: any[];
  opportunity_id: string | null;
  account_id: string | null;
  html_link: string | null;
  status: string | null;
  calendar_owner_email: string | null;
}

type ViewMode = "month" | "week" | "day";

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [hasGmailScope, setHasGmailScope] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterUser, setFilterUser] = useState<string>("all");
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const TEAM_MEMBERS = [
    { email: "admin@merchanthaus.io", label: "Jamie" },
    { email: "darryn@merchanthaus.io", label: "Darryn" },
    { email: "support@merchanthaus.io", label: "Sheiky" },
    { email: "sales@merchanthaus.io", label: "Wesley" },
    { email: "taryn@merchanthaus.io", label: "Taryn" },
  ];

  // Handle OAuth redirect params
  useEffect(() => {
    if (searchParams.get("gcal_connected") === "true") {
      toast.success("Google Calendar connected successfully!");
      setIsConnected(true);
      searchParams.delete("gcal_connected");
      setSearchParams(searchParams, { replace: true });
    }
    if (searchParams.get("gcal_error")) {
      toast.error(`Calendar connection failed: ${searchParams.get("gcal_error")}`);
      searchParams.delete("gcal_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  // Check connection status
  useEffect(() => {
    if (!user?.email) return;
    checkConnection();
  }, [user?.email]);

  async function checkConnection() {
    const { data } = await supabase
      .from("google_calendar_tokens")
      .select("id, scopes")
      .eq("user_email", user?.email || "")
      .maybeSingle();
    setIsConnected(!!data);
    setHasGmailScope(!!data?.scopes?.includes("gmail"));
  }

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel("calendar-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, fetchEvents)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentDate, viewMode]);

  async function fetchEvents() {
    let rangeStart: Date;
    let rangeEnd: Date;

    if (viewMode === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    } else if (viewMode === "week") {
      rangeStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      rangeEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    } else {
      rangeStart = new Date(currentDate);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(currentDate);
      rangeEnd.setHours(23, 59, 59, 999);
    }

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", rangeStart.toISOString())
      .lte("start_time", rangeEnd.toISOString())
      .order("start_time", { ascending: true });

    setEvents((data as CalendarEvent[]) || []);
    setLoading(false);
  }

  async function handleConnect() {
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth-url", {
        body: { user_email: user?.email, user_id: user?.id },
      });
      if (error || !data?.url) {
        toast.error("Failed to start Google Calendar connection.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Failed to start Google Calendar connection.");
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      // Sync ALL connected team members' calendars
      const [calResult, gmailResult] = await Promise.all([
        supabase.functions.invoke("google-calendar-sync"),
        supabase.functions.invoke("google-gmail-sync"),
      ]);
      if (calResult.error) throw calResult.error;
      const calSynced = calResult.data?.synced || 0;
      const emailsSynced = gmailResult.data?.synced || 0;
      const leadsCreated = gmailResult.data?.leads_created || 0;
      const activitiesCreated = gmailResult.data?.activities_created || 0;
      
      let msg = `Synced ${calSynced} calendar events`;
      if (emailsSynced > 0) msg += `, ${emailsSynced} emails`;
      if (leadsCreated > 0) msg += `, ${leadsCreated} new leads`;
      if (activitiesCreated > 0) msg += `, ${activitiesCreated} activities`;
      toast.success(msg);
      fetchEvents();
    } catch (err: any) {
      toast.error("Sync failed: " + (err.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  }

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    });
  }, [currentDate]);

  const filteredEvents = useMemo(() => {
    if (filterUser === "all") return events;
    return events.filter((e) => e.calendar_owner_email === filterUser);
  }, [events, filterUser]);

  const eventsForDate = (date: Date) =>
    filteredEvents.filter((e) => isSameDay(parseISO(e.start_time), date));

  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(new Date(currentDate.getTime() + dir * 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() + dir * 24 * 60 * 60 * 1000));
    }
  };

  return (
    <AppLayout pageTitle="Calendar">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4">
        {/* Header controls */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-bold text-foreground min-w-[180px] text-center">
              {viewMode === "day"
                ? format(currentDate, "EEEE, MMMM d, yyyy")
                : viewMode === "week"
                  ? `Week of ${format(startOfWeek(currentDate), "MMM d")}`
                  : format(currentDate, "MMMM yyyy")}
            </h2>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs ml-2"
              onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
            >
              Today
            </Button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* User filter */}
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {TEAM_MEMBERS.map((m) => (
                  <SelectItem key={m.email} value={m.email}>
                    <span className="flex items-center gap-1.5">
                      <span className={cn("w-2 h-2 rounded-full", getTeamColor(m.email).dot)} />
                      {m.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Connection status + actions */}
            {isConnected === false && (
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleConnect}>
                <Link2 className="h-3.5 w-3.5" />
                Connect Google (Calendar + Gmail)
              </Button>
            )}
            {isConnected === true && (
              <>
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Connected
                </Badge>
                {!hasGmailScope && (
                  <Button variant="outline" size="sm" className="text-xs gap-1 border-amber-500/50 text-amber-600" onClick={handleConnect}>
                    <Mail className="h-3 w-3" />
                    Enable Gmail Sync
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleSync} disabled={syncing}>
                  {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Sync
                </Button>
              </>
            )}

            <div className="flex items-center rounded-lg border border-border/60 bg-card/40 p-0.5">
              {(["month", "week", "day"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize",
                    viewMode === mode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Calendar grid */}
          <div className="flex-1">
            {viewMode === "month" && (
              <div className="rounded-xl border border-border/60 bg-card/80 overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-border/40">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-2">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((day, i) => {
                    const dayEvents = eventsForDate(day);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isCurrentMonth = isSameMonth(day, currentDate);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDate(day)}
                        className={cn(
                          "relative h-20 lg:h-24 p-1 border-b border-r border-border/20 text-left transition-all hover:bg-accent/30",
                          !isCurrentMonth && "opacity-40",
                          isSelected && "bg-primary/10 ring-1 ring-primary/30",
                          isToday(day) && "bg-primary/5"
                        )}
                      >
                        <span className={cn(
                          "text-[11px] font-semibold inline-flex items-center justify-center w-6 h-6 rounded-full",
                          isToday(day) && "bg-primary text-primary-foreground",
                        )}>
                          {format(day, "d")}
                        </span>
                        <div className="mt-0.5 space-y-0.5 overflow-hidden">
                          {dayEvents.slice(0, 3).map((ev) => {
                            const c = getTeamColor(ev.calendar_owner_email);
                            return (
                              <div
                                key={ev.id}
                                className={cn("text-[9px] leading-tight truncate rounded px-1 py-0.5 font-medium flex items-center gap-1", c.bg, "text-foreground/80")}
                              >
                                <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} />
                                {ev.all_day ? "All Day" : format(parseISO(ev.start_time), "h:mm a")} {ev.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 3 && (
                            <span className="text-[9px] text-muted-foreground pl-1">+{dayEvents.length - 3} more</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(viewMode === "week" || viewMode === "day") && (
              <div className="rounded-xl border border-border/60 bg-card/80 p-4">
                {filteredEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No events for this period.</p>
                ) : (
                  <div className="space-y-2">
                    {filteredEvents.map((ev) => (
                      <EventCard key={ev.id} event={ev} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Side panel — selected day detail */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="rounded-xl border border-border/60 bg-card/80 p-4 sticky top-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}
              </h3>

              {selectedEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No events on this day.</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  <AnimatePresence>
                    {selectedEvents.map((ev, idx) => (
                      <motion.div
                        key={ev.id}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <EventCard event={ev} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

const TEAM_COLORS: Record<string, { border: string; bg: string; dot: string }> = {
  "admin@merchanthaus.io": { border: "border-l-blue-500", bg: "bg-blue-500/15", dot: "bg-blue-500" },
  "darryn@merchanthaus.io": { border: "border-l-emerald-500", bg: "bg-emerald-500/15", dot: "bg-emerald-500" },
  "support@merchanthaus.io": { border: "border-l-amber-500", bg: "bg-amber-500/15", dot: "bg-amber-500" },
  "sales@merchanthaus.io": { border: "border-l-purple-500", bg: "bg-purple-500/15", dot: "bg-purple-500" },
  "taryn@merchanthaus.io": { border: "border-l-rose-500", bg: "bg-rose-500/15", dot: "bg-rose-500" },
  shared: { border: "border-l-primary", bg: "bg-primary/15", dot: "bg-primary" },
};

function getTeamColor(email: string | null) {
  if (!email) return TEAM_COLORS.shared;
  return TEAM_COLORS[email] || TEAM_COLORS.shared;
}

function EventCard({ event }: { event: CalendarEvent }) {
  const attendeeList = Array.isArray(event.attendees) ? event.attendees : [];
  const internalAttendees = attendeeList.filter((a: any) => a.email?.endsWith("@merchanthaus.io"));
  const colors = getTeamColor(event.calendar_owner_email);
  const ownerName = event.calendar_owner_email?.split("@")[0] || "shared";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 p-3 hover:bg-accent/30 transition-all cursor-pointer",
        "border-l-4",
        colors.border
      )}
      onClick={() => event.html_link && window.open(event.html_link, "_blank")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
            <span className="text-xs font-bold text-foreground">{event.title}</span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">
              {event.all_day
                ? "All Day"
                : `${format(parseISO(event.start_time), "h:mm a")} – ${format(parseISO(event.end_time), "h:mm a")}`}
            </span>
            <span className="text-[9px] text-muted-foreground/70 capitalize">{ownerName}</span>
          </div>

          {internalAttendees.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">
                {internalAttendees.map((a: any) => a.displayName || a.email?.split("@")[0]).join(", ")}
              </span>
            </div>
          )}

          {event.location && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">{event.location}</span>
            </div>
          )}

          {event.description && (
            <p className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">{event.description}</p>
          )}
        </div>

        {event.html_link && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}
