import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Loader2, LifeBuoy } from "lucide-react";
import merchanthausLogo from "@/assets/merchanthaus-logo.png";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/support";

type FormStatus = "idle" | "submitting" | "success" | "error";

const SupportRequest = () => {
  const [formStatus, setFormStatus] = useState<FormStatus>("idle");
  const [honeypot, setHoneypot] = useState("");
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    business_name: "",
    category: "support" as TicketCategory,
    subject: "",
    description: "",
  });

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const requiredFilled =
    form.name.trim() && form.email.trim() && form.subject.trim() && form.description.trim();
  const progress = Math.round(
    ([form.name, form.email, form.subject, form.description].filter((v) => v.trim()).length / 4) * 100,
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (honeypot) {
      setFormStatus("success");
      return;
    }
    if (!requiredFilled) {
      toast.error("Please complete all required fields.");
      return;
    }

    setFormStatus("submitting");
    try {
      const { data, error } = await supabase.functions.invoke("submit-support-ticket", {
        body: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          business_name: form.business_name.trim(),
          category: form.category,
          subject: form.subject.trim(),
          description: form.description.trim(),
        },
      });

      if (error) throw error;

      setTicketNumber(data?.ticket_number ?? null);
      setFormStatus("success");
      toast.success("Your support request has been submitted.");
    } catch (err) {
      console.error("Support request error:", err);
      setFormStatus("error");
      toast.error("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <img src={merchanthausLogo} alt="MerchantHaus" className="h-7 md:h-10 w-auto" />
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 md:h-2 md:w-32 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs md:text-sm font-medium text-foreground">{progress}%</span>
          </div>
        </div>
      </header>

      <div className="p-3 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">
          <div className="flex items-center gap-3 px-2 py-1.5 md:px-4 md:py-3 rounded-lg bg-card border-b-2 border-primary shadow-sm">
            <div className="w-6 h-6 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
              <LifeBuoy className="w-3 h-3 md:w-5 md:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-foreground truncate">Submit a Support Request</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground">
                Our team will pick up your ticket and reply by email
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
            {formStatus === "error" && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                Something went wrong. Please try again or email us directly at support@merchanthaus.io.
              </div>
            )}

            <div aria-hidden="true" className="absolute opacity-0 pointer-events-none -z-10" style={{ position: "absolute", left: "-9999px" }}>
              <label htmlFor="company_url">Company URL</label>
              <input
                id="company_url"
                name="company_url"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Your Name *
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Jane Doe"
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  required
                  disabled={formStatus === "submitting"}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="jane@company.com"
                  value={form.email}
                  onChange={(e) => update({ email: e.target.value })}
                  required
                  disabled={formStatus === "submitting"}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="business_name" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Business Name
              </Label>
              <Input
                id="business_name"
                type="text"
                placeholder="Your business / merchant account name"
                value={form.business_name}
                onChange={(e) => update({ business_name: e.target.value })}
                disabled={formStatus === "submitting"}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">How can we help? *</Label>
              <Select value={form.category} onValueChange={(v) => update({ category: v as TicketCategory })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label} — {c.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="subject" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Subject *
              </Label>
              <Input
                id="subject"
                type="text"
                placeholder="Short summary of your request"
                value={form.subject}
                onChange={(e) => update({ subject: e.target.value })}
                required
                disabled={formStatus === "submitting"}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Details *
              </Label>
              <Textarea
                id="description"
                placeholder="Describe your issue or question in as much detail as possible…"
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
                rows={5}
                required
                disabled={formStatus === "submitting"}
              />
            </div>

            <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-xl" disabled={formStatus === "submitting"}>
              {formStatus === "submitting" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </form>
        </div>
      </div>

      {formStatus === "success" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Request Received</h1>
            {ticketNumber && (
              <p className="text-sm text-muted-foreground">
                Your ticket reference is{" "}
                <span className="font-mono font-semibold text-foreground">{ticketNumber}</span>
              </p>
            )}
            <p className="text-muted-foreground">
              Our support team will pick up your ticket shortly. A confirmation has been sent to your email —
              just reply to it to add more information.
            </p>
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = "https://merchanthaus.io")}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportRequest;
