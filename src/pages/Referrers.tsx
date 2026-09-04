import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AffiliatePayoutsPanel } from "@/components/affiliates/AffiliatePayoutsPanel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Plus, UserPlus, LogIn, Trash2, Tag } from "lucide-react";
import { format } from "date-fns";

interface ReferrerRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  alias: string | null;
  active: boolean;
  attribution_only: boolean;
  commission_rate: number;
  monthly_cap_per_merchant: number;
  clawback_window_days: number;
  notes: string | null;
  created_at: string;
}


const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function Referrers() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [rows, setRows] = useState<ReferrerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    commission_rate: 0.50,
    monthly_cap_per_merchant: 1000,
  });
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReferrerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [nameOnlyOpen, setNameOnlyOpen] = useState(false);
  const [nameOnlyForm, setNameOnlyForm] = useState({ full_name: "", notes: "" });



  const handleImpersonate = async (row: ReferrerRow) => {
    // Open the tab synchronously, while the click's user-activation context is
    // still live. Browsers block window.open() that fires after an await, so
    // the tab must be opened up-front and navigated once tokens arrive.
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("Popup blocked — allow popups for this site to use admin view");
      return;
    }
    setImpersonating(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("impersonate-referrer", {
        body: { referrer_id: row.id },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Failed to start admin view");
        popup.close();
        return;
      }
      if (!data?.access_token || !data?.refresh_token) {
        toast.error("No session tokens returned");
        popup.close();
        return;
      }

      // Hand off the referrer session via sessionStorage. The new tab reads
      // and clears this immediately, so the admin's main session in this tab
      // (and every other tab) is never touched.
      const handoff = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        referrer_name: data.referrer_name ?? row.full_name,
        referrer_email: data.referrer_email ?? row.email ?? "",
        ts: Date.now(),
      };
      // Use a per-handoff key so multiple opens don't race.
      const key = `impersonation-handoff:${row.id}`;
      try {
        // Stored in localStorage (not sessionStorage) so the newly-opened tab,
        // which has its own sessionStorage, can read it. The new tab deletes
        // the entry immediately after consuming it.
        localStorage.setItem(key, JSON.stringify(handoff));
      } catch {
        toast.error("Browser storage blocked — cannot start admin view");
        popup.close();
        return;
      }

      popup.location.href = `${window.location.origin}/affiliate?impersonate=${encodeURIComponent(row.id)}`;
      toast.success(`Opening admin view as ${row.full_name}`);
    } catch (err) {
      popup.close();
      toast.error(err instanceof Error ? err.message : "Failed to start admin view");
    } finally {
      setImpersonating(null);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("referrers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as unknown as ReferrerRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!roleLoading && isAdmin) load();
  }, [roleLoading, isAdmin]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.active).length;
    const attribution = rows.filter((r) => r.attribution_only).length;
    return { active, attribution, total: rows.length };
  }, [rows]);


  const update = (id: string, patch: Partial<ReferrerRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveRow = async (row: ReferrerRow) => {
    if (!row.full_name.trim()) {
      toast.error("A name is required");
      return;
    }
    setSaving(row.id);
     
    const patch: any = {
      full_name: row.full_name.trim(),
      phone: row.phone,
      alias: row.alias,
      notes: row.notes,
      active: row.active,
      commission_rate: row.commission_rate,
      monthly_cap_per_merchant: row.monthly_cap_per_merchant,
      clawback_window_days: row.clawback_window_days,
    };
    const { error } = await supabase.from("referrers").update(patch).eq("id", row.id);
    setSaving(null);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  const handleDelete = async () => {
    const row = deleteTarget;
    if (!row) return;
    setDeleting(true);

    // Attribution-only names have no login, so the row delete is enough and
    // admins can do it directly under RLS. Full affiliates go through the
    // edge function, which also removes the portal login.
    if (row.attribution_only && !row.auth_user_id) {
      const { error } = await supabase.from("referrers").delete().eq("id", row.id);
      setDeleting(false);
      setDeleteTarget(null);
      if (error) toast.error(error.message);
      else {
        toast.success(`${row.full_name} deleted`);
        load();
      }
      return;
    }

    const { data, error } = await supabase.functions.invoke("delete-referrer", {
      body: { referrer_id: row.id },
    });
    setDeleting(false);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Failed to delete affiliate");
      return;
    }
    setDeleteTarget(null);
    toast.success(data?.message ?? `${row.full_name} deleted`);
    load();
  };

  const handleCreateNameOnly = async () => {
    if (!nameOnlyForm.full_name.trim()) {
      toast.error("A name is required");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("referrers").insert({
      full_name: nameOnlyForm.full_name.trim(),
      notes: nameOnlyForm.notes.trim() || null,
      active: false,
      attribution_only: true,
      commission_rate: 0,
      monthly_cap_per_merchant: 0,
    } as never);
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Name added for attribution");
    setNameOnlyForm({ full_name: "", notes: "" });
    setNameOnlyOpen(false);
    load();
  };

  const handleCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-referrer-user", {
      body: {
        full_name: createForm.full_name.trim(),
        email: createForm.email.trim().toLowerCase(),
        phone: createForm.phone.trim() || null,
        commission_rate: createForm.commission_rate,
        monthly_cap_per_merchant: createForm.monthly_cap_per_merchant,
      },
    });

    if (error || (data && data.error)) {
      setCreating(false);
      toast.error((data && data.error) || error?.message || "Failed to create affiliate");
      return;
    }

    // Promoting an attribution-only name: retire the placeholder row so the
    // list keeps one entry per person.
    if (promotingId) {
      const { error: delErr } = await supabase.from("referrers").delete().eq("id", promotingId);
      if (delErr) toast.error(`Affiliate created, but the old attribution entry remains: ${delErr.message}`);
      setPromotingId(null);
    }

    setCreating(false);
    setCreatedCredentials({ email: createForm.email, password: data.temp_password });
    setCreateForm({ full_name: "", email: "", phone: "", commission_rate: 0.50, monthly_cap_per_merchant: 1000 });
    setCreateOpen(false);
    load();
  };

  const startPromote = (row: ReferrerRow) => {
    setPromotingId(row.id);
    setCreateForm({
      full_name: row.full_name,
      email: "",
      phone: row.phone ?? "",
      commission_rate: 0.50,
      monthly_cap_per_merchant: 1000,
    });
    setCreateOpen(true);
  };


  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (roleLoading) return null;
  if (!isAdmin) {
    return (
      <AppLayout pageTitle="Affiliates">
        <div className="p-6 text-muted-foreground">Admin access required.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      pageTitle="Affiliates"
      headerActions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => copy(`${window.location.origin}/affiliate/signup`)}
            size="sm"
            variant="outline"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Sign-up Link
          </Button>
          <Button onClick={() => setNameOnlyOpen(true)} size="sm" variant="outline">
            <Tag className="h-4 w-4 mr-2" />
            Add Name Only
          </Button>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Affiliate
          </Button>
        </div>
      }
    >
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{totals.active} active</Badge>
          {totals.attribution > 0 && <Badge variant="outline">{totals.attribution} attribution only</Badge>}
          <Badge variant="outline">{totals.total} total</Badge>
        </div>

        <AffiliatePayoutsPanel />


        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Alias</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Comm %</TableHead>
                <TableHead className="text-right">Monthly Cap</TableHead>
                <TableHead className="text-right">Clawback (days)</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Date activated</TableHead>
                <TableHead className="text-center">Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">Loading…</TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                    No affiliates yet. Click <strong>Add Affiliate</strong> to create the first one.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        value={row.full_name}
                        onChange={(e) => update(row.id, { full_name: e.target.value })}
                        className="h-8"
                      />
                      {row.attribution_only && (
                        <Badge variant="outline" className="shrink-0 text-[10px] whitespace-nowrap">
                          Attribution only
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.email ? row.email.split("@")[0] : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <Input
                      value={row.alias ?? ""}
                      onChange={(e) => update(row.id, { alias: e.target.value })}
                      className="h-8 w-28"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.phone ?? ""}
                      onChange={(e) => update(row.id, { phone: e.target.value })}
                      className="h-8"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.notes ?? ""}
                      onChange={(e) => update(row.id, { notes: e.target.value })}
                      className="h-8 w-40"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={row.commission_rate}
                      onChange={(e) => update(row.id, { commission_rate: Number(e.target.value) })}
                      disabled={row.attribution_only}
                      className="h-8 w-20 text-right ml-auto disabled:opacity-50"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="50"
                      min="0"
                      value={row.monthly_cap_per_merchant}
                      onChange={(e) => update(row.id, { monthly_cap_per_merchant: Number(e.target.value) })}
                      disabled={row.attribution_only}
                      className="h-8 w-24 text-right ml-auto disabled:opacity-50"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={row.clawback_window_days}
                      onChange={(e) => update(row.id, { clawback_window_days: Number(e.target.value) })}
                      disabled={row.attribution_only}
                      className="h-8 w-16 text-right ml-auto disabled:opacity-50"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={row.active}
                      disabled={row.attribution_only}
                      onCheckedChange={(v) => update(row.id, { active: v })}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(row.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.attribution_only ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startPromote(row)}
                        title="Give this name a portal login and commission terms"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Promote
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleImpersonate(row)}
                        disabled={impersonating === row.id || !row.active}
                        title={row.active ? "Open a session as this affiliate" : "Affiliate is inactive"}
                      >
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                        {impersonating === row.id ? "Opening…" : "Login as"}
                      </Button>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => saveRow(row)} disabled={saving === row.id}>
                        {saving === row.id ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(row)}
                        title="Delete this affiliate"
                        aria-label={`Delete ${row.full_name}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Commission: affiliate earns <strong>Comm %</strong> of net monthly revenue per referred merchant, capped at
          <strong> Monthly Cap</strong> per merchant per month. Clawback applies if the merchant churns within
          the clawback window of going live. Names marked <strong>Attribution only</strong> exist purely to record who
          referred a deal — no login, no commission and no payouts until you promote them.
        </p>
      </div>

      {/* Create Affiliate dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setPromotingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{promotingId ? "Promote to full affiliate" : "Add Affiliate"}</DialogTitle>
            <DialogDescription>
              Creates an admin-provisioned account. A temporary password will be generated — share it with the
              affiliate; they'll be prompted to change it on first login.

            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="ref-name">Full name</Label>
              <Input
                id="ref-name"
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="ref-email">Email</Label>
              <Input
                id="ref-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <Label htmlFor="ref-phone">Phone (optional)</Label>
              <Input
                id="ref-phone"
                value={createForm.phone}
                onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ref-rate">Commission rate</Label>
                <Input
                  id="ref-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={createForm.commission_rate}
                  onChange={(e) => setCreateForm({ ...createForm, commission_rate: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">{fmtPct(createForm.commission_rate)} of net revenue</p>
              </div>
              <div>
                <Label htmlFor="ref-cap">Monthly cap per merchant</Label>
                <Input
                  id="ref-cap"
                  type="number"
                  step="50"
                  min="0"
                  value={createForm.monthly_cap_per_merchant}
                  onChange={(e) => setCreateForm({ ...createForm, monthly_cap_per_merchant: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">{fmtCurrency(createForm.monthly_cap_per_merchant)} max / merchant / month</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? "Creating…" : "Create affiliate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show generated credentials so admin can deliver them */}
      <Dialog open={!!createdCredentials} onOpenChange={(o) => !o && setCreatedCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Affiliate created</DialogTitle>
            <DialogDescription>
              Share these credentials with the affiliate through a secure channel. This password is only shown once.
            </DialogDescription>
          </DialogHeader>
          {createdCredentials && (
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={createdCredentials.email} className="font-mono" />
                  <Button size="sm" variant="outline" onClick={() => copy(createdCredentials.email)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Temporary password</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={createdCredentials.password} className="font-mono" />
                  <Button size="sm" variant="outline" onClick={() => copy(createdCredentials.password)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The affiliate must change this password on first login.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add an attribution-only name (no login, no payouts) */}
      <Dialog open={nameOnlyOpen} onOpenChange={setNameOnlyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add name only</DialogTitle>
            <DialogDescription>
              Records who referred a deal. No login, no commission and no payouts — you can promote them to a full
              affiliate later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="name-only">Full name</Label>
              <Input
                id="name-only"
                value={nameOnlyForm.full_name}
                onChange={(e) => setNameOnlyForm({ ...nameOnlyForm, full_name: e.target.value })}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="name-only-notes">Notes (optional)</Label>
              <Input
                id="name-only-notes"
                value={nameOnlyForm.notes}
                onChange={(e) => setNameOnlyForm({ ...nameOnlyForm, notes: e.target.value })}
                placeholder="Bank, introducer, how you know them…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNameOnlyOpen(false)} disabled={creating}>Cancel</Button>
            <Button onClick={handleCreateNameOnly} disabled={creating}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? "Adding…" : "Add name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.attribution_only && !deleteTarget?.auth_user_id
                ? "This removes the name from the list. Deals already tagged to them keep their history."
                : "This removes the affiliate and their portal login for good. Deals stay, but they lose the referral tag. If they already have commission records, switch them to inactive instead — the delete will be blocked."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
