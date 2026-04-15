import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { OutcomeStatus, OUTCOME_CONFIG } from "@/types/opportunity";
import { OUTCOME_REASONS, OUTCOME_STATUS_LABELS, EMAIL_TRIGGERING_OUTCOMES } from "@/config/outcomeReasons";
import { cn } from "@/lib/utils";
import { AlertTriangle, Trophy, XCircle, Ban, ShieldX, ChevronDown } from "lucide-react";

const OUTCOME_ICONS: Record<OutcomeStatus, React.ReactNode> = {
  closed_won: <Trophy className="h-4 w-4" />,
  closed_lost: <XCircle className="h-4 w-4" />,
  disqualified: <Ban className="h-4 w-4" />,
  no_decision: <AlertTriangle className="h-4 w-4" />,
  underwriting_declined: <ShieldX className="h-4 w-4" />,
};

interface OutcomeSelectorProps {
  currentOutcome?: OutcomeStatus | null;
  currentReason?: string | null;
  onSelect: (outcome: OutcomeStatus, reason: string, notes: string) => Promise<void>;
  disabled?: boolean;
}

export const OutcomeSelector = ({ currentOutcome, currentReason, onSelect, disabled }: OutcomeSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeStatus | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedOutcome || !reason) return;
    setSubmitting(true);
    try {
      await onSelect(selectedOutcome, reason, notes);
      setOpen(false);
      setSelectedOutcome(null);
      setReason("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  if (currentOutcome) {
    const cfg = OUTCOME_CONFIG[currentOutcome];
    const reasonLabel = OUTCOME_REASONS[currentOutcome]?.find(r => r.value === currentReason)?.label ?? currentReason;
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className={cn("gap-1.5 text-xs font-semibold border", cfg.bgClass, cfg.textClass)}>
          <span>{cfg.icon}</span>
          {cfg.label}
        </Badge>
        {currentReason && (
          <span className="text-[10px] text-muted-foreground pl-0.5">{reasonLabel}</span>
        )}
      </div>
    );
  }

  const isEmailTriggering = selectedOutcome && EMAIL_TRIGGERING_OUTCOMES.includes(selectedOutcome);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5 border-dashed"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Set Outcome
        <ChevronDown className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Opportunity Outcome</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Outcome selection */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Outcome Status</Label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(OUTCOME_CONFIG) as OutcomeStatus[]).map((key) => {
                  const cfg = OUTCOME_CONFIG[key];
                  const isSelected = selectedOutcome === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setSelectedOutcome(key); setReason(""); }}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all text-sm",
                        isSelected
                          ? cn("border-2", cfg.bgClass, cfg.textClass)
                          : "border-border hover:border-foreground/20 text-foreground"
                      )}
                    >
                      <span className={cn("shrink-0", isSelected ? cfg.textClass : "text-muted-foreground")}>
                        {OUTCOME_ICONS[key]}
                      </span>
                      <div>
                        <p className="font-medium">{cfg.label}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Reason */}
            {selectedOutcome && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Outcome Reason <span className="text-destructive">*</span>
                </Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOME_REASONS[selectedOutcome].map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            {selectedOutcome && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional context about this outcome..."
                  rows={3}
                />
              </div>
            )}

            {/* Warning */}
            {selectedOutcome && (
              <div className={cn(
                "rounded-lg border p-3 flex items-start gap-2",
                isEmailTriggering
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-muted/30"
              )}>
                <AlertTriangle className={cn(
                  "h-4 w-4 shrink-0 mt-0.5",
                  isEmailTriggering
                    ? "text-amber-500"
                    : "text-muted-foreground"
                )} />
                <p className="text-xs text-muted-foreground">
                  {isEmailTriggering
                    ? "This will remove the opportunity from the active pipeline board. A compliance notification email will be automatically sent to the merchant contact. The outcome will be recorded in reports and search."
                    : <>
                        This will remove the opportunity from the active pipeline board.
                        {selectedOutcome === 'closed_won' && ' It will appear in the Live & Billing report.'}
                        {['closed_lost', 'no_decision'].includes(selectedOutcome) && ' No email will be sent to the client — this is an internal status.'}
                        {' '}The outcome can still be viewed in reports and search.
                      </>
                  }
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedOutcome || !reason || submitting}
            >
              {submitting ? 'Recording...' : 'Confirm Outcome'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
