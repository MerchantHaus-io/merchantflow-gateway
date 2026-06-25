import { useState, useEffect, type InputHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Building2, Mail, Globe, ShieldCheck, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import merchanthausLogo from '@/assets/merchanthaus-logo.png';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ContactFormData {
  first_name: string;
  last_name: string;
  phone: string;
  website: string;
  email: string;
  business_requirements: string;
}

const Contact = () => {
  const [formStatus, setFormStatus] = useState<FormStatus>('idle');
  const [honeypot, setHoneypot] = useState('');
  const [countdown, setCountdown] = useState(15);
  const [formData, setFormData] = useState<ContactFormData>({
    first_name: '',
    last_name: '',
    phone: '',
    website: '',
    email: '',
    business_requirements: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (honeypot) { setFormStatus('success'); return; }

    setFormStatus('submitting');

    try {
      const { error } = await supabase.functions.invoke('send-contact-form-email', {
        body: {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          phone: formData.phone.trim(),
          website: formData.website.trim(),
          email: formData.email.trim().toLowerCase(),
          business_requirements: formData.business_requirements.trim(),
        },
      });

      if (error) {
        console.error('Contact form error:', error);
        setFormStatus('error');
        toast.error('Something went wrong. Please try again.');
        return;
      }

      setFormStatus('success');
      toast.success('Your inquiry has been submitted!');
    } catch (err) {
      console.error('Contact form error:', err);
      setFormStatus('error');
      toast.error('Something went wrong. Please try again.');
    }
  };

  // Auto-redirect after success (15 seconds)
  useEffect(() => {
    if (formStatus !== 'success') return;
    if (countdown <= 0) {
      window.location.href = 'https://merchanthaus.io';
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [formStatus, countdown]);

  // Calculate progress
  const requiredFields = ['first_name', 'last_name', 'email', 'phone', 'business_requirements'];
  const completedFields = requiredFields.filter(f => formData[f as keyof ContactFormData].trim().length > 0);
  const progress = Math.round((completedFields.length / requiredFields.length) * 100);

  const submitting = formStatus === 'submitting';

  return (
    <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Header matching MerchantApply */}
      <header className="bg-card border-b border-border px-3 py-2.5 md:px-4 md:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
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
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          {/* Hero intro */}
          <div className="space-y-1.5 md:space-y-2 pt-1 md:pt-2">
            <p className="label-caps text-primary">Contact Sales</p>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-foreground">Let's build your payments stack.</h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
              Tell us about your business and a member of our team will reach out with tailored gateway and processing options — usually within one business day.
            </p>
          </div>

          <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)] items-start">
            {/* Form card */}
            <section className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm overflow-hidden">
              {/* Step header */}
              <div className="flex items-center gap-3 px-4 py-3 md:px-6 md:py-4 border-b border-border bg-muted/40">
                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                  <Building2 className="w-4 h-4 md:w-5 md:h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm md:text-base font-semibold text-foreground">Get in Touch</h2>
                  <p className="text-xs text-muted-foreground">Required fields marked with <span className="text-destructive">*</span></p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-5">
                {formStatus === 'error' && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Something went wrong. Please try again or email us directly at <a href="mailto:sales@merchanthaus.io" className="font-medium underline">sales@merchanthaus.io</a>.</span>
                  </div>
                )}

                {/* Honeypot */}
                <div aria-hidden="true" className="absolute opacity-0 pointer-events-none -z-10" style={{ position: 'absolute', left: '-9999px' }}>
                  <label htmlFor="company_url">Company URL</label>
                  <input id="company_url" name="company_url" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                  <Field label="First Name" required htmlFor="first_name">
                    <Input id="first_name" name="first_name" type="text" placeholder="John" value={formData.first_name} onChange={handleInputChange} required disabled={submitting} />
                  </Field>
                  <Field label="Last Name" required htmlFor="last_name">
                    <Input id="last_name" name="last_name" type="text" placeholder="Doe" value={formData.last_name} onChange={handleInputChange} required disabled={submitting} />
                  </Field>
                </div>

                <Field label="Email Address" required htmlFor="email">
                  <Input id="email" name="email" type="email" placeholder="john@company.com" value={formData.email} onChange={handleInputChange} required disabled={submitting} />
                </Field>

                <Field label="Contact Number" required htmlFor="phone">
                  <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 123-4567" value={formData.phone} onChange={handleInputChange} required disabled={submitting} />
                </Field>

                <Field label="Website Address" htmlFor="website">
                  <Input id="website" name="website" type="url" placeholder="https://yourcompany.com" value={formData.website} onChange={handleInputChange} disabled={submitting} />
                </Field>

                <Field label="Business Requirements" required htmlFor="business_requirements">
                  <Textarea
                    id="business_requirements"
                    name="business_requirements"
                    placeholder="Tell us about your business needs, current payment processing setup, and what you're looking for…"
                    value={formData.business_requirements}
                    onChange={handleInputChange}
                    rows={5}
                    required
                    disabled={submitting}
                  />
                </Field>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm transition-all hover:bg-primary/90 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
                  ) : (
                    <>Submit Inquiry<ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            </section>

            {/* Sidebar */}
            <aside className="space-y-3 md:space-y-4">
              <div className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm p-4 md:p-5 space-y-4">
                <p className="text-sm font-semibold text-foreground">Prefer to reach us directly?</p>
                <a href="mailto:sales@merchanthaus.io" className="flex items-center gap-3 group">
                  <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Email</span>
                    <span className="block text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">sales@merchanthaus.io</span>
                  </span>
                </a>
                <a href="https://merchanthaus.io" target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                  <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">Website</span>
                    <span className="block text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">merchanthaus.io</span>
                  </span>
                </a>
              </div>

              <div className="bg-card rounded-xl md:rounded-2xl border border-border shadow-sm p-4 md:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <Clock className="w-4 h-4 text-primary" />
                  What happens next
                </div>
                <ol className="space-y-3">
                  {[
                    'We review your requirements and current setup.',
                    'A specialist reaches out — usually within one business day.',
                    'You get tailored gateway & processing options.',
                  ].map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-info/10 rounded-xl md:rounded-2xl border border-info/20 p-4 md:p-5">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Your details are safe</p>
                    <p className="text-xs text-muted-foreground mt-1">We only use the information you share to respond to your inquiry — never sold or shared with third parties.</p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Success overlay */}
      {formStatus === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4 animate-scale-in">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Thank You!</h1>
            <p className="text-muted-foreground">
              We've received your inquiry and a member of our sales team will
              be in touch shortly. A confirmation email has been sent to your inbox.
            </p>
            <p className="text-sm text-muted-foreground">
              Redirecting to merchanthaus.io in{' '}
              <span className="font-semibold text-foreground">{countdown}s</span>…
            </p>
            <button
              onClick={() => (window.location.href = 'https://merchanthaus.io')}
              className="w-full h-11 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Go now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Local form primitives (boxed style, matching MerchantApply) ───

function Field({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  const filled = !focused && typeof props.value === 'string' && props.value.trim().length > 0;
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
        filled
          ? 'bg-primary text-primary-foreground font-medium border-primary focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20'
          : 'bg-card text-foreground border-input focus:border-primary focus:ring-primary/20',
        props.className,
      )}
    />
  );
}

function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  const filled = !focused && typeof props.value === 'string' && props.value.trim().length > 0;
  return (
    <textarea
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 min-h-[120px] transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
        filled
          ? 'bg-primary text-primary-foreground font-medium border-primary focus:bg-card focus:text-foreground focus:font-normal focus:border-primary focus:ring-primary/20'
          : 'bg-card text-foreground border-input focus:border-primary focus:ring-primary/20',
        props.className,
      )}
    />
  );
}

export default Contact;
