import { useState, useEffect, useMemo } from "react";
import { ACTIVE_INTERNAL_TEAM } from "@/config/team";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday, parseISO, startOfDay, addHours, differenceInMinutes, eachDayOfInterval as eachDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const CT_TZ = "America/Chicago";
/** Convert an ISO string to a Date in Central Time for display */
const toCT = (iso: string) => toZonedTime(parseISO(iso), CT_TZ);
/** Check if an event falls on a given date. All-day events use the date portion directly (no TZ shift). */
const isSameDayCT = (iso: string, date: Date, allDay?: boolean) => {
  if (allDay) {
    // All-day events are stored as YYYY-MM-DDT00:00:00Z — use date portion directly
    const eventDate = parseISO(iso);
    return eventDate.getUTCFullYear() === date.getFullYear() &&
           eventDate.getUTCMonth() === date.getMonth() &&
           eventDate.getUTCDate() === date.getDate();
  }
  return isSameDay(toCT(iso), date);
};
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, Users, ExternalLink, Link2, CheckCircle2, Loader2, Mail, Filter, CalendarIcon, Search, Sparkles, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { EventDetailSheet } from "@/components/calendar/EventDetailSheet";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  attendees: unknown[];
  opportunity_id: string | null;
  account_id: string | null;
  html_link: string | null;
  status: string | null;
  calendar_owner_email: string | null;
}

type ViewMode = "month" | "week" | "day" | "team" | "agenda";

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("team");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [hasGmailScope, setHasGmailScope] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Team list sourced from the roster — see src/config/team.ts
  // De-duplicate by email (case-insensitive) so the shared Sales inbox only appears once.
  const TEAM_MEMBERS: { email: string; label: string }[] = Array.from(
    new Map(
      ACTIVE_INTERNAL_TEAM.map((m) => [m.email.toLowerCase(), { email: m.email, label: m.displayName }])
    ).values()
  );

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
    } else if (viewMode === "agenda") {
      // Agenda: show next 30 days from currentDate
      rangeStart = startOfDay(currentDate);
      rangeEnd = new Date(rangeStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    } else {
      // For day/team views, compute range in CT so we fetch the correct CT day
      // CT is UTC-5 (CST) or UTC-6 depending on DST; use date-fns-tz for accuracy
      rangeStart = new Date(currentDate);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = new Date(currentDate);
      rangeEnd.setHours(23, 59, 59, 999);
    }

    // Widen the query range by ±1 day for day/team views to avoid timezone edge-case misses
    const queryStart = (viewMode === "day" || viewMode === "team")
      ? new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000)
      : rangeStart;
    const queryEnd = (viewMode === "day" || viewMode === "team")
      ? new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000)
      : rangeEnd;

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", queryStart.toISOString())
      .lte("start_time", queryEnd.toISOString())
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
    } catch (err: unknown) {
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
    let evs = events;
    if (filterUser !== "all") evs = evs.filter((e) => e.calendar_owner_email === filterUser);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      evs = evs.filter((e) =>
        e.title?.toLowerCase().includes(q) ||
        e.location?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        (Array.isArray(e.attendees) && e.attendees.some((a: unknown) =>
          a.email?.toLowerCase().includes(q) || a.displayName?.toLowerCase().includes(q)
        ))
      );
    }
    return evs;
  }, [events, filterUser, search]);

  const eventsForDate = (date: Date) =>
    filteredEvents.filter((e) => isSameDayCT(e.start_time, date, e.all_day));

  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  const navigate = (dir: 1 | -1) => {
    if (viewMode === "month") {
      setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else if (viewMode === "week") {
      setCurrentDate(new Date(currentDate.getTime() + dir * 7 * 24 * 60 * 60 * 1000));
    } else {
      const newDate = new Date(currentDate.getTime() + dir * 24 * 60 * 60 * 1000);
      setCurrentDate(newDate);
      setSelectedDate(newDate);
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" className="text-lg font-bold text-foreground min-w-[180px] text-center hover:bg-accent/50 gap-1.5">
                  {viewMode === "day" || viewMode === "team"
                    ? format(currentDate, "EEEE, MMMM d, yyyy")
                    : viewMode === "week"
                      ? `Week of ${format(startOfWeek(currentDate), "MMM d")}`
                      : viewMode === "agenda"
                        ? `Next 30 days from ${format(currentDate, "MMM d")}`
                        : format(currentDate, "MMMM yyyy")}
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <CalendarPicker
                  mode="single"
                  selected={currentDate}
                  onSelect={(d) => { if (d) { setCurrentDate(d); setSelectedDate(d); } }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events…"
                className="h-8 w-[180px] pl-7 text-xs"
              />
            </div>

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

            {/* Sync button */}
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Sync
            </Button>

            <div className="flex items-center rounded-lg border border-border/60 bg-card/40 p-0.5">
              {(["month", "week", "day", "team", "agenda"] as ViewMode[]).map((mode) => (
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
                  {mode === "team" ? "By User" : mode}
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
                                {ev.all_day ? "All Day" : format(toCT(ev.start_time), "h:mm a")} {ev.title}
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
                      <EventCard key={ev.id} event={ev} onClick={() => setActiveEvent(ev)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {viewMode === "agenda" && (
              <AgendaView events={filteredEvents} onSelect={setActiveEvent} />
            )}

            {viewMode === "team" && (
              <TeamDayGrid
                events={events}
                teamMembers={TEAM_MEMBERS}
                currentDate={selectedDate || currentDate}
                onSelect={setActiveEvent}
              />
            )}
          </div>

          {/* Side panel — selected day detail */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="rounded-xl border border-border/60 bg-card/80 p-4 sticky top-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                {selectedDate ? format(selectedDate, "EEEE, MMMM d") : "Select a day"}
                {selectedEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[9px]">{selectedEvents.length}</Badge>
                )}
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
                        <EventCard event={ev} onClick={() => setActiveEvent(ev)} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <EventDetailSheet
        event={activeEvent}
        open={!!activeEvent}
        onOpenChange={(o) => !o && setActiveEvent(null)}
        ownerColor={activeEvent ? getTeamColor(activeEvent.calendar_owner_email) : undefined}
      />
    </AppLayout>
  );
}

const TEAM_COLORS: Record<string, { border: string; bg: string; dot: string }> = {
  "admin@merchanthaus.io": { border: "border-l-blue-500", bg: "bg-blue-500/15", dot: "bg-blue-500" },
  "onboarding@merchanthaus.io": { border: "border-l-emerald-500", bg: "bg-emerald-500/15", dot: "bg-emerald-500" },
  "support@merchanthaus.io": { border: "border-l-amber-500", bg: "bg-amber-500/15", dot: "bg-amber-500" },
  "sales@merchanthaus.io": { border: "border-l-purple-500", bg: "bg-purple-500/15", dot: "bg-purple-500" },
  "taryn@merchanthaus.io": { border: "border-l-rose-500", bg: "bg-rose-500/15", dot: "bg-rose-500" },
  shared: { border: "border-l-primary", bg: "bg-primary/15", dot: "bg-primary" },
};

function getTeamColor(email: string | null) {
  if (!email) return TEAM_COLORS.shared;
  return TEAM_COLORS[email] || TEAM_COLORS.shared;
}

function EventCard({ event, onClick }: { event: CalendarEvent; onClick?: () => void }) {
  const attendeeList = Array.isArray(event.attendees) ? event.attendees : [];
  const internalAttendees = attendeeList.filter((a: unknown) => a.email?.endsWith("@merchanthaus.io"));
  const colors = getTeamColor(event.calendar_owner_email);
  const ownerName = event.calendar_owner_email?.split("@")[0] || "shared";
  const hasLink = !!(event.account_id || event.opportunity_id);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 p-3 hover:bg-accent/30 transition-all cursor-pointer",
        "border-l-4",
        colors.border
      )}
      onClick={() => onClick ? onClick() : (event.html_link && window.open(event.html_link, "_blank"))}
    >
      {hasLink && (
        <div className="absolute top-2 right-2">
          <Link2 className="h-3 w-3 text-primary" />
        </div>
      )}
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
                : `${format(toCT(event.start_time), "h:mm a")} – ${format(toCT(event.end_time), "h:mm a")} CT`}
            </span>
            <span className="text-[9px] text-muted-foreground/70 capitalize">{ownerName}</span>
          </div>

          {internalAttendees.length > 0 && (
            <div className="flex items-center gap-1 mt-1">
              <Users className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">
                {internalAttendees.map((a: unknown) => a.displayName || a.email?.split("@")[0]).join(", ")}
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

// ── Team Day Grid (hourly time-grid with columns per user) ──
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM – 9 PM
const HOUR_HEIGHT = 56; // px per hour row

function TeamDayGrid({
  events,
  teamMembers,
  currentDate,
  onSelect,
}: {
  events: CalendarEvent[];
  teamMembers: { email: string; label: string }[];
  currentDate: Date;
  onSelect?: (e: CalendarEvent) => void;
}) {
  const dayStart = startOfDay(currentDate);

  // Separate all-day vs timed events per member
  // Assign events to members: match by calendar_owner_email, or by attendee email
  const unassigned: CalendarEvent[] = [];
  const memberData = teamMembers.map((member) => {
    const memberEvents = events.filter((e) => {
      if (!isSameDayCT(e.start_time, currentDate, e.all_day)) return false;
      // Direct ownership match
      if (e.calendar_owner_email === member.email) return true;
      // Check attendees for shared calendar events
      if (e.calendar_owner_email === "shared" && Array.isArray(e.attendees)) {
        return e.attendees.some((a: unknown) => a.email === member.email);
      }
      return false;
    });
    const allDay = memberEvents.filter((e) => e.all_day);
    const timed = memberEvents.filter((e) => !e.all_day);
    const colors = getTeamColor(member.email);
    return { member, allDay, timed, colors };
  });

  const hasAnyAllDay = memberData.some((m) => m.allDay.length > 0);

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 overflow-hidden">
      {/* Column headers */}
      <div className="grid border-b border-border/40" style={{ gridTemplateColumns: `56px repeat(${teamMembers.length}, 1fr)` }}>
        <div className="px-2 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider border-r border-border/20">
          {format(currentDate, "EEE d")}
        </div>
        {memberData.map(({ member, colors, timed, allDay }) => (
          <div key={member.email} className={cn("flex items-center gap-1.5 px-2 py-2 border-r border-border/20 last:border-r-0", colors.bg)}>
            <span className={cn("w-2 h-2 rounded-full shrink-0", colors.dot)} />
            <span className="text-[11px] font-bold text-foreground">{member.label}</span>
            <Badge variant="secondary" className="text-[8px] px-1 py-0 ml-auto">
              {timed.length + allDay.length}
            </Badge>
          </div>
        ))}
      </div>

      {/* All-day row */}
      {hasAnyAllDay && (
        <div className="grid border-b border-border/40" style={{ gridTemplateColumns: `56px repeat(${teamMembers.length}, 1fr)` }}>
          <div className="px-2 py-1.5 text-[9px] text-muted-foreground font-medium border-r border-border/20">
            All Day
          </div>
          {memberData.map(({ member, allDay, colors }) => (
            <div key={member.email} className="px-1 py-1 border-r border-border/20 last:border-r-0 space-y-0.5">
              {allDay.map((ev) => (
                <div
                  key={ev.id}
                  className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold truncate cursor-pointer hover:opacity-80", colors.bg, "text-foreground")}
                  onClick={() => onSelect ? onSelect(ev) : (ev.html_link && window.open(ev.html_link, "_blank"))}
                >
                  {ev.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Time grid */}
      <div className="overflow-y-auto max-h-[600px]">
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${teamMembers.length}, 1fr)` }}>
          {/* Hour labels + grid lines */}
          <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-border/15 flex items-start px-1.5 pt-0.5"
                style={{ top: (hour - 6) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="text-[9px] text-muted-foreground font-medium leading-none">
                  {format(addHours(dayStart, hour), "h a")}
                </span>
              </div>
            ))}
            {/* Current time indicator */}
            {isToday(currentDate) && (() => {
              const now = new Date();
              const minutesSince6 = differenceInMinutes(now, addHours(dayStart, 6));
              if (minutesSince6 < 0 || minutesSince6 > HOURS.length * 60) return null;
              const top = (minutesSince6 / 60) * HOUR_HEIGHT;
              return <div className="absolute left-0 right-0 h-0.5 bg-destructive z-10" style={{ top }} />;
            })()}
          </div>

          {/* Event columns */}
          {memberData.map(({ member, timed, colors }) => (
            <div
              key={member.email}
              className="relative border-r border-border/20 last:border-r-0"
              style={{ height: HOURS.length * HOUR_HEIGHT }}
            >
              {/* Hour grid lines */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-b border-border/15"
                  style={{ top: (hour - 6) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                />
              ))}

              {/* Current time indicator */}
              {isToday(currentDate) && (() => {
                const now = new Date();
                const minutesSince6 = differenceInMinutes(now, addHours(dayStart, 6));
                if (minutesSince6 < 0 || minutesSince6 > HOURS.length * 60) return null;
                const top = (minutesSince6 / 60) * HOUR_HEIGHT;
                return <div className="absolute left-0 right-0 h-0.5 bg-destructive z-10" style={{ top }} />;
              })()}

              {/* Events positioned by time */}
              {timed.map((ev) => {
                const evStart = toCT(ev.start_time);
                const evEnd = toCT(ev.end_time);
                const startMin = differenceInMinutes(evStart, addHours(dayStart, 6));
                const duration = Math.max(differenceInMinutes(evEnd, evStart), 15);
                const top = Math.max((startMin / 60) * HOUR_HEIGHT, 0);
                const height = Math.max((duration / 60) * HOUR_HEIGHT, 20);

                return (
                  <div
                    key={ev.id}
                    className={cn(
                      "absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 overflow-hidden cursor-pointer",
                      "hover:ring-1 hover:ring-primary/40 transition-all z-[5]",
                      colors.bg, colors.border, "border-l-2"
                    )}
                    style={{ top, height: Math.min(height, HOURS.length * HOUR_HEIGHT - top) }}
                    onClick={() => onSelect ? onSelect(ev) : (ev.html_link && window.open(ev.html_link, "_blank"))}
                    title={`${ev.title}\n${format(evStart, "h:mm a")} – ${format(evEnd, "h:mm a")} CT`}
                  >
                    <span className="text-[9px] font-bold text-foreground line-clamp-1 leading-tight">{ev.title}</span>
                    <span className="text-[8px] text-muted-foreground leading-none">
                      {format(evStart, "h:mm")}–{format(evEnd, "h:mm a")} CT
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Agenda View — chronological list grouped by day ──
function AgendaView({ events, onSelect }: { events: CalendarEvent[]; onSelect: (e: CalendarEvent) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = ev.all_day
        ? format(parseISO(ev.start_time), "yyyy-MM-dd")
        : format(toCT(ev.start_time), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/80 p-12 text-center">
        <CalendarDays className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No events in the next 30 days.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 overflow-hidden">
      <div className="divide-y divide-border/30 max-h-[700px] overflow-y-auto">
        {groups.map(([dayKey, dayEvents]) => {
          const date = parseISO(dayKey + "T12:00:00");
          const today = isToday(date);
          return (
            <div key={dayKey} className="grid grid-cols-[110px_1fr] gap-3 p-3 hover:bg-accent/10">
              <div className="text-right">
                <div className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  today ? "text-primary" : "text-muted-foreground"
                )}>
                  {format(date, "EEE")}
                </div>
                <div className={cn(
                  "text-2xl font-bold leading-none mt-0.5",
                  today ? "text-primary" : "text-foreground"
                )}>
                  {format(date, "d")}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {format(date, "MMM yyyy")}
                </div>
                {today && (
                  <Badge className="mt-1 text-[8px] px-1.5 py-0 h-4">Today</Badge>
                )}
              </div>
              <div className="space-y-1.5 min-w-0">
                {dayEvents.map((ev) => {
                  const c = getTeamColor(ev.calendar_owner_email);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      className={cn(
                        "w-full text-left rounded-md border border-border/40 bg-background/40 px-2.5 py-2 hover:bg-accent/40 transition-all border-l-4",
                        c.border
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.dot)} />
                        <span className="text-xs font-bold text-foreground truncate flex-1">{ev.title}</span>
                        {(ev.account_id || ev.opportunity_id) && (
                          <Link2 className="h-3 w-3 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {ev.all_day
                          ? "All day"
                          : `${format(toCT(ev.start_time), "h:mm a")} – ${format(toCT(ev.end_time), "h:mm a")} CT`}
                        {ev.location && (
                          <>
                            <span>·</span>
                            <MapPin className="h-2.5 w-2.5" />
                            <span className="truncate">{ev.location}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

