import { useState, useEffect } from "react";
import { Opportunity, STAGE_CONFIG } from "@/types/opportunity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertCircle, Clock, CheckCircle2, Edit2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface StatusBlockerFloatingProps {
  opportunity: Opportunity;
  wizardProgress: number;
  onUpdate: (updates: Partial<Opportunity>) => void;
}

type StatusType = "moving" | "waiting" | "blocked";

const STATUS_CONFIG: Record<
  StatusType,
  { label: string; icon: React.ElementType; colorClass: string; bgClass: string; progressClass: string }
> = {
  moving: {
    label: "Moving",
    icon: CheckCircle2,
    colorClass: "text-success",
    bgClass: "bg-success/10 border-success/30",
    progressClass: "bg-success",
  },
  waiting: {
    label: "Waiting",
    icon: Clock,
    colorClass: "text-warning",
    bgClass: "bg-warning/10 border-warning/30",
    progressClass: "bg-warning",
  },
  blocked: {
    label: "Blocked",
    icon: AlertCircle,
    colorClass: "text-destructive",
    bgClass: "bg-destructive/10 border-destructive/30",
    progressClass: "bg-destructive",
  },
};

export const StatusBlockerFloating = ({ opportunity, wizardProgress, onUpdate }: StatusBlockerFloatingProps) => {
  const { user } = useAuth();
  const [isEditingBlocker, setIsEditingBlocker] = useState(false);
  const [blockerReason, setBlockerReason] = useState("");
  const [currentBlocker, setCurrentBlocker] = useState<string | null>(null);

  const stageConfig = STAGE_CONFIG[opportunity.stage];

  useEffect(() => {
    const fetchLatestBlocker = async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("description")
        .eq("opportunity_id", opportunity.id)
        .eq("type", "blocker")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return;
      if (data?.description) {
        setCurrentBlocker(data.description);
        setBlockerReason(data.description);
      }
    };

    fetchLatestBlocker();
  }, [opportunity.id]);

  const determineStatus = (): StatusType => {
    if (opportunity.status === "dead") return "blocked";
    if (opportunity.sla_status === "red") return "blocked";
    if (currentBlocker) return "blocked";

    const stageEnteredAt = opportunity.stage_entered_at ? new Date(opportunity.stage_entered_at) : new Date(opportunity.created_at);
    const daysSinceStageEntry = Math.floor((Date.now() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceStageEntry > 3 || opportunity.sla_status === "amber") return "waiting";
    return "moving";
  };

  const status = determineStatus();
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  const handleSaveBlocker = async () => {
    if (!user) {
      toast.error("You must be logged in");
      return;
    }
    try {
      if (blockerReason.trim()) {
        await supabase.from("activities").insert({
          opportunity_id: opportunity.id,
          type: "blocker",
          description: blockerReason.trim(),
          user_id: user.id,
          user_email: user.email,
        });
        setCurrentBlocker(blockerReason.trim());
        toast.success("Blocker saved");
      } else {
        await supabase.from("activities").insert({
          opportunity_id: opportunity.id,
          type: "blocker_cleared",
          description: "Blocker cleared",
          user_id: user.id,
          user_email: user.email,
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
    <div className="absolute top-2 right-14 z-20">
      <Popover>
        <PopoverTrigger asChild>
          <button className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${statusConfig.bgClass} ${statusConfig.colorClass} hover:opacity-90`}>
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
            <span className="text-[10px] opacity-70">{wizardProgress}%</span>
            <div className="w-10 h-1 rounded-full bg-muted overflow-hidden ml-1">
              <div
                className={`h-full transition-all ${statusConfig.progressClass}`}
                style={{ width: `${Math.min(wizardProgress, 100)}%` }}
              />
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full border ${statusConfig.bgClass}`}>
                <StatusIcon className={`h-3.5 w-3.5 ${statusConfig.colorClass}`} />
              </div>
              <div>
                <span className={`font-semibold text-sm ${statusConfig.colorClass}`}>{statusConfig.label}</span>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 ml-1.5">
                  {stageConfig.label}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{wizardProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${statusConfig.progressClass}`}
                style={{ width: `${Math.min(wizardProgress, 100)}%` }}
              />
            </div>
          </div>

          {isEditingBlocker ? (
            <div className="space-y-2">
              <Textarea
                placeholder="What is blocking progress?"
                value={blockerReason}
                onChange={(e) => setBlockerReason(e.target.value)}
                className="min-h-[64px] text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveBlocker} className="h-7 text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
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
            <div className="flex items-center justify-between gap-2">
              {currentBlocker ? (
                <p className="text-xs text-foreground/90 line-clamp-2 flex-1">{currentBlocker}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic flex-1">No blocker logged</p>
              )}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setIsEditingBlocker(true)}>
                <Edit2 className="h-3 w-3 mr-1" />
                {currentBlocker ? "Edit" : "Add"}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
