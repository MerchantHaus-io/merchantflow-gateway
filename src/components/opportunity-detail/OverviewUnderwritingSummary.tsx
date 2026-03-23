import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wand2, ChevronRight, MessageSquare, Clock, User } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { EMAIL_TO_USER } from "@/types/opportunity";

interface Props {
  opportunityId: string;
  onNavigate: () => void;
}

interface LatestNote {
  id: string;
  content: string;
  user_email: string;
  created_at: string;
}

const displayName = (email: string) => EMAIL_TO_USER[email?.toLowerCase()] || email || "Unknown";

export const OverviewUnderwritingSummary = ({ opportunityId, onNavigate }: Props) => {
  const { user } = useAuth();
  const [latestReport, setLatestReport] = useState<LatestNote | null>(null);
  const [latestNote, setLatestNote] = useState<LatestNote | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);

      // Fetch latest AI underwriting report (saved as notes with specific prefix)
      const { data: reports } = await supabase
        .from("comments")
        .select("id, content, user_email, created_at")
        .eq("opportunity_id", opportunityId)
        .like("content", "## AI Underwriting Review%")
        .order("created_at", { ascending: false })
        .limit(1);

      if (reports?.length) {
        setLatestReport(reports[0] as LatestNote);
      }

      // Fetch latest general note
      const { data: notes } = await supabase
        .from("comments")
        .select("id, content, user_email, created_at")
        .eq("opportunity_id", opportunityId)
        .not("content", "like", "## AI Underwriting Review%")
        .order("created_at", { ascending: false })
        .limit(1);

      if (notes?.length) {
        setLatestNote(notes[0] as LatestNote);
      }

      setIsLoading(false);
    };

    fetchData();
  }, [opportunityId]);

  const handleQuickNote = async () => {
    if (!newNote.trim() || !user) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        opportunity_id: opportunityId,
        content: newNote.trim(),
        user_id: user.id,
        user_email: user.email,
      });
      if (error) throw error;
      setLatestNote({
        id: crypto.randomUUID(),
        content: newNote.trim(),
        user_email: user.email || "",
        created_at: new Date().toISOString(),
      });
      setNewNote("");
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Wand2 className="h-4 w-4" />
          Underwriting & Notes
        </h3>
        <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Wand2 className="h-4 w-4" />
          Underwriting & Notes
        </h3>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onNavigate}>
          Full Review <ChevronRight className="h-3 w-3 ml-1" />
        </Button>
      </div>

      {/* Latest UW Report Summary */}
      {latestReport ? (
        <button
          onClick={onNavigate}
          className="w-full text-left rounded-lg border border-border bg-card/50 p-3 space-y-1.5 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Wand2 className="h-3 w-3" />
              Latest UW Report
            </Badge>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(latestReport.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {latestReport.content.split("\n").slice(0, 2).join(" ").substring(0, 150)}…
          </p>
          <span className="text-[10px] text-primary font-medium">View full report →</span>
        </button>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-2">
          <Wand2 className="h-6 w-6 mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No underwriting review yet</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onNavigate}>
            <Wand2 className="h-3 w-3 mr-1" />
            Run Underwriting Review
          </Button>
        </div>
      )}

      {/* Latest note */}
      {latestNote && (
        <div className="rounded-lg border border-border bg-card/30 p-2.5 space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span className="font-medium">{displayName(latestNote.user_email)}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(latestNote.created_at), { addSuffix: true })}</span>
          </div>
          <p className="text-xs text-foreground/80 line-clamp-2">{latestNote.content}</p>
        </div>
      )}

      {/* Quick note input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Quick note…"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[36px] h-9 text-xs resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleQuickNote();
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-9 px-3"
          onClick={handleQuickNote}
          disabled={!newNote.trim() || isSubmitting}
        >
          <MessageSquare className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
