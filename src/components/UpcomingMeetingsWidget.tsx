import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, isToday, isTomorrow, differenceInHours } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const CT_TZ = "America/Chicago";
const toCT = (d: string) => toZonedTime(new Date(d), CT_TZ);
import { CalendarClock, MapPin, Users, ExternalLink, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";

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

function getUrgencyLevel(startTime: string): "now" | "soon" | "today" | "upcoming" {
  const hoursUntil = differenceInHours(new Date(startTime), new Date());
  if (hoursUntil <= 0) return "now";
  if (hoursUntil <= 1) return "soon";
  if (isToday(new Date(startTime))) return "today";
  return "upcoming";
}

const urgencyStyles: Record<string, string> = {
  now: "border-l-4 border-l-destructive bg-destructive/5",
  soon: "border-l-4 border-l-warning bg-warning/5",
  today: "border-l-4 border-l-primary bg-primary/5",
  upcoming: "border-l-4 border-l-muted-foreground/30",
};

const urgencyBadge: Record<string, { label: string; className: string }> = {
  now: { label: "NOW", className: "bg-destructive text-destructive-foreground animate-pulse" },
  soon: { label: "< 1 HR", className: "bg-warning text-warning-foreground" },
  today: { label: "TODAY", className: "bg-primary/15 text-primary" },
  upcoming: { label: "", className: "" },
};

export function UpcomingMeetingsWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUpcomingEvents();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("calendar-events-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () => {
        fetchUpcomingEvents();
      })
      .subscribe();

    // Refresh every 5 minutes for urgency recalculation
    const interval = setInterval(fetchUpcomingEvents, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  async function fetchUpcomingEvents() {
    const now = new Date().toISOString();
    const threeDaysOut = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("calendar_events")
      .select("*")
      .gte("start_time", now)
      .lte("start_time", threeDaysOut)
      .eq("status", "confirmed")
      .order("start_time", { ascending: true })
      .limit(3);

    setEvents((data as CalendarEvent[]) || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Upcoming Meetings</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/80 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Upcoming Meetings</span>
          </div>
          <button
            onClick={() => navigate("/calendar")}
            className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
          >
            View Calendar <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center py-4">No upcoming meetings in the next 3 days.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Upcoming Meetings</span>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {events.length}
          </Badge>
        </div>
        <button
          onClick={() => navigate("/calendar")}
          className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
        >
          View Calendar <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
        <AnimatePresence>
          {events.map((event, idx) => {
            const urgency = getUrgencyLevel(event.start_time);
            const badge = urgencyBadge[urgency];
            const attendeeList = Array.isArray(event.attendees) ? event.attendees : [];
            const internalAttendees = attendeeList.filter(
              (a: unknown) => a.email?.endsWith("@merchanthaus.io")
            );

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={cn(
                  "rounded-lg p-2.5 cursor-pointer hover:bg-accent/40 transition-all",
                  urgencyStyles[urgency]
                )}
                onClick={() => event.html_link && window.open(event.html_link, "_blank")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {event.title}
                      </span>
                      {badge.label && (
                        <Badge className={cn("text-[8px] px-1 py-0 h-3.5 shrink-0", badge.className)}>
                          {badge.label}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {event.all_day
                          ? (isToday(toCT(event.start_time)) ? "All Day Today" : isTomorrow(toCT(event.start_time)) ? "All Day Tomorrow" : format(toCT(event.start_time), "EEE, MMM d"))
                          : `${format(toCT(event.start_time), "h:mm a")} – ${format(toCT(event.end_time), "h:mm a")} CT`
                        }
                      </span>
                      {!isToday(toCT(event.start_time)) && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(toCT(event.start_time), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    {/* Internal attendees */}
                    {internalAttendees.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Users className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground truncate">
                          {internalAttendees.map((a: unknown) => a.displayName || a.email?.split("@")[0]).join(", ")}
                        </span>
                      </div>
                    )}

                    {event.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground truncate">{event.location}</span>
                      </div>
                    )}
                  </div>

                  {event.html_link && (
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
