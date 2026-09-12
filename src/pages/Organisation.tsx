/**
 * Organisation admin — the per-ISO console.
 *
 * Scoped entirely to the organisation the signed-in user administers: profile
 * details, team, price list and quote activity. Every read goes through the
 * tenant-scoped policies (an admin of one ISO cannot see another's rows even if
 * they guess an id), and every team write goes through the `tenant-team`
 * worker, which re-derives the caller's tenant from their own membership.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Building2, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";

type MemberRole = "owner" | "admin" | "member";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  primary_contact_email: string | null;
  billing_email: string | null;
}

interface MembershipRow {
  id: string;
  email: string | null;
  role: MemberRole;
  status: string;
  user_id: string | null;
  joined_at: string | null;
  created_at: string;
}

interface PricingRow {
  id: string;
  code: string;
  label: string;
  category: string;
  cadence: string;
  cost: number;
  resale: number;
  active: boolean;
  sort_order: number;
}

interface QuoteRow {
  id: string;
  quote_number: string | null;
  client_business_name: string | null;
  tier_name: string | null;
  status: string | null;
  monthly_resale: number | null;
  created_at: string;
}

const CADENCE_LABEL: Record<string, string> = {
  monthly: "per month",
  per_transaction: "per transaction",
  one_time: "one-off",
};

const CATEGORY_LABEL: Record<string, string> = {
  plan: "Plan",
  gateway_fee: "Gateway fee",
  extra: "Add-on",
  one_time: "One-off",
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const Organisation = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [myRole, setMyRole] = useState<MemberRole | null>(null);
  const [members, setMembers] = useState<MembershipRow[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);

  const [profile, setProfile] = useState({ name: "", primary: "", billing: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const [invite, setInvite] = useState<{ email: string; role: MemberRole }>({
    email: "",
    role: "member",
  });
  const [inviting, setInviting] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<MembershipRow | null>(null);

  const [newItem, setNewItem] = useState({
    label: "",
    code: "",
    category: "extra",
    cadence: "monthly",
    cost: "",
    resale: "",
  });
  const [savingItem, setSavingItem] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PricingRow | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const loadTeam = useCallback(async (tenantId: string) => {
    const { data } = await supabase
      .from("tenant_memberships")
      .select("id,email,role,status,user_id,joined_at,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    setMembers((data ?? []) as MembershipRow[]);
  }, []);

  const loadPricing = useCallback(async (tenantId: string) => {
    const { data } = await supabase
      .from("tenant_pricing_items")
      .select("id,code,label,category,cadence,cost,resale,active,sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    setPricing((data ?? []) as PricingRow[]);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: membership } = await supabase
      .from("tenant_memberships")
      .select("tenant_id,role,status,is_default")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setTenant(null);
      setMyRole(null);
      setLoading(false);
      return;
    }

    setMyRole(membership.role as MemberRole);

    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("id,name,slug,status,primary_contact_email,billing_email")
      .eq("id", membership.tenant_id)
      .maybeSingle();

    if (tenantRow) {
      setTenant(tenantRow as TenantRow);
      setProfile({
        name: tenantRow.name ?? "",
        primary: tenantRow.primary_contact_email ?? "",
        billing: tenantRow.billing_email ?? "",
      });
      await Promise.all([loadTeam(tenantRow.id), loadPricing(tenantRow.id)]);

      const { data: quoteRows } = await supabase
        .from("quotes")
        .select("id,quote_number,client_business_name,tier_name,status,monthly_resale,created_at")
        .eq("tenant_id", tenantRow.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setQuotes((quoteRows ?? []) as QuoteRow[]);
    }

    setLoading(false);
  }, [user, loadTeam, loadPricing]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = async () => {
    if (!tenant) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("tenants")
      .update({
        name: profile.name.trim(),
        primary_contact_email: profile.primary.trim() || null,
        billing_email: profile.billing.trim() || null,
      })
      .eq("id", tenant.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organisation details saved");
    load();
  };

  const callTeam = async (payload: Record<string, string>) => {
    const { data, error } = await supabase.functions.invoke("tenant-team", { body: payload });
    const returned = (data ?? {}) as { error?: string };
    if (error || returned.error) {
      toast.error(returned.error ?? error?.message ?? "That didn't work");
      return false;
    }
    if (tenant) await loadTeam(tenant.id);
    return true;
  };

  const sendInvite = async () => {
    if (!invite.email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setInviting(true);
    const ok = await callTeam({
      action: "invite",
      email: invite.email.trim(),
      role: invite.role,
      redirect_to: `${window.location.origin}/login`,
    });
    setInviting(false);
    if (ok) {
      toast.success(`Invite sent to ${invite.email.trim()}`);
      setInvite({ email: "", role: "member" });
    }
  };

  const addPricingItem = async () => {
    if (!tenant) return;
    const label = newItem.label.trim();
    if (!label) {
      toast.error("Give the item a name");
      return;
    }
    const code =
      newItem.code.trim() ||
      label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    setSavingItem(true);
    const { error } = await supabase.from("tenant_pricing_items").insert({
      tenant_id: tenant.id,
      code,
      label,
      category: newItem.category,
      cadence: newItem.cadence,
      cost: Number(newItem.cost) || 0,
      resale: Number(newItem.resale) || 0,
      sort_order: (pricing.at(-1)?.sort_order ?? 0) + 10,
    });
    setSavingItem(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewItem({ label: "", code: "", category: "extra", cadence: "monthly", cost: "", resale: "" });
    loadPricing(tenant.id);
  };

  const updatePricingItem = async (row: PricingRow, patch: Partial<PricingRow>) => {
    const { error } = await supabase.from("tenant_pricing_items").update(patch).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPricing((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...patch } : p)));
  };

  const deletePricingItem = async (row: PricingRow) => {
    const { error } = await supabase.from("tenant_pricing_items").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPricing((prev) => prev.filter((p) => p.id !== row.id));
    toast.success(`${row.label} removed`);
  };

  const quoteTotals = useMemo(() => {
    const accepted = quotes.filter((q) => q.status === "accepted");
    const monthly = accepted.reduce((sum, q) => sum + Number(q.monthly_resale ?? 0), 0);
    return { count: quotes.length, accepted: accepted.length, monthly };
  }, [quotes]);

  if (loading) {
    return (
      <AppLayout pageTitle="Organisation">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!tenant) {
    return (
      <AppLayout pageTitle="Organisation">
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle>No organisation yet</CardTitle>
              <CardDescription>
                Your login isn't attached to an organisation, so there is nothing to manage here.
                Ask a platform administrator to add you.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pageTitle="Organisation">
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{tenant.name}</h1>
          <Badge variant="outline" className="text-[10px] uppercase">{tenant.status}</Badge>
          <Badge variant="secondary" className="text-[10px]">You are {myRole}</Badge>
          {!isAdmin && (
            <span className="text-xs text-muted-foreground">
              View only — an owner or admin can make changes.
            </span>
          )}
        </div>

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
            <TabsTrigger value="quotes">Quotes</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------- details */}
          <TabsContent value="details" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Organisation details</CardTitle>
                <CardDescription>
                  Workspace key <span className="font-mono">{tenant.slug}</span> — set when the
                  organisation was created and fixed from here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="org-name">Name</Label>
                    <Input
                      id="org-name"
                      value={profile.name}
                      disabled={!isAdmin}
                      onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-primary">Main contact email</Label>
                    <Input
                      id="org-primary"
                      type="email"
                      value={profile.primary}
                      disabled={!isAdmin}
                      onChange={(e) => setProfile((p) => ({ ...p, primary: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="org-billing">Billing email</Label>
                    <Input
                      id="org-billing"
                      type="email"
                      value={profile.billing}
                      disabled={!isAdmin}
                      onChange={(e) => setProfile((p) => ({ ...p, billing: e.target.value }))}
                    />
                  </div>
                </div>
                {isAdmin && (
                  <Button onClick={saveProfile} disabled={savingProfile}>
                    {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save details
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------------- team */}
          <TabsContent value="team" className="mt-4 space-y-4">
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Invite a colleague
                  </CardTitle>
                  <CardDescription>
                    They get an email to set a password, and they land in this organisation only.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5 min-w-[240px] flex-1">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="name@company.com"
                      value={invite.email}
                      onChange={(e) => setInvite((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 w-[160px]">
                    <Label>Role</Label>
                    <Select
                      value={invite.role}
                      onValueChange={(v) => setInvite((p) => ({ ...p, role: v as MemberRole }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={sendInvite} disabled={inviting}>
                    {inviting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Send invite
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Team ({members.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.email ?? "—"}</TableCell>
                        <TableCell>
                          {isAdmin ? (
                            <Select
                              value={m.role}
                              onValueChange={(v) =>
                                callTeam({ action: "set_role", membership_id: m.id, role: v })
                              }
                            >
                              <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="owner">Owner</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="capitalize text-sm">{m.role}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={m.status === "active" ? "default" : "outline"}
                            className="text-[10px] capitalize"
                          >
                            {m.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.joined_at ? format(parseISO(m.joined_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right space-x-2">
                            {m.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPendingRevoke(m)}
                              >
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  callTeam({
                                    action: "set_status",
                                    membership_id: m.id,
                                    status: "active",
                                  })
                                }
                              >
                                Activate
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {members.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-sm text-muted-foreground py-6">
                          Nobody here yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------- pricing */}
          <TabsContent value="pricing" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Price list</CardTitle>
                <CardDescription>
                  Your own prices. Cost is internal and never appears on a merchant document.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Billed</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead>Active</TableHead>
                      {isAdmin && <TableHead className="text-right">Remove</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pricing.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{row.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{row.code}</p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {CATEGORY_LABEL[row.category] ?? row.category}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {CADENCE_LABEL[row.cadence] ?? row.cadence}
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <Input
                              className="h-8 w-24 text-right font-mono"
                              type="number"
                              step="0.01"
                              defaultValue={Number(row.cost)}
                              onBlur={(e) =>
                                updatePricingItem(row, { cost: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span className="font-mono text-sm">{money(Number(row.cost))}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <Input
                              className="h-8 w-24 text-right font-mono"
                              type="number"
                              step="0.01"
                              defaultValue={Number(row.resale)}
                              onBlur={(e) =>
                                updatePricingItem(row, { resale: Number(e.target.value) || 0 })
                              }
                            />
                          ) : (
                            <span className="font-mono text-sm">{money(Number(row.resale))}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {money(Number(row.resale) - Number(row.cost))}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={row.active ? "default" : "outline"}
                            disabled={!isAdmin}
                            onClick={() => updatePricingItem(row, { active: !row.active })}
                          >
                            {row.active ? "On" : "Off"}
                          </Button>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setPendingDelete(row)}
                              aria-label={`Remove ${row.label}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {pricing.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 8 : 7} className="text-center text-sm text-muted-foreground py-6">
                          No prices yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add an item</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5 min-w-[200px] flex-1">
                    <Label htmlFor="item-label">Name</Label>
                    <Input
                      id="item-label"
                      value={newItem.label}
                      onChange={(e) => setNewItem((p) => ({ ...p, label: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 w-[150px]">
                    <Label>Type</Label>
                    <Select
                      value={newItem.category}
                      onValueChange={(v) => setNewItem((p) => ({ ...p, category: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plan">Plan</SelectItem>
                        <SelectItem value="gateway_fee">Gateway fee</SelectItem>
                        <SelectItem value="extra">Add-on</SelectItem>
                        <SelectItem value="one_time">One-off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 w-[170px]">
                    <Label>Billed</Label>
                    <Select
                      value={newItem.cadence}
                      onValueChange={(v) => setNewItem((p) => ({ ...p, cadence: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Per month</SelectItem>
                        <SelectItem value="per_transaction">Per transaction</SelectItem>
                        <SelectItem value="one_time">One-off</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 w-[110px]">
                    <Label htmlFor="item-cost">Cost</Label>
                    <Input
                      id="item-cost"
                      type="number"
                      step="0.01"
                      value={newItem.cost}
                      onChange={(e) => setNewItem((p) => ({ ...p, cost: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5 w-[110px]">
                    <Label htmlFor="item-resale">Price</Label>
                    <Input
                      id="item-resale"
                      type="number"
                      step="0.01"
                      value={newItem.resale}
                      onChange={(e) => setNewItem((p) => ({ ...p, resale: e.target.value }))}
                    />
                  </div>
                  <Button onClick={addPricingItem} disabled={savingItem}>
                    {savingItem ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ----------------------------------------------------------- quotes */}
          <TabsContent value="quotes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotes</CardTitle>
                <CardDescription>
                  {quoteTotals.count} quotes, {quoteTotals.accepted} accepted —{" "}
                  {money(quoteTotals.monthly)} accepted monthly value.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((q) => (
                      <TableRow key={q.id}>
                        <TableCell className="font-mono text-xs">{q.quote_number ?? "—"}</TableCell>
                        <TableCell className="text-sm font-medium">
                          {q.client_business_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{q.tier_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {q.status ?? "draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {money(Number(q.monthly_resale ?? 0))}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(parseISO(q.created_at), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {quotes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                          No quotes yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!pendingRevoke} onOpenChange={(o) => !o && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {pendingRevoke?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this organisation immediately. You can activate them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRevoke) {
                  callTeam({
                    action: "set_status",
                    membership_id: pendingRevoke.id,
                    status: "revoked",
                  });
                }
                setPendingRevoke(null);
              }}
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from your price list. Quotes already sent keep their own figures.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) deletePricingItem(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Organisation;
