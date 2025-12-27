import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { EMAIL_TO_USER } from "@/types/opportunity";

interface Note {
  id: string;
  content: string;
  user_email: string;
  created_at: string;
}

interface NotesSectionProps {
  opportunityId: string;
}

export const NotesSection = ({ opportunityId }: NotesSectionProps) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [opportunityId]);

  const fetchNotes = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("id, content, user_email, created_at")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setNotes(data);
    }
    setIsLoading(false);
  };

  const handleSubmit = async () => {
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

      // Also log as activity
      await supabase.from("activities").insert({
        opportunity_id: opportunityId,
        type: "note",
        description: `Note added: ${newNote.trim().substring(0, 100)}${newNote.length > 100 ? "..." : ""}`,
        user_id: user.id,
        user_email: user.email,
      });

      setNewNote("");
      fetchNotes();
      toast.success("Note added");
    } catch (error) {
      console.error("Error adding note:", error);
      toast.error("Failed to add note");
    }
    setIsSubmitting(false);
  };

  const getUserName = (email: string): string => {
    return EMAIL_TO_USER[email] || email.split("@")[0];
  };

  const getInitials = (email: string): string => {
    const name = getUserName(email);
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Notes
      </h3>

      {/* Add note form */}
      <div className="space-y-2">
        <Textarea
          placeholder="What does the next person need to know?"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          className="min-h-[80px] text-sm"
        />
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!newNote.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Send className="h-3 w-3 mr-1" />
          )}
          Add Note
        </Button>
      </div>

      {/* Notes list */}
      {isLoading ? (
        <div className="text-center py-4 text-muted-foreground text-sm">
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No notes yet</p>
          <p className="text-xs mt-1">Add context for the next person</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {notes.map((note) => (
            <div key={note.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {getInitials(note.user_email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {getUserName(note.user_email)}
                  </span>
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}</span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{note.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
