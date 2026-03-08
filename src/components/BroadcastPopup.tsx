import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

const BROADCAST_KEY = "eob-update-2026-02-20";
const BROADCAST_CREATED = new Date("2026-02-20T00:00:00Z");
const BROADCAST_EXPIRY_DAYS = 7;

const BROADCAST_MESSAGE = `Please update all current accounts accordingly before the end of business today.

Update statuses, mark irrelevant leads as Dead, and add appropriate notes so we can move into next week strong.

If anything's unclear, message me.

— Darryn`;

export function BroadcastPopup() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if broadcast has expired (older than 7 days)
    const now = new Date();
    const expiryDate = new Date(BROADCAST_CREATED);
    expiryDate.setDate(expiryDate.getDate() + BROADCAST_EXPIRY_DAYS);
    if (now > expiryDate) return;

    // Check if user already acknowledged
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

  // Dismiss without acknowledging — will reappear on next session
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
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="glass-card gradient-border rounded-lg shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gold/10 border-b border-gold/20 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                📢 Team Notice
              </h2>
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Dismiss for now"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
                {BROADCAST_MESSAGE}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border bg-muted/20">
              <Button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="w-full bg-gold text-haus-charcoal hover:bg-gold/90 font-semibold gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {acknowledging ? "Confirming…" : "I've read this — Confirm"}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                This notice will appear until confirmed or for 7 days
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
