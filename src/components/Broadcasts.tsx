import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

/**
 * All internal staff broadcasts, driven from the `broadcasts` table (#59).
 *
 * This replaces four near-identical components — ComplianceBroadcast,
 * BroadcastPopup, NMIBoardingBroadcast and AtriaBroadcast — that between them
 * ran to ~640 lines and duplicated the same eligibility check, the same
 * acknowledgement write, the same modal shell and the same framer-motion
 * choreography. Each hardcoded its own copy, dated key, expiry window and
 * priority, so publishing a notice meant shipping a component and fixing a
 * typo meant a deploy.
 *
 * The separate BroadcastQueue context is gone too: with every broadcast loaded
 * in one query, "show the highest-priority eligible one" is a sort, not a
 * registration protocol between independent components.
 */

type BroadcastType = "notice" | "checklist" | "features";

interface ChecklistItem {
  id: string;
  label: string;
  desc?: string;
}

interface FeatureItem {
  title: string;
  desc?: string;
}

interface Broadcast {
  id: string;
  key: string;
  type: BroadcastType;
  title: string;
  icon: string | null;
  body: string | null;
  items: ChecklistItem[] | FeatureItem[];
  priority: number;
  expires_at: string | null;
}

export function Broadcasts() {
  const { user } = useAuth();
  const [pending, setPending] = useState<Broadcast[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [acknowledging, setAcknowledging] = useState(false);
  // Dismissed without acknowledging — reappears next session, matching the
  // previous behaviour of the X button.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      // One round trip for the notices, one for this user's acknowledgements.
      // Expiry is filtered here rather than in SQL so a NULL expires_at means
      // "runs until acknowledged" without needing an OR in the query.
      // `broadcasts` is created by migration 20260807220000. Until that is
      // applied and the generated Database types are regenerated, the client
      // doesn't know the table — narrowed here rather than hand-editing the
      // generated types.ts. This cast becomes redundant afterwards.
      const db = supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (c: string, v: unknown) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>;
            };
          };
        };
      };

      const [{ data: rows, error }, { data: acks }] = await Promise.all([
        db
          .from("broadcasts")
          .select("id, key, type, title, icon, body, items, priority, expires_at")
          .eq("active", true)
          .order("priority", { ascending: true }),
        supabase
          .from("broadcast_acknowledgments")
          .select("broadcast_key")
          .eq("user_id", user.id),
      ]);

      if (cancelled) return;
      if (error) {
        // A broadcast that fails to load is not worth interrupting anyone over.
        console.error("[Broadcasts] load failed", error);
        return;
      }

      const acknowledged = new Set((acks ?? []).map((a) => a.broadcast_key));
      const now = Date.now();

      setPending(
        ((rows ?? []) as unknown as Broadcast[]).filter(
          (b) =>
            !acknowledged.has(b.key) &&
            (b.expires_at === null || new Date(b.expires_at).getTime() > now),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Show one at a time, highest priority first — the job the queue context did.
  const current = useMemo(
    () => pending.find((b) => !dismissed.has(b.key)) ?? null,
    [pending, dismissed],
  );

  const checklistItems = (current?.type === "checklist" ? current.items : []) as ChecklistItem[];
  const featureItems = (current?.type === "features" ? current.items : []) as FeatureItem[];

  // A checklist exists to be read; acknowledging without ticking defeats it.
  const canAcknowledge =
    current?.type !== "checklist" || checklistItems.every((i) => checked[i.id]);

  const handleAcknowledge = async () => {
    if (!user || !current) return;
    setAcknowledging(true);
    const { error } = await supabase.from("broadcast_acknowledgments").insert({
      broadcast_key: current.key,
      user_id: user.id,
      user_email: user.email || "",
    });
    setAcknowledging(false);

    if (error) {
      console.error("[Broadcasts] ack failed", error);
      toast.error("Couldn't save acknowledgment — please try again");
      return;
    }

    setPending((prev) => prev.filter((b) => b.key !== current.key));
    setChecked({});
  };

  const handleDismiss = () => {
    if (current) setDismissed((prev) => new Set(prev).add(current.key));
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="glass-card gradient-border rounded-lg shadow-2xl max-w-md w-full overflow-hidden max-h-[85vh] flex flex-col"
          >
            <div className="bg-gold/10 border-b border-gold/20 px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                {current.icon && <span aria-hidden="true">{current.icon}</span>}
                {current.title}
              </h2>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Dismiss for now"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {current.body && (
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {current.body}
                </p>
              )}

              {current.type === "checklist" &&
                checklistItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex gap-3 items-start cursor-pointer rounded-md p-2 -mx-2 hover:bg-muted/40 transition-colors"
                  >
                    <Checkbox
                      checked={!!checked[item.id]}
                      onCheckedChange={(v) =>
                        setChecked((prev) => ({ ...prev, [item.id]: v === true }))
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{item.label}</span>
                      {item.desc && (
                        <span className="block text-xs text-muted-foreground mt-0.5">{item.desc}</span>
                      )}
                    </span>
                  </label>
                ))}

              {current.type === "features" &&
                featureItems.map((item) => (
                  <div key={item.title} className="border-l-2 border-gold/40 pl-3">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {item.desc && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    )}
                  </div>
                ))}
            </div>

            <div className="px-6 py-4 border-t border-border bg-muted/20 shrink-0">
              <Button
                onClick={handleAcknowledge}
                disabled={acknowledging || !canAcknowledge}
                className="w-full bg-gold text-haus-charcoal hover:bg-gold/90 font-semibold gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {acknowledging ? "Confirming…" : "I've read this — Confirm"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                {current.type === "checklist" && !canAcknowledge
                  ? "Tick each item to confirm"
                  : "This notice will keep appearing until confirmed"}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
