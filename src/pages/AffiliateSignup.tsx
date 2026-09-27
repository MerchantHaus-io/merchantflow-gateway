import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Dark wordmark served from public/images — swaps with the theme in the splash
const merchantHausLogo = "/images/merchanthaus-logo-dark.png";

/**
 * Public self-serve affiliate registration.
 *
 * Creates the partner's login plus a pending affiliate record. Accounts stay
 * inactive until an admin approves them on /admin/affiliates, so no commission
 * access is self-granted.
 *
 * Visual: mirrors the main auth page's layout (brand eyebrow, centered form,
 * floating logo below) forced into a dark theme via a scoped `dark` class so
 * semantic tokens resolve to dark values regardless of the app theme.
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
    <main
      className="dark min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10 relative overflow-hidden"
      data-theme="dark"
    >
      <style>{`
        @keyframes auth-sweep-dark {
          0%   { transform: translateX(-110%) skewX(-8deg); opacity: 0; }
          10%  { opacity: 1; }
          50%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateX(110%) skewX(-8deg); opacity: 0; }
        }
      `}</style>

      {/* Ambient sweep — the auth page's colour ribbon, dimmed for dark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -inset-x-1/4"
        style={{
          background:
            'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 8%, rgba(255,180,100,0.4) 22%, rgba(255,100,170,0.35) 38%, rgba(150,90,255,0.4) 52%, rgba(70,170,255,0.4) 66%, rgba(100,240,190,0.35) 78%, rgba(255,255,255,0.35) 92%, rgba(255,255,255,0) 100%)',
          filter: 'blur(48px) saturate(1.2)',
          mixBlendMode: 'screen',
          opacity: 0.55,
          animation: 'auth-sweep-dark 3.2s cubic-bezier(0.22, 1, 0.36, 1) 1 forwards',
        }}
      />

      <div className="relative w-full max-w-sm">
        <header className="text-center mb-8">
          <span className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            The Ops-Terminal
          </span>
          <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground/70">
            by Merchanthaus.io
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            Become a referral partner
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your partner login, refer merchants, and earn recurring commission on
            every account that goes live.
          </p>
        </header>

        {done ? (
          <div className="rounded-lg border border-border bg-card/60 p-6 text-center space-y-3">
            <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Application received</h2>
            <p className="text-sm text-muted-foreground">
              Your login has been created. A member of our team reviews and approves new
              partners — you will be able to sign in to the partner portal as soon as your
              account is approved.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Full name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={set("full_name")}
                  required
                  maxLength={120}
                  autoComplete="name"
                  className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={set("phone")}
                  maxLength={40}
                  autoComplete="tel"
                  className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={set("email")}
                required
                autoComplete="email"
                className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company">Company or referral source (optional)</Label>
              <Textarea
                id="company"
                value={form.company}
                onChange={set("company")}
                rows={2}
                maxLength={300}
                className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={set("password")}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={form.confirm}
                  onChange={set("confirm")}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="bg-input/40 border-input text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">At least 10 characters.</p>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create partner account
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Already a partner?{" "}
              <Link to="/auth" className="text-foreground hover:underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>

      <div className="relative mt-10 flex items-center justify-center [perspective:1000px]">
        <img
          src={merchantHausLogo}
          alt="Merchant Haus"
          width={220}
          height={54}
          fetchPriority="high"
          className="h-12 w-auto opacity-90 logo-tilt"
        />
      </div>
    </main>
  );
};

export default AffiliateSignup;
