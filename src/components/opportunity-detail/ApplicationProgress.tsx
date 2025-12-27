import { useMemo } from "react";
import { Opportunity } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ApplicationProgressProps {
  opportunity: Opportunity;
  wizardState: {
    progress: number;
    step_index: number;
    form_state: Record<string, unknown>;
    updated_at?: string;
  } | null;
}

type SectionStatus = "complete" | "partial" | "empty";

interface Section {
  key: string;
  label: string;
  fields: string[];
  owner: "Merchant" | "Internal";
}

const SECTIONS: Section[] = [
  {
    key: "business",
    label: "Business Profile",
    fields: ["dbaName", "products", "natureOfBusiness", "dbaContactFirst", "dbaContactLast", "dbaPhone", "dbaEmail", "dbaAddress", "dbaCity", "dbaState", "dbaZip"],
    owner: "Merchant",
  },
  {
    key: "legal",
    label: "Legal Info",
    fields: ["legalEntityName", "legalPhone", "legalEmail", "tin", "ownershipType", "formationDate", "stateIncorporated", "legalAddress", "legalCity", "legalState", "legalZip"],
    owner: "Merchant",
  },
  {
    key: "processing",
    label: "Processing",
    fields: ["monthlyVolume", "avgTicket", "highTicket", "swipedPct", "keyedPct", "motoPct", "ecomPct", "b2cPct", "b2bPct"],
    owner: "Merchant",
  },
  {
    key: "documents",
    label: "Documents",
    fields: ["documents"],
    owner: "Merchant",
  },
];

const isFieldComplete = (formState: Record<string, unknown>, field: string): boolean => {
  const value = formState[field];
  if (field === "documents") {
    return Array.isArray(value) && value.length > 0;
  }
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
};

const getSectionStatus = (formState: Record<string, unknown>, fields: string[]): { status: SectionStatus; completed: number; total: number } => {
  const completed = fields.filter((field) => isFieldComplete(formState, field)).length;
  const total = fields.length;
  
  if (completed === 0) return { status: "empty", completed, total };
  if (completed === total) return { status: "complete", completed, total };
  return { status: "partial", completed, total };
};

const STATUS_ICON: Record<SectionStatus, React.ReactNode> = {
  complete: <Check className="h-4 w-4 text-emerald-500" />,
  partial: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  empty: <X className="h-4 w-4 text-destructive" />,
};

export const ApplicationProgress = ({ opportunity, wizardState }: ApplicationProgressProps) => {
  const formState = useMemo(
    () => (wizardState?.form_state as Record<string, unknown>) ?? {},
    [wizardState?.form_state]
  );

  const sectionProgress = useMemo(() => {
    return SECTIONS.map((section) => ({
      ...section,
      ...getSectionStatus(formState, section.fields),
    }));
  }, [formState]);

  const overallProgress = wizardState?.progress ?? 0;
  const lastUpdated = wizardState?.updated_at 
    ? formatDistanceToNow(new Date(wizardState.updated_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Application Progress
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          asChild
        >
          <a
            href={`/tools/preboarding-wizard?opportunityId=${opportunity.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Open Wizard
          </a>
        </Button>
      </div>

      {/* Overall progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{overallProgress}% Complete</span>
          {lastUpdated && (
            <span className="text-muted-foreground">Updated {lastUpdated}</span>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              overallProgress >= 100 ? "bg-emerald-500" :
              overallProgress >= 50 ? "bg-amber-500" : "bg-destructive"
            )}
            style={{ width: `${Math.min(overallProgress, 100)}%` }}
          />
        </div>
      </div>

      {/* Section breakdown */}
      <div className="grid gap-2">
        {sectionProgress.map((section) => (
          <div
            key={section.key}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border",
              section.status === "complete" && "bg-emerald-500/5 border-emerald-500/20",
              section.status === "partial" && "bg-amber-500/5 border-amber-500/20",
              section.status === "empty" && "bg-destructive/5 border-destructive/20"
            )}
          >
            <div className="flex items-center gap-3">
              {STATUS_ICON[section.status]}
              <div>
                <p className="text-sm font-medium">{section.label}</p>
                <p className="text-xs text-muted-foreground">
                  {section.completed}/{section.total} fields • Owner: {section.owner}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
