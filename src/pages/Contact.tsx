import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';

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
  const { theme } = useTheme();
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src={theme === 'dark' ? logoDark : logoLight}
              alt="Merchant Haus"
              className="h-12 w-auto"
            />
          </div>
          <CardTitle className="text-2xl">Get in Touch</CardTitle>
          <CardDescription>
            Tell us about your business and we'll be in touch shortly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" name="first_name" type="text" placeholder="John" value={formData.first_name} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" name="last_name" type="text" placeholder="Doe" value={formData.last_name} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input id="email" name="email" type="email" placeholder="john@company.com" value={formData.email} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Contact Number *</Label>
              <Input id="phone" name="phone" type="tel" placeholder="+1 (555) 123-4567" value={formData.phone} onChange={handleInputChange} required disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website Address</Label>
              <Input id="website" name="website" type="url" placeholder="https://yourcompany.com" value={formData.website} onChange={handleInputChange} disabled={formStatus === 'submitting'} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_requirements">Business Requirements *</Label>
              <Textarea id="business_requirements" name="business_requirements" placeholder="Tell us about your business needs, current payment processing setup, and what you're looking for…" value={formData.business_requirements} onChange={handleInputChange} rows={5} required disabled={formStatus === 'submitting'} />
            </div>

            <Button type="submit" className="w-full gradient-primary" disabled={formStatus === 'submitting'}>
              {formStatus === 'submitting' ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
              ) : (
                'Submit Inquiry'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Success overlay */}
      {formStatus === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md text-center animate-in zoom-in-95 fade-in duration-300">
            <CardHeader>
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-2xl">Thank You!</CardTitle>
              <CardDescription className="text-base">
                We've received your inquiry and a member of our sales team will
                be in touch shortly. A confirmation email has been sent to your inbox.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Redirecting to merchanthaus.io in{' '}
                <span className="font-semibold text-foreground">{countdown}s</span>…
              </p>
              <Button variant="outline" className="mt-4 w-full" onClick={() => (window.location.href = 'https://merchanthaus.io')}>
                Go now
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Contact;
