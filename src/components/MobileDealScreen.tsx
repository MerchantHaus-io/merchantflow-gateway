import { ArrowLeft, ArrowRightLeft, FileText, Mail, Phone } from "lucide-react";
import { Opportunity, OpportunityStage, STAGE_CONFIG, getServiceType } from "@/types/opportunity";
import type { DealAttention } from "@/lib/dealAttention";
import type { DealSignal } from "@/hooks/useDealSignals";
import { cn } from "@/lib/utils";

interface MobileDealScreenProps {
  opportunity: Opportunity;
  attention: DealAttention;
  stage: OpportunityStage;
  value: number;
  signal: DealSignal;
  daysInStage: number;
  onBack: () => void;
  onMove: () => void;
  /** The full record — the desktop detail modal, for everything this screen deliberately omits. */
  onOpenFullRecord: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const toneStyles: Record<string, string> = {
  critical: "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300",
  soon: "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300",
  ready: "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300",
  steady: "bg-muted border-border text-muted-foreground",
};

/**
 * One deal, on a phone: actions first, facts second.
 *
 * A rep opening a deal between meetings wants to do something — ring the
 * contact, move the stage — not read a record. The desktop detail modal is
 * built for the opposite: tabs, a stage Select, a wizard, every field the deal
 * has. Routing a phone tap into it was the mistake this screen corrects; it is
 * still one tap away at the bottom for everything deliberately left out here.
 *
 * The three targets are 52px and labelled. Call and Email are real device
 * handoffs — tel: and mailto: — because the phone is already the tool for
 * those and re-implementing them in the app would be worse.
 */
const MobileDealScreen = ({
  opportunity,
  attention,
  stage,
  value,
  signal,
  daysInStage,
  onBack,
  onMove,
  onOpenFullRecord,
}: MobileDealScreenProps) => {
  const contact = opportunity.contact;
  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ");
  const serviceType = getServiceType(opportunity);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden">
      <header className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-border/50">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Today"
          className="-m-2 p-2 text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-pipeline-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {STAGE_CONFIG[stage]?.label ?? stage} &middot; {serviceType === "gateway_only" ? "GW" : "CC"}
        </span>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6">
        <h1 className="text-[21px] font-bold leading-tight tracking-tight">
          {opportunity.account?.name || "Unknown"}
        </h1>
        <p className="text-[12.5px] text-muted-foreground mt-1">
          {contactName || "No contact"}
          {value > 0 && <> &middot; {formatCurrency(value)}/mo est.</>}
        </p>

        <p
          className={cn(
            "mt-3 rounded-lg border px-3 py-2.5 text-[12.5px] leading-snug",
            toneStyles[attention.tone] ?? toneStyles.steady,
          )}
        >
          {attention.text}
        </p>

        <div className="mt-4 space-y-2">
          {contact?.phone && (
            <a
              href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}
              className="flex items-center gap-3 min-h-[52px] rounded-xl px-3 bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))]"
            >
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-black/15 shrink-0">
                <Phone className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-tight">
                  Call {contact.first_name || "contact"}
                </span>
                <span className="block text-[11px] opacity-70 leading-tight mt-0.5">{contact.phone}</span>
              </span>
            </a>
          )}

          {contact?.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-3 min-h-[52px] rounded-xl px-3 border border-border bg-card"
            >
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))] shrink-0">
                <Mail className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold leading-tight">Email {contact.first_name || "contact"}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {contact.email}
                </span>
              </span>
            </a>
          )}

          <button
            type="button"
            onClick={onMove}
            className="w-full flex items-center gap-3 min-h-[52px] rounded-xl px-3 border border-border bg-card text-left"
          >
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))] shrink-0">
              <ArrowRightLeft className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight">Move stage</span>
              <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">
                Currently {STAGE_CONFIG[stage]?.label ?? stage}
              </span>
            </span>
          </button>
        </div>

        <dl className="mt-5 border-t border-border/50">
          {signal.underwritingScore !== null && (
            <div className="flex items-center justify-between py-2.5 border-b border-border/40 text-[12.5px]">
              <dt className="text-muted-foreground">Underwriting score</dt>
              <dd className="font-pipeline-mono">{Math.round(signal.underwritingScore)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between py-2.5 border-b border-border/40 text-[12.5px]">
            <dt className="text-muted-foreground">In stage</dt>
            <dd className="font-pipeline-mono">{daysInStage}d</dd>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-border/40 text-[12.5px]">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="font-pipeline-mono">{opportunity.assigned_to || "Unassigned"}</dd>
          </div>
          {signal.nextEvent && (
            <div className="flex items-center justify-between py-2.5 border-b border-border/40 text-[12.5px]">
              <dt className="text-muted-foreground">Next meeting</dt>
              <dd className="font-pipeline-mono">
                {new Date(signal.nextEvent.start_time).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>

        <button
          type="button"
          onClick={onOpenFullRecord}
          className="mt-4 w-full flex items-center gap-2 justify-center min-h-[44px] rounded-lg border border-dashed border-border text-[12.5px] text-muted-foreground"
        >
          <FileText className="h-3.5 w-3.5" />
          Open full record
        </button>
      </div>
    </div>
  );
};

export default MobileDealScreen;
