import { useState, useEffect } from "react";
import { Opportunity, STAGE_CONFIG } from "@/types/opportunity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Clock, CheckCircle2, Edit2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface StatusBlockerPanelProps {
  opportunity: Opportunity;
  wizardProgress: number;
  onUpdate: (updates: Partial<Opportunity>) => void;
}

type StatusType = "moving" | "waiting" | "blocked";

const STATUS_CONFIG: Record<StatusType, { label: string; icon: React.ElementType; colorClass: string; bgClass: string }> = {
  moving: {
    label: "Moving",
    icon: CheckCircle2,
    colorClass: "text-emerald-500",
    bgClass: "bg-emerald-500/10 border-emerald-500/30",
  },
  waiting: {
    label: "Waiting",
    icon: Clock,
    colorClass: "text-amber-500",
    bgClass: "bg-amber-500/10 border-amber-500/30",
  },
  blocked: {
    label: "Blocked",
    icon: AlertCircle,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/10 border-destructive/30",
  },
};

export const StatusBlockerPanel = ({ opportunity, wizardProgress, onUpdate }: StatusBlockerPanelProps) => {
  const { user } = useAuth();
  const [isEditingBlocker, setIsEditingBlocker] = useState(false);
  const [blockerReason, setBlockerReason] = useState("");
  const [currentBlocker, setCurrentBlocker] = useState<string | null>(null);

  const stageConfig = STAGE_CONFIG[opportunity.stage];

  // Fetch latest blocker note on mount
  useEffect(() => {
    const fetchLatestBlocker = async () => {
      const { data } = await supabase
        .from("activities")
        .select("description")
        .eq("opportunity_id", opportunity.id)
        .eq("type", "blocker")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (data?.description) {
        setCurrentBlocker(data.description);
        setBlockerReason(data.description);
      }
    };
    fetchLatestBlocker();
  }, [opportunity.id]);

  // Determine status based on various signals
  const determineStatus = (): StatusType => {
    if (opportunity.status === "dead") return "blocked";
    if (opportunity.sla_status === "red") return "blocked";
    if (currentBlocker) return "blocked";
    
    // Check stage duration - if > 3 days without activity, it's waiting
    const stageEnteredAt = opportunity.stage_entered_at ? new Date(opportunity.stage_entered_at) : new Date(opportunity.created_at);
    const daysSinceStageEntry = Math.floor((Date.now() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceStageEntry > 3 || opportunity.sla_status === "amber") return "waiting";
    return "moving";
  };

  const status = determineStatus();
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  const handleSaveBlocker = async () => {
    try {
      if (blockerReason.trim()) {
        // Add blocker as activity
        await supabase.from("activities").insert({
          opportunity_id: opportunity.id,
          type: "blocker",
          description: blockerReason.trim(),
          user_id: user?.id,
          user_email: user?.email,
        });
        setCurrentBlocker(blockerReason.trim());
        toast.success("Blocker saved");
      } else {
        // Clear blocker by adding a "blocker cleared" activity
        await supabase.from("activities").insert({
          opportunity_id: opportunity.id,
          type: "blocker_cleared",
          description: "Blocker cleared",
          user_id: user?.id,
          user_email: user?.email,
        });
        setCurrentBlocker(null);
        toast.success("Blocker cleared");
      }
      
      setIsEditingBlocker(false);
    } catch (error) {
      console.error("Error updating blocker:", error);
      toast.error("Failed to update blocker");
    }
  };

  return (
    <div className={`rounded-lg border p-4 ${statusConfig.bgClass}`}>
      <div className="flex items-start justify-between gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-full ${statusConfig.bgClass}`}>
            <StatusIcon className={`h-5 w-5 ${statusConfig.colorClass}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${statusConfig.colorClass}`}>
                {statusConfig.label}
              </span>
              <Badge variant="outline" className="text-xs">
                {stageConfig.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {wizardProgress}% complete
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex-1 max-w-[200px]">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${
                wizardProgress >= 100 ? "bg-emerald-500" : 
                wizardProgress >= 50 ? "bg-amber-500" : "bg-destructive"
              }`}
              style={{ width: `${Math.min(wizardProgress, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Blocker reason */}
      <div className="mt-4">
        {isEditingBlocker ? (
          <div className="space-y-2">
            <Textarea
              placeholder="What is blocking progress? Who owns the resolution?"
              value={blockerReason}
              onChange={(e) => setBlockerReason(e.target.value)}
              className="min-h-[80px] text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveBlocker}>
                <Check className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => {
                  setBlockerReason(currentBlocker || "");
                  setIsEditingBlocker(false);
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            {currentBlocker ? (
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Blocking Reason
                </p>
                <p className="text-sm">{currentBlocker}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No blockers reported
              </p>
            )}
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => setIsEditingBlocker(true)}
            >
              <Edit2 className="h-3 w-3 mr-1" />
              {currentBlocker ? "Edit" : "Add Blocker"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
