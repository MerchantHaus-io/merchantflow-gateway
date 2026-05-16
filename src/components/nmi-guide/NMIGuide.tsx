import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ChevronRight, ChevronLeft, CheckCircle2, Camera, X,
  BookOpen, Zap, AlertTriangle, Info, CircleDot, ExternalLink,
  ArrowRight, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// ─────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────
const G = '#5CDDAD';      // Gateway green
const GD = 'rgba(92,221,173,0.12)';  // Green dim
const GB = 'rgba(92,221,173,0.22)';  // Green border
const P = '#32165D';      // NMI purple
const BG = 'hsl(217 33% 11%)';       // Sidebar bg
const BG2 = 'hsl(217 33% 13%)';      // Card bg
const BG3 = 'hsl(217 33% 9%)';       // Deep bg

// ─────────────────────────────────────────────────────────────────
// PIN BUTTON
// ─────────────────────────────────────────────────────────────────
const PinButton = React.memo(({ pin, isActive, onClick }: {
  pin: HotspotPin; isActive: boolean; onClick: (e: React.MouseEvent) => void;
}) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.35 }}
    whileTap={{ scale: 0.88 }}
    animate={isActive ? { scale: 1.2 } : { scale: 1 }}
    className="absolute flex items-center justify-center rounded-full text-[10px] font-black z-10 focus:outline-none select-none"
    style={{
      left: pin.x, top: pin.y,
      transform: 'translate(-50%,-50%)',
      width: 20, height: 20,
      background: isActive ? P : G,
      color: isActive ? G : '#0a1a14',
      boxShadow: isActive
        ? `0 0 0 3px ${G}, 0 4px 20px rgba(92,221,173,0.55)`
        : `0 2px 10px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(255,255,255,0.25)`,
    }}
  >
    {pin.label}
  </motion.button>
));

// ─────────────────────────────────────────────────────────────────
// HOTSPOT IMAGE
// ─────────────────────────────────────────────────────────────────
const HotspotImage = React.memo(({ screenshot }: { screenshot: ScreenshotSection }) => {
  const [activeTip, setActiveTip] = useState<{ pin: HotspotPin; x: number; y: number; right: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handlePin = useCallback((e: React.MouseEvent, pin: HotspotPin) => {
    e.stopPropagation();
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const px = (parseFloat(pin.x) / 100) * r.width;
    const py = (parseFloat(pin.y) / 100) * r.height;
    if (activeTip?.pin.id === pin.id) { setActiveTip(null); return; }
    setActiveTip({ pin, x: px, y: py, right: px < r.width * 0.58 });
  }, [activeTip]);

  useEffect(() => {
    const close = () => setActiveTip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const imgSrc = SCREENSHOTS[screenshot.key as keyof typeof SCREENSHOTS];

  return (
    <div className="rounded-xl overflow-hidden mb-5" style={{
      border: '1px solid hsl(var(--border))',
      boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
    }}>
      {/* Chrome bar */}
      <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: BG3, borderBottom: '1px solid hsl(var(--border))' }}>
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,95,87,0.7)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,189,68,0.7)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(40,200,64,0.7)' }} />
        </div>
        <span className="text-[10px] font-mono flex-1 tracking-widest uppercase" style={{ color: 'hsl(var(--muted-foreground)/0.5)' }}>
          {screenshot.label}
        </span>
        {screenshot.pins?.length && (
          <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: G }}>
            <CircleDot className="h-2.5 w-2.5" />{screenshot.pins.length} pins
          </span>
        )}
      </div>

      {/* Image */}
      <div className="relative" ref={wrapRef} onClick={() => setActiveTip(null)}>
        {imgSrc
          ? <img src={imgSrc} alt={screenshot.label} className="w-full block" draggable={false} />
          : (
            <div className="flex flex-col items-center justify-center gap-3 py-16" style={{ background: BG3 }}>
              <Camera className="h-10 w-10 opacity-30" style={{ color: G }} />
              <div className="text-center">
                <p className="text-sm font-semibold text-muted-foreground">Screenshot pending</p>
                <p className="text-[10px] font-mono mt-1 opacity-60" style={{ color: G }}>{screenshot.key}</p>
              </div>
            </div>
          )}

        {screenshot.pins?.map(pin => (
          <PinButton key={pin.id} pin={pin} isActive={activeTip?.pin.id === pin.id} onClick={e => handlePin(e, pin)} />
        ))}

        <AnimatePresence>
          {activeTip && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.14 }}
              className="absolute z-30 w-60"
              style={{
                left: activeTip.right ? activeTip.x + 16 : activeTip.x - 256,
                top: Math.max(8, activeTip.y - 14),
                pointerEvents: 'all',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="rounded-xl p-3.5" style={{
                background: BG,
                border: `1px solid ${GB}`,
                boxShadow: `0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(92,221,173,0.06)`,
              }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-black text-[11px]" style={{ color: G }}>{activeTip.pin.title}</p>
                  <button onClick={() => setActiveTip(null)} className="text-muted-foreground/50 hover:text-muted-foreground mt-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">{activeTip.pin.description}</p>
                <div className="flex items-center gap-1.5 pt-2" style={{ borderTop: `1px solid ${GD}` }}>
                  <ArrowRight className="h-2.5 w-2.5 shrink-0" style={{ color: G }} />
                  <span className="text-[10px] font-black font-mono" style={{ color: G }}>{activeTip.pin.tip}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────
// NOTE
// ─────────────────────────────────────────────────────────────────
const Note = ({ variant = 'info', children }: { variant?: 'info' | 'warning' | 'danger'; children: React.ReactNode }) => {
  const c = {
    info:    { icon: Info,           col: G,                              bg: GD,                             border: GB },
    warning: { icon: AlertTriangle,  col: 'hsl(var(--warning))',          bg: 'hsl(var(--warning)/0.1)',      border: 'hsl(var(--warning)/0.3)' },
    danger:  { icon: AlertTriangle,  col: 'hsl(var(--destructive))',      bg: 'hsl(var(--destructive)/0.1)',  border: 'hsl(var(--destructive)/0.3)' },
  }[variant];
  const Icon = c.icon;
  return (
    <div className="flex gap-2.5 rounded-lg px-3 py-2.5 my-3 text-xs leading-relaxed"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: c.col }} />
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// PLACEHOLDER
// ─────────────────────────────────────────────────────────────────
const PlaceholderCard = ({ name, url, description }: { name: string; url: string; description?: string }) => (
  <div className="flex items-start gap-3 rounded-lg p-3 my-3" style={{
    border: '1px dashed hsl(var(--border))', background: BG3,
  }}>
    <Camera className="mt-0.5 shrink-0 h-4 w-4 opacity-25" style={{ color: G }} />
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-sm text-foreground/80">{name}</p>
      <code className="text-[10px] font-mono mt-0.5 block opacity-70" style={{ color: G }}>{url}</code>
      {description && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>}
    </div>
    <Badge variant="outline" className="shrink-0 text-[10px] border-warning/30 text-warning/80 bg-warning/5">📷 needed</Badge>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// SECTION HEADER
// ─────────────────────────────────────────────────────────────────
const SectionHeader = ({ number, title, subtitle, url, accent = false }: {
  number: number; title: string; subtitle: string; url?: string; accent?: boolean;
}) => (
  <div className="flex items-start gap-3 mb-4 pb-3" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
    <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-black mt-0.5"
      style={{
        background: accent ? GD : BG3,
        border: `1px solid ${accent ? GB : 'hsl(var(--border))'}`,
        color: accent ? G : 'hsl(var(--muted-foreground))',
      }}>
      {number}
    </div>
    <div>
      <h2 className="text-base font-black tracking-tight">{title}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      {url && (
        <code className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded font-mono opacity-80"
          style={{ background: BG3, border: '1px solid hsl(var(--border))', color: G }}>
          <ExternalLink className="h-2.5 w-2.5" />{url}
        </code>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// DATA TABLE
// ─────────────────────────────────────────────────────────────────
const DataTable = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <div className="overflow-x-auto rounded-xl mb-5" style={{ border: '1px solid hsl(var(--border))' }}>
    <table className="w-full text-xs">
      <thead>
        <tr style={{ borderBottom: '1px solid hsl(var(--border))', background: BG3 }}>
          {headers.map(h => (
            <th key={h} className="text-left px-3 py-2.5 font-black text-muted-foreground uppercase tracking-wider text-[9px]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="transition-colors hover:bg-white/[0.025]"
            style={{ borderBottom: i < rows.length - 1 ? '1px solid hsl(var(--border)/0.5)' : 'none' }}>
            {row.map((cell, j) => (
              <td key={j} className={cn('px-3 py-2.5', j === 0 ? 'font-semibold text-foreground/90' : 'text-muted-foreground')}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// STATUS PILL
// ─────────────────────────────────────────────────────────────────
const StatusPill = ({ status }: { status: string }) => {
  const m: Record<string, [string, string]> = {
    'ACTIVE':     ['hsl(var(--success)/0.14)', 'hsl(var(--success))'],
    'RESTRICTED': ['hsl(var(--warning)/0.14)', 'hsl(var(--warning))'],
    'CLOSED':     ['hsl(var(--destructive)/0.14)', 'hsl(var(--destructive))'],
    'DELETED':    ['hsl(var(--muted))', 'hsl(var(--muted-foreground))'],
  };
  const [bg, col] = m[status] ?? m['DELETED'];
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest"
    style={{ background: bg, color: col }}>{status}</span>;
};

// ─────────────────────────────────────────────────────────────────
// REFERENCE CONTENT
// ─────────────────────────────────────────────────────────────────
const ReferenceContent = ({ scrollTo, viewportRef }: { scrollTo: string | null; viewportRef?: React.RefObject<HTMLDivElement> }) => {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!scrollTo || !refs.current[scrollTo]) return;
    const el = refs.current[scrollTo]!;
    const viewport = viewportRef?.current;
    if (viewport) {
      // Walk up offsetParents to compute position relative to the viewport
      let top = 0;
      let node: HTMLElement | null = el;
      while (node && node !== viewport) {
        top += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      viewport.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollTo, viewportRef]);
  const ref = (id: string) => (el: HTMLElement | null) => { refs.current[id] = el; };

  return (
    <div className="p-5 max-w-4xl">

      {/* ── HERO ── */}
      <motion.div ref={ref('welcome')} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-2xl p-6 mb-8 relative overflow-hidden"
        style={{ background: `linear-gradient(140deg, ${P} 0%, hsl(217 33% 20%) 100%)`, border: `1px solid ${GB}` }}>
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `linear-gradient(${G} 1px, transparent 1px), linear-gradient(90deg, ${G} 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
        }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-[0.08]"
          style={{ background: `radial-gradient(circle, ${G}, transparent 70%)` }} />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black tracking-[0.18em] uppercase px-2 py-1 rounded"
              style={{ background: GD, color: G, border: `1px solid ${GB}` }}>
              NMI Partner Portal
            </span>
            <span className="text-[10px] text-white/35 font-mono">March 2026</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2">Partner Portal Guide</h1>
          <p className="text-sm text-white/55 leading-relaxed max-w-lg mb-5">
            Every page of the portal documented with interactive screenshots. Click the numbered pins to explore, or switch to
            <strong className="text-white/80"> Tasks</strong> for guided walkthroughs.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: BookOpen, label: '34 pages' },
              { icon: CircleDot, label: '14 screenshots' },
              { icon: Zap, label: '5 walkthroughs' },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                style={{ background: GD, color: G, border: `1px solid ${GB}` }}>
                <Icon className="h-3 w-3" />{label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg"
              style={{ background: 'hsl(var(--warning)/0.15)', color: 'hsl(var(--warning))', border: 'hsl(var(--warning)/0.3) 1px solid' }}>
              <Camera className="h-3 w-3" />20 screenshots needed
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── SECTIONS ── */}

      <section ref={ref('s1')} className="mb-12 scroll-mt-4">
        <SectionHeader number={1} title="Dashboard — Home Screen" subtitle="Landing page after login" url="/partners/" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">The first page you see after logging in. Every section is reachable from the icon tiles here or from the persistent left sidebar on every portal page.</p>
        <HotspotImage screenshot={{ key: 'home_dashboard', label: 'Home Dashboard', pins: [
          { id: 'td1', x: '19.5%', y: '43%', label: 1, title: 'My Accounts', description: 'Tiles for List Accounts, Add Merchant, and Add Affiliate — your day-to-day hub.', tip: 'Most-used section' },
          { id: 'td2', x: '50%', y: '43%', label: 2, title: 'Reporting', description: 'Quick access to Transactions, Commissions, and Billing reports across your portfolio.', tip: 'Transactions · Commissions · Billing' },
          { id: 'td3', x: '29%', y: '72%', label: 3, title: 'Services', description: 'Settings, Order Devices, Order History, Service Prices, and Help.', tip: 'Config & hardware' },
          { id: 'td4', x: '64%', y: '72%', label: 4, title: 'Service Prices', description: 'Manage fee schedules — build presets or custom schedules for individual merchants.', tip: 'Under Services' },
          { id: 'td5', x: '92%', y: '12%', label: 5, title: 'Account ID', description: 'Your unique partner identifier. Always quote this when contacting NMI support.', tip: 'Quote to NMI Support' },
        ]}} />
      </section>

      <section ref={ref('s2')} className="mb-12 scroll-mt-4">
        <SectionHeader number={2} title="List Accounts" subtitle="My Accounts → List Accounts" url="/partners/accounts" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">Your complete merchant portfolio. Search, sign in as unknown merchant, export, or kick off bulk operations.</p>
        <HotspotImage screenshot={{ key: 'list_accounts', label: 'List Accounts', pins: [
          { id: 'la1', x: '26%', y: '27%', label: 1, title: 'Search Box', description: 'Type any part of a merchant name to filter the list instantly as you type.', tip: 'Filters as you type' },
          { id: 'la2', x: '71%', y: '17%', label: 2, title: 'Update Multiple Accounts', description: 'Opens Bulk Actions — apply a service or fee change to multiple merchants at once.', tip: 'Bulk Actions' },
          { id: 'la3', x: '19%', y: '48%', label: 3, title: 'Sign In Button', description: "Logs you into that merchant's portal for troubleshooting. Requires 'Log in as merchants' permission.", tip: 'Needs permission' },
          { id: 'la4', x: '32%', y: '48%', label: 4, title: 'Status Badge', description: 'Active (green), Test (grey), Restricted (yellow), Closed (red).', tip: 'Active = live processing' },
          { id: 'la5', x: '32%', y: '57%', label: 5, title: 'Merchant Name', description: 'Click to open the full Merchant Details page for this account.', tip: 'Opens Merchant Details' },
          { id: 'la6', x: '57%', y: '60%', label: 6, title: 'Download Buttons', description: 'Export your portfolio as Excel or CSV for reporting or CRM imports.', tip: 'Excel or CSV' },
        ]}} />
      </section>

      <section ref={ref('s3')} className="mb-12 scroll-mt-4">
        <SectionHeader number={3} title="Add Merchant" subtitle="My Accounts → Add Merchant" url="/partners/merchant/new" />
        <Note variant="warning"><strong>Permission required:</strong> Your user needs "Manage merchant accounts." Primary users have this by default.</Note>
        <HotspotImage screenshot={{ key: 'add_merchant_type', label: 'Step 1 — Select Merchant Type', pins: [
          { id: 'at1', x: '22%', y: '55%', label: 1, title: 'Standard', description: 'Full gateway — all payment methods, all features, live processing. Use for all real merchants.', tip: 'Default for live accounts' },
          { id: 'at2', x: '50%', y: '55%', label: 2, title: 'Mobile', description: 'Mobile-only, limited access. Upgradeable to Standard later.', tip: 'Upgradeable later' },
          { id: 'at3', x: '77%', y: '55%', label: 3, title: 'Test', description: 'Permanent sandbox. Never charges anyone, not billable. Great for demos.', tip: 'Free — never bills' },
        ]}} />
        <HotspotImage screenshot={{ key: 'add_merchant_form', label: 'Step 2 — New Merchant Form', pins: [
          { id: 'af1', x: '50%', y: '13%', label: 1, title: 'Merchant Information', description: 'Company name (what merchant sees at login), address, country, timezone.', tip: 'Company name = merchant login label' },
          { id: 'af2', x: '50%', y: '44%', label: 2, title: 'Company Contact', description: 'Receives the welcome email with login credentials. Verify this email — wrong email means no access.', tip: '⚠️ Verify email carefully' },
          { id: 'af3', x: '18%', y: '71%', label: 3, title: 'Primary Username', description: '4–32 characters, alphanumeric only, globally unique across all NMI accounts.', tip: '4–32 chars, alphanumeric' },
          { id: 'af4', x: '18%', y: '87%', label: 4, title: 'Continue', description: "Moves to processor setup and fees. You'll need the merchant's VAR sheet from their acquiring bank.", tip: 'Next: processor + fees' },
        ]}} />
        <Note><strong>VAR sheet:</strong> The merchant requests this from their processor (First Data, TSYS, etc.). It contains credentials to link their merchant account to the gateway. Required before adding a live processor.</Note>
      </section>

      <section ref={ref('s5')} className="mb-12 scroll-mt-4">
        <SectionHeader number={5} title="Merchant Details" subtitle="Click any merchant name in List Accounts" />
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">The central management page for a single merchant. Everything is viewable and editable here — no need to log into the merchant's own portal.</p>
        <HotspotImage screenshot={{ key: 'merchant_details_top', label: 'Merchant Details', pins: [
          { id: 'md1', x: '24%', y: '20%', label: 1, title: 'Merchant Information', description: 'Gateway ID (give to NMI Support), business address, and timezone.', tip: 'Gateway ID = support reference' },
          { id: 'md2', x: '75%', y: '20%', label: 2, title: 'Company Contact', description: 'Primary contact. Email receives all account notifications and appears on receipts.', tip: 'Edit name, email, phone' },
          { id: 'md3', x: '24%', y: '48%', label: 3, title: 'Billing Information', description: 'Bank account gateway fees are withdrawn from. Account number shown masked for security.', tip: 'Gateway fees drawn here' },
          { id: 'md4', x: '75%', y: '40%', label: 4, title: 'Merchant Users', description: 'All portal users for this account. Send password resets or sign in directly.', tip: 'Reset Password / Log In' },
          { id: 'md5', x: '24%', y: '71%', label: 5, title: 'Advanced Features', description: 'Optional feature checkboxes — surcharge fees, receipt automation, QuickClick routing.', tip: 'See Edit Merchant' },
          { id: 'md6', x: '75%', y: '63%', label: 6, title: 'Merchant Status', description: 'Active / Restricted / Closed / Deleted. Full history log with timestamps and user.', tip: 'Active = can process' },
        ]}} />
        <DataTable
          headers={['Section', 'Shows', 'You can do']}
          rows={[
            ['Merchant Information', 'Gateway ID, address, timezone', 'Edit name, address, timezone'],
            ['Company Contact', 'Name, email, phone', 'Update contact details'],
            ['Billing Information', 'Masked bank + routing', 'Update banking details'],
            ['Merchant Users', 'Portal usernames', 'Reset password, sign in as merchant'],
            ['Advanced Features', 'Optional feature checkboxes', 'Enable / disable features'],
            ['Merchant Status', 'Active / Restricted / Closed / Deleted', 'Change status, view audit log'],
            ['Processing Services', 'Connected processors', 'Add, edit, disable processors'],
            ['Value-Added Services', 'Add-on features', 'Enable, trial, or disable services'],
            ['Fee Schedules', 'Billing and custom pricing', 'Edit fees, enable billing statement'],
          ]}
        />
      </section>

      <section ref={ref('s6')} className="mb-12 scroll-mt-4">
        <SectionHeader number={6} title="Editing a Merchant" subtitle="Merchant Details → click Edit on any section" />
        <HotspotImage screenshot={{ key: 'edit_merchant_billing_status', label: 'Edit Merchant — Billing, Features & Status', pins: [
          { id: 'eb1', x: '18%', y: '19%', label: 1, title: 'Billing Information', description: 'Update bank account, routing/ABA, holder type, account type.', tip: 'Click Save to apply' },
          { id: 'eb2', x: '18%', y: '47%', label: 2, title: 'Advanced Features', description: 'Optional feature checkboxes. Ticked = active for this merchant.', tip: 'Scroll to see all' },
          { id: 'eb3', x: '63%', y: '15%', label: 3, title: 'Merchant Users', description: 'Click Reset Password to send a reset email from your portal directly.', tip: 'Send reset from here' },
          { id: 'eb4', x: '63%', y: '38%', label: 4, title: 'Status Definitions', description: 'Active = full. Restricted = no processing. Closed = no login. Deleted = removed from reports.', tip: 'Use Closed not Deleted' },
          { id: 'eb5', x: '63%', y: '56%', label: 5, title: 'Select a Status', description: 'Dropdown to change status. Takes effect immediately — no confirmation, no undo.', tip: 'Immediate effect' },
          { id: 'eb6', x: '63%', y: '80%', label: 6, title: 'Status History', description: 'Full audit log — who changed it, when, and from what status to what.', tip: 'Full audit trail' },
        ]}} />
        <HotspotImage screenshot={{ key: 'edit_merchant_advanced_features', label: 'Advanced Features', pins: [
          { id: 'ea1', x: '15%', y: '46%', label: 1, title: '✅ Surcharge & Convenience Fees', description: 'Active. Merchant can add surcharges on transactions — configured in their portal.', tip: 'Currently active' },
          { id: 'ea2', x: '15%', y: '55%', label: 2, title: '✅ Miscellaneous Fees', description: 'Active. Merchant can configure custom fee types on transactions.', tip: 'Currently active' },
          { id: 'ea3', x: '15%', y: '65%', label: 3, title: 'Tips in Virtual Terminal', description: 'Adds tip entry on keyed transactions. Good for restaurants.', tip: 'Not enabled' },
          { id: 'ea4', x: '15%', y: '73%', label: 4, title: 'Daily Batch Reports', description: 'Sends merchant a batch summary email daily at 5AM UTC.', tip: 'Not enabled' },
          { id: 'ea5', x: '15%', y: '83%', label: 5, title: '✅ QuickClick Inline Stylesheets', description: 'Active. Inline CSS in QuickClick forms. Merchant takes PCI DSS responsibility.', tip: 'Currently active' },
        ]}} />
      </section>

      <section ref={ref('s7')} className="mb-12 scroll-mt-4">
        <SectionHeader number={7} title="Merchant Status" subtitle="Controls access and billing" />
        <div className="overflow-x-auto rounded-xl mb-4" style={{ border: '1px solid hsl(var(--border))' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid hsl(var(--border))', background: BG3 }}>
                {['Status', 'Merchant can', 'You can', 'Billed?'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-black text-muted-foreground uppercase tracking-wider text-[9px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { s: 'ACTIVE',     m: 'Process, view everything', y: 'Full access', b: 'Yes' },
                { s: 'RESTRICTED', m: 'Login, reports — no processing', y: 'Full access', b: 'If active services' },
                { s: 'CLOSED',     m: 'Nothing — no login', y: 'Reporting & voids only', b: 'No' },
                { s: 'DELETED',    m: 'Nothing — removed from reports', y: 'Commission reports only', b: 'No' },
              ].map(({ s, m, y, b }, i, a) => (
                <tr key={s} className="hover:bg-white/[0.025] transition-colors"
                  style={{ borderBottom: i < a.length - 1 ? '1px solid hsl(var(--border)/0.5)' : 'none' }}>
                  <td className="px-3 py-2.5"><StatusPill status={s} /></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{y}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Note variant="warning"><strong>Always use Closed, not Deleted</strong> for merchants with transaction history. Deleted removes them from reports and is very difficult to reverse.</Note>
      </section>

      <section ref={ref('s8')} className="mb-12 scroll-mt-4">
        <SectionHeader number={8} title="Processing Services" subtitle="Merchant Details → Processing Services" />
        <HotspotImage screenshot={{ key: 'processing_services_vas', label: 'Processing Services & VAS', pins: [
          { id: 'ps1', x: '8%', y: '6%', label: 1, title: 'Processing Services', description: 'Credit Card, eCheck (ACH), Cash — one row per payment type.', tip: 'One row per type' },
          { id: 'ps2', x: '86%', y: '6%', label: 2, title: 'Add Processor', description: "Enter credentials from the merchant's VAR sheet. Select account classification.", tip: 'Requires VAR sheet' },
          { id: 'ps3', x: '75%', y: '14%', label: 3, title: 'Billing Action', description: 'Update the billing bank account for this specific processor.', tip: 'Per-processor billing' },
          { id: 'ps4', x: '75%', y: '22%', label: 4, title: 'Edit / Disable', description: 'Edit modifies credentials. Disable deactivates without deleting.', tip: 'Disable keeps record' },
          { id: 'ps5', x: '8%', y: '39%', label: 5, title: 'Value-Added Services', description: 'Active = on. Offered = available, not yet enabled. Not Offered = unavailable.', tip: 'Active / Offered / Not Offered' },
          { id: 'ps6', x: '86%', y: '39%', label: 6, title: 'Update Services', description: 'Opens the full VAS selection page. Always click Submit — nothing saves until you do.', tip: 'Opens VAS page' },
        ]}} />
      </section>

      <section ref={ref('s9')} className="mb-12 scroll-mt-4">
        <SectionHeader number={9} title="Value-Added Services" subtitle="Merchant Details → Update Services" />
        <Note>Always click <strong>Submit</strong> at the bottom — no changes are saved until you do. There are no partial saves.</Note>
        <HotspotImage screenshot={{ key: 'value_added_services_select', label: 'Select Value-Added Services', pins: [
          { id: 'vs1', x: '50%', y: '13%', label: 1, title: 'Authvia TXT2PAY®', description: 'Send payment request links via SMS. Free trial available.', tip: 'Free trial available' },
          { id: 'vs2', x: '50%', y: '23%', label: 2, title: 'Automatic Card Updater', description: 'Auto-updates stored cards when banks reissue them.', tip: 'Runs automatically' },
          { id: 'vs3', x: '50%', y: '33%', label: 3, title: 'Customer Token Vault', description: 'Network-token upgrade of Customer Vault — better auth rates.', tip: 'Better than standard vault' },
          { id: 'vs4', x: '50%', y: '43%', label: 4, title: 'Customer Vault', description: 'Stores payment data for recurring billing. Status: Active.', tip: 'Required for recurring' },
          { id: 'vs5', x: '50%', y: '53%', label: 5, title: 'Fraud Prevention', description: 'Rule-based fraud screening on all transactions. Highly recommended.', tip: 'Always recommend' },
          { id: 'vs6', x: '50%', y: '63%', label: 6, title: 'Invoicing', description: 'Digital invoices — customers pay via hosted link. Free trial available.', tip: 'Free trial available' },
          { id: 'vs7', x: '15%', y: '88%', label: 7, title: 'Submit Button', description: 'Nothing saves until you click Submit. All changes applied together.', tip: '⚠️ Must click to save' },
        ]}} />
      </section>

      <section ref={ref('s-bulk')} className="mb-12 scroll-mt-4">
        <SectionHeader number={19} title="Bulk Actions" subtitle="List Accounts → Update Multiple Accounts" accent />
        <HotspotImage screenshot={{ key: 'bulk_actions', label: 'Bulk Actions', pins: [
          { id: 'ba1', x: '25%', y: '55%', label: 1, title: 'Mass Enable Services', description: 'Enable one service across multiple merchants in a single operation.', tip: 'One service per operation' },
          { id: 'ba2', x: '75%', y: '55%', label: 2, title: 'Update Fee Schedules', description: 'Apply fee schedule changes to multiple merchants simultaneously.', tip: 'Review before confirming' },
        ]}} />
        <HotspotImage screenshot={{ key: 'mass_enable_services', label: 'Mass Enable Value-Added Services', pins: [
          { id: 'me1', x: '44%', y: '22%', label: 1, title: 'Service Dropdown', description: 'Select the service to enable. Run separate operations for multiple services.', tip: 'One at a time' },
          { id: 'me2', x: '44%', y: '48%', label: 2, title: 'Account Selection', description: 'Check merchants or select all. Submit applies immediately — no undo.', tip: '⚠️ No undo' },
        ]}} />
        <HotspotImage screenshot={{ key: 'bulk_update_fee_schedules', label: 'Bulk Update Fee Schedules', pins: [
          { id: 'bf1', x: '20%', y: '25%', label: 1, title: 'Select Fee Schedules', description: 'Choose schedules to apply. Use arrows to set priority order.', tip: 'Reorder with arrows' },
          { id: 'bf2', x: '20%', y: '60%', label: 2, title: 'Select Accounts', description: 'Only accounts with custom fee schedules appear.', tip: 'Custom-fee accounts only' },
          { id: 'bf3', x: '18%', y: '82%', label: 3, title: 'Continue to Pricing', description: 'Review all proposed changes before they apply.', tip: 'Review then confirm' },
        ]}} />
      </section>

      {/* Placeholder sections */}
      {[
        { id: 's10', n: 10, title: 'VAMP Guidance', sub: 'Marketplace → VAMP Guidance', url: '/partners/vamp-guidance', desc: "Two sections: Preventing Fraud and Managing Chargebacks. Covers Visa's monitoring thresholds." },
        { id: 's11', n: 11, title: 'Transactions', sub: 'Reports → Transactions', url: '/partners/transactions', desc: 'Transaction Snapshot (portfolio overview) and Search Transactions (granular filter by date, amount, status).' },
        { id: 's12', n: 12, title: 'Commissions', sub: 'Reports → Commissions', url: '/partners/commission_reports', desc: 'Select a month to view earnings. Issued the 22nd for the following month. Discrepancies: call NMI with your Affiliate ID.' },
        { id: 's13', n: 13, title: 'Billing', sub: 'Reports → Billing', url: '/partners/billing_reports', desc: "Date range selector. Debits appear on statements as 'GATEWAY SERVICES — CO ID 4460522024'." },
        { id: 's16', n: 16, title: 'Service Prices', sub: 'Services → Service Prices', url: '/partners/fee_schedules', desc: 'Two tiles: Cost Schedule (your NMI buy rates) and Fee Schedule Manager (schedules applied to merchants).' },
        { id: 's21', n: 21, title: 'Account Information', sub: 'Settings → Account Information', url: '/partners/settings/account_information', desc: 'Contact types: Billing, Support, Emergency, Marketing, Risk. Each receives different automated emails.' },
        { id: 's22', n: 22, title: 'Look & Feel', sub: 'Settings → Look and Feel', url: '/partners/settings/look_and_feel', desc: 'Colour, logo, icon, header image. Full white-labelling — the portal feels like your own product.' },
        { id: 's26', n: 26, title: 'Users', sub: 'Settings → Users and Access', url: '/partners/settings/users', desc: 'Usernames, full names, permission codes. Create sub-users with restricted access per function.' },
        { id: 's29', n: 29, title: 'Two-Factor Auth', sub: 'Settings → Two-Factor Auth', url: '/partners/two_factor_authentication', desc: 'QR code for Google Authenticator or Authy. Required for all accounts since October 2025.' },
        { id: 's31', n: 31, title: 'Contact Support', sub: 'Help → Documentation & Support', url: '/partners/documentation', desc: 'support@nmi.com · 1 (847) 352-4850 · Always include the merchant Gateway ID and your Affiliate ID.' },
      ].map(({ id, n, title, sub, url, desc }) => (
        <section key={id} ref={ref(id)} className="mb-12 scroll-mt-4">
          <SectionHeader number={n} title={title} subtitle={sub} url={url} />
          <PlaceholderCard name={title} url={url} description={desc} />
        </section>
      ))}

      {/* Screenshots priority list */}
      <section ref={ref('screenshots-needed')} className="mb-12 scroll-mt-4">
        <SectionHeader number={0} title="Priority Screenshots" subtitle="20 pages still need screenshots — ranked by training value" />
        {[
          { label: 'Priority 1 — Capture First', col: 'hsl(var(--destructive))', border: 'hsl(var(--destructive)/0.3)', bg: 'hsl(var(--destructive)/0.07)', items: [
            { n: 1, title: 'Transaction Reports', url: '/partners/transactions' },
            { n: 2, title: 'Commission Report', url: '/partners/commission_reports' },
            { n: 3, title: 'Service Prices Overview', url: '/partners/fee_schedules' },
            { n: 4, title: 'Fee Schedule Manager + Edit', url: '/partners/fee_schedules/list' },
            { n: 5, title: 'Users Page', url: '/partners/settings/users' },
          ]},
          { label: 'Priority 2 — High Value', col: 'hsl(var(--warning))', border: 'hsl(var(--warning)/0.3)', bg: 'hsl(var(--warning)/0.07)', items: [
            { n: 6, title: 'Account Information', url: '/partners/settings/account_information' },
            { n: 7, title: 'Look & Feel Settings', url: '/partners/settings/look_and_feel' },
            { n: 8, title: 'Security Keys', url: '/partners/settings/security_keys' },
            { n: 9, title: 'Two-Factor Auth Setup', url: '/partners/two_factor_authentication' },
            { n: 10, title: 'VAMP Guidance', url: '/partners/vamp-guidance' },
          ]},
        ].map(({ label, col, border, bg, items }) => (
          <div key={label} className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: col }}>{label}</p>
            <div className="space-y-1.5">
              {items.map(({ n, title, url }) => (
                <div key={n} className="flex items-center gap-3 p-2.5 rounded-lg transition-colors hover:bg-white/[0.02]"
                  style={{ border: `1px solid ${border}`, background: bg }}>
                  <span className="w-6 h-6 shrink-0 rounded flex items-center justify-center text-[10px] font-black"
                    style={{ background: bg, border: `1px solid ${border}`, color: col }}>{n}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{title}</p>
                    <code className="text-[10px] font-mono opacity-70" style={{ color: col }}>{url}</code>
                  </div>
                  <Camera className="h-3 w-3 shrink-0 opacity-40" style={{ color: col }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// WALKTHROUGH PANE
// ─────────────────────────────────────────────────────────────────
const WalkthroughPane = () => {
  const [activeWT, setActiveWT] = useState<Walkthrough | null>(null);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());

  const wt = activeWT;
  const s = wt?.steps[step];
  const total = wt?.steps.length ?? 0;
  const img = s ? SCREENSHOTS[s.imageKey as keyof typeof SCREENSHOTS] : undefined;

  const start = (w: Walkthrough) => { setActiveWT(w); setStep(0); };
  const finish = () => { if (wt) setDone(p => new Set([...p, wt.id])); setActiveWT(null); };

  return (
    <div className="p-5 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-black tracking-tight mb-1">Guided Task Walkthroughs</h2>
        <p className="text-sm text-muted-foreground">Step-by-step with highlighted screenshots showing exactly where to click</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {WALKTHROUGHS.map(w => {
          const isDone = done.has(w.id);
          const isActive = activeWT?.id === w.id;
          return (
            <motion.button key={w.id} onClick={() => start(w)} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
              className="text-left p-4 rounded-xl transition-all relative overflow-hidden"
              style={{
                border: isActive ? `1px solid ${G}` : isDone ? '1px solid hsl(var(--success)/0.4)' : '1px solid hsl(var(--border))',
                background: isActive ? GD : isDone ? 'hsl(var(--success)/0.07)' : BG2,
                boxShadow: isActive ? `0 0 24px ${GD}` : 'none',
              }}>
              {isDone && <CheckCircle2 className="absolute top-3 right-3 h-4 w-4" style={{ color: 'hsl(var(--success))' }} />}
              <span className="text-2xl block mb-2">{w.icon}</span>
              <p className="text-sm font-black mb-1 pr-5">{w.title}</p>
              <p className="text-xs text-muted-foreground leading-snug mb-3">{w.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono" style={{ color: G }}>{w.steps.length} steps</span>
                <Play className="h-3 w-3 opacity-60" style={{ color: G }} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {wt && s && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }} className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${GB}`, boxShadow: `0 4px 40px rgba(0,0,0,0.5)` }}>

            {/* Progress bar */}
            <div className="h-0.5 w-full" style={{ background: 'hsl(var(--border))' }}>
              <motion.div className="h-full" style={{ background: G }}
                animate={{ width: `${((step + 1) / total) * 100}%` }} transition={{ duration: 0.3 }} />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3.5" style={{ background: BG3, borderBottom: '1px solid hsl(var(--border))' }}>
              <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-sm font-black"
                style={{ background: GD, border: `1px solid ${GB}`, color: G }}>{step + 1}</div>
              <div className="flex-1">
                <h3 className="font-black text-sm">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.subtitle}</p>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground">{step + 1} / {total}</span>
            </div>

            {/* Body */}
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* Instructions */}
              <div className="p-5 overflow-y-auto max-h-[420px]" style={{ borderRight: '1px solid hsl(var(--border))' }}>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{s.text}</p>
                <div>
                  {s.actions.map((action, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      className="flex gap-2.5 text-xs text-muted-foreground py-2"
                      style={{ borderBottom: i < s.actions.length - 1 ? '1px solid hsl(var(--border)/0.4)' : 'none' }}>
                      <span className="w-4 h-4 shrink-0 rounded flex items-center justify-center text-[9px] font-black mt-0.5"
                        style={{ background: GD, color: G, border: `1px solid ${GB}` }}>{i + 1}</span>
                      <span className="leading-relaxed">{action}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg text-xs leading-relaxed" style={{ background: GD, border: `1px solid ${GB}` }}>
                  <span className="font-bold" style={{ color: G }}>💡 </span>
                  <span className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: s.tip }} />
                </div>
              </div>

              {/* Screenshot with highlight */}
              <div className="p-4" style={{ background: BG3 }}>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40 mb-2">
                  {s.imageKey.replace(/_/g, ' ')}
                </p>
                <div className="rounded-lg overflow-hidden relative" style={{ border: '1px solid hsl(var(--border))' }}>
                  {img ? (
                    <>
                      <img src={img} alt={s.title} className="w-full block" draggable={false} />
                      <motion.div key={`${step}-hl`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute pointer-events-none"
                        style={{
                          top: s.highlight.top, left: s.highlight.left,
                          width: s.highlight.width, height: s.highlight.height,
                          border: `2px solid ${G}`, borderRadius: 3,
                          boxShadow: `0 0 0 2000px rgba(0,0,0,0.55), 0 0 16px rgba(92,221,173,0.4)`,
                        }}>
                        <span className="absolute font-black font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ bottom: 'calc(100% + 4px)', left: 0, background: G, color: '#0a1a14', fontSize: 9 }}>
                          {s.highlight.label}
                        </span>
                      </motion.div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-20" style={{ background: BG3 }}>
                      <Camera className="h-8 w-8 opacity-15" style={{ color: G }} />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid hsl(var(--border))', background: BG3 }}>
              <Button variant="outline" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex gap-1.5 items-center">
                {Array.from({ length: total }).map((_, i) => (
                  <button key={i} onClick={() => setStep(i)} className="rounded-full transition-all"
                    style={{ width: i === step ? 18 : 6, height: 6, background: i === step ? G : i < step ? G + '55' : 'hsl(var(--border))' }} />
                ))}
              </div>
              <Button size="sm" onClick={() => step < total - 1 ? setStep(step + 1) : finish()}
                className="font-bold hover:opacity-90"
                style={{ background: G, color: '#0a1a14', border: 'none' }}>
                {step < total - 1 ? (<>Next <ChevronRight className="h-4 w-4 ml-1" /></>) : (<><CheckCircle2 className="h-4 w-4 mr-1" /> Complete</>)}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────
const NMIGuide: React.FC = () => {
  const contentViewportRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<GuideMode>('reference');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [activeId, setActiveId] = useState('welcome');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_INDEX.filter(e => e.title.toLowerCase().includes(q) || e.keywords.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const go = useCallback((id: string) => {
    setMode('reference');
    setScrollTarget(id);
    setActiveId(id);
    setQuery('');
    setSearchOpen(false);
    setTimeout(() => setScrollTarget(null), 600);
  }, []);

  const navClick = (id: string) => {
    setActiveId(id);
    setScrollTarget(id);
    setTimeout(() => setScrollTarget(null), 600);
  };

  const NAV = [
    { label: 'My Accounts', items: [
      { label: 'Overview', id: 'welcome' },
      { label: 'Dashboard', id: 's1' },
      { label: 'List Accounts', id: 's2' },
      { label: 'Add Merchant', id: 's3' },
    ]},
    { label: 'Merchant Setup', items: [
      { label: 'Merchant Details', id: 's5' },
      { label: 'Editing', id: 's6' },
      { label: 'Status', id: 's7' },
      { label: 'Processing Services', id: 's8' },
      { label: 'Value-Added Services', id: 's9' },
    ]},
    { label: 'Marketplace', items: [
      { label: 'VAMP Guidance', id: 's10', ph: true },
    ]},
    { label: 'Reports', items: [
      { label: 'Transactions', id: 's11', ph: true },
      { label: 'Commissions', id: 's12', ph: true },
      { label: 'Billing', id: 's13', ph: true },
    ]},
    { label: 'Services', items: [
      { label: 'Service Prices', id: 's16', ph: true },
      { label: 'Bulk Actions', id: 's-bulk' },
    ]},
    { label: 'Settings', items: [
      { label: 'Account Information', id: 's21', ph: true },
      { label: 'Look & Feel', id: 's22', ph: true },
      { label: 'Users', id: 's26', ph: true },
      { label: 'Two-Factor Auth', id: 's29', ph: true },
    ]},
    { label: 'Help', items: [
      { label: 'Contact Support', id: 's31', ph: true },
      { label: '📷 Screenshots', id: 'screenshots-needed' },
    ]},
  ];

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background/80 dark:bg-transparent">
      {/* ── SIDEBAR ── */}
      <aside className="w-48 shrink-0 flex flex-col overflow-hidden" style={{
        background: BG, borderRight: '1px solid hsl(var(--border))',
      }}>
        {/* Mode toggle */}
        <div className="p-2 shrink-0" style={{ borderBottom: '1px solid hsl(var(--border))' }}>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg" style={{ background: BG3 }}>
            {(['reference', 'walkthroughs'] as GuideMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="relative py-1.5 text-[11px] font-bold rounded-md transition-all"
                style={{ color: mode === m ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                {mode === m && (
                  <motion.div layoutId="modepill" className="absolute inset-0 rounded-md"
                    style={{ background: BG2 }} transition={{ duration: 0.18 }} />
                )}
                <span className="relative z-10">{m === 'reference' ? '📖 Ref' : '🎯 Tasks'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Nav items */}
        <ScrollArea className="flex-1">
          {mode === 'reference' ? (
            <nav className="py-2 px-1">
              {NAV.map(({ label, items }) => (
                <div key={label} className="mb-1">
                  <p className="px-2 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em]"
                    style={{ color: 'hsl(var(--muted-foreground)/0.45)' }}>{label}</p>
                  {items.map(({ label: l, id, ph }: any) => (
                    <button key={id} onClick={() => navClick(id)}
                      className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 text-xs rounded-md transition-colors relative"
                      style={{
                        color: activeId === id ? G : 'hsl(var(--muted-foreground))',
                        background: activeId === id ? GD : 'transparent',
                      }}>
                      {activeId === id && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full" style={{ background: G }} />}
                      <span className="flex-1 pl-1">{l}</span>
                      {ph && <Camera className="h-2.5 w-2.5 opacity-25 shrink-0" />}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          ) : (
            <nav className="py-2 px-1">
              <p className="px-2 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.14em]"
                style={{ color: 'hsl(var(--muted-foreground)/0.45)' }}>Walkthroughs</p>
              {WALKTHROUGHS.map(w => (
                <button key={w.id} className="flex items-start gap-2 w-full text-left px-2 py-2 text-xs rounded-md hover:bg-white/5 transition-colors">
                  <span className="shrink-0 text-base leading-none mt-0.5">{w.icon}</span>
                  <span className="text-muted-foreground leading-snug">{w.title}</span>
                </button>
              ))}
            </nav>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 shrink-0" style={{ borderTop: '1px solid hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black"
              style={{ background: P, color: G }}>N</div>
            <div>
              <p className="text-[9px] font-black text-muted-foreground">NMI Partner Portal</p>
              <p className="text-[8px] text-muted-foreground/40 font-mono">March 2026</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Topbar */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{
          background: BG2, borderBottom: '1px solid hsl(var(--border))',
        }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/50">Portal Guide</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
            <span className="text-xs font-semibold" style={{ color: G }}>
              {mode === 'reference' ? 'Reference' : 'Walkthroughs'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{ background: GD, color: G, border: `1px solid ${GB}` }}>
              34 pages
            </span>
          </div>

          {/* Search */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
              style={{ background: BG3, border: '1px solid hsl(var(--border))' }}>
              <Search className="h-3 w-3 text-muted-foreground/50" />
              <input value={query}
                onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
                placeholder="Search 34 pages…"
                className="text-xs bg-transparent outline-none w-40 text-foreground placeholder:text-muted-foreground/35" />
              {query && <button onClick={() => setQuery('')} className="text-muted-foreground/40 hover:text-muted-foreground"><X className="h-3 w-3" /></button>}
            </div>

            <AnimatePresence>
              {searchOpen && results.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.97 }} transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-1.5 w-72 rounded-xl overflow-hidden z-50"
                  style={{ background: BG, border: `1px solid ${GB}`, boxShadow: `0 16px 48px rgba(0,0,0,0.65)` }}>
                  {results.map((e, i) => (
                    <button key={e.sectionId} onClick={() => go(e.sectionId)}
                      className="flex flex-col w-full text-left px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
                      style={{ borderBottom: i < results.length - 1 ? '1px solid hsl(var(--border)/0.5)' : 'none' }}>
                      <span className="text-xs font-bold">{e.title}</span>
                      <span className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {e.keywords.split(' ').slice(0, 6).join(', ')}…
                      </span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1" viewportRef={contentViewportRef}>
          {mode === 'reference' ? <ReferenceContent scrollTo={scrollTarget} viewportRef={contentViewportRef} /> : <WalkthroughPane />}
        </ScrollArea>
      </div>
    </div>
  );
};

export default NMIGuide;
