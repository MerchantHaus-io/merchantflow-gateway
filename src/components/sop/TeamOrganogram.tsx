import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Crown, Shield, HeadphonesIcon, TrendingUp, Link2, Search,
  CheckCircle, FileText, ClipboardCheck, Settings, Zap, Rocket, Trophy,
  Users, ArrowDown, ChevronDown, ChevronRight
} from "lucide-react";
import { STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface TeamMember {
  name: string;
  email: string;
  title: string;
  role: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  stages: { stage: OpportunityStage; role: string }[];
  responsibilities: string[];
}

const TEAM: TeamMember[] = [
  {
    name: "Jamie",
    email: "admin@merchanthaus.io",
    title: "CEO",
    role: "Leadership / Operations / Underwriting",
    icon: <Crown className="h-5 w-5" />,
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    borderColor: "border-amber-500/40",
    stages: [
      { stage: "application_prep", role: "Prepares & reviews application" },
      { stage: "underwriting_review", role: "Submits to underwriting" },
    ],
    responsibilities: [
      "Overall business operations & SOP compliance",
      "Meeting agenda management",
      "Business & services account management (with Taryn) — e.g. banking",
      "Application preparation (with Sheiky)",
      "Submit applications to underwriting",
      "Escalation point for all teams",
      "Ensures pipeline hygiene & data integrity",
    ],
  },
  {
    name: "Darryn",
    email: "darryn@merchanthaus.io",
    title: "QA & Complex Sales",
    role: "Quality Assurance / Sales / Integration",
    icon: <Shield className="h-5 w-5" />,
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    borderColor: "border-blue-500/40",
    stages: [
      { stage: "discovery", role: "Complex sales & discovery" },
      { stage: "qualified", role: "Initial QA review gate" },
      { stage: "integration_setup", role: "Complex integrations" },
    ],
    responsibilities: [
      "Initial QA review at Qualified stage — all CRM underwriting starts here",
      "Complex sales deals from Discovery",
      "Complex integration support",
      "Quality gate-keeper for pipeline progression",
      "Data quality & compliance auditing",
    ],
  },
  {
    name: "Sheiky",
    email: "support@merchanthaus.io",
    title: "Support & Gateway Operations",
    role: "Gateway / Integration / Testing / Go-Live / Support",
    icon: <HeadphonesIcon className="h-5 w-5" />,
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    borderColor: "border-emerald-500/40",
    stages: [
      { stage: "application_prep", role: "App preparation (with Jamie)" },
      { stage: "underwriting_review", role: "Submit to underwriting (with Jamie)" },
      { stage: "gateway_submitted", role: "Gateway setup & configuration" },
      { stage: "integration_setup", role: "Integration support" },
      { stage: "testing", role: "Testing & validation" },
      { stage: "go_live_ready", role: "Go-live execution" },
    ],
    responsibilities: [
      "Application preparation (with Jamie)",
      "Gateway setup & merchant onboarding",
      "Integration configuration & testing",
      "Go-live activation & verification",
      "Post-go-live client support (sole owner)",
      "Live account issue resolution",
    ],
  },
  {
    name: "Wesley",
    email: "sales@merchanthaus.io",
    title: "Sales",
    role: "Outreach / Discovery / Lead Generation",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    borderColor: "border-violet-500/40",
    stages: [
      { stage: "discovery", role: "Lead gen & outreach" },
      { stage: "qualified", role: "Qualification" },
    ],
    responsibilities: [
      "Email outreach campaigns (sole owner)",
      "Lead generation & cold outreach",
      "Discovery calls & qualification",
      "Follows all SOP items up to Qualified stage",
      "Pipeline sourcing & referral tracking",
    ],
  },
  {
    name: "Taryn",
    email: "taryn@merchanthaus.io",
    title: "Affiliate & Partner Manager",
    role: "NMI / Affiliate Relationships",
    icon: <Link2 className="h-5 w-5" />,
    color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    borderColor: "border-rose-500/40",
    stages: [],
    responsibilities: [
      "NMI affiliate account management",
      "Formal partner relationship management",
      "Processor liaison & communications",
      "Affiliate program coordination",
    ],
  },
];

const PIPELINE_OWNERSHIP: { stage: OpportunityStage; owners: string[] }[] = [
  { stage: "discovery", owners: ["Wesley", "Darryn"] },
  { stage: "qualified", owners: ["Wesley", "Darryn (QA Gate)"] },
  { stage: "application_prep", owners: ["Jamie", "Sheiky"] },
  { stage: "underwriting_review", owners: ["Jamie", "Sheiky"] },
  { stage: "processor_approval", owners: ["Jamie"] },
  { stage: "gateway_submitted", owners: ["Sheiky"] },
  { stage: "integration_setup", owners: ["Sheiky", "Darryn (complex)"] },
  { stage: "testing", owners: ["Sheiky"] },
  { stage: "go_live_ready", owners: ["Sheiky"] },
];

const STAGE_ICONS: Record<string, React.ReactNode> = {
  discovery: <Search className="h-4 w-4" />,
  qualified: <CheckCircle className="h-4 w-4" />,
  application_prep: <FileText className="h-4 w-4" />,
  underwriting_review: <ClipboardCheck className="h-4 w-4" />,
  processor_approval: <CheckCircle className="h-4 w-4" />,
  gateway_submitted: <Rocket className="h-4 w-4" />,
  integration_setup: <Settings className="h-4 w-4" />,
  testing: <Zap className="h-4 w-4" />,
  go_live_ready: <Trophy className="h-4 w-4" />,
};

export const TeamOrganogram = () => {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Leadership */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-foreground mb-1">MerchantHaus Team Structure</h3>
        <p className="text-sm text-muted-foreground">Card assignment = action ownership. If assigned, you own it.</p>
      </div>

      {/* CEO at top */}
      <div className="flex justify-center">
        <MemberCard
          member={TEAM[0]}
          expanded={expandedMember === TEAM[0].name}
          onToggle={() => setExpandedMember(expandedMember === TEAM[0].name ? null : TEAM[0].name)}
        />
      </div>

      {/* Connector line */}
      <div className="flex justify-center">
        <div className="w-px h-8 bg-border" />
      </div>

      {/* Horizontal bar */}
      <div className="hidden md:flex justify-center">
        <div className="w-3/4 h-px bg-border relative">
          {[0, 25, 50, 75, 100].map((pct, i) => (
            <div key={i} className="absolute top-0 w-px h-3 bg-border" style={{ left: `${pct}%` }} />
          ))}
        </div>
      </div>

      {/* Rest of team */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TEAM.slice(1).map((member) => (
          <MemberCard
            key={member.name}
            member={member}
            expanded={expandedMember === member.name}
            onToggle={() => setExpandedMember(expandedMember === member.name ? null : member.name)}
          />
        ))}
      </div>

      {/* Pipeline ownership matrix */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Pipeline Stage Ownership
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {PIPELINE_OWNERSHIP.map(({ stage, owners }) => {
              const config = STAGE_CONFIG[stage];
              return (
                <div
                  key={stage}
                  className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0")} style={{ backgroundColor: config.color }} />
                  <span className="text-sm font-medium w-28 shrink-0">{config.label}</span>
                  <div className="flex items-center gap-1">
                    {STAGE_ICONS[stage]}
                  </div>
                  <ArrowDown className="h-3 w-3 text-muted-foreground rotate-[-90deg]" />
                  <div className="flex flex-wrap gap-1">
                    {owners.map((owner) => (
                      <Badge key={owner} variant="secondary" className="text-xs">
                        {owner}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 rounded-md bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground font-medium mb-1">Key Rules</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <strong>Darryn's QA gate at Qualified</strong> — all underwriting review starts here</li>
              <li>• <strong>Card assignment = 100% action ownership</strong> — if assigned to you, you deal with it</li>
              <li>• <strong>Post-go-live support</strong> — Sheiky exclusively</li>
              <li>• <strong>Outreach campaigns</strong> — Wesley exclusively</li>
              <li>• <strong>NMI & affiliate relationships</strong> — Taryn exclusively</li>
            </ul>
          </div>

          <div className="mt-4 p-3 rounded-md bg-primary/5 border border-primary/20">
            <p className="text-xs font-medium mb-1 text-foreground">🗳️ Governance — Process & Policy Decisions</p>
            <p className="text-xs text-muted-foreground mb-2">
              All process and policy decisions are made by <strong>majority vote</strong> among the following voting members:
            </p>
            <div className="flex flex-wrap gap-1 mb-2">
              {["Jamie", "Darryn", "Sheiky", "Wesley"].map((name) => (
                <Badge key={name} variant="secondary" className="text-xs">{name}</Badge>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Taryn's role is affiliate & partner-facing and does not carry a vote on internal process/policy decisions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const MemberCard = ({
  member,
  expanded,
  onToggle,
}: {
  member: TeamMember;
  expanded: boolean;
  onToggle: () => void;
}) => (
  <Collapsible open={expanded} onOpenChange={onToggle}>
    <Card className={cn("border transition-all hover:shadow-md", member.borderColor)}>
      <CollapsibleTrigger className="w-full text-left">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("p-2 rounded-lg", member.color)}>
                {member.icon}
              </div>
              <div>
                <CardTitle className="text-base">{member.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{member.title}</p>
              </div>
            </div>
            {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardHeader>
      </CollapsibleTrigger>

      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground mb-2">{member.role}</p>

        {member.stages.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {member.stages.map(({ stage }) => (
              <Badge key={stage} variant="outline" className="text-[10px]" style={{ borderColor: STAGE_CONFIG[stage].color, color: STAGE_CONFIG[stage].color }}>
                {STAGE_CONFIG[stage].label}
              </Badge>
            ))}
          </div>
        )}

        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
            {member.stages.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Stage Roles</p>
                {member.stages.map(({ stage, role }) => (
                  <div key={stage} className="flex items-start gap-2 text-xs text-muted-foreground py-0.5">
                    <span className="font-medium text-foreground w-24 shrink-0">{STAGE_CONFIG[stage].label}:</span>
                    <span>{role}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs font-medium mb-1">Responsibilities</p>
              <ul className="space-y-0.5">
                {member.responsibilities.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-primary mt-0.5">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </CardContent>
    </Card>
  </Collapsible>
);
