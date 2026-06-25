import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import {
  Sparkles, Bug, Wrench, Zap, Shield, Layout, Bell,
  MessageSquare, ClipboardList, BarChart3, Users, FileText, Phone,
  type LucideIcon,
} from "lucide-react";

const LS_KEY = "patchNotes.lastSeenDate";

const iconMap: Record<string, LucideIcon> = {
  Sparkles, Bug, Wrench, Zap, Shield, Layout, Bell,
  MessageSquare, ClipboardList, BarChart3, Users, FileText, Phone,
};

const typeConfig: Record<string, { label: string; className: string }> = {
  feature: { label: "New", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" },
  fix: { label: "Fix", className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400" },
  improvement: { label: "Improved", className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400" },
  security: { label: "Security", className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" },
};

interface Update {
  id: string;
  title: string;
  description: string;
  type: string;
  icon_name: string;
  published_date: string;
}

export function PatchNotesPopup() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const lastSeen = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;

  const { data: updates } = useQuery({
    enabled: authed,
    queryKey: ["patch-notes-unseen", lastSeen],
    queryFn: async () => {
      let q = supabase
        .from("terminal_updates")
        .select("id,title,description,type,icon_name,published_date")
        .order("published_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(25);
      if (lastSeen) q = q.gt("published_date", lastSeen);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Update[];
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (updates && updates.length > 0) setOpen(true);
  }, [updates]);

  const grouped = useMemo(() => {
    const m: Record<string, Update[]> = {};
    (updates ?? []).forEach((u) => {
      (m[u.published_date] ??= []).push(u);
    });
    return Object.entries(m).sort(([a], [b]) => b.localeCompare(a));
  }, [updates]);

  const handleDismiss = () => {
    if (updates && updates.length > 0) {
      localStorage.setItem(LS_KEY, updates[0].published_date);
    } else {
      localStorage.setItem(LS_KEY, new Date().toISOString().slice(0, 10));
    }
    setOpen(false);
  };

  if (!authed || !updates || updates.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleDismiss())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What's New in the Terminal
          </DialogTitle>
          <DialogDescription>
            {updates.length} update{updates.length === 1 ? "" : "s"} since you last checked in.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {format(parseISO(date), "EEE, MMM d")}
                  </h3>
                  <Separator className="flex-1" />
                </div>
                {items.map((u) => {
                  const tc = typeConfig[u.type] || typeConfig.feature;
                  const Icon = iconMap[u.icon_name] || Sparkles;
                  return (
                    <div key={u.id} className="flex gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
                      <div className="mt-0.5 h-7 w-7 flex-shrink-0 rounded-md bg-muted flex items-center justify-center">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{u.title}</span>
                          <Badge variant="outline" className={tc.className + " text-[10px] px-1.5 py-0"}>
                            {tc.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{u.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button onClick={handleDismiss} className="w-full sm:w-auto">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
