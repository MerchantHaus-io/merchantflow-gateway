import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import { resolveNotificationRoute } from '@/lib/notification-routes';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
  notification_category?: string | null;
}

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  // Infer an in-app route from a notification's title/message when no explicit link exists
  const inferLink = (n: Notification): string | null => {
    if (n.link) return n.link;
    const text = `${n.title ?? ''} ${n.message ?? ''}`.toLowerCase();
    const map: Array<[RegExp, string]> = [
      [/\btask(s)?\b/, '/my-tasks'],
      [/\bcalendar|meeting|event\b/, '/calendar'],
      [/\bopportun|pipeline|deal\b/, '/opportunities'],
      [/\baccount\b/, '/accounts'],
      [/\bcontact\b/, '/contacts'],
      [/\bcommission\b/, '/commissions'],
      [/\bquote|contract\b/, '/quotes-contracts'],
      [/\breferr(er|al)\b/, '/referrers'],
      [/\bsupport|ticket\b/, '/support-triage'],
      [/\bbilling|invoice|live account\b/, '/live-billing'],
      [/\bdocument\b/, '/documents'],
      [/\bintegration|gmail|google\b/, '/integrations'],
      [/\bsetting|profile|avatar\b/, '/settings'],
      [/\bpatch note|terminal update|what's new\b/, '/terminal-updates'],
      [/\bnmi|gateway\b/, '/gateway-accounts'],
    ];
    for (const [re, path] of map) if (re.test(text)) return path;
    return null;
  };

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user]);

  const fetchNotifications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error('Failed to load notifications');
    } else {
      setNotifications(data || []);
    }
    setLoading(false);
  };

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete notification');
    } else {
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;

    await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  return (
    <AppLayout
      pageTitle="Notifications"
      headerActions={
        <Button variant="outline" size="sm" onClick={markAllAsRead}>
          <Check className="h-4 w-4 mr-2" />
          Mark all as read
        </Button>
      }
    >
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No notifications yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => {
                const targetLink = inferLink(notification);
                const openLink = () => {
                  if (!targetLink) return;
                  if (!notification.read) markAsRead(notification.id);
                  navigate(targetLink);
                };
                return (
                <Card
                  key={notification.id}
                  onClick={targetLink ? openLink : undefined}
                  role={targetLink ? 'link' : undefined}
                  tabIndex={targetLink ? 0 : undefined}
                  onKeyDown={targetLink ? (e) => { if (e.key === 'Enter') openLink(); } : undefined}
                  className={cn(
                    'transition-colors',
                    !notification.read && 'border-primary/50 bg-primary/5',
                    targetLink && 'cursor-pointer hover:bg-muted/40'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          'w-3 h-3 rounded-full mt-1.5 flex-shrink-0',
                          notification.type === 'success' && 'bg-emerald-500',
                          notification.type === 'error' && 'bg-destructive',
                          notification.type === 'warning' && 'bg-amber-500',
                          notification.type === 'info' && 'bg-primary'
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold flex items-center gap-1.5">
                            {notification.title}
                            {targetLink && <ArrowUpRight className="h-3.5 w-3.5 text-primary/70" />}
                          </h3>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                          {targetLink && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openLink(); }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Open {targetLink}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => markAsRead(notification.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteNotification(notification.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </div>
    </AppLayout>
  );
};

export default Notifications;
