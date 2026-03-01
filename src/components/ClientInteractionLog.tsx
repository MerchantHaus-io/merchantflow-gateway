import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Phone,
  Mail,
  Video,
  FileText,
  Plus,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const INTERACTION_TYPES = [
  { value: "call", label: "Phone Call", icon: Phone, color: "text-blue-500" },
  { value: "email", label: "Email", icon: Mail, color: "text-amber-500" },
  { value: "meeting", label: "Meeting", icon: Video, color: "text-purple-500" },
  { value: "note", label: "Note", icon: FileText, color: "text-muted-foreground" },
  { value: "sms", label: "SMS / Text", icon: MessageSquare, color: "text-green-500" },
] as const;

const getTypeConfig = (type: string) =>
  INTERACTION_TYPES.find((t) => t.value === type) || INTERACTION_TYPES[3];

interface Props {
  accountId: string;
}

const ClientInteractionLog = ({ accountId }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [form, setForm] = useState({ type: "note", subject: "", notes: "" });

  const { data: interactions, isLoading } = useQuery({
    queryKey: ["client-interactions", accountId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_interactions")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!accountId,
  });

  const { data: profileMap } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("email, full_name, avatar_url");
      const map: Record<string, { name: string; avatar: string | null }> = {};
      data?.forEach((p) => {
        if (p.email) map[p.email] = { name: p.full_name || p.email, avatar: p.avatar_url };
      });
      return map;
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("client_interactions").insert({
        account_id: accountId,
        interaction_type: form.type,
        subject: form.subject.trim(),
        notes: form.notes.trim() || null,
        created_by: user?.id,
        created_by_email: user?.email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-interactions", accountId] });
      setForm({ type: "note", subject: "", notes: "" });
      setIsAdding(false);
      toast.success("Interaction logged");
    },
    onError: () => toast.error("Failed to log interaction"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("client_interactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-interactions", accountId] });
      toast.success("Interaction removed");
    },
  });

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Client Interaction Log
          {interactions && interactions.length > 0 && (
            <Badge variant="secondary" className="text-[10px] ml-1">{interactions.length}</Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {!isAdding && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setIsAdding(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Log Interaction
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Add form */}
          {isAdding && (
            <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/20">
              <div className="flex items-center gap-2">
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                          {t.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Subject / summary..."
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="h-8 text-sm flex-1"
                />
              </div>
              <Textarea
                placeholder="Details (optional)..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-sm min-h-[60px] resize-none"
                rows={2}
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setIsAdding(false); setForm({ type: "note", subject: "", notes: "" }); }}>
                  <X className="h-3.5 w-3.5 mr-1" />Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!form.subject.trim() || addMutation.isPending}
                  onClick={() => addMutation.mutate()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {addMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}

          {/* Interaction list */}
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : !interactions || interactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No interactions logged yet</p>
              <p className="text-xs mt-1">Log calls, emails, meetings and notes here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {interactions.map((item) => {
                const cfg = getTypeConfig(item.interaction_type);
                const Icon = cfg.icon;
                const profile = profileMap?.[item.created_by_email];
                return (
                  <div
                    key={item.id}
                    className="group flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className={cn("mt-0.5 shrink-0 rounded-full p-1.5 bg-muted/60")}>
                      <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                          {cfg.label}
                        </Badge>
                        <span className="text-sm font-medium text-foreground truncate">{item.subject}</span>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.notes}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                        {profile && (
                          <span className="flex items-center gap-1">
                            <Avatar className="h-4 w-4">
                              {profile.avatar && <AvatarImage src={profile.avatar} />}
                              <AvatarFallback className="text-[7px] bg-muted">{getInitials(profile.name)}</AvatarFallback>
                            </Avatar>
                            {profile.name.split(" ")[0]}
                          </span>
                        )}
                        <span title={format(new Date(item.created_at), "PPpp")}>
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default ClientInteractionLog;
