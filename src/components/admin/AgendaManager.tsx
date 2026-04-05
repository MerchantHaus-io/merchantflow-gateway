import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lightbulb, ClipboardList, Trash2, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface AgendaItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  submitted_by_email: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  raised: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  ongoing: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  closed: "bg-green-500/20 text-green-600 border-green-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  agenda: "Meeting Agenda",
  business_improvement: "Business Improvement",
  crm_enhancement: "CRM Enhancement",
  website_update: "Website Update",
  general_ideation: "General Ideation",
};

export function AgendaManager() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState("");

  const fetchItems = async () => {
    const { data } = await supabase
      .from("agenda_items")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setItems(data as AgendaItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel("agenda-items-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_items" }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("agenda_items").update({ status }).eq("id", id);
    if (error) toast.error("Failed to update status");
    else toast.success(`Status updated to ${status}`);
  };

  const saveNotes = async (id: string) => {
    const { error } = await supabase.from("agenda_items").update({ admin_notes: notesText }).eq("id", id);
    if (error) toast.error("Failed to save notes");
    else { toast.success("Notes saved"); setEditingNotes(null); }
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("agenda_items").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else toast.success("Item removed");
  };

  const agendaItems = items.filter(i => i.category === "agenda");
  const ideationItems = items.filter(i => i.category !== "agenda");

  const renderItems = (list: AgendaItem[]) => {
    if (loading) return <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>;
    if (list.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">No submissions yet</p>;

    return (
      <div className="space-y-3">
        {list.map((item) => (
          <div key={item.id} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </Badge>
                  <Badge className={`text-[10px] ${STATUS_COLORS[item.status] || ""}`}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {item.submitted_by_email.split("@")[0]} · {format(new Date(item.created_at), "dd MMM HH:mm")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Select value={item.status} onValueChange={(v) => updateStatus(item.id, v)}>
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raised">Raised</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  setEditingNotes(editingNotes === item.id ? null : item.id);
                  setNotesText(item.admin_notes || "");
                }}>
                  <MessageSquare className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {editingNotes === item.id && (
              <div className="space-y-2 pt-1">
                <Textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Admin notes…"
                  rows={2}
                  className="text-xs"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveNotes(item.id)}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingNotes(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {item.admin_notes && editingNotes !== item.id && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 italic">
                Admin: {item.admin_notes}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const raisedCount = items.filter(i => i.status === "raised").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          User-Submitted Agenda Items – Next Meeting
          {raisedCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px] ml-2">
              {raisedCount} new
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Manage agenda submissions and ideation from the team</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="agenda">
          <TabsList className="mb-4">
            <TabsTrigger value="agenda" className="gap-1.5 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Agenda ({agendaItems.length})
            </TabsTrigger>
            <TabsTrigger value="ideation" className="gap-1.5 text-xs">
              <Lightbulb className="h-3.5 w-3.5" />
              Ideation ({ideationItems.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="agenda">{renderItems(agendaItems)}</TabsContent>
          <TabsContent value="ideation">{renderItems(ideationItems)}</TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
