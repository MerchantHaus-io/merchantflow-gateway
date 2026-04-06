import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

const BROADCAST_KEY = "eob-update-2026-02-20";

const TEAM_EMAILS = [
  "admin@merchanthaus.io",
  "onboarding@merchanthaus.io",
  "jamie@merchanthaus.io",
  "support@merchanthaus.io",
  "sales@merchanthaus.io",
  "taryn@merchanthaus.io",
];

interface Ack {
  user_email: string;
  acknowledged_at: string;
}

export function BroadcastAckPanel() {
  const [acks, setAcks] = useState<Ack[]>([]);

  const fetchAcks = async () => {
    const { data } = await supabase
      .from("broadcast_acknowledgments")
      .select("user_email, acknowledged_at")
      .eq("broadcast_key", BROADCAST_KEY);
    if (data) setAcks(data);
  };

  useEffect(() => {
    fetchAcks();
    const channel = supabase
      .channel("broadcast-acks")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "broadcast_acknowledgments" }, () => {
        fetchAcks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const ackedEmails = new Set(acks.map((a) => a.user_email));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📢 Broadcast Acknowledgments
        </CardTitle>
        <CardDescription>EOB account update notice — who has confirmed</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {TEAM_EMAILS.map((email) => {
            const ack = acks.find((a) => a.user_email === email);
            const name = email.split("@")[0];
            const displayName = name.charAt(0).toUpperCase() + name.slice(1);

            return (
              <div
                key={email}
                className="flex items-center justify-between py-2 px-3 rounded-md border border-border"
              >
                <span className="text-sm font-medium capitalize">{displayName}</span>
                {ack ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-primary text-primary-foreground gap-1 text-xs">
                      <CheckCircle2 className="h-3 w-3" />
                      Read
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(ack.acknowledged_at), "HH:mm")}
                    </span>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/30 gap-1 text-xs">
                    <XCircle className="h-3 w-3" />
                    Pending
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {ackedEmails.size} of {TEAM_EMAILS.length} confirmed
        </p>
      </CardContent>
    </Card>
  );
}
