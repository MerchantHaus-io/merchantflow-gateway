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
  ShieldCheck
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

const SOP = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const emailTemplates = {
    step1: {
      subject: "Great to Connect",
      body: `Hello,

I'm glad we were able to get connected. I'd love to learn more about your business and understand your requirements so we can explore how best to support you.

Are you available for a quick call in the next few days? If email works better, I'm happy to continue the conversation here.

Best regards,
Sales Support`
    },
    step1_2: {
      subject: "Schedule a Quick Discovery Call",
      body: `Hello,

Thanks for connecting. To make things easier, you can book a quick discovery call at a time that works best for you using the link below:

https://calendar.app.google/6F1xCy8DcVh8B4aR7

If you prefer to continue over email, I'm happy to do so as well.

Best regards,
Sales Support`
    },
    step2: {
      subject: "Next Steps to Complete Your Application",
      body: `Hello,

Thanks again for connecting.

I reviewed the information available online, and it looks like we just need a few additional items to complete your application and move your account forward for approval.

Could you please complete the attached form and send it back along with the items below?

- 3 most recent months of bank statements (business or personal)
- 3 most recent months of processing history (if available)
- Voided check or bank letter
- Articles of Organization
- Driver's license or passport

Once we have these, we can proceed with approval immediately.

If you have any questions while reviewing everything, feel free to reach out — I'm here to help.

Thanks,
Sales Support`
    },
    step3: {
      subject: "Your Application Is Now in Process",
      body: `Hello,

Thanks for sending through the required documents. We've received the following:

- Articles of Organization
- 3 months of recent bank statements
- 3 months of processing history (if applicable)
- Driver's license or U.S. passport
- VAR sheet (if available)

Your application is now officially in process. Our team is reviewing the submitted information, and we will update you as soon as the next stage is completed.

If anything additional is required, we'll reach out right away. In the meantime, feel free to contact us with any questions.

Best regards,
Sales Support`
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Standard Operating Procedures</h1>
          </header>
          
          <div className="flex-1 flex overflow-hidden">
            {/* SOP Navigation Sidebar */}
            <aside className="w-64 border-r border-border bg-card hidden lg:block overflow-y-auto">
              <div className="p-4 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Quick Navigation</p>
              </div>
              <nav className="p-4 space-y-1">
                <a href="#index" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">Document Index</a>
                <a href="#principles" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">1. Principles</a>
                
                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sales Ops</div>
                <a href="#step1" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">2.1 Intro & Discovery</a>
                <a href="#step1-2" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">2.2 Call Scheduling</a>
                <a href="#step2" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">2.3 Request Docs</a>
                <a href="#step3" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">2.4 App in Process</a>
                
                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Internal Ops</div>
                <a href="#step4" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">3.1 Processing Setup</a>
                <a href="#action-items" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">3.2 Action Items</a>
                
                <div className="pt-4 pb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</div>
                <a href="#appendix" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">4. Appendices</a>
                <a href="#tech-stack" className="block px-4 py-2 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors">Systems & Tech</a>
              </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-10">
          
          {/* Document Index */}
          <section id="index" className="bg-card rounded-xl border border-border shadow-sm p-8">
            <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">Document Index</h2>
            <div className="grid md:grid-cols-2 gap-8 text-sm">
              <div>
                <h3 className="font-bold text-foreground mb-3 uppercase tracking-wide text-xs">Section 1 — Principles & Foundation</h3>
                <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                  <li><strong>1.1</strong> — Foreword: The Four Agreements</li>
                </ul>

                <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">Section 2 — Sales Operating Procedures</h3>
                <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                  <li><strong>2.1</strong> — Step 1: Intro & Discovery (Email)</li>
                  <li><strong>2.2</strong> — Step 1.2: Call Scheduling (Email & Action)</li>
                  <li><strong>2.3</strong> — Step 2: Request for Documents</li>
                  <li><strong>2.4</strong> — Step 3: Application In Process</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-foreground mb-3 uppercase tracking-wide text-xs">Section 3 — Internal Operations & Risk</h3>
                <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                  <li><strong>3.1</strong> — Step 4: Processing & Gateway Setup (Internal)</li>
                  <li><strong>3.2</strong> — Additional Action Items & Industry Standards</li>
                </ul>

                <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">Section 4 — Appendices & Reference</h3>
                <ul className="space-y-2 text-muted-foreground pl-2 border-l-2 border-border">
                  <li><strong>4.1</strong> — SOP Structure & Best Practices</li>
                  <li><strong>4.2</strong> — Development Reference</li>
                  <li><strong>4.3</strong> — Service Providers & SaaS Stack</li>
                </ul>

                <h3 className="font-bold text-foreground mt-6 mb-3 uppercase tracking-wide text-xs">Section 5 — External Artifacts</h3>
                <ul className="space-y-2 text-cyan-400 pl-2 border-l-2 border-border">
                  <li>
                    <a href="https://docs.google.com/spreadsheets/d/1OuQwgzkEGHYemHRv3fuyte1jracU2nJGgVVAb5HlQ3A/edit?gid=0#gid=0" target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Lead Stages Document
                    </a>
                  </li>
                  <li>
                    <a href="https://docs.google.com/spreadsheets/d/1ahUNEoqobsMFw5iibFdqbcmUPLpuSGMGPLJi6cmgNa4/edit?gid=0#gid=0" target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Form Responses Sheet
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Foreword */}
          <section id="principles" className="bg-card rounded-xl border border-border shadow-sm p-8">
            <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">Foreword — The Four Agreements</h2>
            <p className="text-muted-foreground mb-6 italic border-l-4 border-cyan-500 pl-4 bg-cyan-500/10 py-2 pr-2 rounded-r">
              The following principles serve as the foundational mindset and ethical framework that guide all MerchantHaus operations.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-accent/50 p-5 rounded-lg border border-border">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> 1. Be Impeccable With Your Word</h3>
                <p className="text-sm text-muted-foreground">Mean what you say and say what you mean. Speak with integrity. Avoid gossip and self-criticism.</p>
              </div>
              <div className="bg-accent/50 p-5 rounded-lg border border-border">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> 2. Don't Take Anything Personally</h3>
                <p className="text-sm text-muted-foreground">What others think is a reflection of their reality, not yours. Feedback is for growth, not attack.</p>
              </div>
              <div className="bg-accent/50 p-5 rounded-lg border border-border">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-primary" /> 3. Don't Make Assumptions</h3>
                <p className="text-sm text-muted-foreground">Do not guess. Ask questions. Clear communication eliminates misunderstandings.</p>
              </div>
              <div className="bg-accent/50 p-5 rounded-lg border border-border">
                <h3 className="font-bold text-foreground mb-2 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> 4. Always Do Your Best</h3>
                <p className="text-sm text-muted-foreground">Your best will vary. Doing your best prevents regret and self-judgment.</p>
              </div>
            </div>
          </section>

          {/* Email Template Component */}
          {[
            { id: "step1", title: "Step 1 — Intro & Discovery", template: emailTemplates.step1, note: { text: "Logic Step 1.2: If needed, schedule a discovery call.", link: "https://calendar.app.google/6F1xCy8DcVh8B4aR7", linkText: "Schedule a Call", skipNote: "If no call requested, skip to Step 2." } },
            { id: "step1-2", title: "Step 1.2 — Call Scheduling", template: emailTemplates.step1_2 },
            { id: "step2", title: "Step 2 — Request for Documents", template: emailTemplates.step2 },
            { id: "step3", title: "Step 3 — Application in Process", template: emailTemplates.step3 },
          ].map((step) => (
            <section key={step.id} id={step.id}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
                <span className="bg-blue-500/20 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded">Email Template</span>
              </div>
              
              <div className="bg-card rounded-xl border border-border shadow-lg overflow-hidden">
                <div className="bg-accent/50 px-6 py-3 border-b border-border flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground uppercase">Subject</span>
                    <p className="font-medium text-foreground">{step.template.subject}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(step.template.subject, `${step.id}-subject`)}
                    className="text-xs"
                  >
                    {copiedId === `${step.id}-subject` ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    Copy
                  </Button>
                </div>
                <div className="p-6 relative group">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(step.template.body, `${step.id}-body`)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition text-xs"
                  >
                    {copiedId === `${step.id}-body` ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    Copy Body
                  </Button>
                  <div className="text-muted-foreground whitespace-pre-wrap font-sans">
                    {step.template.body}
                  </div>
                </div>
                {step.note && (
                  <div className="bg-yellow-500/10 px-6 py-4 border-t border-yellow-500/20 text-sm text-yellow-200">
                    <strong>{step.note.text}</strong><br />
                    Booking Link: <a href={step.note.link} className="underline font-bold" target="_blank" rel="noopener noreferrer">{step.note.linkText}</a><br />
                    <em>{step.note.skipNote}</em>
                  </div>
                )}
              </div>
            </section>
          ))}

          {/* Step 4 Internal */}
          <section id="step4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Step 4 — Processing & Gateway Setup</h2>
              <span className="bg-red-500/20 text-red-400 text-xs font-semibold px-2.5 py-0.5 rounded flex items-center gap-1">
                <Lock className="w-3 h-3" /> Internal Only
              </span>
            </div>
            
            <div className="bg-card rounded-xl border-2 border-red-500/30 shadow-sm p-6">
              <p className="text-red-400 font-bold mb-4 text-sm uppercase tracking-wide">Do not send to merchant</p>
              <div className="text-muted-foreground">
                <p className="mb-2">Once Email 3 is complete and all documents are collected:</p>
                <ol className="list-decimal pl-5 space-y-2 mb-4">
                  <li>Apply for the <strong className="text-foreground">processing account</strong> using the MerchantHaus microsite.</li>
                  <li>After processing approval, choose setup path:
                    <ul className="list-disc pl-5 mt-1 text-sm">
                      <li><strong className="text-foreground">Path A:</strong> Use approved processing details to apply for NMI Gateway.</li>
                      <li><strong className="text-foreground">Path B (Existing):</strong> Use VAR sheet to apply for NMI Gateway and map configuration.</li>
                    </ul>
                  </li>
                  <li>Confirm submission and move file to next workflow stage.</li>
                </ol>
              </div>
            </div>
          </section>

          {/* Action Items */}
          <section id="action-items" className="bg-card rounded-xl border border-border shadow-sm p-8">
            <h2 className="text-2xl font-bold text-primary border-b-4 border-cyan-500 inline-block mb-6 pb-1">3.2 — Action Items & Standards</h2>
            
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><CheckSquare className="w-5 h-5 text-cyan-500" /> Required Actions</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">Banking:</strong> Add details, verify deposit/withdrawal routing.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">Gateway:</strong> Configure access links, deliver secure credentials.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">API:</strong> Enable keys/webhooks for integrations.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">MID:</strong> Confirm assignment & descriptor alignment.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">VAR:</strong> Upload sheet, confirm mapping.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">Test:</strong> Run transaction to verify connectivity.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">PCI:</strong> Initiate compliance workflow (SAQ).</span></li>
                  <li className="flex gap-2 items-start"><span className="text-primary">•</span> <span><strong className="text-foreground">CRM:</strong> Verify notes & attach documents.</span></li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-cyan-500" /> Industry Standards</h3>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">KYC/KYB:</strong> Identity & corporate structure validated.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">Risk:</strong> Fraud filters, AVS/CVV rules, velocity checks set.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">Descriptors:</strong> Soft/Hard descriptors accurate.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">Settlement:</strong> Schedule set by volume/risk.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">Disputes:</strong> Portal access granted, timelines explained.</span></li>
                  <li className="flex gap-2 items-start"><span className="text-muted-foreground">→</span> <span><strong className="text-foreground">Handoff:</strong> Support contacts provided.</span></li>
                </ul>
              </div>
            </div>
          </section>

          {/* Appendices */}
          <section id="appendix" className="bg-accent/50 rounded-xl border border-border p-8">
            <h2 className="text-xl font-bold text-foreground mb-6">Appendix — SOP Structure</h2>
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-bold text-foreground mb-2">Best Practices</h4>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>Structure:</strong> Title, Purpose, Trigger, Owner, Output.</li>
                  <li><strong>Version Control:</strong> Maintain revision logs.</li>
                  <li><strong>Alignment:</strong> Sync Ops, Risk, Underwriting, Eng.</li>
                  <li><strong>Dependencies:</strong> Map prerequisites clearly.</li>
                  <li><strong>KPIs:</strong> Track turnaround, approval rates.</li>
                  <li><strong>Compliance:</strong> Tie PCI/KYC directly to checkpoints.</li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-foreground mb-2">Process Mapping Needs</h4>
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
          <section id="tech-stack" className="bg-sidebar rounded-xl p-8 shadow-lg">
            <h2 className="text-xl font-bold text-foreground mb-6 border-b border-border pb-2">System Documentation & Tech Stack</h2>
            
            <div className="grid md:grid-cols-2 gap-8 text-sm">
              <div>
                <h3 className="text-cyan-400 font-bold mb-3">MerchantHaus.io Frontend</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li><strong className="text-foreground">Vite:</strong> Build tool</li>
                  <li><strong className="text-foreground">React 18 + TS:</strong> Component architecture</li>
                  <li><strong className="text-foreground">Tailwind + Animate:</strong> Styling</li>
                  <li><strong className="text-foreground">shadcn/ui:</strong> UI Primitives</li>
                  <li><strong className="text-foreground">React Query:</strong> Async state</li>
                  <li><strong className="text-foreground">Recharts:</strong> Dashboards</li>
                  <li><strong className="text-foreground">Zod + Hook Form:</strong> Validation</li>
                </ul>
              </div>
              <div>
                <h3 className="text-cyan-400 font-bold mb-3">SaaS Ecosystem</h3>
                <div className="flex flex-wrap gap-2">
                  {["Resend", "Formspree", "Netlify", "Supabase", "GitHub", "OpenPhone", "Google Workspace", "Gemini AI", "Lovable"].map((item) => (
                    <span key={item} className="bg-background px-2 py-1 rounded border border-border text-muted-foreground">{item}</span>
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
