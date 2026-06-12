import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Link2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface NmiMerchant {
  merchant_id: string;
  gateway_id: string;
  company_name: string | null;
  dba_name: string | null;
  status: string | null;
  contact_email: string | null;
  created_at: string | null;
}

interface PortalMerchant {
  id: string;
  company_name?: string | null;
  dba_name?: string | null;
  email?: string | null;
  contact_email?: string | null;
  nmi_gateway_id?: number | string | null;
  account_status?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
}

export const LinkGatewayDialog = ({ open, onOpenChange, accountId, accountName }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkPortal, setLinkPortal] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch(accountName || "");
      setSelectedId(null);
    }
  }, [open, accountName]);

  const { data: nmiData, isLoading: nmiLoading, error: nmiError } = useQuery({
    queryKey: ["nmi-list-merchants"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nmi-list-merchants");
      if (error) throw error;
      return (data?.merchants ?? []) as NmiMerchant[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const { data: portalData } = useQuery({
    queryKey: ["gateway-accounts-all"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("gateway-accounts");
      if (error) throw error;
      return (data?.merchants ?? []) as PortalMerchant[];
    },
    enabled: open && linkPortal,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const list = nmiData ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 50);
    return list
      .filter((m) => {
        return (
          (m.company_name || "").toLowerCase().includes(q) ||
          (m.dba_name || "").toLowerCase().includes(q) ||
          (m.merchant_id || "").toLowerCase().includes(q) ||
          (m.contact_email || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [nmiData, search]);

  const findPortalMatch = (m: NmiMerchant): string | null => {
    if (!portalData?.length) return null;
    const gid = String(m.gateway_id);
    const byGw = portalData.find((p) => String(p.nmi_gateway_id ?? "") === gid);
    if (byGw) return byGw.id;
    const email = (m.contact_email || "").toLowerCase();
    const dba = (m.dba_name || "").toLowerCase();
    const byEmail = email
      ? portalData.find(
          (p) =>
            (p.email || "").toLowerCase() === email ||
            (p.contact_email || "").toLowerCase() === email,
        )
      : null;
    if (byEmail) return byEmail.id;
    const byDba = dba
      ? portalData.find((p) => (p.dba_name || "").toLowerCase() === dba)
      : null;
    return byDba?.id ?? null;
  };

  const handleLink = async () => {
    const selected = filtered.find((m) => m.merchant_id === selectedId) ?? null;
    if (!selected) return;
    setSubmitting(true);
    try {
      const { error: accErr } = await supabase
        .from("accounts")
        .update({ nmi_merchant_id: selected.merchant_id })
        .eq("id", accountId);
      if (accErr) throw accErr;

      let portalLinked = false;
      if (linkPortal) {
        const portalId = findPortalMatch(selected);
        if (portalId) {
          const { error: oppErr } = await supabase
            .from("opportunities")
            .update({ portal_merchant_id: portalId })
            .eq("account_id", accountId)
            .is("portal_merchant_id", null);
          if (!oppErr) portalLinked = true;
        }
      }

      toast({
        title: "Gateway linked",
        description: `MID ${selected.merchant_id} attached to ${accountName}${
          portalLinked ? " · portal merchant linked" : ""
        }`,
      });
      await queryClient.invalidateQueries({ queryKey: ["live-billing-opportunities"] });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to link gateway",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link NMI Gateway</DialogTitle>
          <DialogDescription>
            Attach a gateway from the NMI roster to <span className="font-medium text-foreground">{accountName}</span>.
            The selected merchant ID will populate on Live &amp; Billing and unlock commission tracking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by DBA, company, MID, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-lg max-h-[360px] overflow-y-auto">
            {nmiLoading ? (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : nmiError ? (
              <p className="p-6 text-sm text-destructive text-center">
                Failed to load NMI roster: {(nmiError as Error).message}
              </p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No merchants match this search.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((m) => {
                  const isSelected = m.merchant_id === selectedId;
                  return (
                    <li key={m.merchant_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.merchant_id)}
                        className={cn(
                          "w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 transition-colors",
                          isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {m.dba_name || m.company_name || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.company_name && m.dba_name && m.company_name !== m.dba_name
                              ? `${m.company_name} · `
                              : ""}
                            {m.contact_email || "no contact email"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {m.merchant_id}
                          </span>
                          {m.status && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              {m.status}
                            </Badge>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="link-portal"
              checked={linkPortal}
              onCheckedChange={(c) => setLinkPortal(c === true)}
            />
            <Label htmlFor="link-portal" className="text-xs text-muted-foreground cursor-pointer">
              Also link portal merchant when a match is found (by gateway ID, email, or DBA)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!selectedId || submitting} className="gap-1.5">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Link Gateway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
