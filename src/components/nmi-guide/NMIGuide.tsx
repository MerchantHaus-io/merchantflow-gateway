import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { Search, ChevronRight, ChevronLeft, CheckCircle2, Camera, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  WALKTHROUGHS,
  SEARCH_INDEX,
  type HotspotPin,
  type ScreenshotSection,
  type Walkthrough,
  type GuideMode,
} from './types';
import { SCREENSHOTS } from './screenshots';

// ─────────────────────────────────────────────
// HOTSPOT IMAGE
// ─────────────────────────────────────────────
interface HotspotImageProps { screenshot: ScreenshotSection; }

const HotspotImage = React.memo(({ screenshot }: HotspotImageProps) => {
  const [activeTip, setActiveTip] = useState<{ pin: HotspotPin; x: number; y: number; goRight: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handlePinClick = useCallback((e: React.MouseEvent, pin: HotspotPin) => {
    e.stopPropagation();
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const px = (parseFloat(pin.x) / 100) * rect.width;
    const py = (parseFloat(pin.y) / 100) * rect.height;
    if (activeTip?.pin.id === pin.id) { setActiveTip(null); return; }
    setActiveTip({ pin, x: px, y: py, goRight: px < rect.width * 0.55 });
  }, [activeTip]);

  useEffect(() => {
    const close = () => setActiveTip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const imgSrc = SCREENSHOTS[screenshot.key as keyof typeof SCREENSHOTS];

  return (
    <div className="rounded-lg overflow-hidden border border-border mb-4 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
        <span className="w-2 h-2 rounded-full bg-teal shrink-0" />
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{screenshot.label}</span>
        {screenshot.pins && (
          <span className="ml-auto text-xs text-teal font-medium">{screenshot.pins.length} pins</span>
        )}
      </div>
      <div className="relative" ref={wrapRef} onClick={() => setActiveTip(null)}>
        {imgSrc ? (
          <img src={imgSrc} alt={screenshot.label} className="w-full block" draggable={false} />
        ) : (
          <div className="flex items-center justify-center gap-3 py-12 bg-muted/30 border-2 border-dashed border-border">
            <Camera className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Screenshot needed</p>
              <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">{screenshot.key}</p>
            </div>
          </div>
        )}

        {/* Pins */}
        {screenshot.pins?.map((pin) => (
          <button
            key={pin.id}
            onClick={(e) => handlePinClick(e, pin)}
            className={cn(
              'absolute flex items-center justify-center rounded-full text-xs font-black transition-transform z-10',
              'focus:outline-none hover:scale-125',
              activeTip?.pin.id === pin.id
                ? 'bg-accent text-accent-foreground scale-110'
                : 'bg-teal text-white',
            )}
            style={{
              left: pin.x, top: pin.y,
              transform: activeTip?.pin.id === pin.id ? 'translate(-50%, -50%) scale(1.15)' : 'translate(-50%, -50%)',
              width: 22, height: 22,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25), 0 0 0 2px rgba(255,255,255,0.4)',
            }}
          >
            {pin.label}
          </button>
        ))}

        {/* Tooltip */}
        {activeTip && (
          <div
            className="absolute z-30 w-56 rounded-xl p-3 text-xs shadow-2xl border"
            style={{
              left: activeTip.goRight ? activeTip.x + 14 : activeTip.x - 238,
              top: Math.max(4, activeTip.y - 10),
              background: 'hsl(var(--card))',
              borderColor: 'hsl(var(--teal))',
              pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-1.5 right-2 text-muted-foreground hover:text-foreground"
              onClick={() => setActiveTip(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="font-black mb-1 pr-4" style={{ color: 'hsl(var(--teal))' }}>{activeTip.pin.title}</p>
            <p className="text-muted-foreground leading-relaxed">{activeTip.pin.description}</p>
            <span className="block mt-2 font-bold font-mono text-[10px]" style={{ color: 'hsl(var(--teal))' }}>
              → {activeTip.pin.tip}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// PLACEHOLDER CARD
// ─────────────────────────────────────────────
const PlaceholderCard = ({ name, url, description }: { name: string; url: string; description?: string }) => (
  <div className="flex items-start gap-3 rounded-lg p-3 my-3 border border-dashed border-border bg-muted/10">
    <Camera className="mt-0.5 shrink-0 h-5 w-5 text-muted-foreground/40" />
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-sm">{name}</p>
      <p className="font-mono text-xs text-muted-foreground mt-0.5">{url}</p>
      {description && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>}
    </div>
    <Badge variant="outline" className="shrink-0 text-xs text-warning border-warning/40 bg-warning/5">
      📷 Needed
    </Badge>
  </div>
);

// ─────────────────────────────────────────────
// NOTE
// ─────────────────────────────────────────────
const Note = ({ variant = 'info', children }: { variant?: 'info' | 'warning' | 'danger'; children: React.ReactNode }) => {
  const styles = {
    info:    'border-teal/50 bg-teal/5 text-muted-foreground',
    warning: 'border-warning/50 bg-warning/5 text-muted-foreground',
    danger:  'border-destructive/50 bg-destructive/5 text-muted-foreground',
  }[variant];
  return (
    <div className={cn('border-l-2 px-3 py-2.5 rounded-r-lg my-3 text-xs leading-relaxed', styles)}>
      {children}
    </div>
  );
};

// ─────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────
const SectionHeader = ({ number, title, subtitle, url, accent = false }: {
  number: number; title: string; subtitle: string; url?: string; accent?: boolean;
}) => (
  <div className="flex items-start gap-3 mb-4 pb-3 border-b border-border">
    <div className={cn(
      'w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-xs font-black mt-0.5',
      accent ? 'bg-teal/15 text-teal border border-teal/25' : 'bg-muted text-muted-foreground border border-border',
    )}>
      {number}
    </div>
    <div>
      <h2 className="text-base font-black">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      {url && (
        <code className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground font-mono">
          {url}
        </code>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────
// REFERENCE CONTENT
// ─────────────────────────────────────────────
const ReferenceContent = ({ scrollTo }: { scrollTo: string | null }) => {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (scrollTo && sectionRefs.current[scrollTo]) {
      sectionRefs.current[scrollTo]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollTo]);

  const ref = (id: string) => (el: HTMLElement | null) => { sectionRefs.current[id] = el; };

  return (
    <div className="p-5 max-w-4xl space-y-0">

      {/* Welcome */}
      <div ref={ref('welcome')} className="rounded-xl border border-border bg-card p-6 mb-6">
        <Badge className="mb-3 bg-teal/10 text-teal border-teal/25 hover:bg-teal/15">
          ✦ NMI Partner Portal · March 2026
        </Badge>
        <h1 className="text-2xl font-black mb-2">
          Partner Portal <span className="text-teal">Complete Guide</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Every page of the Merchant Haus partner portal documented in one place.
          Click the numbered hotspot pins on screenshots, or switch to <strong>Tasks</strong> for step-by-step walkthroughs.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <Badge variant="outline" className="text-teal border-teal/30 bg-teal/5">34 pages documented</Badge>
          <Badge variant="outline" className="text-teal border-teal/30 bg-teal/5">14 screenshots with pins</Badge>
          <Badge variant="outline" className="text-teal border-teal/30 bg-teal/5">5 task walkthroughs</Badge>
          <Badge variant="outline" className="text-warning border-warning/30 bg-warning/5">📷 20 screenshots needed</Badge>
        </div>
      </div>

      {/* S1 Dashboard */}
      <section ref={ref('s1')} className="mb-10 scroll-mt-20">
        <SectionHeader number={1} title="Dashboard — Home Screen" subtitle="Landing page after login" url="/partners/" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          The first page you see after logging in. Every section is accessible from the icon tiles here, or from the left sidebar which stays visible on every page.
        </p>
        <HotspotImage screenshot={{
          key: 'home_dashboard', label: 'Home Dashboard — click pins to explore',
          pins: [
            { id: 'td1', x: '19.5%', y: '43%', label: 1, title: 'My Accounts', description: 'Tiles for List Accounts, Add Merchant, and Add Affiliate — your day-to-day hub.', tip: 'Most-used section' },
            { id: 'td2', x: '50%', y: '43%', label: 2, title: 'Reporting', description: 'Quick access to Transactions, Commissions, and Billing reports across your portfolio.', tip: 'Transactions · Commissions · Billing' },
            { id: 'td3', x: '29%', y: '72%', label: 3, title: 'Services', description: 'Settings, Order Devices, Order History, Service Prices, and Help.', tip: 'Config & hardware' },
            { id: 'td4', x: '64%', y: '72%', label: 4, title: 'Service Prices', description: 'Manage fee schedules — build presets or custom schedules for individual merchants.', tip: 'Under Services' },
            { id: 'td5', x: '92%', y: '12%', label: 5, title: 'Account ID', description: 'Your unique partner identifier. Always quote this when contacting NMI support.', tip: 'Quote to NMI Support' },
          ],
        }} />
      </section>

      {/* S2 List Accounts */}
      <section ref={ref('s2')} className="mb-10 scroll-mt-20">
        <SectionHeader number={2} title="List Accounts" subtitle="My Accounts → List Accounts" url="/partners/accounts" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          Your complete merchant portfolio. Search, sign in as any merchant, export your list, or kick off bulk operations.
        </p>
        <HotspotImage screenshot={{
          key: 'list_accounts', label: 'List Accounts page',
          pins: [
            { id: 'la1', x: '26%', y: '27%', label: 1, title: 'Search Box', description: 'Type any part of a merchant name to filter instantly.', tip: 'Filters as you type' },
            { id: 'la2', x: '71%', y: '17%', label: 2, title: 'Update Multiple Accounts', description: 'Opens Bulk Actions — apply a service or fee change to multiple merchants.', tip: 'Bulk Actions' },
            { id: 'la3', x: '19%', y: '48%', label: 3, title: 'Sign In Button', description: "Logs you into that merchant's portal for troubleshooting. Requires 'Log in as merchants' permission.", tip: 'Needs permission' },
            { id: 'la4', x: '32%', y: '48%', label: 4, title: 'Status Badge', description: 'Active (green), Test (grey), Restricted (yellow), Closed (red).', tip: 'Active = live processing' },
            { id: 'la5', x: '32%', y: '57%', label: 5, title: 'Merchant Name', description: 'Click to open the full Merchant Details page.', tip: 'Opens Merchant Details' },
            { id: 'la6', x: '57%', y: '60%', label: 6, title: 'Download Buttons', description: 'Export as Excel or CSV for reporting or CRM uploads.', tip: 'Excel or CSV' },
          ],
        }} />
      </section>

      {/* S3 Add Merchant */}
      <section ref={ref('s3')} className="mb-10 scroll-mt-20">
        <SectionHeader number={3} title="Add Merchant" subtitle="My Accounts → Add Merchant" url="/partners/merchant/new" />
        <Note variant="warning">⚠️ <strong>Permission required:</strong> Your user needs "Manage merchant accounts." Primary users have this by default.</Note>
        <HotspotImage screenshot={{
          key: 'add_merchant_type', label: 'Step 1 — Select Merchant Type',
          pins: [
            { id: 'at1', x: '22%', y: '55%', label: 1, title: 'Standard', description: 'Full gateway — all payment methods, all features, live processing. Use for all real merchants.', tip: 'Default for live accounts' },
            { id: 'at2', x: '50%', y: '55%', label: 2, title: 'Mobile', description: 'Mobile-only, limited access. Upgradeable to Standard.', tip: 'Upgradeable later' },
            { id: 'at3', x: '77%', y: '55%', label: 3, title: 'Test', description: 'Permanent sandbox. Never charges anyone, not billable. Great for demos.', tip: 'Free, never bills' },
          ],
        }} />
        <HotspotImage screenshot={{
          key: 'add_merchant_form', label: 'Step 2 — Fill in the New Merchant Form',
          pins: [
            { id: 'af1', x: '50%', y: '13%', label: 1, title: 'Merchant Information', description: 'Company name (what merchant sees at login), address, country, timezone.', tip: 'Company name = merchant login label' },
            { id: 'af2', x: '50%', y: '44%', label: 2, title: 'Company Contact', description: 'Receives the welcome email with login credentials. Verify this email carefully.', tip: 'Verify this email' },
            { id: 'af3', x: '18%', y: '71%', label: 3, title: 'Primary Username', description: '4–32 characters, letters and numbers only, globally unique across all NMI accounts.', tip: 'Alphanumeric, 4–32 chars' },
            { id: 'af4', x: '18%', y: '87%', label: 4, title: 'Continue', description: "Moves to processor setup and fees. You'll need the merchant's VAR sheet from their acquiring bank.", tip: 'Next: processor + fees' },
          ],
        }} />
        <Note>💡 <strong>VAR sheet:</strong> A document the merchant requests from their processor (First Data, TSYS, etc.) with credentials to connect their merchant account. Required before adding a live processor.</Note>
      </section>

      {/* S5 Merchant Details */}
      <section ref={ref('s5')} className="mb-10 scroll-mt-20">
        <SectionHeader number={5} title="Merchant Details" subtitle="Click any merchant name in List Accounts" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          The central management page for a single merchant. Everything is viewable and editable here — no need to log into the merchant's own portal.
        </p>
        <HotspotImage screenshot={{
          key: 'merchant_details_top', label: 'Merchant Details — top section',
          pins: [
            { id: 'md1', x: '24%', y: '20%', label: 1, title: 'Merchant Information', description: 'Gateway ID (give to NMI Support), business address, and timezone.', tip: 'Gateway ID = support reference' },
            { id: 'md2', x: '75%', y: '20%', label: 2, title: 'Company Contact', description: 'Primary contact. Email receives all account notifications and appears on receipts.', tip: 'Edit name, email, phone' },
            { id: 'md3', x: '24%', y: '48%', label: 3, title: 'Billing Information', description: 'Bank account gateway fees are withdrawn from. Account number shown masked.', tip: 'Gateway fees from here' },
            { id: 'md4', x: '75%', y: '40%', label: 4, title: 'Merchant Users', description: 'All portal users. Send password resets or sign in directly from here.', tip: 'Reset Password / Log In' },
            { id: 'md5', x: '24%', y: '71%', label: 5, title: 'Advanced Features', description: 'Optional feature checkboxes — surcharge fees, receipt automation, routing.', tip: 'See Edit Merchant section' },
            { id: 'md6', x: '75%', y: '63%', label: 6, title: 'Merchant Status', description: 'Active / Restricted / Closed / Deleted. History log records every past change.', tip: 'Active = can process' },
          ],
        }} />
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {['Section', 'What it shows', 'You can'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-bold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Merchant Information', 'Gateway ID, address, timezone', 'Edit name, address, timezone'],
                ['Company Contact', 'Name, email, phone', 'Edit contact details'],
                ['Billing Information', 'Masked bank account + routing', 'Update banking details'],
                ['Merchant Users', 'Portal usernames', 'Reset password, sign in as merchant'],
                ['Advanced Features', 'Optional feature checkboxes', 'Enable / disable features'],
                ['Merchant Status', 'Active / Restricted / Closed / Deleted', 'Change status, view audit history'],
                ['Processing Services', 'Connected processors (CC, eCheck, Cash)', 'Add, edit, disable processors'],
                ['Value-Added Services', 'Add-on features and statuses', 'Enable, trial, or disable services'],
                ['Fee Schedules', 'Billing settings and custom pricing', 'Edit fees, enable billing statement'],
              ].map(([s, sh, c], i) => (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-semibold">{s}</td>
                  <td className="px-3 py-2 text-muted-foreground">{sh}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* S6 Edit Merchant */}
      <section ref={ref('s6')} className="mb-10 scroll-mt-20">
        <SectionHeader number={6} title="Editing a Merchant" subtitle="Merchant Details → click Edit on any section" />
        <HotspotImage screenshot={{
          key: 'edit_merchant_billing_status', label: 'Edit view — Billing, Advanced Features & Status',
          pins: [
            { id: 'eb1', x: '18%', y: '19%', label: 1, title: 'Billing Information', description: 'Update bank account, routing/ABA, holder type, account type.', tip: 'Click Save to apply' },
            { id: 'eb2', x: '18%', y: '47%', label: 2, title: 'Advanced Features', description: 'Optional feature checkboxes. Ticked = active.', tip: 'Scroll to see all' },
            { id: 'eb3', x: '63%', y: '15%', label: 3, title: 'Merchant Users', description: 'Click Reset Password to send a reset email from your portal.', tip: 'Send reset from here' },
            { id: 'eb4', x: '63%', y: '38%', label: 4, title: 'Status Definitions', description: 'Active = full. Restricted = no processing. Closed = no login. Deleted = removed from reports.', tip: 'Use Closed not Deleted' },
            { id: 'eb5', x: '63%', y: '56%', label: 5, title: 'Select a Status', description: "Dropdown to change the merchant's status. Effective immediately.", tip: 'Immediate' },
            { id: 'eb6', x: '63%', y: '80%', label: 6, title: 'Status History', description: 'Full audit log — who changed it, when, from what to what.', tip: 'Full audit trail' },
          ],
        }} />
        <HotspotImage screenshot={{
          key: 'edit_merchant_advanced_features', label: 'Advanced Merchant Features — full list',
          pins: [
            { id: 'ea1', x: '15%', y: '46%', label: 1, title: '✅ Surcharge & Convenience Fees', description: 'Active. Merchant can add surcharges to transactions.', tip: 'Currently active' },
            { id: 'ea2', x: '15%', y: '55%', label: 2, title: '✅ Miscellaneous Fees', description: 'Active. Merchant can configure and apply miscellaneous fee types.', tip: 'Currently active' },
            { id: 'ea3', x: '15%', y: '65%', label: 3, title: 'Tips in Virtual Terminal', description: 'Allow tip entry on keyed transactions. Useful for restaurants.', tip: 'Not enabled' },
            { id: 'ea4', x: '15%', y: '73%', label: 4, title: 'Daily Batch Reports', description: 'Send merchant a detailed daily batch report email at 5AM UTC.', tip: 'Not enabled' },
            { id: 'ea5', x: '15%', y: '83%', label: 5, title: '✅ QuickClick Inline Stylesheets', description: 'Active. Inline CSS in QuickClick forms. Merchant owns PCI DSS responsibility.', tip: 'Currently active' },
          ],
        }} />
      </section>

      {/* S7 Status */}
      <section ref={ref('s7')} className="mb-10 scroll-mt-20">
        <SectionHeader number={7} title="Merchant Status" subtitle="Controls access and billing" />
        <div className="overflow-x-auto rounded-lg border border-border mb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {['Status', 'Merchant access', 'Your access', 'Billed?'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-bold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border hover:bg-muted/20">
                <td className="px-3 py-2"><Badge className="bg-success/10 text-success border-success/25 text-xs">ACTIVE</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">Full — process transactions, all features</td>
                <td className="px-3 py-2 text-muted-foreground">Full</td>
                <td className="px-3 py-2 text-muted-foreground">Yes</td>
              </tr>
              <tr className="border-b border-border hover:bg-muted/20">
                <td className="px-3 py-2"><Badge className="bg-warning/10 text-warning border-warning/25 text-xs">RESTRICTED</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">Login, reports, settings — no processing</td>
                <td className="px-3 py-2 text-muted-foreground">Full</td>
                <td className="px-3 py-2 text-muted-foreground">If active services</td>
              </tr>
              <tr className="border-b border-border hover:bg-muted/20">
                <td className="px-3 py-2"><Badge className="bg-destructive/10 text-destructive border-destructive/25 text-xs">CLOSED</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">No login</td>
                <td className="px-3 py-2 text-muted-foreground">Reporting & voids only</td>
                <td className="px-3 py-2 text-muted-foreground">No</td>
              </tr>
              <tr className="hover:bg-muted/20">
                <td className="px-3 py-2"><Badge variant="outline" className="text-xs">DELETED</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">No login, removed from all reports</td>
                <td className="px-3 py-2 text-muted-foreground">Commission reports only</td>
                <td className="px-3 py-2 text-muted-foreground">No</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note variant="warning">⚠️ <strong>Always use Closed, not Deleted</strong> for any merchant with transaction history. Deleted removes them from reports and is very difficult to reverse.</Note>
      </section>

      {/* S8 Processing Services */}
      <section ref={ref('s8')} className="mb-10 scroll-mt-20">
        <SectionHeader number={8} title="Processing Services" subtitle="Merchant Details → Processing Services" />
        <HotspotImage screenshot={{
          key: 'processing_services_vas', label: 'Processing Services & Value-Added Services',
          pins: [
            { id: 'ps1', x: '8%', y: '6%', label: 1, title: 'Processing Services', description: 'Credit Card, eCheck (ACH), Cash — one row per type.', tip: 'One row per type' },
            { id: 'ps2', x: '86%', y: '6%', label: 2, title: 'Add Processor', description: "Enter credentials from the merchant's VAR sheet. Select account classification.", tip: 'Requires VAR sheet' },
            { id: 'ps3', x: '75%', y: '14%', label: 3, title: 'Billing Action', description: "Update billing info for this processor's fees specifically.", tip: 'Per-processor billing' },
            { id: 'ps4', x: '75%', y: '22%', label: 4, title: 'Edit / Disable', description: 'Edit modifies credentials. Disable deactivates without deleting.', tip: 'Disable keeps the record' },
            { id: 'ps5', x: '8%', y: '39%', label: 5, title: 'Value-Added Services', description: 'Premium features. Active = on. Offered = available. Not Offered = unavailable.', tip: 'Active / Offered / Not Offered' },
            { id: 'ps6', x: '86%', y: '39%', label: 6, title: 'Update Services', description: 'Opens the full service selection page to enable, trial, or disable services.', tip: 'Opens VAS page' },
          ],
        }} />
      </section>

      {/* S9 Value-Added Services */}
      <section ref={ref('s9')} className="mb-10 scroll-mt-20">
        <SectionHeader number={9} title="Value-Added Services" subtitle="Merchant Details → Update Services" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-3">
          Premium features per merchant. Always click <strong>Submit</strong> — nothing applies until you do.
        </p>
        <HotspotImage screenshot={{
          key: 'value_added_services_select', label: 'Select Value-Added Services page',
          pins: [
            { id: 'vs1', x: '50%', y: '13%', label: 1, title: 'Authvia TXT2PAY®', description: 'Send payment request links via SMS. Status: Offered.', tip: 'Free trial available' },
            { id: 'vs2', x: '50%', y: '23%', label: 2, title: 'Automatic Card Updater', description: 'Auto-updates stored cards when banks reissue them. Status: Active.', tip: 'Runs on schedule' },
            { id: 'vs3', x: '50%', y: '33%', label: 3, title: 'Customer Token Vault', description: 'Network-token upgrade of Customer Vault — better approval rates.', tip: 'Better than standard vault' },
            { id: 'vs4', x: '50%', y: '43%', label: 4, title: 'Customer Vault', description: 'Stores customer payment data for recurring billing. Status: Active.', tip: 'Required for recurring' },
            { id: 'vs5', x: '50%', y: '53%', label: 5, title: 'Fraud Prevention', description: 'Rule-based fraud screening on all transactions. Status: Active.', tip: 'Recommended always' },
            { id: 'vs6', x: '50%', y: '63%', label: 6, title: 'Invoicing', description: 'Create and email digital invoices — customers pay via a link. Status: Offered.', tip: 'Free trial available' },
            { id: 'vs7', x: '15%', y: '88%', label: 7, title: 'Submit Button', description: 'Nothing saves until you click Submit.', tip: 'Must click to save' },
          ],
        }} />
      </section>

      {/* S-BULK Bulk Actions */}
      <section ref={ref('s-bulk')} className="mb-10 scroll-mt-20">
        <SectionHeader number={19} title="Bulk Actions" subtitle="List Accounts → Update Multiple Accounts" accent />
        <HotspotImage screenshot={{
          key: 'bulk_actions', label: 'Bulk Actions — two options',
          pins: [
            { id: 'ba1', x: '25%', y: '55%', label: 1, title: 'Mass Enable Services', description: 'Select one service and enable it across multiple merchants at once.', tip: 'One service per operation' },
            { id: 'ba2', x: '75%', y: '55%', label: 2, title: 'Update Custom Fee Schedules', description: 'Apply fee schedule changes to multiple merchants simultaneously.', tip: 'Review before confirming' },
          ],
        }} />
        <HotspotImage screenshot={{
          key: 'mass_enable_services', label: 'Mass Enable Value-Added Services',
          pins: [
            { id: 'me1', x: '44%', y: '22%', label: 1, title: 'Service Dropdown', description: 'Select the service to enable across all selected merchants.', tip: 'One at a time' },
            { id: 'me2', x: '44%', y: '48%', label: 2, title: 'Account Selection', description: 'Check individual merchants or select all. Submit applies immediately — no undo.', tip: 'No undo after Submit' },
          ],
        }} />
        <HotspotImage screenshot={{
          key: 'bulk_update_fee_schedules', label: 'Bulk Update Fee Schedules',
          pins: [
            { id: 'bf1', x: '20%', y: '25%', label: 1, title: 'Select Fee Schedules', description: "Choose schedule(s) to apply. Use arrows to set priority order.", tip: 'Reorder with arrows' },
            { id: 'bf2', x: '20%', y: '60%', label: 2, title: 'Select Accounts', description: 'Only accounts with custom fee schedules appear.', tip: 'Custom-fee accounts only' },
            { id: 'bf3', x: '18%', y: '82%', label: 3, title: 'Continue to Pricing', description: 'Review all proposed changes before they apply.', tip: 'Review then confirm' },
          ],
        }} />
      </section>

      {/* Remaining pages — placeholders */}
      {[
        { id: 's10', n: 10, title: 'VAMP Guidance', sub: 'Marketplace → VAMP Guidance', url: '/partners/vamp-guidance', ph: { name: 'VAMP Guidance Page', url: '/partners/vamp-guidance', desc: "Two sections: Preventing Fraud and Managing Chargebacks." } },
        { id: 's11', n: 11, title: 'Transactions', sub: 'Reports → Transactions', url: '/partners/transactions', ph: { name: 'Transaction Reports Page', url: '/partners/transactions', desc: 'Two search tools: Transaction Snapshot (overview) and Search Transactions (granular).' } },
        { id: 's12', n: 12, title: 'Commissions', sub: 'Reports → Commissions', url: '/partners/commission_reports', ph: { name: 'Commission Reports Page', url: '/partners/commission_reports', desc: 'Select a month to view earnings. Issued on the 22nd for the following month.' } },
        { id: 's13', n: 13, title: 'Billing', sub: 'Reports → Billing', url: '/partners/billing_reports', ph: { name: 'Billing Reports Page', url: '/partners/billing_reports', desc: "Date range selector. All gateway debits show as 'GATEWAY SERVICES — CO ID 4460522024'." } },
        { id: 's16', n: 16, title: 'Service Prices', sub: 'Service Prices overview', url: '/partners/fee_schedules', ph: { name: 'Service Prices Overview', url: '/partners/fee_schedules', desc: 'Two tiles: Cost Schedule (your buy rates from NMI) and Fee Schedule Manager.' } },
        { id: 's21', n: 21, title: 'Account Information', sub: 'Settings → Account Information', url: '/partners/settings/account_information', ph: { name: 'Account Information Page', url: '/partners/settings/account_information' } },
        { id: 's22', n: 22, title: 'Look & Feel', sub: 'Settings → Look and Feel', url: '/partners/settings/look_and_feel', ph: { name: 'Look and Feel Settings', url: '/partners/settings/look_and_feel', desc: 'Colour, logo, icon, header image. White-labelling makes the portal feel like your own product.' } },
        { id: 's26', n: 26, title: 'Users', sub: 'Settings → Users and Access → Users', url: '/partners/settings/users', ph: { name: 'Users Page', url: '/partners/settings/users', desc: 'Lists users with username, full name, and permission codes.' } },
        { id: 's29', n: 29, title: 'Two-Factor Authentication', sub: 'Settings → Two-Factor Auth', url: '/partners/two_factor_authentication', ph: { name: 'Two-Factor Auth Page', url: '/partners/two_factor_authentication', desc: 'QR code to scan with an authenticator app. Required since October 2025.' } },
        { id: 's31', n: 31, title: 'Contact Support', sub: 'Help → Contact Support', url: '/partners/documentation', ph: { name: 'Documentation / Contact Support', url: '/partners/documentation', desc: 'support@nmi.com · 1 (847) 352-4850 · Always include the merchant Gateway ID.' } },
      ].map(({ id, n, title, sub, url, ph }) => (
        <section key={id} ref={ref(id)} className="mb-10 scroll-mt-20">
          <SectionHeader number={n} title={title} subtitle={sub} url={url} />
          <PlaceholderCard name={ph.name} url={ph.url} description={ph.desc} />
        </section>
      ))}

      {/* Priority screenshots */}
      <section ref={ref('screenshots-needed')} className="mb-10 scroll-mt-20">
        <SectionHeader number={0} title="Priority Screenshots to Capture" subtitle="20 pages still need screenshots — ranked by value" />
        {[
          { priority: 1, color: 'text-destructive border-destructive/30 bg-destructive/5' as const, label: '🔴 Priority 1 — Capture First', items: [
            { n: 1, title: 'Transactions Report Page', url: '/partners/transactions' },
            { n: 2, title: 'Commissions Report', url: '/partners/commission_reports' },
            { n: 3, title: 'Service Prices Overview', url: '/partners/fee_schedules' },
            { n: 4, title: 'Fee Schedule Manager + View + Edit', url: '/partners/fee_schedules/list' },
            { n: 5, title: 'Users Page', url: '/partners/settings/users' },
          ]},
          { priority: 2, color: 'text-warning border-warning/30 bg-warning/5' as const, label: '🟡 Priority 2 — High Value', items: [
            { n: 6, title: 'Account Information', url: '/partners/settings/account_information' },
            { n: 7, title: 'Look & Feel', url: '/partners/settings/look_and_feel' },
            { n: 8, title: 'Security Keys', url: '/partners/settings/security_keys' },
            { n: 9, title: 'Two-Factor Auth Setup', url: '/partners/two_factor_authentication' },
            { n: 10, title: 'VAMP Guidance', url: '/partners/vamp-guidance' },
          ]},
        ].map(({ label, color, items }) => (
          <div key={label} className="mb-4">
            <p className="text-xs font-bold mb-2 text-muted-foreground">{label}</p>
            <div className="space-y-1.5">
              {items.map(({ n, title, url }) => (
                <div key={n} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors">
                  <Badge variant="outline" className={cn('shrink-0 font-black text-xs w-6 justify-center', color)}>{n}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{title}</p>
                    <code className="text-xs text-muted-foreground">{url}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

    </div>
  );
};

// ─────────────────────────────────────────────
// WALKTHROUGH PANE
// ─────────────────────────────────────────────
const WalkthroughPane = () => {
  const [activeWT, setActiveWT] = useState<Walkthrough | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const step = activeWT?.steps[stepIndex];
  const total = activeWT?.steps.length ?? 0;

  const imgSrc = step ? SCREENSHOTS[step.imageKey as keyof typeof SCREENSHOTS] : undefined;

  return (
    <div className="p-5 max-w-4xl">
      <div className="mb-5">
        <h2 className="text-lg font-black">Guided Task Walkthroughs</h2>
        <p className="text-sm text-muted-foreground mt-1">Step-by-step with highlighted screenshots showing exactly where to click</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {WALKTHROUGHS.map((wt) => (
          <button
            key={wt.id}
            onClick={() => { setActiveWT(wt); setStepIndex(0); }}
            className={cn(
              'text-left p-4 rounded-xl border transition-all hover:shadow-sm',
              activeWT?.id === wt.id
                ? 'border-teal bg-teal/5'
                : 'border-border bg-card hover:border-teal/40',
            )}
          >
            <span className="text-2xl block mb-2">{wt.icon}</span>
            <p className="text-sm font-black mb-1">{wt.title}</p>
            <p className="text-xs text-muted-foreground leading-snug">{wt.description}</p>
            <span className="text-xs font-bold font-mono text-teal mt-2 block">{wt.steps.length} steps</span>
          </button>
        ))}
      </div>

      {activeWT && step && (
        <div>
          {/* Progress */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-muted">
              <div
                className="h-full rounded-full bg-teal transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-muted-foreground shrink-0">
              Step {stepIndex + 1} of {total}
            </span>
          </div>

          {/* Player card */}
          <div className="rounded-xl overflow-hidden border border-border bg-card shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-black bg-teal/15 text-teal border border-teal/25">
                {stepIndex + 1}
              </div>
              <div>
                <h3 className="font-black text-sm">{step.title}</h3>
                <p className="text-xs text-muted-foreground">{step.subtitle}</p>
              </div>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Instructions */}
              <div className="p-4 border-r border-border overflow-y-auto max-h-96">
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.text}</p>
                <ul className="space-y-2">
                  {step.actions.map((action, i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground py-1.5 border-b border-border last:border-0">
                      <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-teal mt-1.5" />
                      {action}
                    </li>
                  ))}
                </ul>
                <div
                  className="mt-3 p-3 rounded-lg text-xs text-muted-foreground leading-relaxed bg-teal/5 border border-teal/15"
                  dangerouslySetInnerHTML={{ __html: '💡 ' + step.tip }}
                />
              </div>

              {/* Screenshot */}
              <div className="p-3 bg-muted/30">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">
                  {step.imageKey.replace(/_/g, ' ')}
                </p>
                <div className="rounded-lg overflow-hidden border border-border relative">
                  {imgSrc ? (
                    <>
                      <img src={imgSrc} alt={step.title} className="w-full block" draggable={false} />
                      {/* Highlight box */}
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          top: step.highlight.top,
                          left: step.highlight.left,
                          width: step.highlight.width,
                          height: step.highlight.height,
                          border: '2px solid hsl(var(--teal))',
                          borderRadius: 3,
                          boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)',
                        }}
                      >
                        <span
                          className="absolute text-xs font-black font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{
                            bottom: 'calc(100% + 3px)', left: 0,
                            background: 'hsl(var(--teal))', color: 'hsl(var(--background))',
                            fontSize: 9,
                          }}
                        >
                          {step.highlight.label}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-16 bg-muted/20">
                      <Camera className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Nav */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <Button
                variant="outline" size="sm"
                onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                disabled={stepIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>

              <div className="flex gap-1.5">
                {activeWT.steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStepIndex(i)}
                    className={cn('w-1.5 h-1.5 rounded-full transition-all', i === stepIndex ? 'bg-teal' : 'bg-muted border border-border')}
                  />
                ))}
              </div>

              <Button
                size="sm"
                className="bg-teal text-background hover:bg-teal/90"
                onClick={() => stepIndex < total - 1 ? setStepIndex(stepIndex + 1) : setActiveWT(null)}
              >
                {stepIndex < total - 1 ? (<>Next <ChevronRight className="h-4 w-4 ml-1" /></>) : (<><CheckCircle2 className="h-4 w-4 mr-1" /> Done</>)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const NMIGuide: React.FC = () => {
  const [mode, setMode] = useState<GuideMode>('reference');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(e =>
      e.title.toLowerCase().includes(q) || e.keywords.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [searchQuery]);

  const handleSearchSelect = useCallback((sectionId: string) => {
    setMode('reference');
    setScrollTarget(sectionId);
    setSearchQuery('');
    setSearchOpen(false);
    setTimeout(() => setScrollTarget(null), 600);
  }, []);

  // Sidebar nav groups matching the actual portal structure
  const navGroups = [
    { label: 'My Accounts', items: [
      { label: 'Overview', id: 'welcome' },
      { label: 'Dashboard', id: 's1' },
      { label: 'List Accounts', id: 's2' },
      { label: 'Add Merchant', id: 's3' },
    ]},
    { label: 'Merchant Setup', items: [
      { label: 'Merchant Details', id: 's5' },
      { label: 'Editing a Merchant', id: 's6' },
      { label: 'Merchant Status', id: 's7' },
      { label: 'Processing Services', id: 's8' },
      { label: 'Value-Added Services', id: 's9' },
    ]},
    { label: 'Marketplace', items: [
      { label: 'VAMP Guidance', id: 's10', placeholder: true },
    ]},
    { label: 'Reports', items: [
      { label: 'Transactions', id: 's11', placeholder: true },
      { label: 'Commissions', id: 's12', placeholder: true },
      { label: 'Billing', id: 's13', placeholder: true },
    ]},
    { label: 'Service Prices', items: [
      { label: 'Service Prices', id: 's16', placeholder: true },
      { label: 'Bulk Actions', id: 's-bulk' },
    ]},
    { label: 'Settings', items: [
      { label: 'Account Information', id: 's21', placeholder: true },
      { label: 'Look & Feel', id: 's22', placeholder: true },
      { label: 'Users', id: 's26', placeholder: true },
      { label: 'Two-Factor Auth', id: 's29', placeholder: true },
    ]},
    { label: 'Help', items: [
      { label: 'Contact Support', id: 's31', placeholder: true },
    ]},
    { label: 'Guide Tools', items: [
      { label: '📷 Screenshots Needed', id: 'screenshots-needed' },
    ]},
  ];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        {/* Mode toggle */}
        <div className="p-2 border-b border-border">
          <div className="grid grid-cols-2 gap-1 bg-muted rounded-lg p-1">
            {(['reference', 'walkthroughs'] as GuideMode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'py-1.5 text-xs font-bold rounded-md transition-all',
                  mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'reference' ? '📖 Ref' : '🎯 Tasks'}
              </button>
            ))}
          </div>
        </div>

        {/* Nav */}
        <ScrollArea className="flex-1">
          {mode === 'reference' ? (
            <nav className="py-2">
              {navGroups.map(({ label, items }) => (
                <div key={label}>
                  <p className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wider text-muted-foreground/70">
                    {label}
                  </p>
                  {items.map(({ label: itemLabel, id, placeholder }) => (
                    <button
                      key={id}
                      onClick={() => { setScrollTarget(id); setTimeout(() => setScrollTarget(null), 600); }}
                      className="flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors rounded-sm mx-1"
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      <span className="flex-1">{itemLabel}</span>
                      {placeholder && <Camera className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          ) : (
            <nav className="py-2">
              <p className="px-3 pt-3 pb-1 text-xs font-black uppercase tracking-wider text-muted-foreground/70">Guided Tasks</p>
              {WALKTHROUGHS.map((wt, i) => (
                <button
                  key={wt.id}
                  className="flex items-start gap-2 w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => setMode('walkthroughs')}
                >
                  <span className="shrink-0 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center text-[9px] font-black mt-0.5">{i + 1}</span>
                  <span className="text-muted-foreground leading-snug">{wt.title}</span>
                </button>
              ))}
            </nav>
          )}
        </ScrollArea>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Topbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              Partner Portal ›{' '}
              <span className="text-teal font-medium">
                {mode === 'reference' ? 'Reference Guide' : 'Task Walkthroughs'}
              </span>
            </span>
            <Badge variant="outline" className="text-xs text-teal border-teal/30">34 pages</Badge>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="Search all 34 pages…"
                className="text-xs bg-transparent outline-none w-44 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-72 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                {searchResults.map(entry => (
                  <button
                    key={entry.sectionId}
                    onClick={() => handleSearchSelect(entry.sectionId)}
                    className="flex flex-col w-full text-left px-3 py-2.5 hover:bg-accent border-b border-border last:border-0 transition-colors"
                  >
                    <span className="text-xs font-bold">{entry.title}</span>
                    <span className="text-xs text-muted-foreground mt-0.5 truncate">
                      {entry.keywords.split(' ').slice(0, 6).join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {mode === 'reference'
            ? <ReferenceContent scrollTo={scrollTarget} />
            : <WalkthroughPane />
          }
        </ScrollArea>
      </div>
    </div>
  );
};

export default NMIGuide;
