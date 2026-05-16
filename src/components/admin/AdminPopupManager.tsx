import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Plus, Trash2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";

interface AdminPopup {
  id: string;
  title: string;
  content: string;
  min_display_seconds: number;
  is_active: boolean;
  created_by_email: string;
  created_at: string;
  expires_at: string | null;
}

interface Ack {
  popup_id: string;
  user_email: string;
  acknowledged_at: string;
}

export function AdminPopupManager() {
  const { user } = useAuth();
  const [popups, setPopups] = useState<AdminPopup[]>([]);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [minSeconds, setMinSeconds] = useState(10);
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from("admin_popups").select("*").order("created_at", { ascending: false }),
      supabase.from("admin_popup_acknowledgments").select("popup_id, user_email, acknowledged_at"),
    ]);
    if (p) setPopups(p as AdminPopup[]);
    if (a) setAcks(a as Ack[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const createPopup = async () => {
    if (!title.trim() || !content.trim() || !user) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("admin_popups").insert({
        title: title.trim(),
        content: content.trim(),
        min_display_seconds: minSeconds,
        created_by: user.id,
        created_by_email: user.email || "",
      });
      if (error) throw error;
      toast.success("Popup notification created");
      setTitle("");
      setContent("");
      setMinSeconds(10);
      setCreateOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("admin_popups").update({ is_active: active }).eq("id", id);
    fetchData();
  };

  const deletePopup = async (id: string) => {
    await supabase.from("admin_popups").delete().eq("id", id);
    toast.success("Popup deleted");
    fetchData();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Admin Popup Notifications
            </CardTitle>
            <CardDescription>Create and track mandatory popup notifications for users</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create Popup
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Popup Notification</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title" maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label>Content *</Label>
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Message content…" rows={4} maxLength={2000} />
                </div>
                <div className="space-y-2">
                  <Label>Minimum display time (seconds)</Label>
                  <Input type="number" value={minSeconds} onChange={(e) => setMinSeconds(Number(e.target.value))} min={5} max={120} />
                </div>
                <Button onClick={createPopup} disabled={!title.trim() || !content.trim() || creating} className="w-full">
                  {creating ? "Creating…" : "Create & Push to All Users"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : popups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No popups created yet</p>
        ) : (
          <div className="space-y-3">
            {popups.map((p) => {
              const popupAcks = acks.filter(a => a.popup_id === p.id);
              return (
                <div key={p.id} className="border border-border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.content}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant={p.is_active ? "default" : "outline"} className="text-[10px]">
                          {p.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(p.created_at), "dd MMM yyyy HH:mm")} · {p.min_display_seconds}s min
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p.id, v)} />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePopup(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Eye className="h-3 w-3" />
                    {popupAcks.length} acknowledgment{popupAcks.length !== 1 ? "s" : ""}
                    {popupAcks.length > 0 && (
                      <span className="ml-1">
                        ({popupAcks.map(a => a.user_email.split("@")[0]).join(", ")})
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
