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

// Map of snake_case field → legacy camelCase aliases
const FIELD_ALIASES: Record<string, string[]> = {
  dba_name: ["dbaName"],
  product_description: ["products"],
  nature_of_business: ["natureOfBusiness"],
  dba_contact_first_name: ["dbaContactFirst"],
  dba_contact_last_name: ["dbaContactLast"],
  dba_contact_phone: ["dbaPhone"],
  dba_contact_email: ["dbaEmail"],
  dba_address_line1: ["dbaAddress"],
  dba_city: ["dbaCity"],
  dba_state: ["dbaState"],
  dba_zip: ["dbaZip"],
  legal_entity_name: ["legalEntityName"],
  federal_tax_id: ["tin"],
  ownership_type: ["ownershipType"],
  business_formation_date: ["formationDate"],
  state_incorporated: ["stateIncorporated"],
  legal_address_line1: ["legalAddress"],
  legal_city: ["legalCity"],
  legal_state: ["legalState"],
  legal_zip: ["legalZip"],
  monthly_volume: ["monthlyVolume"],
  average_transaction: ["avgTicket"],
  high_ticket: ["highTicket"],
  percent_swiped: ["swipedPct"],
  percent_keyed: ["keyedPct"],
  percent_moto: ["motoPct"],
  percent_ecommerce: ["ecomPct"],
  percent_b2c: ["b2cPct"],
  percent_b2b: ["b2bPct"],
  username: ["username"],
  current_processor: ["current_processor"],
};

// Processing sections – full application
const PROCESSING_SECTIONS: Section[] = [
  {
    key: "business",
    label: "Business Profile",
    fields: [
      "dba_name", "product_description", "nature_of_business",
      "dba_contact_first_name", "dba_contact_last_name",
      "dba_contact_phone", "dba_contact_email",
      "dba_address_line1", "dba_city", "dba_state", "dba_zip",
    ],
    owner: "Merchant",
  },
  {
    key: "legal",
    label: "Legal Info",
    fields: [
      "legal_entity_name", "federal_tax_id", "ownership_type",
      "business_formation_date", "state_incorporated",
      "legal_address_line1", "legal_city", "legal_state", "legal_zip",
    ],
    owner: "Merchant",
  },
  {
    key: "processing",
    label: "Processing",
    fields: [
      "monthly_volume", "average_transaction", "high_ticket",
      "percent_swiped", "percent_keyed", "percent_moto", "percent_ecommerce",
      "percent_b2c", "percent_b2b",
    ],
    owner: "Merchant",
  },
  {
    key: "documents",
    label: "Documents",
    fields: ["documents"],
    owner: "Merchant",
  },
];

// Gateway Only sections – simplified requirements
const GATEWAY_SECTIONS: Section[] = [
  {
    key: "gateway_business",
    label: "Business Details",
    fields: [
      "dba_name", "dba_contact_first_name", "dba_contact_last_name",
      "dba_contact_phone", "dba_contact_email",
      "dba_address_line1", "dba_city", "dba_state", "dba_zip",
      "username", "current_processor",
    ],
    owner: "Merchant",
  },
];

const isFieldComplete = (formState: Record<string, unknown>, field: string): boolean => {
  // Check the canonical snake_case key first, then fall back to legacy camelCase aliases
  const keysToCheck = [field, ...(FIELD_ALIASES[field] ?? [])];
  for (const key of keysToCheck) {
    const value = formState[key];
    if (field === "documents" || key === "documents") {
      if (Array.isArray(value) && value.length > 0) return true;
      continue;
    }
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim().length > 0) return true;
    if (typeof value !== "string" && Boolean(value)) return true;
  }
  return false;
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
  const isGatewayOnly = opportunity.service_type === "gateway_only";

  const formState = useMemo(
    () => (wizardState?.form_state as Record<string, unknown>) ?? {},
    [wizardState?.form_state]
  );

  const sections = isGatewayOnly ? GATEWAY_SECTIONS : PROCESSING_SECTIONS;

  const sectionProgress = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      ...getSectionStatus(formState, section.fields),
    }));
  }, [formState, sections]);

  // Recalculate overall progress based on the relevant sections
  const overallProgress = useMemo(() => {
    const allFields = sections.flatMap(s => s.fields);
    const total = allFields.length;
    if (total === 0) return 0;
    const completed = allFields.filter(f => isFieldComplete(formState, f)).length;
    return Math.round((completed / total) * 100);
  }, [formState, sections]);

  const lastUpdated = wizardState?.updated_at 
    ? formatDistanceToNow(new Date(wizardState.updated_at), { addSuffix: true })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Application Progress {isGatewayOnly && <span className="text-xs ml-1">(Gateway Only)</span>}
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
