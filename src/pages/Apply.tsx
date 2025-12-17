import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import brandLogo from '@/assets/brand-logo.png';
import type { ApplicationFormData } from '@/types/application';

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

const Apply = () => {
  const [formStatus, setFormStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [formData, setFormData] = useState<ApplicationFormData>({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    business_type: '',
    monthly_volume: '',
    message: '',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormStatus('submitting');
    setErrorMessage('');

    // Convert form data to plain object with proper types
    const applicationData = {
      full_name: formData.full_name.trim(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone?.trim() || null,
      company_name: formData.company_name?.trim() || null,
      business_type: formData.business_type || null,
      monthly_volume: formData.monthly_volume || null,
      message: formData.message?.trim() || null,
      status: 'pending' as const,
    };

    // Insert directly into Supabase 'applications' table
    const { error } = await supabase
      .from('applications')
      .insert(applicationData);

    if (error) {
      console.error('Application submission error:', error);
      setFormStatus('error');
      setErrorMessage(
        error.message || 'Failed to submit application. Please try again.'
      );
      toast.error('Application submission failed');
      return;
    }

    setFormStatus('success');
    toast.success('Application submitted successfully!');
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      company_name: '',
      business_type: '',
      monthly_volume: '',
      message: '',
    });
    setFormStatus('idle');
    setErrorMessage('');
  };

  // Success state
  if (formStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Application Submitted!</CardTitle>
            <CardDescription className="text-base">
              Thank you for your interest. We've received your application and
              will be in touch within 1-2 business days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={resetForm} variant="outline" className="w-full">
              Submit Another Application
            </Button>
            <Link to="/auth">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img src={brandLogo} alt="Merchant Haus" className="h-12 w-auto" />
          </div>
          <CardTitle className="text-2xl">Apply for Merchant Services</CardTitle>
          <CardDescription>
            Fill out the form below to start your application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {formStatus === 'error' && errorMessage && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {errorMessage}
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={handleInputChange}
                required
                disabled={formStatus === 'submitting'}
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="john@company.com"
                value={formData.email}
                onChange={handleInputChange}
                required
                disabled={formStatus === 'submitting'}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={formData.phone}
                onChange={handleInputChange}
                disabled={formStatus === 'submitting'}
              />
            </div>

            {/* Company Name */}
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name</Label>
              <Input
                id="company_name"
                name="company_name"
                type="text"
                placeholder="Acme Corp"
                value={formData.company_name}
                onChange={handleInputChange}
                disabled={formStatus === 'submitting'}
              />
            </div>

            {/* Business Type */}
            <div className="space-y-2">
              <Label htmlFor="business_type">Business Type</Label>
              <Select
                value={formData.business_type}
                onValueChange={(value) => handleSelectChange('business_type', value)}
                disabled={formStatus === 'submitting'}
              >
                <SelectTrigger id="business_type">
                  <SelectValue placeholder="Select business type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                  <SelectItem value="restaurant">Restaurant / Food Service</SelectItem>
                  <SelectItem value="professional_services">Professional Services</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Monthly Volume */}
            <div className="space-y-2">
              <Label htmlFor="monthly_volume">Estimated Monthly Volume</Label>
              <Select
                value={formData.monthly_volume}
                onValueChange={(value) => handleSelectChange('monthly_volume', value)}
                disabled={formStatus === 'submitting'}
              >
                <SelectTrigger id="monthly_volume">
                  <SelectValue placeholder="Select volume range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0-10000">$0 - $10,000</SelectItem>
                  <SelectItem value="10000-50000">$10,000 - $50,000</SelectItem>
                  <SelectItem value="50000-100000">$50,000 - $100,000</SelectItem>
                  <SelectItem value="100000-500000">$100,000 - $500,000</SelectItem>
                  <SelectItem value="500000+">$500,000+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">Additional Information</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Tell us more about your business needs..."
                value={formData.message}
                onChange={handleInputChange}
                rows={3}
                disabled={formStatus === 'submitting'}
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full gradient-primary"
              disabled={formStatus === 'submitting'}
            >
              {formStatus === 'submitting' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>

            {/* Back to Login Link */}
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/auth" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Apply;
