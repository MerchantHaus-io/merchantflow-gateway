import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Building2 } from 'lucide-react';
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

  return (
    <div className="merchant-form fixed inset-0 z-50 bg-background overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      {/* Header matching MerchantApply */}
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
          {/* Step header */}
          <div className="flex items-center gap-3 px-2 py-1.5 md:px-4 md:py-3 rounded-lg bg-card border-b-2 border-primary shadow-sm">
            <div className="w-6 h-6 md:w-10 md:h-10 rounded-full flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
              <Building2 className="w-3 h-3 md:w-5 md:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-semibold text-foreground truncate">Get in Touch</h2>
              <p className="text-[10px] md:text-xs text-muted-foreground">Tell us about your business needs</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 md:space-y-6">
            {formStatus === 'error' && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                Something went wrong. Please try again or email us directly at sales@merchanthaus.io.
              </div>
            )}

            {/* Honeypot */}
            <div aria-hidden="true" className="absolute opacity-0 pointer-events-none -z-10" style={{ position: 'absolute', left: '-9999px' }}>
              <label htmlFor="company_url">Company URL</label>
              <input id="company_url" name="company_url" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            {/* Form fields — underline style matching MerchantApply */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="space-y-1">
                <Label htmlFor="first_name" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">First Name *</Label>
                <Input id="first_name" name="first_name" type="text" placeholder="John" value={formData.first_name} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">Last Name *</Label>
                <Input id="last_name" name="last_name" type="text" placeholder="Doe" value={formData.last_name} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="email" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">Email Address *</Label>
              <Input id="email" name="email" type="email" placeholder="john@company.com" value={formData.email} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">Contact Number *</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 123-4567" value={formData.phone} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="website" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">Website Address</Label>
              <Input id="website" name="website" type="url" placeholder="https://yourcompany.com" value={formData.website} onChange={handleInputChange} disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="business_requirements" className="label-caps text-[11px] uppercase tracking-wider text-muted-foreground">Business Requirements *</Label>
              <Textarea
                id="business_requirements"
                name="business_requirements"
                placeholder="Tell us about your business needs, current payment processing setup, and what you're looking for…"
                value={formData.business_requirements}
                onChange={handleInputChange}
                rows={5}
                required
                disabled={formStatus === 'submitting'}
                className="bg-transparent border-0 border-b-2 border-border px-0 py-2 text-sm font-light rounded-none focus-visible:border-foreground focus-visible:ring-0"
              />
            </div>

            <Button type="submit" className="w-full h-12 text-sm font-semibold rounded-xl" disabled={formStatus === 'submitting'}>
              {formStatus === 'submitting' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                'Submit Inquiry'
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Success overlay */}
      {formStatus === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-lg text-center space-y-4">
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
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = 'https://merchanthaus.io')}>
              Go now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contact;
