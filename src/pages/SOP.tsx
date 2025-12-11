import { useState } from "react";
import {
  MessageSquare,
  Shield,
  HelpCircle,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Lock,
  CheckSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

const SOP = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [variantSelection, setVariantSelection] = useState<Record<string, string>>({
    step1: "standard",
    step1_2: "standard",
    step2: "standard",
    step3: "standard",
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleVariantChange = (stepKey: string, variantKey: string) => {
    setVariantSelection((prev) => ({
      ...prev,
      [stepKey]: variantKey,
    }));
  };

  const emailTemplates = {
    step1: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Great to Connect",
          body: `Hello,

Thank you for taking the time to connect.

I’d love to learn more about your business and what you’re looking for in a payments/processing partner so we can see how best to support you.

Are you available for a quick call in the next few days? If email is easier, you’re welcome to reply with a brief overview of your business (what you sell, how you accept payments today, and your typical monthly volume), and we’ll take it from there.

Best regards,
Sales Support`,
        },
        brief: {
          label: "Brief Follow-Up",
          subject: "Quick Follow-Up & Next Steps",
          body: `Hello,

Just following up on our recent connection.

When you have a moment, could you please reply with a quick overview of your business (what you sell, how you take payments today, and your approximate monthly volume)? That will help us confirm the best fit and next steps.

If you’d prefer a quick call instead, you’re welcome to share a few times that work for you, and we’ll schedule something.

Best regards,
Sales Support`,
        },
      },
    },
    step1_2: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Schedule a Quick Discovery Call",
          body: `Hello,

Thanks again for connecting.

To make next steps easy, you can book a quick discovery call at a time that works best for you using the link below:

https://calendar.app.google/6F1xCy8DcVh8B4aR7

On this call, we’ll review your business model, products/services, and any specific requirements so we can recommend the best solution.

If you prefer to continue over email instead, just reply with a brief description of your business and any questions you have.

Best regards,
Sales Support`,
        },
      },
    },
    step2: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Next Steps to Complete Your Application",
          body: `Hello,

Thank you again for your interest in working with us.

To move your application forward to underwriting, we just need a bit more information and a few standard documents.

Please complete the attached form and return it along with:

- 3 most recent months of bank statements (business or personal)
- 3 most recent months of processing statements, if available
- Voided check or bank letter showing your account and routing details
- Articles of Organization (or equivalent formation document)
- Copy of the owner’s driver’s license or passport
- Social Security Number (SSN) for the principal owner
- A brief overview of your products and services, including:
  - What you sell
  - How you sell (in person, online, recurring/subscription, etc.)
  - Typical ticket size and monthly volume
  - Who your typical customers are

Please share as much detail as you can about your products and services — this helps underwriting understand your business clearly and speeds up approval.

You can reply to this email with the documents attached, or let us know if you’d prefer to use a secure upload method and we’ll provide details.

Once we have everything, we’ll submit your file for review right away and update you on the next steps.

If you have any questions while gathering these items, please reach out — we’re here to help.

Thanks,
Sales Support`,
        },
        prelaunch: {
          label: "Pre-Launch / No History",
          subject: "Next Steps to Complete Your Application (Pre-Launch)",
          body: `Hello,

Thank you again for your interest in working with us.

Because your business is pre-launch or has limited processing history, underwriting will focus more on your business model and projections. To move your application forward, please complete the attached form and return it along with:

- 3 most recent months of bank statements (business or personal)
- Voided check or bank letter showing your account and routing details
- Articles of Organization (or equivalent formation document)
- Copy of the owner’s driver’s license or passport
- Social Security Number (SSN) for the principal owner
- A detailed overview of your products and services, including:
  - What you will sell
  - How you will sell (in person, online, recurring/subscription, etc.)
  - Expected average ticket size and monthly volume
  - Your target customers and markets
  - Any existing contracts, partnerships, or letters of intent (if available)
- A brief explanation of your experience in this industry or related fields

Please share as much detail as you can about your products and services — the more clarity we have, the easier it is for underwriting to approve and set the right parameters.

You can reply to this email with the documents attached, or let us know if you’d prefer to use a secure upload method and we’ll provide details.

Once we have everything, we’ll submit your file for review right away and update you on the next steps.

If you have any questions while gathering these items, please reach out — we’re here to help.

Thanks,
Sales Support`,
        },
      },
    },
    step3: {
      defaultVariant: "standard",
      variants: {
        standard: {
          label: "Standard",
          subject: "Your Application Is Now in Process",
          body: `Hello,

Thank you for sending through your documents.

We’ve received your application and supporting information and have submitted your file to our processing/underwriting team for review. Your application is now officially in process.

If anything additional is required, we’ll reach out right away. Otherwise, we’ll provide an update as soon as the review is complete.

In the meantime, if you have any questions about timelines or next steps, just reply to this email and we’ll be happy to help.

Best regards,
Sales Support`,
        },
      },
    },
  };

  const emailSteps = [
    {
      id: "step1",
      templateKey: "step1" as const,
      title: "Step 1 — Intro & Discovery",
      note: {
        text: "Logic Step 1.2: If needed, schedule a discovery call.",
        link: "https://calendar.app.google/6F1xCy8DcVh8B4aR7",
        linkText: "Schedule a Call",
        skipNote: "If no call requested, skip to Step 2.",
      },
    },
    {
      id: "step1-2",
      templateKey: "step1_2" as const,
      title: "Step 1.2 — Call Scheduling",
    },
    {
      id: "step2",
      templateKey: "step2" as const,
      title: "Step 2 — Request for Documents",
    },
    {
      id: "step3",
      templateKey: "step3" as const,
      title: "Step 3 — Application in Process",
    },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">
              Standard Operating Procedures
            </h1>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* SOP Navigation Sidebar */}
            <aside className="w-64 border-r border-border bg-card hidden lg:block overflow-y-auto">
              <div className="p-4 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Quick Navigation
                </p>
              </div>
              <nav className="p-4 space-y-1">
                <a
                  href="#index"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  Document Index
                </a>
                <a
                  href="#principles"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  1. Principles
                </a>

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Sales Ops
                </div>
                <a
                  href="#step1"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  2.1 Intro & Discovery (Email Templates)
                </a>
                <a
                  href="#step1-2"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  2.2 Call Scheduling (Email Template)
                </a>
                <a
                  href="#step2"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  2.3 Request for Documents (Email Templates)
                </a>
                <a
                  href="#step3"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  2.4 Application in Process (Email Template)
                </a>

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Internal Ops
                </div>
                <a
                  href="#step4"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  3.1 Processing & Gateway Setup (Internal)
                </a>
                <a
                  href="#action-items"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  3.2 Action Items & Standards
                </a>

                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Reference
                </div>
                <a
                  href="#appendix"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  4. Appendices
                </a>
                <a
                  href="#tech-stack"
                  className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
                >
                  5. Systems & Tech Stack
                </a>
              </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-10">
                {/* Document Index */}
                <section
                  id="index"
                  className="bg-card rounded-xl border border-border shadow-sm p-8"
                >
                  <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">
                    Document Index
                  </h2>
                  <div className="grid md:grid-cols-2 gap-8 text-sm">
                    <div>
                      <h3 className="font-bold text-foreground mb-3 uppercase tracking-wide text-xs">
                        Section 1 — Principles & Foundation
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                        <li>
                          <strong>1.1</strong> — Foreword: The Four Agreements
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">
                        Section 2 — Sales Operating Procedures
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                        <li>
                          <strong>2.1</strong> — Step 1: Intro & Discovery
                          (Email Templates)
                        </li>
                        <li>
                          <strong>2.2</strong> — Step 1.2: Call Scheduling
                          (Email Template)
                        </li>
                        <li>
                          <strong>2.3</strong> — Step 2: Request for Documents
                          (Email Templates)
                        </li>
                        <li>
                          <strong>2.4</strong> — Step 3: Application In Process
                          (Email Template)
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-3 uppercase tracking-wide text-xs">
                        Section 3 — Internal Operations & Risk
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                        <li>
                          <strong>3.1</strong> — Step 4: Processing & Gateway
                          Setup (Internal)
                        </li>
                        <li>
                          <strong>3.2</strong> — Additional Action Items &
                          Industry Standards
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">
                        Section 4 — Appendices & Reference
                      </h3>
                      <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                        <li>
                          <strong>4.1</strong> — SOP Structure & Best Practices
                        </li>
                        <li>
                          <strong>4.2</strong> — Development Reference
                        </li>
                        <li>
                          <strong>4.3</strong> — Service Providers & SaaS Stack
                        </li>
                      </ul>

                      <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">
                        Section 5 — External Artifacts
                      </h3>
                      <ul className="space-y-2 text-cyan-400 pl-2 border-l-2 border-border">
                        <li>
                          <a
                            href="https://docs.google.com/spreadsheets/d/1OuQwgzkEGHYemHRv3fuyte1jracU2nJGgVVAb5HlQ3A/edit?gid=0#gid=0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Lead Stages
                            Document
                          </a>
                        </li>
                        <li>
                          <a
                            href="https://docs.google.com/spreadsheets/d/1ahUNEoqobsMFw5iibFdqbcmUPLpuSGMGPLJi6cmgNa4/edit?gid=0#gid=0"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Form Responses
                            Sheet
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Foreword */}
                <section
                  id="principles"
                  className="bg-card rounded-xl border border-border shadow-sm p-8"
                >
                  <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">
                    Foreword — The Four Agreements
                  </h2>
                  <p className="text-muted-foreground mb-6 italic border-l-4 border-cyan-500 pl-4 bg-cyan-500/10 py-2 pr-2 rounded-r">
                    The following principles serve as the foundational mindset and
                    ethical framework that guide all MerchantHaus operations.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-accent/50 p-5 rounded-lg border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" /> 1. Be
                        Impeccable With Your Word
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Mean what you say and say what you mean. Speak with
                        integrity. Avoid gossip and self-criticism.
                      </p>
                    </div>
                    <div className="bg-accent/50 p-5 rounded-lg border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-primary" /> 2. Don't Take
                        Anything Personally
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        What others think is a reflection of their reality, not
                        yours. Feedback is for growth, not attack.
                      </p>
                    </div>
                    <div className="bg-accent/50 p-5 rounded-lg border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-primary" /> 3. Don't
                        Make Assumptions
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Do not guess. Ask questions. Clear communication eliminates
                        misunderstandings.
                      </p>
                    </div>
                    <div className="bg-accent/50 p-5 rounded-lg border border-border">
                      <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" /> 4. Always Do
                        Your Best
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Your best will vary. Doing your best prevents regret and
                        self-judgment.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Email Template Sections with Variants */}
                {emailSteps.map((step) => {
                  const group = emailTemplates[step.templateKey];
                  const variants = group.variants;
                  const activeVariantKey =
                    variantSelection[step.templateKey] || group.defaultVariant;
                  const activeTemplate = variants[activeVariantKey];
                  const hasVariants = Object.keys(variants).length > 1;

                  const subjectCopyId = `${step.id}-${activeVariantKey}-subject`;
                  const bodyCopyId = `${step.id}-${activeVariantKey}-body`;

                  return (
                    <section key={step.id} id={step.id}>
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xl font-bold text-foreground">
                          {step.title}
                        </h2>
                        <div className="flex items-center gap-2">
                          {hasVariants && (
                            <div className="flex gap-1 mr-1">
                              {Object.entries(variants).map(([key, variant]) => (
                                <Button
                                  key={key}
                                  type="button"
                                  variant={
                                    key === activeVariantKey ? "default" : "outline"
                                  }
                                  size="sm"
                                  className="text-[10px] px-2 py-1 h-7"
                                  onClick={() =>
                                    handleVariantChange(step.templateKey, key)
                                  }
                                >
                                  {variant.label}
                                </Button>
                              ))}
                            </div>
                          )}
                          <span className="bg-blue-500/20 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded">
                            {hasVariants ? "Email Templates" : "Email Template"}
                          </span>
                        </div>
                      </div>

                      <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
                        <div className="bg-accent/50 px-6 py-3 border-b border-border flex justify-between items-center">
                          <div>
                            <span className="text-xs font-bold text-muted-foreground uppercase">
                              Subject
                            </span>
                            <p className="font-medium text-foreground">
                              {activeTemplate.subject}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(activeTemplate.subject, subjectCopyId)
                            }
                            className="text-xs"
                          >
                            {copiedId === subjectCopyId ? (
                              <Check className="w-3 h-3 mr-1" />
                            ) : (
                              <Copy className="w-3 h-3 mr-1" />
                            )}
                            Copy
                          </Button>
                        </div>
                        <div className="p-6 relative group">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(activeTemplate.body, bodyCopyId)
                            }
                            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition text-xs"
                          >
                            {copiedId === bodyCopyId ? (
                              <Check className="w-3 h-3 mr-1" />
                            ) : (
                              <Copy className="w-3 h-3 mr-1" />
                            )}
                            Copy Body
                          </Button>
                          <div className="text-muted-foreground whitespace-pre-wrap font-sans">
                            {activeTemplate.body}
                          </div>
                        </div>
                        {step.note && (
                          <div className="bg-yellow-500/10 px-6 py-4 border-t border-yellow-500/20 text-sm text-yellow-200">
                            <strong>{step.note.text}</strong>
                            <br />
                            Booking Link:{" "}
                            <a
                              href={step.note.link}
                              className="underline font-bold"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {step.note.linkText}
                            </a>
                            <br />
                            <em>{step.note.skipNote}</em>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}

                {/* Step 4 Internal */}
                <section id="step4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-foreground">
                      Step 4 — Processing & Gateway Setup
                    </h2>
                    <span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2.5 py-0.5 rounded flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Internal Only
                    </span>
                  </div>

                  <div className="bg-card rounded-xl border-2 border-red-500/30 shadow-sm p-6">
                    <p className="text-red-400 font-bold mb-4 text-sm uppercase tracking-wide">
                      Do not send to merchant
                    </p>
                    <div className="text-muted-foreground">
                      <p className="mb-2">
                        Once Step 3 (Application in Process email) is complete and
                        all documents are collected:
                      </p>
                      <ol className="list-decimal pl-5 space-y-2 mb-4">
                        <li>
                          Apply for the{" "}
                          <strong className="text-foreground">
                            processing account
                          </strong>{" "}
                          using the MerchantHaus microsite.
                        </li>
                        <li>
                          After processing approval, choose setup path:
                          <ul className="list-disc pl-5 mt-1 text-sm">
                            <li>
                              <strong className="text-foreground">Path A:</strong>{" "}
                              Use approved processing details to apply for NMI
                              Gateway.
                            </li>
                            <li>
                              <strong className="text-foreground">
                                Path B (Existing):
                              </strong>{" "}
                              Use VAR sheet to apply for NMI Gateway and map
                              configuration.
                            </li>
                          </ul>
                        </li>
                        <li>Confirm submission and move file to the next workflow stage.</li>
                      </ol>
                    </div>
                  </div>
                </section>

                {/* Action Items */}
                <section
                  id="action-items"
                  className="bg-card rounded-xl border border-border shadow-sm p-8"
                >
                  <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">
                    3.2 — Action Items & Standards
                  </h2>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-cyan-500" /> Required
                        Actions
                      </h3>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">Banking:</strong>{" "}
                            Add details, verify deposit/withdrawal routing.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">Gateway:</strong>{" "}
                            Configure access links, deliver secure credentials.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">API:</strong> Enable
                            keys/webhooks for integrations.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">MID:</strong> Confirm
                            assignment & descriptor alignment.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">VAR:</strong> Upload
                            sheet, confirm mapping.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">Test:</strong> Run
                            transaction to verify connectivity.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">PCI:</strong> Initiate
                            compliance workflow (SAQ).
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-primary">•</span>
                          <span>
                            <strong className="text-foreground">CRM:</strong> Verify
                            notes & attach documents.
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-cyan-500" /> Industry
                        Standards
                      </h3>
                      <ul className="space-y-3 text-sm text-muted-foreground">
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">KYC/KYB:</strong>{" "}
                            Identity & corporate structure validated.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">Risk:</strong> Fraud
                            filters, AVS/CVV rules, velocity checks set.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">Descriptors:</strong>{" "}
                            Soft/Hard descriptors accurate.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">Settlement:</strong>{" "}
                            Schedule set by volume/risk.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">Disputes:</strong>{" "}
                            Portal access granted, timelines explained.
                          </span>
                        </li>
                        <li className="flex gap-2 items-start">
                          <span className="text-muted-foreground">→</span>
                          <span>
                            <strong className="text-foreground">Handoff:</strong>{" "}
                            Support contacts provided.
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Appendices */}
                <section
                  id="appendix"
                  className="bg-accent/50 rounded-xl border border-border p-8"
                >
                  <h2 className="text-xl font-bold text-foreground mb-6">
                    Appendix — SOP Structure
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6 text-sm">
                    <div>
                      <h4 className="font-bold text-foreground mb-2">
                        Best Practices
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>
                          <strong>Structure:</strong> Title, Purpose, Trigger, Owner,
                          Output.
                        </li>
                        <li>
                          <strong>Version Control:</strong> Maintain revision logs.
                        </li>
                        <li>
                          <strong>Alignment:</strong> Sync Ops, Risk, Underwriting,
                          Eng.
                        </li>
                        <li>
                          <strong>Dependencies:</strong> Map prerequisites clearly.
                        </li>
                        <li>
                          <strong>KPIs:</strong> Track turnaround, approval rates.
                        </li>
                        <li>
                          <strong>Compliance:</strong> Tie PCI/KYC directly to
                          checkpoints.
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">
                        Process Mapping Needs
                      </h4>
                      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                        <li>Lead intake → CRM</li>
                        <li>Discovery → Solution fit</li>
                        <li>Docs → Underwriting readiness</li>
                        <li>Approval → Gateway config</li>
                        <li>VAR mapping</li>
                        <li>Activation → API → Testing</li>
                        <li>Training, Chargebacks, Support Handoff</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Tech Stack */}
                <section
                  id="tech-stack"
                  className="bg-sidebar rounded-xl p-8 shadow-lg"
                >
                  <h2 className="text-xl font-bold text-foreground mb-6 border-b border-border pb-2">
                    System Documentation & Tech Stack
                  </h2>

                  <div className="grid md:grid-cols-2 gap-8 text-sm">
                    <div>
                      <h3 className="text-cyan-400 font-bold mb-3">
                        MerchantHaus.io Frontend
                      </h3>
                      <ul className="space-y-2 text-muted-foreground">
                        <li>
                          <strong className="text-foreground">Vite:</strong> Build
                          tool
                        </li>
                        <li>
                          <strong className="text-foreground">React 18 + TS:</strong>{" "}
                          Component architecture
                        </li>
                        <li>
                          <strong className="text-foreground">
                            Tailwind + Animate:
                          </strong>{" "}
                          Styling
                        </li>
                        <li>
                          <strong className="text-foreground">shadcn/ui:</strong> UI
                          Primitives
                        </li>
                        <li>
                          <strong className="text-foreground">React Query:</strong>{" "}
                          Async state
                        </li>
                        <li>
                          <strong className="text-foreground">Recharts:</strong>{" "}
                          Dashboards
                        </li>
                        <li>
                          <strong className="text-foreground">
                            Zod + Hook Form:
                          </strong>{" "}
                          Validation
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-cyan-400 font-bold mb-3">
                        SaaS Ecosystem
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "Resend",
                          "Formspree",
                          "Netlify",
                          "Supabase",
                          "GitHub",
                          "OpenPhone",
                          "Google Workspace",
                          "Gemini AI",
                          "Lovable",
                        ].map((item) => (
                          <span
                            key={item}
                            className="bg-background px-2 py-1 rounded border border-border text-muted-foreground"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <footer className="text-center text-muted-foreground text-sm pb-10">
                  <p>MerchantHaus Internal SOP — Confidential</p>
                </footer>
              </div>
            </main>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default SOP;
