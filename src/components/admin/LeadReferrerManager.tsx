import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LeadReferrer {
  id: string;
  name: string;
  institution: string | null;
  is_active: boolean;
  created_at: string;
}

type Draft = { id?: string; name: string; institution: string; is_active: boolean };

const empty: Draft = { name: "", institution: "", is_active: true };

export function LeadReferrerManager() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: referrers = [], isLoading } = useQuery<LeadReferrer[]>({
    queryKey: ["lead-referrers-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_referrers" as never)
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LeadReferrer[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["lead-referrers-admin"] });
    qc.invalidateQueries({ queryKey: ["lead-referrers-active"] });
  };

  const openCreate = () => {
    setDraft(empty);
    setDialogOpen(true);
  };

  const openEdit = (r: LeadReferrer) => {
    setDraft({ id: r.id, name: r.name, institution: r.institution ?? "", is_active: r.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        institution: draft.institution.trim() || null,
        is_active: draft.is_active,
      };
      if (draft.id) {
        const { error } = await supabase
          .from("lead_referrers" as never)
          .update(payload)
          .eq("id", draft.id);
        if (error) throw error;
        toast.success("Referrer updated");
      } else {
        const { error } = await supabase.from("lead_referrers" as never).insert(payload);
        if (error) throw error;
        toast.success("Referrer added");
      }
      setDialogOpen(false);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from("lead_referrers" as never).delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Referrer removed");
      setDeleteId(null);
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const toggleActive = async (r: LeadReferrer) => {
    const { error } = await supabase
      .from("lead_referrers" as never)
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
    } else {
      invalidate();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Referrers
          </CardTitle>
          <CardDescription>
            Manage bank and partner contacts shown when creating deals or converting web submissions.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Referrer
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : referrers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No referrers yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrers.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.institution || <span className="opacity-50">—</span>}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => toggleActive(r)}
                        className="cursor-pointer"
                        aria-label="Toggle active"
                      >
                        <Badge
                          variant={r.is_active ? "default" : "outline"}
                          className={
                            r.is_active
                              ? "bg-green-600/20 text-green-600 border-green-600/30 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {r.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteId(r.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "Edit Referrer" : "Add Referrer"}</DialogTitle>
            <DialogDescription>
              Used to attribute new deals to a bank or partner contact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="lr-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="lr-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Jane Smith"
                maxLength={150}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lr-institution">Institution</Label>
              <Input
                id="lr-institution"
                value={draft.institution}
                onChange={(e) => setDraft((d) => ({ ...d, institution: e.target.value }))}
                placeholder="Wells Fargo (optional)"
                maxLength={150}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <Label htmlFor="lr-active" className="text-sm">Active</Label>
              <Switch
                id="lr-active"
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : draft.id ? "Save Changes" : "Add Referrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove referrer?</AlertDialogTitle>
            <AlertDialogDescription>
              The referrer will be removed from the directory. Existing deals attributed to them will keep
              their link cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
