import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeneficialOwner {
  id: string;
  full_name: string;
  title: string | null;
  ownership_percentage: number;
  date_of_birth: string | null;
  address_line1: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
}

interface BeneficialOwnersProps {
  opportunityId: string;
}

export const BeneficialOwners = ({ opportunityId }: BeneficialOwnersProps) => {
  const [owners, setOwners] = useState<BeneficialOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [ownershipPct, setOwnershipPct] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const fetchOwners = useCallback(async () => {
    const { data } = await supabase
      .from("beneficial_owners")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: true });
    setOwners((data as BeneficialOwner[]) || []);
    setLoading(false);
  }, [opportunityId]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

  const resetForm = () => {
    setFullName("");
    setTitle("");
    setOwnershipPct("");
    setDob("");
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setShowForm(false);
  };

  const handleAdd = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    const pct = parseFloat(ownershipPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error("Ownership percentage must be between 0 and 100");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("beneficial_owners").insert({
      opportunity_id: opportunityId,
      full_name: fullName.trim(),
      title: title.trim() || null,
      ownership_percentage: pct,
      date_of_birth: dob || null,
      address_line1: address.trim() || null,
      address_city: city.trim() || null,
      address_state: state.trim() || null,
      address_zip: zip.trim() || null,
    });

    if (error) {
      toast.error("Failed to add beneficial owner");
    } else {
      toast.success("Beneficial owner added");
      resetForm();
      fetchOwners();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("beneficial_owners").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove owner");
    } else {
      setOwners((prev) => prev.filter((o) => o.id !== id));
      toast.success("Owner removed");
    }
  };

  const totalPct = owners.reduce((sum, o) => sum + o.ownership_percentage, 0);

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Beneficial Owners (CDD)</h4>
          <Badge variant={owners.length > 0 ? "default" : "destructive"} className="text-[10px] h-5">
            {owners.length} recorded
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      {owners.length === 0 && !showForm && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span>No beneficial owners recorded. At least one 25%+ owner is required for underwriting (FinCEN CDD Rule).</span>
        </div>
      )}

      {owners.map((owner) => (
        <div key={owner.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card text-xs group">
          <div className="space-y-0.5">
            <p className="font-medium">{owner.full_name}</p>
            <p className="text-muted-foreground">
              {owner.title && `${owner.title} • `}
              {owner.ownership_percentage}% ownership
              {owner.address_city && owner.address_state && ` • ${owner.address_city}, ${owner.address_state}`}
            </p>
          </div>
          <button
            onClick={() => handleDelete(owner.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {totalPct > 0 && (
        <p className={cn("text-[10px] font-medium", totalPct > 100 ? "text-destructive" : "text-muted-foreground")}>
          Total ownership declared: {totalPct}%
        </p>
      )}

      {showForm && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Full Name *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CEO" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Ownership % *</Label>
              <Input type="number" value={ownershipPct} onChange={(e) => setOwnershipPct(e.target.value)} placeholder="25" min="0" max="100" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Date of Birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">State</Label>
              <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="CA" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">ZIP</Label>
              <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="90210" className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={saving}>
              {saving ? "Adding..." : "Add Owner"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
