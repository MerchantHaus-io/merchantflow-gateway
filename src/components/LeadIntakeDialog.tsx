// Lead intake: drop a lead in as pasted text or an image (screenshot, photo of
// a card, chat capture). The AI pulls out the contact details and drafts the
// first outreach email; the rep checks both, then saves the lead (account +
// contact + Discovery opportunity) and, if they choose, sends the email from
// sales@merchanthaus.io.

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, Loader2, Send, Sparkles, X, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { confirmAutoEmail } from "@/components/EmailSendConfirm";
import {
  accountNameFor,
  leadProblems,
  leadToForm,
  normaliseEmail,
  scaledSize,
  type ExtractedLead,
  type LeadForm,
} from "@/lib/leadIntake";

interface LeadIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a lead is saved, with its opportunity id. */
  onSaved?: (opportunityId: string) => void;
}

interface ExistingMatch {
  contactId: string;
  accountId: string;
  label: string;
  opportunityId: string | null;
}

/** Downscale an image file to a JPEG data URL small enough for the AI call. */
async function imageFileToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open that image."));
      el.src = url;
    });
    const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't read that image.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function findExisting(email: string): Promise<ExistingMatch | null> {
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, account_id, account:accounts(name)")
    .ilike("email", escapeLike(normaliseEmail(email)))
    .order("created_at", { ascending: true })
    .limit(1);
  const c = contacts?.[0] as
    | { id: string; first_name: string | null; last_name: string | null; account_id: string; account?: { name?: string } | null }
    | undefined;
  if (!c) return null;
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id")
    .eq("contact_id", c.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ") || "This contact";
  return {
    contactId: c.id,
    accountId: c.account_id,
    label: `${person}${c.account?.name ? ` at ${c.account.name}` : ""}`,
    opportunityId: opps?.[0]?.id ?? null,
  };
}

export function LeadIntakeDialog({ open, onOpenChange, onSaved }: LeadIntakeDialogProps) {
  const { user } = useAuth();
  const [rawText, setRawText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState<"save" | "send" | null>(null);
  const [form, setForm] = useState<LeadForm | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [existing, setExisting] = useState<ExistingMatch | null>(null);
  // Set once the lead is saved, so retrying a failed send never saves it twice.
  const [savedOpportunityId, setSavedOpportunityId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRawText("");
    setImage(null);
    setForm(null);
    setExisting(null);
    setSavedOpportunityId(null);
    setLowConfidence(false);
    setReading(false);
    setSaving(null);
  };

  const close = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const takeImage = useCallback(async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That isn't an image. Drop a PNG, JPG or screenshot, or paste the text.");
      return;
    }
    try {
      setImage(await imageFileToDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that image.");
    }
  }, []);

  const onPaste = (e: React.ClipboardEvent) => {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void takeImage(file);
    }
  };

  const readLead = async () => {
    if (!rawText.trim() && !image) {
      toast.error("Paste the lead text or drop an image first.");
      return;
    }
    setReading(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-lead", {
        body: { text: rawText.trim() || undefined, image: image ?? undefined },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Couldn't read that lead.");
      const lead = data.lead as ExtractedLead;
      if (lead.is_lead === false) {
        toast.warning("That doesn't look like a sales lead. Check the details before saving.");
      }
      const next = leadToForm(lead);
      setForm(next);
      setLowConfidence(lead.confidence === "low");
      setExisting(next.email ? await findExisting(next.email) : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that lead.");
    } finally {
      setReading(false);
    }
  };

  const recheckExisting = async () => {
    if (form?.email) setExisting(await findExisting(form.email));
  };

  const set = (key: keyof LeadForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => (f ? { ...f, [key]: e.target.value } : f));

  /** Create (or reuse) account, contact and opportunity. Returns the opportunity id. */
  const saveLead = async (f: LeadForm): Promise<string> => {
    const email = normaliseEmail(f.email);
    let accountId = existing?.accountId ?? null;
    let contactId = existing?.contactId ?? null;
    let opportunityId = existing?.opportunityId ?? null;

    if (!accountId || !contactId) {
      const { data: account, error: aErr } = await supabase
        .from("accounts")
        .insert({ name: accountNameFor(f), website: f.website || null })
        .select("id")
        .single();
      if (aErr) throw aErr;
      accountId = account.id;

      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .insert({
          account_id: accountId,
          first_name: f.first_name.trim() || null,
          last_name: f.last_name.trim() || null,
          email,
          phone: f.phone.trim() || null,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      contactId = contact.id;
    }

    if (!opportunityId) {
      const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .insert({
          account_id: accountId,
          contact_id: contactId,
          stage: "discovery",
          status: "active",
          referral_source: f.lead_source.trim() || "Lead intake",
          source: "lead_intake",
          assigned_to: user?.email ?? null,
        })
        .select("id")
        .single();
      if (oErr) throw oErr;
      opportunityId = opp.id;

      await supabase.from("activities").insert({
        opportunity_id: opportunityId,
        type: "opportunity_created",
        description: `Lead added via Lead intake${f.lead_source.trim() ? ` (${f.lead_source.trim()})` : ""}`,
        user_id: user?.id,
        user_email: user?.email,
      });
    }

    if (f.notes.trim() && user) {
      await supabase.from("comments").insert({
        opportunity_id: opportunityId,
        content: f.notes.trim(),
        user_id: user.id,
        user_email: user.email,
      });
    }
    return opportunityId as string;
  };

  const submit = async (mode: "save" | "send") => {
    if (!form) return;
    const problems = leadProblems(form, { sending: mode === "send" });
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    const email = normaliseEmail(form.email);
    if (mode === "send" && !(await confirmAutoEmail(`Send this outreach email to ${email} from sales@merchanthaus.io?`))) {
      return;
    }

    setSaving(mode);
    let opportunityId = savedOpportunityId;
    try {
      if (!opportunityId) {
        opportunityId = await saveLead(form);
        setSavedOpportunityId(opportunityId);
        onSaved?.(opportunityId);
      }
    } catch (e) {
      toast.error(`Couldn't save the lead: ${e instanceof Error ? e.message : "unknown error"}`);
      setSaving(null);
      return;
    }

    if (mode === "send") {
      const { data, error } = await supabase.functions.invoke("send-lead-outreach", {
        body: { to: email, subject: form.email_subject.trim(), body: form.email_body, opportunity_id: opportunityId },
      });
      if (error || data?.error) {
        // The lead is saved either way; keep the dialog open so the rep can retry the send.
        toast.error(`Lead saved, but the email didn't send: ${data?.error || error?.message}`);
        setSaving(null);
        return;
      }
      toast.success(`Lead saved and email sent to ${email}`);
    } else {
      toast.success(`${accountNameFor(form)} saved as a lead`);
    }

    setSaving(null);
    onOpenChange(false);
    reset();
  };

  const busy = reading || saving !== null;
  const locked = busy || savedOpportunityId !== null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onPaste={form ? undefined : onPaste}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-teal" /> Lead intake
          </DialogTitle>
          <DialogDescription>
            {form
              ? "Check the details and the email, then save the lead or save and send."
              : "Paste the lead's text, or drop or paste a screenshot. The details and a first email are filled in for you."}
          </DialogDescription>
        </DialogHeader>

        {!form && (
          <div className="space-y-3">
            <Textarea
              autoFocus
              rows={7}
              placeholder="Paste the lead here: a message, a forwarded email, form details…"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={reading}
            />

            {image ? (
              <div className="relative rounded-md border border-border p-2">
                <img src={image} alt="Lead image" className="max-h-56 mx-auto rounded" />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-7 w-7"
                  onClick={() => setImage(null)}
                  disabled={reading}
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void takeImage(e.dataTransfer.files?.[0]);
                }}
                className={`w-full rounded-md border border-dashed p-6 text-sm text-muted-foreground flex flex-col items-center gap-1.5 transition-colors ${
                  dragging ? "border-teal bg-teal/5" : "border-border hover:bg-muted/40"
                }`}
              >
                <ImagePlus className="h-5 w-5" />
                <span>Drop a screenshot here, paste one (Ctrl/Cmd+V), or click to choose</span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void takeImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="button" variant="teal" size="sm" onClick={readLead} disabled={reading || (!rawText.trim() && !image)}>
                {reading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Reading lead…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Read lead
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {form && (
          <div className="space-y-4">
            {lowConfidence && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                The lead was hard to read. Double-check the name and email before sending.
              </div>
            )}
            {existing?.label && (
              <div className="flex items-start gap-2 rounded-md border border-info/40 bg-info/10 p-2.5 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {existing.label} is already in the system with this email.{" "}
                  {existing.opportunityId
                    ? "The email will be logged on their open opportunity; nothing new is created."
                    : "A new Discovery opportunity will be added to the existing contact."}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input value={form.first_name} onChange={set("first_name")} maxLength={100} disabled={locked} />
              </Field>
              <Field label="Last name">
                <Input value={form.last_name} onChange={set("last_name")} maxLength={100} disabled={locked} />
              </Field>
              <Field label="Email" required>
                <Input type="email" value={form.email} onChange={set("email")} onBlur={recheckExisting} maxLength={255} disabled={locked} />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={form.phone} onChange={set("phone")} maxLength={30} disabled={locked} />
              </Field>
              <Field label="Company">
                <Input value={form.company} onChange={set("company")} maxLength={200} disabled={locked || !!existing?.label} />
              </Field>
              <Field label="Website">
                <Input value={form.website} onChange={set("website")} maxLength={200} disabled={locked || !!existing?.label} />
              </Field>
              <Field label="Lead source">
                <Input value={form.lead_source} onChange={set("lead_source")} placeholder="e.g. WhatsApp, referral" maxLength={100} disabled={locked} />
              </Field>
            </div>

            <Field label="Notes (saved on the opportunity)">
              <Textarea rows={3} value={form.notes} onChange={set("notes")} disabled={locked} />
            </Field>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Outreach email</span>
                <Badge variant="outline" className="text-[10px]">from sales@merchanthaus.io</Badge>
              </div>
              <Input value={form.email_subject} onChange={set("email_subject")} placeholder="Subject" maxLength={200} disabled={busy} />
              <Textarea rows={10} value={form.email_body} onChange={set("email_body")} disabled={busy} />
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)} disabled={locked}>
                Start over
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => submit("save")} disabled={locked}>
                  {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Save lead only
                </Button>
                <Button type="button" variant="teal" size="sm" onClick={() => submit("send")} disabled={busy}>
                  {saving === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  {savedOpportunityId ? "Retry sending" : "Save & send email"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
