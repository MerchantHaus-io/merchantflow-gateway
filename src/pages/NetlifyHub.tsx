import { useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Cloud, Bug, Zap, Wrench, AlertTriangle, Lightbulb, CheckCircle2, Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface AuditEntry {
  id: string;
  audit_date: string;
  item_id: string;
  type: string;
  title: string;
  description: string;
  expected_outcome: string;
  status: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

const typeConfig: Record<string, { label: string; icon: typeof Bug; className: string }> = {
  bug: { label: "Bug", icon: Bug, className: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400" },
  missing: { label: "Missing", icon: AlertTriangle, className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  improvement: { label: "Improvement", icon: Lightbulb, className: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400" },
};

export default function NetlifyHub() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntry, setNewEntry] = useState({ type: "bug", title: "", description: "", expected_outcome: "" });

  const { data: entries = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_entries")
        .select("*")
        .order("audit_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AuditEntry[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof newEntry) => {
      const { error } = await supabase.from("audit_entries").insert({
        item_id: `${entry.type}-${Date.now()}`,
        type: entry.type,
        title: entry.title,
        description: entry.description,
        expected_outcome: entry.expected_outcome,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-entries"] });
      setShowAddDialog(false);
      setNewEntry({ type: "bug", title: "", description: "", expected_outcome: "" });
      toast.success("Audit entry added");
    },
    onError: () => toast.error("Failed to add entry"),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolve }: { id: string; resolve: boolean }) => {
      const { error } = await supabase
        .from("audit_entries")
        .update({
          status: resolve ? "resolved" : "open",
          resolved_at: resolve ? new Date().toISOString() : null,
          resolved_by: resolve ? (user?.email || null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-entries"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const filtered = entries.filter((e) => {
    if (statusFilter === "open") return e.status === "open";
    if (statusFilter === "resolved") return e.status === "resolved";
    return true;
  });

  // Group by date
  const grouped = filtered.reduce<Record<string, AuditEntry[]>>((acc, e) => {
    const date = e.audit_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(e);
    return acc;
  }, {});

  const openCount = entries.filter((e) => e.status === "open").length;
  const resolvedCount = entries.filter((e) => e.status === "resolved").length;

  return (
    <AppLayout pageTitle="Audit Log">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Cloud className="h-6 w-6 text-[hsl(var(--gold))]" />
              <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Deployment audit log — bugs found, fixes needed, and improvements suggested.
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setShowAddDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Entry
            </Button>
          )}
        </div>

        <Separator />

        {/* Filter tabs */}
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as unknown)}>
          <TabsList>
            <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
            <TabsTrigger value="open">Open ({openCount})</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading audit entries…</span>
          </div>
        )}

        {isError && (
          <Card className="border-destructive/50">
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm text-destructive">Failed to load audit entries</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No {statusFilter !== "all" ? statusFilter : ""} audit entries found.
          </div>
        )}

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date} className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                Audit — {format(new Date(date + "T00:00:00"), "MMM d, yyyy")}
              </h2>
              <Badge variant="outline" className="text-xs">{items.length} items</Badge>
            </div>

            {/* Summary counts */}
            <div className="flex gap-3 flex-wrap">
              {(["bug", "missing", "improvement"] as const).map((type) => {
                const count = items.filter((i) => i.type === type).length;
                if (count === 0) return null;
                const config = typeConfig[type];
                const Icon = config.icon;
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {count} {config.label}{count > 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Items */}
            <div className="space-y-3">
              {items.map((item) => {
                const config = typeConfig[item.type] || typeConfig.bug;
                const Icon = config.icon;
                const isResolved = item.status === "resolved";

                return (
                  <Card key={item.id} className={`transition-colors hover:bg-muted/30 ${isResolved ? "opacity-60" : ""}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium text-sm ${isResolved ? "line-through" : ""}`}>{item.title}</span>
                            <Badge variant="outline" className={config.className + " text-xs"}>
                              {config.label}
                            </Badge>
                            {isResolved && (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 text-xs">
                                Resolved
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                          {isResolved && item.resolved_by && (
                            <p className="text-xs text-muted-foreground">
                              Resolved by {item.resolved_by.split("@")[0]}
                              {item.resolved_at && ` · ${format(new Date(item.resolved_at), "MMM d, yyyy")}`}
                            </p>
                          )}
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-xs"
                            onClick={() => resolveMutation.mutate({ id: item.id, resolve: !isResolved })}
                            disabled={resolveMutation.isPending}
                          >
                            {isResolved ? "Reopen" : "Resolve"}
                          </Button>
                        )}
                      </div>
                      <div className="ml-11 flex items-start gap-2 bg-muted/50 rounded-lg p-3">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Outcome</span>
                          <p className="text-sm text-foreground mt-0.5">{item.expected_outcome}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Add Entry Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Audit Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={newEntry.type} onValueChange={(v) => setNewEntry((p) => ({ ...p, type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="improvement">Improvement</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Title"
              value={newEntry.title}
              onChange={(e) => setNewEntry((p) => ({ ...p, title: e.target.value }))}
            />
            <Textarea
              placeholder="Description"
              value={newEntry.description}
              onChange={(e) => setNewEntry((p) => ({ ...p, description: e.target.value }))}
              rows={3}
            />
            <Textarea
              placeholder="Expected outcome"
              value={newEntry.expected_outcome}
              onChange={(e) => setNewEntry((p) => ({ ...p, expected_outcome: e.target.value }))}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(newEntry)}
              disabled={!newEntry.title.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
