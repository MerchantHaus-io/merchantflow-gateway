import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Bot, Sparkles, MessageSquare, FileText, Phone, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useBroadcastSlot } from "@/components/BroadcastQueue";

const BROADCAST_KEY = "atria-abilities-2026-03-13";
const BROADCAST_CREATED = new Date("2026-03-13T00:00:00Z");
const BROADCAST_EXPIRY_DAYS = 14;

const NEW_ABILITIES = [
  {
    icon: Sparkles,
    title: "Create Full Deals",
    desc: "Ask Atria to create a new merchant — she'll set up the Account, Contact, and Opportunity in one shot.",
  },
  {
    icon: FileText,
    title: "Manage Documents",
    desc: "Relabel document categories directly from chat. Just tell Atria which doc to recategorise.",
  },
  {
    icon: Phone,
    title: "Log Client Interactions",
    desc: "Record calls, emails, meetings, and notes against any account with outcome and follow-up tracking.",
  },
  {
    icon: Shield,
    title: "Run Underwriting Validation",
    desc: "Trigger a full document completeness and compliance check from chat — no need to open the deal.",
  },
  {
    icon: MessageSquare,
    title: "9-Stage SOP Knowledge",
    desc: "Atria now knows the full 9-stage sales workflow, per-stage doc checklists, and data integrity rules.",
  },
];

export function AtriaBroadcast() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const slotOk = useBroadcastSlot(BROADCAST_KEY, 4, visible);

  useEffect(() => {
    if (!user) return;

    const now = new Date();
    const expiryDate = new Date(BROADCAST_CREATED);
    expiryDate.setDate(expiryDate.getDate() + BROADCAST_EXPIRY_DAYS);
    if (now > expiryDate) return;

    supabase
      .from("broadcast_acknowledgments")
      .select("id")
      .eq("broadcast_key", BROADCAST_KEY)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setVisible(true);
      });
  }, [user]);

  const handleAcknowledge = async () => {
    if (!user) return;
    setAcknowledging(true);
    await supabase.from("broadcast_acknowledgments").insert({
      broadcast_key: BROADCAST_KEY,
      user_id: user.id,
      user_email: user.email || "",
    });
    setVisible(false);
    setAcknowledging(false);
  };

  const handleDismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
            onClick={handleDismiss}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg rounded-2xl border border-primary/20 bg-card shadow-2xl shadow-primary/10 overflow-hidden">
              {/* Header */}
              <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center ring-2 ring-primary/20">
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground tracking-tight">Meet the New Atria</h2>
                    <p className="text-sm text-muted-foreground">Your AI teammate just got a major upgrade</p>
                  </div>
                </div>
              </div>

              {/* Abilities list */}
              <div className="px-6 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
                {NEW_ABILITIES.map((ability, i) => (
                  <motion.div
                    key={ability.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/50"
                  >
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ability.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{ability.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{ability.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Chat with Atria in the <span className="font-medium text-primary">#atria-ai</span> channel or tap her icon
                </p>
                <Button
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  size="sm"
                  className="shrink-0 gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {acknowledging ? "…" : "Got it"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
