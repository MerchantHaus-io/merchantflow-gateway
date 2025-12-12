import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Pencil, Trash2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/useUserRole";

interface Comment {
  id: string;
  opportunity_id: string;
  user_id: string | null;
  user_email: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

interface CommentsTabProps {
  opportunityId: string;
}

const CommentsTab = ({ opportunityId }: CommentsTabProps) => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`comments-${opportunityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `opportunity_id=eq.${opportunityId}`
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [opportunityId]);

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('id, opportunity_id, user_id, user_email, content, created_at, updated_at')
      .eq('opportunity_id', opportunityId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setComments(data);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;

    setIsSubmitting(true);
    const { error } = await supabase
      .from('comments')
      .insert({
        opportunity_id: opportunityId,
        user_id: user.id,
        user_email: user.email,
        content: newComment.trim(),
      });

    if (error) {
      toast.error('Failed to add comment');
    } else {
      setNewComment("");
      toast.success('Comment added');
    }
    setIsSubmitting(false);
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;

    const { error } = await supabase
      .from('comments')
      .update({ content: editContent.trim() })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update comment');
    } else {
      setEditingId(null);
      setEditContent("");
      toast.success('Comment updated');
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete comment');
    } else {
      toast.success('Comment deleted');
    }
  };

  const startEditing = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const canEditDelete = (comment: Comment) => {
    return comment.user_id === user?.id || isAdmin;
  };

  return (
    <div className="space-y-4">
      {/* New comment input */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[80px] resize-none"
        />
        <div className="flex justify-end">
          <Button 
            size="sm" 
            onClick={handleSubmit}
            disabled={!newComment.trim() || isSubmitting}
          >
            <Send className="h-4 w-4 mr-1" />
            {isSubmitting ? 'Posting...' : 'Post'}
          </Button>
        </div>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No comments yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div 
              key={comment.id} 
              className="p-3 bg-muted/50 rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.user_email || 'Unknown'}
                    </span>
                    <span>•</span>
                    <span>{format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}</span>
                    {comment.updated_at !== comment.created_at && (
                      <span className="italic">(edited)</span>
                    )}
                  </div>
                </div>
                {canEditDelete(comment) && !editingId && (
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6"
                      onClick={() => startEditing(comment)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleDelete(comment.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              
              {editingId === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[60px] resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setEditingId(null);
                        setEditContent("");
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleEdit(comment.id)}
                      disabled={!editContent.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CommentsTab;
