import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";

const BROADCAST_KEY = "compliance-controls-2026-03-12";
const BROADCAST_CREATED = new Date("2026-03-12T00:00:00Z");
const BROADCAST_EXPIRY_DAYS = 14;

const CONTROLS = [
  {
    id: "kyc",
    label: "Owner Identity Verification (KYC / CDD)",
    desc: "Passport or Driver's License is now a mandatory document before any deal can proceed to underwriting.",
  },
  {
    id: "ofac",
    label: "OFAC / Sanctions Screening",
    desc: "All business names, DBAs, and principal owners are now screened against OFAC SDN and sanctions lists during AI Underwriting Review.",
  },
  {
    id: "bo",
    label: "Beneficial Ownership Declaration (FinCEN CDD Rule)",
    desc: "At least one beneficial owner with 25%+ equity must be recorded before an opportunity can proceed to underwriting.",
  },
  {
    id: "sla",
    label: "Stage SLA Timers & Escalation",
    desc: "Each pipeline stage now has defined SLA thresholds. Amber and red alerts auto-generate tasks and notifications on breach.",
  },
  {
    id: "dupe",
    label: "Duplicate Merchant Detection",
    desc: "When moving past Discovery, the system checks for matching EINs and legal names and surfaces warnings to prevent duplicate submissions.",
  },
  {
    id: "risk",
    label: "High-Risk MCC Flagging",
    desc: "AI Underwriting Review now identifies and flags high-risk MCC codes (e.g., gambling, direct marketing) with a risk tier badge.",
  },
  {
    id: "gateway",
    label: "Gateway-Only Lighter Requirements",
    desc: "Gateway-only clients now follow a streamlined path — only Voided Check and VAR/Tear Sheet are required, with no full underwriting scrutiny.",
  },
];

export function ComplianceBroadcast() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = CONTROLS.every((c) => checked[c.id]);

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
    if (!user || !allChecked) return;
    setAcknowledging(true);
    await supabase.from("broadcast_acknowledgments").insert({
      broadcast_key: BROADCAST_KEY,
      user_id: user.id,
      user_email: user.email || "",
    });
    setVisible(false);
    setAcknowledging(false);
  };

  const toggleCheck = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ scale: 0.92, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 30 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="rounded-xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] flex flex-col bg-[hsl(220,20%,14%)] border border-white/10"
          >
            {/* Header — no close button, mandatory */}
            <div className="bg-white/5 border-b border-white/10 px-6 py-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">
                    New Compliance Controls
                  </h2>
                  <p className="text-xs text-white/50">
                    Mandatory acknowledgment required before proceeding
                  </p>
                </div>
              </div>
            </div>

            {/* Body — scrollable */}
            <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
              <p className="text-sm text-white/70 leading-relaxed">
                The following compliance and risk controls have been implemented
                across the platform. Please review each item and confirm your
                understanding by checking every box below.
              </p>

              <div className="space-y-2 pt-1">
                {CONTROLS.map((control, i) => (
                  <motion.label
                    key={control.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked[control.id]
                        ? "bg-primary/10 border-primary/30"
                        : "bg-white/5 border-white/10 hover:border-white/20"
                    }`}
                  >
                    <Checkbox
                      checked={!!checked[control.id]}
                      onCheckedChange={() => toggleCheck(control.id)}
                      className="mt-0.5 shrink-0 border-white/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white leading-tight">
                        {control.label}
                      </p>
                      <p className="text-xs text-white/60 mt-0.5 leading-relaxed">
                        {control.desc}
                      </p>
                    </div>
                  </motion.label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 bg-white/5 shrink-0">
              <Button
                onClick={handleAcknowledge}
                disabled={!allChecked || acknowledging}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                {acknowledging
                  ? "Confirming…"
                  : allChecked
                  ? "I understand — Confirm"
                  : `Acknowledge all ${CONTROLS.length} controls to continue`}
              </Button>
              <p className="text-[10px] text-white/40 text-center mt-2">
                This notice cannot be dismissed — you must acknowledge all items to proceed
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
