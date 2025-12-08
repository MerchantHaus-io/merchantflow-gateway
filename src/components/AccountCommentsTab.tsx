import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { STAGE_CONFIG, OpportunityStage } from "@/types/opportunity";

interface Comment {
  id: string;
  opportunity_id: string;
  user_email: string | null;
  content: string;
  created_at: string;
  opportunity?: {
    stage: string;
    account?: {
      name: string;
    };
  };
}

interface AccountCommentsTabProps {
  accountId: string;
}

const AccountCommentsTab = ({ accountId }: AccountCommentsTabProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAccountComments();
  }, [accountId]);

  const fetchAccountComments = async () => {
    // First get all opportunities for this account
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select('id')
      .eq('account_id', accountId);

    if (oppError || !opportunities?.length) {
      setLoading(false);
      return;
    }

    const opportunityIds = opportunities.map(o => o.id);

    // Then get all comments for those opportunities
    const { data: commentsData, error: commentsError } = await supabase
      .from('comments')
      .select(`
        *,
        opportunity:opportunities(stage)
      `)
      .in('opportunity_id', opportunityIds)
      .order('created_at', { ascending: false });

    if (!commentsError && commentsData) {
      setComments(commentsData as Comment[]);
    }
    setLoading(false);
  };

  const getStageLabel = (stage: string) => {
    return STAGE_CONFIG[stage as OpportunityStage]?.label || stage;
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <div className="animate-pulse">Loading comments...</div>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No comments on any opportunities</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[400px] overflow-y-auto">
      {comments.map((comment) => (
        <div 
          key={comment.id} 
          className="p-3 bg-muted/50 rounded-lg space-y-2"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {comment.user_email || 'Unknown'}
            </span>
            <span>•</span>
            <span>{format(new Date(comment.created_at), 'MMM d, yyyy h:mm a')}</span>
            {comment.opportunity?.stage && (
              <>
                <span>•</span>
                <span className="text-primary">
                  {getStageLabel(comment.opportunity.stage)}
                </span>
              </>
            )}
          </div>
          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
        </div>
      ))}
    </div>
  );
};

export default AccountCommentsTab;
