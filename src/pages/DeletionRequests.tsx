import { useState, useEffect } from 'react';
import { Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/AppLayout';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DeletionRequest {
  id: string;
  requester_id: string;
  requester_email: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  reason: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

const DeletionRequests = () => {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    request: DeletionRequest | null;
    action: 'approve' | 'reject';
  }>({ open: false, request: null, action: 'approve' });

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/');
      return;
    }
    if (isAdmin) {
      fetchRequests();
    }
  }, [isAdmin, roleLoading, navigate]);

  const fetchRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deletion_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load deletion requests');
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    const request = confirmDialog.request;
    if (!request) return;

    try {
      if (action === 'approve') {
        // Delete the actual entity
        const tableName = request.entity_type === 'opportunity' ? 'opportunities' 
          : request.entity_type === 'account' ? 'accounts' 
          : 'contacts';
        
        const { error: deleteError } = await supabase
          .from(tableName)
          .delete()
          .eq('id', request.entity_id);

        if (deleteError) throw deleteError;
      }

      // Update the request status
      await supabase
        .from('deletion_requests')
        .update({
          status: action === 'approve' ? 'approved' : 'rejected',
          resolved_at: new Date().toISOString(),
          resolved_by: user?.email,
        })
        .eq('id', request.id);

      // Send notification to requester
      await supabase.from('notifications').insert({
        user_id: request.requester_id,
        user_email: request.requester_email,
        title: action === 'approve' ? 'Deletion Request Approved' : 'Deletion Request Rejected',
        message: action === 'approve'
          ? `Your request to delete "${request.entity_name}" has been approved and the ${request.entity_type} has been deleted.`
          : `Your request to delete "${request.entity_name}" has been rejected.`,
        type: action === 'approve' ? 'success' : 'warning',
      });

      toast.success(`Request ${action === 'approve' ? 'approved' : 'rejected'}`);
      fetchRequests();
    } catch (error) {
      toast.error(`Failed to ${action} request`);
    }

    setConfirmDialog({ open: false, request: null, action: 'approve' });
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AppLayout pageTitle="Deletion Requests">
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Trash2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No deletion requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <Card key={request.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{request.entity_name}</h3>
                          <Badge variant="outline" className="capitalize">
                            {request.entity_type}
                          </Badge>
                          <Badge
                            variant={
                              request.status === 'pending'
                                ? 'default'
                                : request.status === 'approved'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {request.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Requested by: {request.requester_email}
                        </p>
                        {request.reason && (
                          <p className="text-sm mt-2">Reason: {request.reason}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                        {request.resolved_at && (
                          <p className="text-xs text-muted-foreground">
                            Resolved by {request.resolved_by} on{' '}
                            {format(new Date(request.resolved_at), 'MMM d, yyyy h:mm a')}
                          </p>
                        )}
                      </div>
                      {request.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setConfirmDialog({ open: true, request, action: 'approve' })
                            }
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmDialog({ open: true, request, action: 'reject' })
                            }
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog({ ...confirmDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.action === 'approve' ? 'Approve Deletion' : 'Reject Request'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.action === 'approve'
                ? `This will permanently delete "${confirmDialog.request?.entity_name}". This action cannot be undone.`
                : `This will reject the deletion request for "${confirmDialog.request?.entity_name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction(confirmDialog.action)}
              className={
                confirmDialog.action === 'approve'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {confirmDialog.action === 'approve' ? 'Delete' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default DeletionRequests;
