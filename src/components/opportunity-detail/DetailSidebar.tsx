import { cn } from "@/lib/utils";
import { Opportunity, Account, Contact, getServiceType } from "@/types/opportunity";
import { ClipboardList, Wand2, MessageSquare, FileText, Building2, Phone, Mail, Globe, DollarSign } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ClickToCall } from "@/components/ClickToCall";

interface WizardSectionProgress {
  key: string;
  label: string;
  percent: number;
  completed: number;
  total: number;
  done: boolean;
}

interface DetailSidebarProps {
  opportunity: Opportunity;
  resolvedAccount?: Account;
  resolvedContact?: Contact;
  wizardSectionProgress: WizardSectionProgress[];
  activeSection: string;
  onSelect: (id: string) => void;
  isGatewayCard: boolean;
}

const NAV_ITEMS = [
  { id: "overview", icon: ClipboardList, label: "Overview" },
  { id: "underwriting", icon: Wand2, label: "UW Review", processingOnly: true },
  { id: "notes", icon: MessageSquare, label: "Notes" },
  { id: "documents", icon: FileText, label: "Documents" },
  { id: "details", icon: Building2, label: "Details" },
];

const wizardBarColor = (pct: number) => {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 10) return "bg-amber-500";
  return "bg-destructive";
};

export const DetailSidebar = ({
  opportunity,
  resolvedAccount,
  resolvedContact,
  wizardSectionProgress,
  activeSection,
  onSelect,
  isGatewayCard,
}: DetailSidebarProps) => {
  const contactName = [resolvedContact?.first_name, resolvedContact?.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="w-[260px] border-r border-border bg-background flex flex-col flex-shrink-0 overflow-y-auto deal-sans">
      {/* Quick Info Card */}
      <div className="p-4 border-b border-border space-y-3">
        <div>
          <p className="deal-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">Company</p>
          <p className="text-sm font-semibold truncate">{resolvedAccount?.name || "—"}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contactName}</span>
          </div>
          {resolvedContact?.phone && (
            <div className="flex items-center gap-2 text-xs">
              <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <ClickToCall phoneNumber={resolvedContact.phone} size="sm" variant="ghost" className="h-auto p-0 text-xs text-primary hover:underline" />
            </div>
          )}
          {resolvedContact?.email && (
            <div className="flex items-center gap-2 text-xs">
              <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a href={`mailto:${resolvedContact.email}`} className="text-primary hover:underline truncate">
                {resolvedContact.email}
              </a>
            </div>
          )}
          {resolvedAccount?.website && (
            <div className="flex items-center gap-2 text-xs">
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <a
                href={resolvedAccount.website.startsWith("http") ? resolvedAccount.website : `https://${resolvedAccount.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate"
              >
                {resolvedAccount.website}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Section Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {NAV_ITEMS.filter((item) => !item.processingOnly || !isGatewayCard).map((item) => {
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-all duration-150 border-l-2",
                isActive
                  ? "border-primary text-foreground font-semibold bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="deal-mono text-[11px] uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Wizard Progress */}
      {wizardSectionProgress.length > 0 && (
        <div className="p-4 border-t border-border space-y-3">
          <p className="deal-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-medium">Wizard Progress</p>
          {wizardSectionProgress.map((section) => (
            <div key={section.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="deal-mono text-[11px] uppercase tracking-wider text-muted-foreground">{section.label}</span>
                <span className={cn(
                  "deal-mono text-[10px] font-bold",
                  section.percent >= 100 ? "text-emerald-500" : section.percent >= 10 ? "text-amber-500" : "text-destructive"
                )}>
                  {section.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full transition-all duration-500", wizardBarColor(section.percent))}
                  style={{ width: `${section.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
