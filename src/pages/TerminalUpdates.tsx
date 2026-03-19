import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sparkles,
  Bug,
  Wrench,
  Zap,
  Shield,
  Layout,
  Bell,
  MessageSquare,
  ClipboardList,
  BarChart3,
  Users,
  FileText,
  Phone,
  Download,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";

type UpdateType = "feature" | "fix" | "improvement" | "security";

const iconMap: Record<string, LucideIcon> = {
  Sparkles, Bug, Wrench, Zap, Shield, Layout, Bell,
  MessageSquare, ClipboardList, BarChart3, Users, FileText, Phone,
};

const typeConfig: Record<UpdateType, { label: string; className: string }> = {
  feature: { label: "New", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" },
  fix: { label: "Fix", className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400" },
  improvement: { label: "Improved", className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400" },
  security: { label: "Security", className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" },
};

interface DbUpdate {
  id: string;
  title: string;
  description: string;
  type: string;
  icon_name: string;
  published_date: string;
}

interface DayBlock {
  date: string;
  updates: DbUpdate[];
}

export default function TerminalUpdates() {
  const [sending, setSending] = useState(false);
  const { data: updates, isLoading } = useQuery({
    queryKey: ["terminal-updates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_updates")
        .select("*")
        .order("published_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DbUpdate[];
    },
  });

  // Group by published_date
  const dayBlocks = useMemo<DayBlock[]>(() => {
    if (!updates) return [];
    const grouped: Record<string, DbUpdate[]> = {};
    for (const u of updates) {
      const key = u.published_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(u);
    }
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({ date, updates: items }));
  }, [updates]);

  const downloadMarkdown = useCallback(() => {
    if (!dayBlocks.length) return;
    const lines: string[] = ["# Terminal Updates\n"];
    dayBlocks.forEach((day) => {
      lines.push(`## ${format(parseISO(day.date), "EEEE, MMMM d, yyyy")}\n`);
      day.updates.forEach((u) => {
        const tag = typeConfig[u.type as UpdateType]?.label.toUpperCase() || u.type.toUpperCase();
        lines.push(`- **[${tag}] ${u.title}** — ${u.description}`);
      });
      lines.push("");
    });
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-updates-${format(new Date(), "yyyy-MM-dd")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dayBlocks]);

  const sendUpdateEmail = useCallback(async (date?: string) => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-terminal-update-email", {
        body: date ? { date } : {},
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Update email sent to ${data.recipients} team members`);
      } else {
        toast.info(data?.message || "No updates to send");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 space-y-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Terminal Updates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              What's new, fixed, and improved — updated daily.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => sendUpdateEmail()} className="gap-1.5" disabled={isLoading || sending}>
              <Mail className="h-4 w-4" />
              {sending ? "Sending…" : "Email Team"}
            </Button>
            <Button variant="outline" size="sm" onClick={downloadMarkdown} className="gap-1.5" disabled={isLoading}>
              <Download className="h-4 w-4" />
              Download .md
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : dayBlocks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p>No updates logged yet.</p>
          </div>
        ) : (
          dayBlocks.map((day) => (
            <div key={day.date} className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground whitespace-nowrap">
                  {format(parseISO(day.date), "EEEE, MMMM d")}
                </h2>
                <Separator className="flex-1" />
              </div>

              <div className="space-y-3">
                {day.updates.map((update) => {
                  const tConfig = typeConfig[update.type as UpdateType] || typeConfig.feature;
                  const Icon = iconMap[update.icon_name] || Sparkles;
                  return (
                    <Card key={update.id} className="transition-colors hover:bg-muted/30">
                      <CardContent className="p-4 flex gap-3">
                        <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{update.title}</span>
                            <Badge variant="outline" className={tConfig.className + " text-xs"}>
                              {tConfig.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {update.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}
