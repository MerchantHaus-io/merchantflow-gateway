import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Public self-serve affiliate registration.
 *
 * Creates the partner's login plus a pending affiliate record. Accounts stay
 * inactive until an admin approves them on /admin/affiliates, so no commission
 * access is self-granted.
 */
const AffiliateSignup = () => {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirm: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 10) {
      toast.error("Password must be at least 10 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("affiliate-signup", {
      body: {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        password: form.password,
      },
    });
    setSubmitting(false);

    const payloadError = (data as { error?: string } | null)?.error;
    if (error || payloadError) {
      toast.error(payloadError ?? error?.message ?? "Could not complete your registration.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <header className="text-center space-y-2">
          <img
            src="/images/merchanthaus-logo.png"
            alt="MerchantHaus"
            className="h-10 mx-auto w-auto"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Become a referral partner
          </h1>
          <p className="text-sm text-muted-foreground">
            Create your partner login, refer merchants, and earn recurring commission on every
            account that goes live.
          </p>
        </header>

        {done ? (
          <div className="rounded-lg border border-border p-6 text-center space-y-3">
            <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Application received</h2>
            <p className="text-sm text-muted-foreground">
              Your login has been created. A member of our team reviews and approves new partners —
              you will be able to sign in to the partner portal as soon as your account is approved.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-lg border border-border p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input id="full_name" value={form.full_name} onChange={set("full_name")} required maxLength={120} autoComplete="name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" value={form.phone} onChange={set("phone")} maxLength={40} autoComplete="tel" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company">Company or referral source (optional)</Label>
              <Textarea id="company" value={form.company} onChange={set("company")} rows={2} maxLength={300} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={form.password} onChange={set("password")} required minLength={10} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" value={form.confirm} onChange={set("confirm")} required minLength={10} autoComplete="new-password" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">At least 10 characters.</p>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create partner account
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already a partner?{" "}
              <Link to="/auth" className="underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default AffiliateSignup;
