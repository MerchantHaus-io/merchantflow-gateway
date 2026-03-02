import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Mail,
  Send,
  Users,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  Eye,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function Outreach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [fromName, setFromName] = useState("Merchant Haus");
  const [fromEmail, setFromEmail] = useState("outreach@merchanthaus.io");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["outreach-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("outreach_campaigns").insert({
        name,
        subject,
        body_html: bodyHtml,
        from_name: fromName,
        from_email: fromEmail,
        created_by: user?.id || "",
        created_by_email: user?.email || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setCreateOpen(false);
      setName("");
      setSubject("");
      setBodyHtml("");
      toast.success("Campaign created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("outreach_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast.success("Campaign deleted");
    },
  });

  const totalSent = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalBounced = campaigns.reduce((a, c) => a + (c.bounced_count || 0), 0);
  const totalReplied = campaigns.reduce((a, c) => a + (c.replied_count || 0), 0);
  const totalConverted = campaigns.reduce((a, c) => a + (c.converted_count || 0), 0);

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "sending": return "default";
      case "sent": return "default";
      case "completed": return "default";
      default: return "secondary";
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Email Outreach</h1>
            <p className="text-muted-foreground text-sm">Campaign tracker & email sender</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Campaign</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Campaign Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 Merchant Outreach" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>From Name</Label>
                    <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
                  </div>
                  <div>
                    <Label>From Email</Label>
                    <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Subject Line</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Processing solutions for your business" />
                </div>
                <div>
                  <Label>Email Body (HTML)</Label>
                  <Textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<p>Hi {{first_name}},</p><p>We'd love to help...</p>"
                    rows={6}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use {"{{first_name}}"}, {"{{last_name}}"}, {"{{company}}"} as merge tags
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => createCampaign.mutate()}
                  disabled={!name || !subject || !bodyHtml || createCampaign.isPending}
                >
                  Create Campaign
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Mail className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Campaigns</p>
                <p className="text-xl font-bold text-foreground">{campaigns.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Send className="h-4 w-4 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Sent</p>
                <p className="text-xl font-bold text-foreground">{totalSent}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10"><AlertTriangle className="h-4 w-4 text-destructive" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Bounced</p>
                <p className="text-xl font-bold text-foreground">{totalBounced}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><MessageSquare className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Replied</p>
                <p className="text-xl font-bold text-foreground">{totalReplied}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="h-4 w-4 text-amber-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Converted</p>
                <p className="text-xl font-bold text-foreground">{totalConverted}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Campaign Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No campaigns yet. Create your first one!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Contacts</TableHead>
                      <TableHead className="text-center">Sent</TableHead>
                      <TableHead className="text-center">Bounced</TableHead>
                      <TableHead className="text-center">Replied</TableHead>
                      <TableHead className="text-center">Converted</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/outreach/${c.id}`)}
                      >
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(c.status)}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-center">{c.total_contacts}</TableCell>
                        <TableCell className="text-center">{c.sent_count}</TableCell>
                        <TableCell className="text-center">{c.bounced_count}</TableCell>
                        <TableCell className="text-center">{c.replied_count}</TableCell>
                        <TableCell className="text-center">{c.converted_count}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/outreach/${c.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => deleteCampaign.mutate(c.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
