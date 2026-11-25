import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Trash2, Layers, ChevronRight, Zap } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Sequence = { id: string; name: string; created_at: string };

function SequenceCard({ c, enrolled, onOpen, onDelete }: { c: Sequence; enrolled?: number; onOpen: () => void; onDelete: () => void }) {
  return (
    <Card
      onClick={onOpen}
      className="group relative cursor-pointer border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-foreground break-words min-w-0">{c.name}</p>
          <Button
            size="icon" variant="ghost" aria-label={`Delete ${c.name}`}
            className="h-7 w-7 shrink-0 text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
          <span>
            {enrolled === undefined ? "—" : `${enrolled} enrolled`} · {format(new Date(c.created_at), "MMM d, yyyy")}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Outreach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Sequence | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_campaigns").select("id, name, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sequence[];
    },
  });

  // Enrolment count per sequence. Best-effort: if it fails the cards just omit the count.
  const { data: enrolCounts } = useQuery({
    queryKey: ["outreach-enrollment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("outreach_enrollments").select("campaign_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data) counts[r.campaign_id] = (counts[r.campaign_id] || 0) + 1;
      return counts;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      // subject / body_html are NOT NULL legacy columns from the retired single-email
      // cadence; the 12-touch sequence does not use them, so they are stored empty.
      const { data, error } = await supabase.from("outreach_campaigns").insert({
        name: name.trim(), subject: "", body_html: "",
        created_by: user?.id || "", created_by_email: user?.email || "",
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setOpen(false); setName("");
      toast.success("Sequence created");
      navigate(`/outreach/${newId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-enrollment-counts"] });
      toast.success("Sequence deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canCreate = name.trim().length > 0 && !create.isPending;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={Zap}
          title="Outreach Sequences"
          description="12-touch sequences · task queue · AI research & drafts"
          color="warning"
          actions={
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New sequence</Button>
          }
        />

        <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setName(""); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" />New sequence</DialogTitle>
              <DialogDescription>Name the sequence, then upload a CSV or enrol contacts on the next screen.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={e => { e.preventDefault(); if (canCreate) create.mutate(); }}
            >
              <div>
                <Label htmlFor="sequence-name" className="text-xs">Sequence name</Label>
                <Input id="sequence-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Q2 SMB restaurants" className="mt-1" />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!canCreate}>{create.isPending ? "Creating…" : "Create sequence"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!pendingDelete} onOpenChange={o => { if (!o) setPendingDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>This removes the sequence. It cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (pendingDelete) del.mutate(pendingDelete.id); setPendingDelete(null); }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />)}
            </div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No sequences yet"
              description="Create a sequence, then upload a CSV or enrol contacts into the 12-touch cadence."
              actionLabel="New sequence"
              onAction={() => setOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {campaigns.map(c => (
                <SequenceCard
                  key={c.id} c={c} enrolled={enrolCounts?.[c.id] ?? (enrolCounts ? 0 : undefined)}
                  onOpen={() => navigate(`/outreach/${c.id}`)}
                  onDelete={() => setPendingDelete(c)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
