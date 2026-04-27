import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";

const CATEGORIES = [
  { value: "agenda", label: "Meeting Agenda" },
  { value: "business_improvement", label: "Business Improvement" },
  { value: "crm_enhancement", label: "CRM Enhancement" },
  { value: "website_update", label: "Website Update" },
  { value: "general_ideation", label: "General Ideation" },
];

export function AgendaSubmitDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("agenda");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("agenda_items").insert({
        title: title.trim(),
        description: description.trim() || null,
        category,
        submitted_by: user.id,
        submitted_by_email: user.email || "",
      });
      if (error) throw error;

      // Email admin (with confirmation prompt)
      if (await confirmAutoEmail("An agenda notification email will be sent to the admin.")) {
        supabase.functions.invoke("send-agenda-notification", {
          body: {
            title: title.trim(),
            description: description.trim(),
            category,
            submittedByEmail: user.email,
          },
        });
      }

      toast.success("Agenda item submitted successfully");
      setTitle("");
      setDescription("");
      setCategory("agenda");
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Submit Agenda Item
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Submit Agenda Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for your submission"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details, context, or rationale..."
              rows={4}
              maxLength={2000}
            />
          </div>
          <Button onClick={handleSubmit} disabled={!title.trim() || submitting} className="w-full">
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
