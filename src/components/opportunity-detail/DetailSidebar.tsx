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
    <div className="w-[260px] border-r border-border bg-muted/20 flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Quick Info Card */}
      <div className="p-4 border-b border-border space-y-3">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Company</p>
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
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 relative",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
              )}
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Wizard Progress */}
      {wizardSectionProgress.length > 0 && (
        <div className="p-4 border-t border-border space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Wizard Progress</p>
          {wizardSectionProgress.map((section) => (
            <div key={section.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{section.label}</span>
                <span className={cn(
                  "text-[10px] font-bold",
                  section.percent >= 100 ? "text-emerald-500" : section.percent >= 10 ? "text-amber-500" : "text-destructive"
                )}>
                  {section.percent}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", wizardBarColor(section.percent))}
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
