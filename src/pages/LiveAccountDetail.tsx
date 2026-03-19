import { useState, useCallback } from "react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OutcomeSelector } from "@/components/OutcomeSelector";
import {
  ArrowLeft,
  Building2,
  User,
  Zap,
  CreditCard,
  Calendar,
  Globe,
  MapPin,
  Mail,
  Phone,
  FileText,
  Activity,
  ExternalLink,
  Briefcase,
  Archive,
  Download,
  Eye,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { getServiceType, STAGE_CONFIG, migrateStage, OutcomeStatus, EMAIL_TO_USER } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "@/contexts/ThemeContext";
import ClientInteractionLog from "@/components/ClientInteractionLog";
import { NMITransactionsPanel } from "@/components/NMITransactionsPanel";
import logoDark from "@/assets/logo-dark.png";
import logoLight from "@/assets/logo-light.png";
import liveBadge from "@/assets/live-badge.webp";

const TEAM_EMAIL_MAP: Record<string, string> = {
  'Wesley': 'dylan@merchanthaus.io',
  'Jamie': 'admin@merchanthaus.io',
  'Darryn': 'darryn@merchanthaus.io',
  'Taryn': 'taryn@merchanthaus.io',
  'Yaseen': 'support@merchanthaus.io',
  'Sales': 'sales@merchanthaus.io',
};

const InfoRow = ({ icon: Icon, label, value, href }: { icon: any; label: string; value?: string | null; href?: string }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline break-all">
            {value}
          </a>
        ) : (
          <p className="text-sm font-medium text-foreground break-all">{value}</p>
        )}
      </div>
    </div>
  );
};

const LiveAccountDetail = () => {
  const { id: accountId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);

  // Fetch ALL live opportunities for this account
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ["live-account-detail", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(`
          *,
          account:accounts(*),
          contact:contacts(*),
          wizard_state:onboarding_wizard_states(*)
        `)
        .eq("account_id", accountId!)
        .eq("outcome_status", "closed_won")
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return null;
      return data.map((d) => ({
        ...d,
        stage: migrateStage(d.stage),
        wizard_state: Array.isArray(d.wizard_state) ? d.wizard_state[0] : d.wizard_state,
      }));
    },
    enabled: !!accountId,
  });

  // Use first opportunity for shared account/contact data
  const primaryOpp = opportunities?.[0];
  const account = primaryOpp?.account as any;
  const contact = primaryOpp?.contact as any;

  const pipelines = opportunities
    ? [...new Set(opportunities.map((o) => getServiceType(o as any)))]
    : [];

  // Fetch documents for ALL opportunities of this account
  const oppIds = opportunities?.map((o) => o.id) || [];
  const { data: documents } = useQuery({
    queryKey: ["live-account-documents", accountId, oppIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .in("opportunity_id", oppIds)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: oppIds.length > 0,
  });

  const handleDownloadAllDocs = async () => {
    if (!documents || documents.length === 0) return;
    setIsDownloadingAll(true);

    for (const doc of documents) {
      try {
        const { data, error } = await supabase.storage
          .from('opportunity-documents')
          .download(doc.file_path);

        if (error || !data) {
          toast.error(`Failed to download ${doc.file_name}`);
          continue;
        }

        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        await new Promise((r) => setTimeout(r, 300));
      } catch {
        toast.error(`Failed to download ${doc.file_name}`);
      }
    }

    setIsDownloadingAll(false);
    toast.success('Downloads complete');
  };

  // Fetch activities for ALL opportunities
  const { data: activities } = useQuery({
    queryKey: ["live-account-activities", accountId, oppIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("*")
        .in("opportunity_id", oppIds)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: oppIds.length > 0,
  });

  const { data: ownerAvatar } = useQuery({
    queryKey: ["owner-avatar", primaryOpp?.assigned_to],
    queryFn: async () => {
      const email = TEAM_EMAIL_MAP[primaryOpp!.assigned_to!];
      if (!email) return null;
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("email", email)
        .maybeSingle();
      return data;
    },
    enabled: !!primaryOpp?.assigned_to,
  });

  // Fetch NMI gateway IDs for this account
  const { data: boardingSubmissions } = useQuery({
    queryKey: ["nmi-boarding-submissions", accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nmi_boarding_submissions")
        .select("nmi_gateway_id")
        .eq("account_id", accountId!)
        .not("nmi_gateway_id", "is", null);
      return data || [];
    },
    enabled: !!accountId,
  });

  const accountGatewayIds = (boardingSubmissions || [])
    .map((s: any) => s.nmi_gateway_id)
    .filter(Boolean) as string[];

  const getInitials = (name: string) =>
    name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const address = [account?.address1, account?.address2, account?.city, account?.state, account?.zip, account?.country]
    .filter(Boolean)
    .join(", ");

  // Earliest go-live date
  const goLiveDate = opportunities
    ?.map((o) => o.stage_entered_at)
    .filter(Boolean)
    .sort()[0];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid lg:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!primaryOpp) {
    return (
      <AppLayout>
        <div className="p-4 lg:p-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/live-billing")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Live & Billing
          </Button>
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Account not found</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <>
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="relative border-b border-border bg-gradient-to-r from-amber-50/60 via-yellow-50/40 to-background dark:from-amber-950/20 dark:via-yellow-950/10 dark:to-background px-4 lg:px-6 py-4">
          {/* Centered ribbon overlay */}
          <div className="absolute inset-0 flex justify-center pointer-events-none z-10" style={{ top: '-1rem' }}>
            <img 
              src={liveBadge} 
              alt="Live Account" 
              className="h-36 w-auto drop-shadow-2xl opacity-90 animate-ribbon-drop" 
              style={{ filter: 'drop-shadow(0 8px 16px rgba(180, 130, 20, 0.35))' }}
            />
          </div>
          <div className="relative z-20 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/live-billing")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl lg:text-2xl font-bold text-foreground truncate">
                    {account?.name || "Unknown Account"}
                  </h1>
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs">
                    ✦ Live
                  </Badge>
                  {pipelines.includes("processing") && (
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      <CreditCard className="h-3 w-3 mr-1" />Processing
                    </Badge>
                  )}
                  {pipelines.includes("gateway_only") && (
                    <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-600 dark:text-teal-400">
                      <Zap className="h-3 w-3 mr-1" />Gateway
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                  {goLiveDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Live since {format(new Date(goLiveDate), "MMM dd, yyyy")}
                    </span>
                  )}
                  {primaryOpp.assigned_to && (
                    <span className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5 border border-background">
                        {ownerAvatar?.avatar_url && <AvatarImage src={ownerAvatar.avatar_url} />}
                        <AvatarFallback className="text-[8px] bg-muted">{getInitials(primaryOpp.assigned_to)}</AvatarFallback>
                      </Avatar>
                      {primaryOpp.assigned_to}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OutcomeSelector
                onSelect={async (outcome: OutcomeStatus, reason: string, notes: string) => {
                  if (!opportunities || !user) return;
                  const closerEmail = user.email || "";
                  const closerName = closerEmail.split("@")[0];
                  
                  // Update all opportunities for this account
                  for (const opp of opportunities) {
                    await supabase
                      .from("opportunities")
                      .update({
                        outcome_status: outcome,
                        outcome_reason: reason,
                        outcome_notes: notes,
                        outcome_closed_at: new Date().toISOString(),
                        outcome_closed_by: closerEmail,
                        status: outcome === "closed_won" ? "active" : "dead",
                      })
                      .eq("id", opp.id);

                    await supabase.from("activities").insert({
                      opportunity_id: opp.id,
                      type: "outcome_set",
                      description: `Account closed: ${outcome} — ${reason}`,
                      user_email: closerEmail,
                      user_id: user.id,
                    });
                  }

                  // Send closure email to merchant + team notification
                  const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Merchant";
                  const contactEmail = contact?.email;

                  if (contactEmail) {
                    supabase.functions.invoke("send-account-closed", {
                      body: {
                        recipientEmail: contactEmail,
                        recipientName: contactName,
                        accountName: account?.name || "",
                        outcomeStatus: outcome,
                        outcomeReason: reason,
                        closedBy: closerName.charAt(0).toUpperCase() + closerName.slice(1),
                      },
                    }).catch((err) => console.error("Closure email error:", err));
                  }

                  toast.success("Account closed and merchant notified");
                  queryClient.invalidateQueries({ queryKey: ["live-account-detail", accountId] });
                  queryClient.invalidateQueries({ queryKey: ["live-billing-opportunities"] });
                  navigate("/live-billing");
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  if (!opportunities) return;
                  for (const opp of opportunities) {
                    await supabase
                      .from("opportunities")
                      .update({ status: "archived" })
                      .eq("id", opp.id);
                    await supabase.from("activities").insert({
                      opportunity_id: opp.id,
                      type: "archived",
                      description: "Archived from Live & Billing",
                    });
                  }
                  navigate("/live-billing");
                }}
              >
                <Archive className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Archive</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className={cn(
            "grid gap-6",
            isMobile ? "grid-cols-1" : "grid-cols-3"
          )}>
            {/* Account Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Account Details
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <InfoRow icon={Building2} label="Business Name" value={account?.name} />
                <InfoRow icon={Globe} label="Website" value={account?.website} href={account?.website ? (account.website.startsWith("http") ? account.website : `https://${account.website}`) : undefined} />
                {address && <InfoRow icon={MapPin} label="Address" value={address} />}
                <Separator className="my-2" />
                <div className="py-1">
                  <p className="text-xs text-muted-foreground">Account Status</p>
                  <Badge variant="outline" className="mt-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                    Active
                  </Badge>
                </div>
                <div className="py-1">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">{account?.created_at ? format(new Date(account.created_at), "MMM dd, yyyy") : "—"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Contact Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Primary Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                <InfoRow icon={User} label="Full Name" value={[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null} />
                <InfoRow icon={Mail} label="Email" value={contact?.email} href={contact?.email ? `mailto:${contact.email}` : undefined} />
                <InfoRow icon={Phone} label="Phone" value={contact?.phone} href={contact?.phone ? `tel:${contact.phone}` : undefined} />
                {contact?.fax && <InfoRow icon={Phone} label="Fax" value={contact.fax} />}
                <Separator className="my-2" />
                {primaryOpp.referral_source && (
                  <div className="py-1">
                    <p className="text-xs text-muted-foreground">Referral Source</p>
                    <p className="text-sm font-medium">{primaryOpp.referral_source}</p>
                  </div>
                )}
                {primaryOpp.username && (
                  <div className="py-1">
                    <p className="text-xs text-muted-foreground">Username</p>
                    <p className="text-sm font-medium">{primaryOpp.username}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Opportunities (show each one) */}
            {opportunities?.map((opp) => {
              const svcType = getServiceType(opp as any);
              return (
                <Card key={opp.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      {svcType === "gateway_only" ? "NMI Gateway" : "NMI Payments"}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] ml-auto",
                          svcType === "gateway_only"
                            ? "border-teal-500/50 text-teal-600 dark:text-teal-400"
                            : "border-primary/50 text-primary"
                        )}
                      >
                        {svcType === "gateway_only" ? <><Zap className="h-3 w-3 mr-1" />Gateway</> : <><CreditCard className="h-3 w-3 mr-1" />Processing</>}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="py-1">
                      <p className="text-xs text-muted-foreground">Stage</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-base">{STAGE_CONFIG[opp.stage as keyof typeof STAGE_CONFIG]?.icon || "📋"}</span>
                        <p className="text-sm font-medium">{STAGE_CONFIG[opp.stage as keyof typeof STAGE_CONFIG]?.label || opp.stage}</p>
                      </div>
                    </div>
                    {opp.processing_services && opp.processing_services.length > 0 && (
                      <div className="py-1">
                        <p className="text-xs text-muted-foreground mb-1">Processing Services</p>
                        <div className="flex flex-wrap gap-1">
                          {opp.processing_services.map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {opp.value_services && opp.value_services.length > 0 && (
                      <div className="py-1">
                        <p className="text-xs text-muted-foreground mb-1">Value Services</p>
                        <div className="flex flex-wrap gap-1">
                          {opp.value_services.map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {opp.stage_entered_at && (
                      <div className="py-1">
                        <p className="text-xs text-muted-foreground">Went Live</p>
                        <p className="text-sm font-medium">{format(new Date(opp.stage_entered_at), "MMM dd, yyyy")}</p>
                      </div>
                    )}
                    <Separator className="my-1" />
                    <div className="py-1">
                      <p className="text-xs text-muted-foreground">Last Updated</p>
                      <p className="text-sm font-medium">{formatDistanceToNow(new Date(opp.updated_at), { addSuffix: true })}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => navigate(`/opportunities/${opp.id}`)}
                    >
                      <Briefcase className="h-4 w-4 mr-1.5" />
                      View Opportunity
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {/* Documents */}
            <Card className={isMobile ? "" : "lg:col-span-2"}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Documents
                  {documents && documents.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-auto">{documents.length}</Badge>
                  )}
                  {documents && documents.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleDownloadAllDocs}
                      disabled={isDownloadingAll}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {isDownloadingAll ? 'Downloading...' : 'Download all'}
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!documents || documents.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No documents uploaded</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-3 border border-border/50 rounded-lg hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.document_type || "Unassigned"} · {doc.created_at ? format(new Date(doc.created_at), "MMM dd") : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewDoc(doc)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Log */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {!activities || activities.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No activity recorded</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activities.map((act) => {
                      const userName = act.user_email
                        ? (EMAIL_TO_USER[act.user_email.toLowerCase()] || act.user_email.split('@')[0])
                        : null;
                      return (
                        <div key={act.id} className="flex gap-3 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-2 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-foreground">{act.description || act.type}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              {userName && (
                                <>
                                  <span className="font-medium">{userName}</span>
                                  <span>·</span>
                                </>
                              )}
                              <span>{format(new Date(act.created_at), "MMM d, yyyy h:mm a")}</span>
                              <span className="text-muted-foreground/50">
                                ({formatDistanceToNow(new Date(act.created_at), { addSuffix: true })})
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gateway Transactions */}
          {accountGatewayIds.length > 0 && (
            <div className="mt-6">
              <NMITransactionsPanel
                gatewayIds={accountGatewayIds}
                accountName={account?.name}
              />
            </div>
          )}

          {/* Client Interaction Log */}
          <div className="mt-6">
            <ClientInteractionLog
              accountId={accountId!}
              contactName={[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null}
              contactEmail={contact?.email}
              contactPhone={contact?.phone}
            />
          </div>
          <footer className="border-t border-border/50 mt-8 py-6 px-4 lg:px-6">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                © {new Date().getFullYear()} · {format(new Date(), "MMMM dd, yyyy")}
              </p>
              <img
                src={theme === 'dark' ? logoDark : logoLight}
                alt="Ops Terminal"
                className="h-6 w-auto opacity-60"
              />
            </div>
          </footer>
        </div>
      </div>
    </AppLayout>

    <DocumentPreviewDialog
      document={previewDoc}
      open={!!previewDoc}
      onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
    />
    </>
  );
};

export default LiveAccountDetail;
