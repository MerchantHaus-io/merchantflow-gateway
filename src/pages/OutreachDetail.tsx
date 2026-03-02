import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Upload,
  Send,
  Mail,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRightCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  sent: <Mail className="h-3.5 w-3.5 text-blue-500" />,
  bounced: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  replied: <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />,
  converted: <ArrowRightCircle className="h-3.5 w-3.5 text-amber-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "secondary",
  sent: "default",
  bounced: "destructive",
  replied: "default",
  converted: "default",
};

export default function OutreachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  const { data: campaign } = useQuery({
    queryKey: ["outreach-campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_campaigns")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: contacts = [], isLoading: contactsLoading } = useQuery({
    queryKey: ["outreach-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_contacts")
        .select("*")
        .eq("campaign_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV must have a header row and at least one data row");
      return;
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const emailIdx = headers.findIndex((h) => h.includes("email"));
    const firstIdx = headers.findIndex((h) => h.includes("first") || h === "name");
    const lastIdx = headers.findIndex((h) => h.includes("last"));
    const companyIdx = headers.findIndex((h) => h.includes("company") || h.includes("business"));

    if (emailIdx === -1) {
      toast.error("CSV must contain an 'email' column");
      return;
    }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/['"]/g, ""));
      return {
        campaign_id: id,
        email: cols[emailIdx] || "",
        first_name: firstIdx >= 0 ? cols[firstIdx] || null : null,
        last_name: lastIdx >= 0 ? cols[lastIdx] || null : null,
        company: companyIdx >= 0 ? cols[companyIdx] || null : null,
      };
    }).filter((r) => r.email && r.email.includes("@"));

    if (rows.length === 0) {
      toast.error("No valid email addresses found in CSV");
      return;
    }

    const { error } = await supabase.from("outreach_contacts").insert(rows);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Update total_contacts count
    await supabase
      .from("outreach_campaigns")
      .update({ total_contacts: (campaign?.total_contacts || 0) + rows.length })
      .eq("id", id);

    queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    toast.success(`${rows.length} contacts imported`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const sendEmails = async () => {
    if (!id || !campaign) return;
    const pendingContacts = contacts.filter((c) => c.status === "pending");
    if (pendingContacts.length === 0) {
      toast.error("No pending contacts to send to");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-outreach-emails", {
        body: { campaign_id: id },
      });
      if (error) throw error;
      toast.success(`Sending ${pendingContacts.length} emails...`);
      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to send emails");
    } finally {
      setSending(false);
    }
  };

  const markStatus = useMutation({
    mutationFn: async ({ contactId, status }: { contactId: string; status: string }) => {
      const updates: Record<string, any> = { status };
      if (status === "bounced") updates.bounced_at = new Date().toISOString();
      if (status === "replied") updates.replied_at = new Date().toISOString();
      if (status === "converted") updates.converted_at = new Date().toISOString();

      const { error } = await supabase
        .from("outreach_contacts")
        .update(updates)
        .eq("id", contactId);
      if (error) throw error;

      // Recalculate campaign counts
      const { data: allContacts } = await supabase
        .from("outreach_contacts")
        .select("status")
        .eq("campaign_id", id!);

      if (allContacts) {
        await supabase.from("outreach_campaigns").update({
          sent_count: allContacts.filter((c) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length,
          bounced_count: allContacts.filter((c) => c.status === "bounced").length,
          replied_count: allContacts.filter((c) => ["replied", "converted"].includes(c.status)).length,
          converted_count: allContacts.filter((c) => c.status === "converted").length,
        }).eq("id", id!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
    },
  });

  if (!campaign) return <AppLayout><div className="p-6 text-muted-foreground">Loading...</div></AppLayout>;

  const pendingCount = contacts.filter((c) => c.status === "pending").length;
  const sentCount = contacts.filter((c) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length;
  const bouncedCount = contacts.filter((c) => c.status === "bounced").length;
  const repliedCount = contacts.filter((c) => ["replied", "converted"].includes(c.status)).length;
  const convertedCount = contacts.filter((c) => c.status === "converted").length;
  const total = contacts.length || 1;

  // Timeline events sorted by most recent
  const timelineEvents = contacts
    .flatMap((c) => {
      const events = [];
      if (c.sent_at) events.push({ type: "sent", date: c.sent_at, contact: c });
      if (c.bounced_at) events.push({ type: "bounced", date: c.bounced_at, contact: c });
      if (c.replied_at) events.push({ type: "replied", date: c.replied_at, contact: c });
      if (c.converted_at) events.push({ type: "converted", date: c.converted_at, contact: c });
      return events;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 50);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/outreach")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
            <p className="text-sm text-muted-foreground">Subject: {campaign.subject}</p>
          </div>
          <Badge variant={campaign.status === "draft" ? "secondary" : "default"}>{campaign.status}</Badge>
        </div>

        {/* Funnel KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Contacts</p>
              <p className="text-2xl font-bold text-foreground">{contacts.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Sent</p>
              <p className="text-2xl font-bold text-blue-500">{sentCount}</p>
              <Progress value={(sentCount / total) * 100} className="mt-2 h-1.5" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Bounced</p>
              <p className="text-2xl font-bold text-destructive">{bouncedCount}</p>
              <Progress value={(bouncedCount / total) * 100} className="mt-2 h-1.5 [&>div]:bg-destructive" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Replied</p>
              <p className="text-2xl font-bold text-emerald-500">{repliedCount}</p>
              <Progress value={(repliedCount / total) * 100} className="mt-2 h-1.5 [&>div]:bg-emerald-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Converted</p>
              <p className="text-2xl font-bold text-amber-500">{convertedCount}</p>
              <Progress value={(convertedCount / total) * 100} className="mt-2 h-1.5 [&>div]:bg-amber-500" />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            ref={fileRef}
            className="hidden"
            onChange={handleCsvUpload}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Upload CSV
          </Button>
          <Button onClick={sendEmails} disabled={sending || pendingCount === 0}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : `Send to ${pendingCount} Pending`}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Table */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Contacts ({contacts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
              ) : contacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Upload a CSV to add contacts</p>
                  <p className="text-xs mt-1">CSV should have: email, first_name, last_name, company</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                          </TableCell>
                          <TableCell className="text-sm">{c.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.company || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {STATUS_ICONS[c.status] || STATUS_ICONS.pending}
                              <Badge variant={STATUS_COLORS[c.status] as any || "secondary"} className="text-xs">
                                {c.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {c.sent_at ? format(new Date(c.sent_at), "MMM d, HH:mm") : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {c.status === "sent" && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-destructive"
                                    onClick={() => markStatus.mutate({ contactId: c.id, status: "bounced" })}
                                  >
                                    Bounced
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-emerald-500"
                                    onClick={() => markStatus.mutate({ contactId: c.id, status: "replied" })}
                                  >
                                    Replied
                                  </Button>
                                </>
                              )}
                              {c.status === "replied" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-amber-500"
                                  onClick={() => markStatus.mutate({ contactId: c.id, status: "converted" })}
                                >
                                  Convert
                                </Button>
                              )}
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

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timelineEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No activity yet</p>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {timelineEvents.map((event, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <div className="mt-0.5">{STATUS_ICONS[event.type]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate">
                          <span className="font-medium">
                            {[event.contact.first_name, event.contact.last_name].filter(Boolean).join(" ") || event.contact.email}
                          </span>
                          {" "}
                          <span className="text-muted-foreground">
                            {event.type === "sent" && "— email sent"}
                            {event.type === "bounced" && "— bounced"}
                            {event.type === "replied" && "— replied"}
                            {event.type === "converted" && "— converted to pipeline"}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(event.date), "MMM d, yyyy · HH:mm")}
                        </p>
                        {event.type === "bounced" && event.contact.bounce_reason && (
                          <p className="text-xs text-destructive mt-0.5">{event.contact.bounce_reason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
