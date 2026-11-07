import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Ban, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { checkBlockableDomain } from "@/lib/support";

const BLOCKED_DOMAINS_KEY = ["support-blocked-domains"];

interface BlockedDomainRow {
  id: string;
  domain: string;
  created_by_email: string | null;
  created_at: string;
}

/**
 * Insert a blocked domain. The database does the rest in the same statement:
 * the domain's open / in-progress tickets move to spam, and new mail from it
 * arrives as spam. Returns false (after telling the user) on failure.
 */
const blockSupportDomain = async (domain: string): Promise<boolean> => {
  const check = checkBlockableDomain(domain);
  if (!check.ok) {
    toast.error(check.message);
    return false;
  }
  const { error } = await supabase.from("support_blocked_domains").insert({ domain: check.domain });
  if (error) {
    if (error.code === "23505") {
      toast.info(`${check.domain} is already blocked.`);
      return true;
    }
    console.error("Failed to block domain:", error);
    toast.error(`Could not block ${check.domain}.`);
    return false;
  }
  toast.success(`Blocked ${check.domain}. Its open tickets were moved to spam.`);
  return true;
};

/** Open / in-progress tickets that blocking `domain` would move to spam. */
const useAffectedCount = (domain: string | null) =>
  useQuery({
    queryKey: ["support-tickets", "block-preview", domain],
    enabled: !!domain,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .or(`requester_email.ilike.*@${domain},requester_email.ilike.*.${domain}`);
      if (error) throw error;
      return count ?? 0;
    },
  });

/**
 * Confirm step for blocking a domain. When the domain is ours or a shared
 * free-mail provider it shows a warning instead and offers no block button.
 */
export const BlockDomainConfirm = ({
  domain,
  open,
  onOpenChange,
  onBlocked,
}: {
  domain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlocked?: () => void;
}) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const check = checkBlockableDomain(domain);
  const { data: affected } = useAffectedCount(open && check.ok ? check.domain : null);

  const confirm = async () => {
    setSaving(true);
    const ok = await blockSupportDomain(check.domain);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: BLOCKED_DOMAINS_KEY });
    queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
    queryClient.invalidateQueries({ queryKey: ["support-ticket"] });
    if (ok) {
      onOpenChange(false);
      onBlocked?.();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {check.ok ? `Block ${check.domain}?` : `Can't block ${check.domain || "this domain"}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            {check.ok ? (
              <div className="space-y-2">
                <p>
                  Every open or in-progress ticket from <strong>{check.domain}</strong> (and its
                  subdomains) moves to Spam
                  {affected !== undefined && ` — ${affected} ticket${affected === 1 ? "" : "s"} right now`}
                  , and future mail from it arrives as spam with no acknowledgement sent.
                </p>
                <p>
                  Closed tickets are left as they are. Unblocking later does not restore tickets
                  already moved to spam.
                </p>
              </div>
            ) : (
              <p className="flex gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                <span>{check.message}</span>
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>{check.ok ? "Cancel" : "Close"}</AlertDialogCancel>
          {check.ok && (
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                confirm();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Block domain
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/** List, add and remove blocked sender domains. */
export const BlockedDomainsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [pendingBlock, setPendingBlock] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data: domains, isLoading } = useQuery({
    queryKey: BLOCKED_DOMAINS_KEY,
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_blocked_domains")
        .select("id, domain, created_by_email, created_at")
        .order("domain");
      if (error) throw error;
      return (data ?? []) as BlockedDomainRow[];
    },
  });

  const draftCheck = draft.trim() ? checkBlockableDomain(draft) : null;

  const remove = async (row: BlockedDomainRow) => {
    setRemovingId(row.id);
    const { error } = await supabase.from("support_blocked_domains").delete().eq("id", row.id);
    setRemovingId(null);
    if (error) {
      console.error("Failed to unblock domain:", error);
      toast.error(`Could not unblock ${row.domain}.`);
      return;
    }
    toast.success(`Unblocked ${row.domain}. Tickets already in spam stay there.`);
    queryClient.invalidateQueries({ queryKey: BLOCKED_DOMAINS_KEY });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Blocked domains</DialogTitle>
            <DialogDescription>
              Mail from these domains (and their subdomains) lands in Spam, with no acknowledgement
              sent. Removing a domain stops future blocking only — it does <strong>not</strong>{" "}
              restore tickets already in spam; restore those from the Spam tab.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) setPendingBlock(draft);
            }}
          >
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="example.com or someone@example.com"
                aria-label="Domain to block"
              />
              <Button type="submit" disabled={!draftCheck}>
                <Ban className="h-4 w-4 mr-1.5" />
                Block
              </Button>
            </div>
            {draftCheck && !draftCheck.ok && (
              <p className="text-xs text-amber-600 dark:text-amber-400">{draftCheck.message}</p>
            )}
          </form>

          <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
            {isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (domains ?? []).length === 0 ? (
              <p className="p-4 text-sm text-center text-muted-foreground">No domains are blocked.</p>
            ) : (
              (domains ?? []).map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.domain}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Blocked {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      {d.created_by_email && ` by ${d.created_by_email}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground"
                    disabled={removingId === d.id}
                    onClick={() => remove(d)}
                    aria-label={`Unblock ${d.domain}`}
                  >
                    {removingId === d.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Unblock
                      </>
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BlockDomainConfirm
        domain={pendingBlock ?? ""}
        open={pendingBlock !== null}
        onOpenChange={(o) => !o && setPendingBlock(null)}
        onBlocked={() => setDraft("")}
      />
    </>
  );
};
