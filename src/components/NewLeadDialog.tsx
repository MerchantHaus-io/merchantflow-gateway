import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Loader2, Mail, Inbox } from "lucide-react";
import { toast } from "sonner";
import { LeadReferrerSelect } from "@/components/LeadReferrerSelect";

type LeadType = "manual" | "outreach";

export function NewLeadDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadType, setLeadType] = useState<LeadType>("manual");
  const [leadReferrerId, setLeadReferrerId] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    company: "",
    phone: "",
    notes: "",
    campaign_id: "",
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["outreach-campaigns-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reset = () => {
    setForm({ first_name: "", last_name: "", email: "", company: "", phone: "", notes: "", campaign_id: "" });
    setLeadType("manual");
    setLeadReferrerId(null);
  };

  const handleSubmitManual = async () => {
    if (!form.email.trim()) {
      toast.error("Email is required");
      return;
    }
    const email = form.email.trim().toLowerCase();
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      const accountName = form.company.trim() || `${form.first_name} ${form.last_name}`.trim() || email;

      // Create account with status 'lead'
      const { data: account, error: aErr } = await supabase
        .from("accounts")
        .insert({ name: accountName, status: "lead" })
        .select()
        .single();
      if (aErr) throw aErr;

      // Create contact
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .insert({
          account_id: account.id,
          first_name: form.first_name.trim() || null,
          last_name: form.last_name.trim() || null,
          email,
          phone: form.phone.trim() || null,
        })
        .select()
        .single();
      if (cErr) throw cErr;

      // Create opportunity in discovery stage
      const { error: oErr } = await supabase
        .from("opportunities")
        .insert({
          account_id: account.id,
          contact_id: contact.id,
          stage: "discovery",
          referral_source: "Manual Lead",
          ...(leadReferrerId ? ({ lead_referrer_id: leadReferrerId } as Record<string, unknown>) : {}),
        });
      if (oErr) throw oErr;

      queryClient.invalidateQueries({ queryKey: ["email-leads"] });
      toast.success(`${accountName} added as a lead ✓`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitOutreach = async () => {
    if (!form.email.trim() || !form.campaign_id) {
      toast.error("Email and cadence are required");
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("outreach_contacts").insert({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        email,
        company: form.company.trim() || null,
        campaign_id: form.campaign_id,
        status: "pending",
      });
      if (error) throw error;

      // Update campaign total_contacts count
      const { count } = await supabase
        .from("outreach_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", form.campaign_id);
      if (count !== null) {
        await supabase.from("outreach_campaigns").update({ total_contacts: count }).eq("id", form.campaign_id);
      }

      queryClient.invalidateQueries({ queryKey: ["all-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast.success(`${form.first_name || email} added as an outreach lead ✓`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leadType === "manual") {
      await handleSubmitManual();
    } else {
      await handleSubmitOutreach();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="teal" className="gap-1.5">
          <UserPlus className="h-4 w-4" />New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Lead</DialogTitle>
        </DialogHeader>

        <Tabs value={leadType} onValueChange={v => setLeadType(v as LeadType)} className="pt-1">
          <TabsList className="w-full h-9">
            <TabsTrigger value="manual" className="flex-1 text-xs gap-1.5">
              <Inbox className="h-3.5 w-3.5" />Manual Lead
            </TabsTrigger>
            <TabsTrigger value="outreach" className="flex-1 text-xs gap-1.5">
              <Mail className="h-3.5 w-3.5" />Outreach Lead
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name" className="text-xs text-muted-foreground">First Name</Label>
              <Input id="first_name" placeholder="Jane" maxLength={100} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name" className="text-xs text-muted-foreground">Last Name</Label>
              <Input id="last_name" placeholder="Smith" maxLength={100} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" required placeholder="jane@company.com" maxLength={255} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company" className="text-xs text-muted-foreground">Company</Label>
            <Input id="company" placeholder="Acme Corp" maxLength={200} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
          </div>

          {leadType === "manual" && (
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone</Label>
              <Input id="phone" type="tel" placeholder="(555) 123-4567" maxLength={30} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          )}

          {leadType === "outreach" && (
            <div className="space-y-1.5">
              <Label htmlFor="campaign" className="text-xs text-muted-foreground">Cadence <span className="text-destructive">*</span></Label>
              <Select value={form.campaign_id} onValueChange={v => setForm(f => ({ ...f, campaign_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a cadence…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Adding…</> : "Add Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
