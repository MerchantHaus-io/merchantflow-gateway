import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const BROADCAST_KEY = "nmi-boarding-live-2026-03-28";
const BROADCAST_CREATED = new Date("2026-03-28T00:00:00Z");
const BROADCAST_EXPIRY_DAYS = 14;

export function NMIBoardingBroadcast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

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

  const handleGoToBoarding = async () => {
    await handleAcknowledge();
    navigate("/tools/nmi-boarding");
  };

  const handleDismiss = () => setVisible(false);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="glass-card gradient-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
          >
            {/* Hero Header */}
            <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border-b border-primary/20 px-6 py-6 text-center overflow-hidden">
              {/* Decorative glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 animate-pulse" />
              <div className="relative">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
                  className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 mb-3"
                >
                  <Zap className="h-8 w-8 text-primary" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xl font-bold text-foreground tracking-tight"
                >
                  NMI Gateway Boarding is Live
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-xs text-muted-foreground mt-1"
                >
                  New CRM Tool — Effective Immediately
                </motion.p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                You can now <span className="font-semibold text-primary">board merchants directly to the NMI gateway</span> from inside the CRM — no need to leave the platform or use external portals.
              </p>

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">What's included:</p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>Link any active opportunity to auto-populate merchant data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>Multi-step wizard with validation at every stage</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>VAR/Tear Sheet upload support (optional)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>Submits directly to the NMI Partner API — live gateway IDs returned instantly</span>
                  </li>
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                Access anytime via <span className="font-medium text-foreground">Tools → NMI Boarding</span> in the sidebar.
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/20 space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleGoToBoarding}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
                >
                  <Zap className="h-4 w-4" />
                  Open NMI Boarding
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {acknowledging ? "…" : "Got it"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                This announcement will appear until confirmed or for 14 days
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
