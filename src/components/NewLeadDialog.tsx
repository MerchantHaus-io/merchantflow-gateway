import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NewLeadDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    company: "",
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

  const reset = () => setForm({ first_name: "", last_name: "", email: "", company: "", campaign_id: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.campaign_id) {
      toast.error("Email and cadence are required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("outreach_contacts").insert({
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email,
        company: form.company || null,
        campaign_id: form.campaign_id,
        status: "pending",
      });
      if (error) throw error;

      // Update campaign total_contacts count
      const { data: counts } = await supabase
        .from("outreach_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", form.campaign_id);
      // counts is null when head:true, use count from response
      const { count } = await supabase
        .from("outreach_contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", form.campaign_id);
      if (count !== null) {
        await supabase.from("outreach_campaigns").update({ total_contacts: count }).eq("id", form.campaign_id);
      }

      queryClient.invalidateQueries({ queryKey: ["all-leads"] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast.success(`${form.first_name || form.email} added as a lead ✓`);
      reset();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="teal" className="gap-1.5">
          <UserPlus className="h-4 w-4" />New Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="first_name" className="text-xs text-muted-foreground">First Name</Label>
              <Input id="first_name" placeholder="Jane" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name" className="text-xs text-muted-foreground">Last Name</Label>
              <Input id="last_name" placeholder="Smith" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs text-muted-foreground">Email <span className="text-destructive">*</span></Label>
            <Input id="email" type="email" required placeholder="jane@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company" className="text-xs text-muted-foreground">Company</Label>
            <Input id="company" placeholder="Acme Corp" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
          </div>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} loading={saving}>
              {saving ? "Adding…" : "Add Lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
