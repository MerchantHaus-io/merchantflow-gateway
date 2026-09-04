import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Zap, CreditCard, Users, TrendingUp, Calendar, XCircle, Link2, Receipt } from "lucide-react";
import { LinkGatewayDialog } from "@/components/live-billing/LinkGatewayDialog";
import { CloseAccountDialog } from "@/components/live-billing/CloseAccountDialog";
import { BillingDocDialog } from "@/components/live-billing/BillingDocDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PricingBadges } from "@/components/PricingBadges";
import { format } from "date-fns";
import { getServiceType, TEAM_MEMBERS } from "@/types/opportunity";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { BillingEstimatesPanel } from "@/components/BillingEstimatesPanel";
import { ReferrerAssignField } from "@/components/ReferrerAssignField";

import { NAME_TO_EMAIL } from "@/config/team";
const TEAM_EMAIL_MAP: Record<string, string> = NAME_TO_EMAIL;

interface GroupedAccount {
  account_id: string;
  account: any;
  contact: any;
  assigned_to: string | null;
  stage_entered_at: string | null;
  pipelines: ('processing' | 'gateway_only')[];
  opportunities: any[];
}

const LiveBilling = () => {
  const [search, setSearch] = useState("");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPipeline, setFilterPipeline] = useState<string>("all");
  const [linkTarget, setLinkTarget] = useState<{ accountId: string; accountName: string } | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ accountId: string; accountName: string; nmiMerchantId?: string | null } | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<{ accountId: string; accountName: string } | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { teamMemberName } = useAuth();
  const { isAdmin } = useUserRole();

  const { data: liveOpportunities, isLoading } = useQuery({
    queryKey: ["live-billing-opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opportunities")
        .select(`
          *,
          account:accounts(*),
          contact:contacts(*)
        `)
        .eq("outcome_status", "closed_won")
        .order("outcome_closed_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: avatars } = useQuery({
    queryKey: ["team-avatars"],
    queryFn: async () => {
      const emails = Object.values(TEAM_EMAIL_MAP);
      const { data } = await supabase
        .from("profiles")
        .select("email, avatar_url")
        .in("email", emails);
      const map: Record<string, string> = {};
      data?.forEach((p) => {
        if (p.email && p.avatar_url) map[p.email] = p.avatar_url;
      });
      return map;
    },
  });

  // Group opportunities by account_id
  const grouped = useMemo(() => {
    if (!liveOpportunities) return [];
    const map = new Map<string, GroupedAccount>();

    for (const opp of liveOpportunities) {
      // Non-admin users only see opportunities assigned to them
      if (!isAdmin && teamMemberName && opp.assigned_to !== teamMemberName) continue;

      const accountId = opp.account_id;
      const svcType = getServiceType(opp as any);

      if (map.has(accountId)) {
        const group = map.get(accountId)!;
        group.opportunities.push(opp);
        if (!group.pipelines.includes(svcType)) {
          group.pipelines.push(svcType);
        }
        // Use the earliest go-live date
        if (opp.stage_entered_at && (!group.stage_entered_at || opp.stage_entered_at < group.stage_entered_at)) {
          group.stage_entered_at = opp.stage_entered_at;
        }
      } else {
        map.set(accountId, {
          account_id: accountId,
          account: opp.account,
          contact: opp.contact,
          assigned_to: opp.assigned_to,
          stage_entered_at: opp.stage_entered_at,
          pipelines: [svcType],
          opportunities: [opp],
        });
      }
    }

    return Array.from(map.values());
  }, [liveOpportunities, isAdmin, teamMemberName]);

  const filtered = useMemo(() => {
    return grouped.filter((g) => {
      const name = g.account?.name?.toLowerCase() || "";
      const contactName = `${g.contact?.first_name || ""} ${g.contact?.last_name || ""}`.toLowerCase();
      const q = search.toLowerCase();
      const matchSearch = !q || name.includes(q) || contactName.includes(q);
      const matchAssignee = filterAssignee === "all" || g.assigned_to === filterAssignee;
      const matchPipeline = filterPipeline === "all" || g.pipelines.includes(filterPipeline as any);
      return matchSearch && matchAssignee && matchPipeline;
    });
  }, [grouped, search, filterAssignee, filterPipeline]);

  const stats = useMemo(() => {
    const total = grouped.length;
    const processing = grouped.filter((g) => g.pipelines.includes("processing")).length;
    const gateway = grouped.filter((g) => g.pipelines.includes("gateway_only")).length;
    const assignees = new Set(grouped.map((g) => g.assigned_to).filter(Boolean));
    return { total, processing, gateway, teamMembers: assignees.size };
  }, [grouped]);

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const PipelineBadges = ({ pipelines }: { pipelines: ('processing' | 'gateway_only')[] }) => (
    <div className="flex flex-col gap-1">
      {pipelines.includes("processing") && (
        <Badge variant="outline" className="text-xs border-primary/50 text-primary w-fit">
          <CreditCard className="h-3 w-3 mr-1" />Processing
        </Badge>
      )}
      {pipelines.includes("gateway_only") && (
        <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-600 dark:text-teal-400 w-fit">
          <Zap className="h-3 w-3 mr-1" />Gateway
        </Badge>
      )}
    </div>
  );

  return (
    <AppLayout pageTitle="Live & Billing">
      <div className="p-4 lg:p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <Card className="border-amber-400/40 dark:border-amber-500/30 bg-gradient-to-br from-amber-50/80 to-yellow-50/60 dark:from-amber-950/30 dark:to-yellow-950/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/15 dark:bg-amber-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Live</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.processing}</p>
                <p className="text-xs text-muted-foreground">Processing</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.gateway}</p>
                <p className="text-xs text-muted-foreground">Gateway</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.teamMembers}</p>
                <p className="text-xs text-muted-foreground">Team Active</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by account or contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {TEAM_MEMBERS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPipeline} onValueChange={setFilterPipeline}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Pipelines</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="gateway_only">Gateway</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Billing estimates from transaction data */}
        <BillingEstimatesPanel accounts={filtered} />

        {/* Table */}

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No live clients found</p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          /* Mobile Card View */
          <div className="space-y-3">
            {filtered.map((g) => {
              const assignedEmail = g.assigned_to ? TEAM_EMAIL_MAP[g.assigned_to] : null;
              const avatarUrl = assignedEmail && avatars ? avatars[assignedEmail] : null;

              return (
                <Card
                  key={g.account_id}
                  onClick={() => navigate(`/live-billing/${g.account_id}`)}
                  className="border-amber-400/30 dark:border-amber-500/20 bg-gradient-to-br from-amber-50/50 to-background dark:from-amber-950/20 dark:to-background cursor-pointer hover:shadow-md transition-all"
                >
                  <CardContent className="p-4 space-y-2">
                     <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm text-foreground truncate">
                            {g.account?.name || "Unknown"}
                          </h3>
                          {g.account?.commission_model === 'gateway_only' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-500/50 text-teal-600 dark:text-teal-400 shrink-0">
                              <Zap className="h-3 w-3 mr-1" />Gateway only
                            </Badge>
                          )}
                        </div>
                        {g.account?.nmi_merchant_id ? (
                          <span className="text-[10px] font-mono text-muted-foreground">MID: {g.account.nmi_merchant_id}</span>
                        ) : isAdmin ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkTarget({ accountId: g.account_id, accountName: g.account?.name || "Unknown" });
                            }}
                            className="text-[10px] inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline"
                          >
                            <Link2 className="h-3 w-3" /> Link Gateway
                          </button>
                        ) : null}
                      </div>
                      <PipelineBadges pipelines={g.pipelines} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {g.contact?.first_name} {g.contact?.last_name}
                      {g.contact?.email && ` · ${g.contact.email}`}
                    </p>
                    {(() => {
                      const lead = g.opportunities?.[0] as any;
                      return (lead?.pricing_plan || lead?.gateway_tier) ? (
                        <PricingBadges pricingPlan={lead.pricing_plan} gatewayTier={lead.gateway_tier} />
                      ) : null;
                    })()}
                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {g.stage_entered_at
                          ? format(new Date(g.stage_entered_at), "MMM dd, yyyy")
                          : "—"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {g.assigned_to && (
                          <>
                            <Avatar className="h-5 w-5 border border-background">
                              {avatarUrl && <AvatarImage src={avatarUrl} />}
                              <AvatarFallback className="text-[8px] bg-muted">
                                {getInitials(g.assigned_to)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{g.assigned_to}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInvoiceTarget({ accountId: g.account_id, accountName: g.account?.name || "Unknown" });
                        }}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Invoice
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCloseTarget({
                            accountId: g.account_id,
                            accountName: g.account?.name || "Unknown",
                            nmiMerchantId: g.account?.nmi_merchant_id ?? null,
                          });
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Close
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* Desktop Table View */
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right pr-2">#</TableHead>
                   <TableHead>Account</TableHead>
                  <TableHead>Merchant ID</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Pipeline</TableHead>
                  <TableHead>Went Live</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Affiliate</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g, idx) => {
                  const assignedEmail = g.assigned_to ? TEAM_EMAIL_MAP[g.assigned_to] : null;
                  const avatarUrl = assignedEmail && avatars ? avatars[assignedEmail] : null;

                  return (
                    <TableRow key={g.account_id} className="hover:bg-amber-50/30 dark:hover:bg-amber-950/10 cursor-pointer" onClick={() => navigate(`/live-billing/${g.account_id}`)}>
                      <TableCell className="text-right pr-2 text-[11px] text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          {g.account?.name || "Unknown"}
                          {g.account?.commission_model === 'gateway_only' && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-500/50 text-teal-600 dark:text-teal-400">
                              <Zap className="h-3 w-3 mr-1" />Gateway only
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => { if (!g.account?.nmi_merchant_id && isAdmin) e.stopPropagation(); }}>
                        {g.account?.nmi_merchant_id ? (
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{g.account.nmi_merchant_id}</span>
                        ) : isAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] gap-1 border-amber-400/40 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLinkTarget({ accountId: g.account_id, accountName: g.account?.name || "Unknown" });
                            }}
                          >
                            <Link2 className="h-3 w-3" /> Link Gateway
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm">{g.contact?.first_name} {g.contact?.last_name}</span>
                          {g.contact?.email && (
                            <p className="text-xs text-muted-foreground">{g.contact.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PipelineBadges pipelines={g.pipelines} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {g.stage_entered_at
                            ? format(new Date(g.stage_entered_at), "MMM dd, yyyy")
                            : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {g.assigned_to ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6 border border-background">
                              {avatarUrl && <AvatarImage src={avatarUrl} />}
                              <AvatarFallback className="text-[9px] bg-muted">
                                {getInitials(g.assigned_to)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{g.assigned_to}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ReferrerAssignField
                          table="accounts"
                          recordId={g.account_id}
                          value={g.account?.referrer_id ?? null}
                          invalidateKeys={[["live-billing-opportunities"]]}
                          className="w-[190px]"
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                onClick={() => setInvoiceTarget({ accountId: g.account_id, accountName: g.account?.name || "Unknown" })}
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>New Invoice / Receipt</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setCloseTarget({
                                  accountId: g.account_id,
                                  accountName: g.account?.name || "Unknown",
                                  nmiMerchantId: g.account?.nmi_merchant_id ?? null,
                                })}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Close Account</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
      {linkTarget && (
        <LinkGatewayDialog
          open={!!linkTarget}
          onOpenChange={(o) => { if (!o) setLinkTarget(null); }}
          accountId={linkTarget.accountId}
          accountName={linkTarget.accountName}
        />
      )}
      {closeTarget && (
        <CloseAccountDialog
          open={!!closeTarget}
          onOpenChange={(o) => { if (!o) setCloseTarget(null); }}
          accountId={closeTarget.accountId}
          accountName={closeTarget.accountName}
          nmiMerchantId={closeTarget.nmiMerchantId}
        />
      )}
      {invoiceTarget && (
        <BillingDocDialog
          open={!!invoiceTarget}
          onOpenChange={(o) => { if (!o) setInvoiceTarget(null); }}
          accountId={invoiceTarget.accountId}
          accountName={invoiceTarget.accountName}
        />
      )}
    </AppLayout>
  );
};

export default LiveBilling;
