import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, MapPin, Users, ExternalLink, Building2, Briefcase, Mail, Calendar as CalIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const CT_TZ = "America/Chicago";
const toCT = (iso: string) => toZonedTime(parseISO(iso), CT_TZ);

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

interface Props {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerColor?: { dot: string; bg: string; border: string };
}

export function EventDetailSheet({ event, open, onOpenChange, ownerColor }: Props) {
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null);
  const [opportunity, setOpportunity] = useState<{ id: string; stage: string; account_id: string } | null>(null);

  useEffect(() => {
    if (!event || !open) {
      setAccount(null);
      setOpportunity(null);
      return;
    }
    (async () => {
      if (event.account_id) {
        const { data } = await supabase.from("accounts").select("id, name").eq("id", event.account_id).maybeSingle();
        if (data) setAccount(data);
      }
      if (event.opportunity_id) {
        const { data } = await supabase.from("opportunities").select("id, stage, account_id").eq("id", event.opportunity_id).maybeSingle();
        if (data) {
          setOpportunity(data);
          if (!event.account_id && data.account_id) {
            const { data: acc } = await supabase.from("accounts").select("id, name").eq("id", data.account_id).maybeSingle();
            if (acc) setAccount(acc);
          }
        }
      }
    })();
  }, [event, open]);

  if (!event) return null;
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const internal = attendees.filter((a: any) => a.email?.endsWith("@merchanthaus.io"));
  const external = attendees.filter((a: any) => !a.email?.endsWith("@merchanthaus.io"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left space-y-3">
          <div className="flex items-center gap-2">
            <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", ownerColor?.dot ?? "bg-primary")} />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {event.calendar_owner_email?.split("@")[0] ?? "shared"}
            </Badge>
            {event.status && (
              <Badge variant="secondary" className="text-[10px] capitalize">{event.status}</Badge>
            )}
          </div>
          <SheetTitle className="text-xl font-bold leading-tight">{event.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <Row icon={<Clock className="h-4 w-4" />}>
            {event.all_day ? (
              <span>All day · {format(toCT(event.start_time), "EEE, MMM d")}</span>
            ) : (
              <span>
                {format(toCT(event.start_time), "EEE, MMM d · h:mm a")} – {format(toCT(event.end_time), "h:mm a")} CT
              </span>
            )}
          </Row>

          {event.location && (
            <Row icon={<MapPin className="h-4 w-4" />}>
              <span className="break-words">{event.location}</span>
            </Row>
          )}

          {(account || opportunity) && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Linked record</p>
                {account && (
                  <Link to={`/accounts/${account.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 hover:bg-accent/40 transition-colors">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold flex-1 truncate">{account.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                )}
                {opportunity && (
                  <Link to={`/opportunities/${opportunity.id}`} className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5 hover:bg-accent/40 transition-colors">
                    <Briefcase className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold flex-1 truncate">Opportunity</span>
                    <Badge variant="secondary" className="text-[9px] capitalize">{opportunity.stage}</Badge>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </Link>
                )}
              </div>
            </>
          )}

          {(internal.length > 0 || external.length > 0) && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3 w-3" /> Attendees ({attendees.length})
                </p>
                {internal.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Internal</p>
                    {internal.map((a: any, i: number) => (
                      <AttendeeRow key={`i-${i}`} attendee={a} />
                    ))}
                  </div>
                )}
                {external.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">External</p>
                    {external.map((a: any, i: number) => (
                      <AttendeeRow key={`e-${i}`} attendee={a} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {event.description && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</p>
                <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{event.description}</p>
              </div>
            </>
          )}

          {event.html_link && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => window.open(event.html_link!, "_blank")}
            >
              <CalIcon className="h-4 w-4" />
              Open in Google Calendar
              <ExternalLink className="h-3 w-3 ml-auto" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-foreground/90">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function AttendeeRow({ attendee }: { attendee: unknown }) {
  const name = attendee.displayName || attendee.email?.split("@")[0] || "Unknown";
  const status = attendee.responseStatus;
  const statusColor =
    status === "accepted" ? "bg-emerald-500" :
    status === "declined" ? "bg-rose-500" :
    status === "tentative" ? "bg-amber-500" : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-accent/30">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusColor)} title={status || "no response"} />
      <span className="font-medium truncate">{name}</span>
      {attendee.email && <span className="text-muted-foreground text-[10px] truncate ml-auto">{attendee.email}</span>}
    </div>
  );
}
