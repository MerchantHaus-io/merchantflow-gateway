import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  Eye,
  Loader2,
  Plus,
  Layers,
  Reply,
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

function mergeTags(html: string, contact: { first_name?: string | null; last_name?: string | null; company?: string | null; email: string }) {
  return html
    .replace(/\{\{first_name\}\}/g, contact.first_name || "")
    .replace(/\{\{last_name\}\}/g, contact.last_name || "")
    .replace(/\{\{company\}\}/g, contact.company || "")
    .replace(/\{\{email\}\}/g, contact.email || "");
}

export default function OutreachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [replyDialogContact, setReplyDialogContact] = useState<any | null>(null);
  const [replySnippet, setReplySnippet] = useState("");

  // Cadence step form
  const [stepSubject, setStepSubject] = useState("");
  const [stepBody, setStepBody] = useState("");
  const [stepDelay, setStepDelay] = useState(3);

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

  const { data: cadenceSteps = [] } = useQuery({
    queryKey: ["cadence-steps", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cadence_steps")
        .select("*")
        .eq("campaign_id", id!)
        .order("step_number", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const addCadenceStep = useMutation({
    mutationFn: async () => {
      const nextStep = cadenceSteps.length + 2; // step 1 is the initial email
      const { error } = await supabase.from("cadence_steps").insert({
        campaign_id: id!,
        step_number: nextStep,
        delay_days: stepDelay,
        subject: stepSubject,
        body_html: stepBody,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cadence-steps", id] });
      setStepSubject("");
      setStepBody("");
      setStepDelay(3);
      toast.success("Cadence step added");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCadenceStep = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.from("cadence_steps").delete().eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cadence-steps", id] });
      toast.success("Step removed");
    },
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

  const sendEmails = async (stepNumber?: number) => {
    if (!id || !campaign) return;
    const pendingContacts = stepNumber
      ? contacts.filter((c) => (c as any).current_step === stepNumber && c.status === "sent" && !["bounced", "replied", "converted"].includes(c.status))
      : contacts.filter((c) => c.status === "pending");

    if (pendingContacts.length === 0) {
      toast.error("No eligible contacts for this step");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-outreach-emails", {
        body: { campaign_id: id, step_number: stepNumber || 1 },
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

  const saveReply = async () => {
    if (!replyDialogContact) return;
    const { error } = await supabase
      .from("outreach_contacts")
      .update({
        status: "replied",
        replied_at: new Date().toISOString(),
        reply_snippet: replySnippet || null,
      })
      .eq("id", replyDialogContact.id);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Recalculate
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

    queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
    queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
    setReplyDialogContact(null);
    setReplySnippet("");
    toast.success("Reply recorded");
  };

  const convertToPipeline = async (contact: any) => {
    if (!campaign) return;
    setConvertingId(contact.id);
    try {
      const accountName = contact.company || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email;
      const { data: account, error: accErr } = await supabase
        .from("accounts")
        .insert({ name: accountName })
        .select()
        .single();
      if (accErr) throw accErr;

      const { data: newContact, error: contErr } = await supabase
        .from("contacts")
        .insert({
          account_id: account.id,
          first_name: contact.first_name || null,
          last_name: contact.last_name || null,
          email: contact.email,
        })
        .select()
        .single();
      if (contErr) throw contErr;

      const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .insert({
          account_id: account.id,
          contact_id: newContact.id,
          stage: "discovery",
          referral_source: `Outreach: ${campaign.name}`,
        })
        .select()
        .single();
      if (oppErr) throw oppErr;

      await supabase
        .from("outreach_contacts")
        .update({
          status: "converted",
          converted_at: new Date().toISOString(),
          opportunity_id: opp.id,
        })
        .eq("id", contact.id);

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

      queryClient.invalidateQueries({ queryKey: ["outreach-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      toast.success(`${accountName} converted to pipeline`);
    } catch (err: any) {
      toast.error(err.message || "Conversion failed");
    } finally {
      setConvertingId(null);
    }
  };

  if (!campaign) return <AppLayout><div className="p-6 text-muted-foreground">Loading...</div></AppLayout>;

  const pendingCount = contacts.filter((c) => c.status === "pending").length;
  const sentCount = contacts.filter((c) => ["sent", "bounced", "replied", "converted"].includes(c.status)).length;
  const bouncedCount = contacts.filter((c) => c.status === "bounced").length;
  const repliedCount = contacts.filter((c) => ["replied", "converted"].includes(c.status)).length;
  const convertedCount = contacts.filter((c) => c.status === "converted").length;
  const total = contacts.length || 1;

  const sampleContact = contacts[0] || { first_name: "John", last_name: "Doe", company: "Acme Corp", email: "john@example.com" };
  const previewHtml = mergeTags(campaign.body_html, sampleContact);

  const timelineEvents = contacts
    .flatMap((c) => {
      const events: { type: string; date: string; contact: typeof c; detail?: string }[] = [];
      if (c.sent_at) events.push({ type: "sent", date: c.sent_at, contact: c });
      if (c.bounced_at) events.push({ type: "bounced", date: c.bounced_at, contact: c });
      if (c.replied_at) events.push({ type: "replied", date: c.replied_at, contact: c, detail: c.reply_snippet || undefined });
      if (c.converted_at) events.push({ type: "converted", date: c.converted_at, contact: c });
      return events;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 50);

  const isScheduled = !!(campaign as any).scheduled_at && campaign.status === "draft";

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
            {isScheduled && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                Scheduled for {format(new Date((campaign as any).scheduled_at), "MMM d, yyyy · HH:mm")}
              </p>
            )}
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
          <input type="file" accept=".csv,.xlsx,.xls" ref={fileRef} className="hidden" onChange={handleCsvUpload} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />Upload CSV
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-2" />Preview Email
          </Button>
          <Button onClick={() => sendEmails()} disabled={sending || pendingCount === 0}>
            <Send className="h-4 w-4 mr-2" />
            {sending ? "Sending..." : `Send to ${pendingCount} Pending`}
          </Button>
        </div>

        {/* Email Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">From</p>
                  <p className="font-medium text-foreground">{campaign.from_name} &lt;{campaign.from_email}&gt;</p>
                </div>
                <div>
                  <p className="text-muted-foreground">To</p>
                  <p className="font-medium text-foreground">{sampleContact.email}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Subject</p>
                <p className="font-medium text-foreground">{campaign.subject}</p>
              </div>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  Preview using: {[sampleContact.first_name, sampleContact.last_name].filter(Boolean).join(" ") || sampleContact.email}
                </div>
                <div
                  className="p-4 bg-white text-black min-h-[200px]"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reply Dialog */}
        <Dialog open={!!replyDialogContact} onOpenChange={(o) => { if (!o) { setReplyDialogContact(null); setReplySnippet(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Record Reply</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Log a reply from <span className="font-medium text-foreground">{replyDialogContact?.email}</span>
              </p>
              <div>
                <Label>Reply Snippet (optional)</Label>
                <Textarea
                  value={replySnippet}
                  onChange={(e) => setReplySnippet(e.target.value)}
                  placeholder="Paste key excerpt from the reply..."
                  rows={4}
                />
              </div>
              <Button className="w-full" onClick={saveReply}>
                <Reply className="h-4 w-4 mr-2" />Save Reply
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="contacts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="contacts">Contacts ({contacts.length})</TabsTrigger>
            <TabsTrigger value="cadence">
              <Layers className="h-3.5 w-3.5 mr-1.5" />
              Cadence ({cadenceSteps.length + 1} steps)
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Contacts Tab */}
          <TabsContent value="contacts">
            <Card>
              <CardContent className="pt-6">
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
                          <TableHead>Step</TableHead>
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
                              <Badge variant="outline" className="text-xs">
                                Step {(c as any).current_step || 1}
                              </Badge>
                            </TableCell>
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
                                      onClick={() => {
                                        setReplyDialogContact(c);
                                        setReplySnippet(c.reply_snippet || "");
                                      }}
                                    >
                                      <Reply className="h-3 w-3 mr-1" />
                                      Replied
                                    </Button>
                                  </>
                                )}
                                {c.status === "replied" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs text-amber-500"
                                    disabled={convertingId === c.id}
                                    onClick={() => convertToPipeline(c)}
                                  >
                                    {convertingId === c.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <TrendingUp className="h-3 w-3 mr-1" />
                                    )}
                                    Convert
                                  </Button>
                                )}
                                {c.status === "converted" && c.opportunity_id && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs"
                                    onClick={() => navigate(`/opportunities/${c.opportunity_id}`)}
                                  >
                                    View Opp
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
          </TabsContent>

          {/* Cadence Tab */}
          <TabsContent value="cadence">
            <div className="space-y-4">
              {/* Step 1 - initial email */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">1</div>
                      <div>
                        <p className="font-medium text-foreground">Initial Email</p>
                        <p className="text-xs text-muted-foreground">Subject: {campaign.subject}</p>
                      </div>
                    </div>
                    <Badge variant="outline">Day 0</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Follow-up steps */}
              {cadenceSteps.map((step, i) => (
                <Card key={step.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{step.step_number}</div>
                        <div>
                          <p className="font-medium text-foreground">Follow-up #{i + 1}</p>
                          <p className="text-xs text-muted-foreground">Subject: {step.subject}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">+{step.delay_days} days</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sending}
                          onClick={() => sendEmails(step.step_number)}
                        >
                          <Send className="h-3 w-3 mr-1" />Send Step
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteCadenceStep.mutate(step.id)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add step form */}
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4" />Add Follow-up Step
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Input value={stepSubject} onChange={(e) => setStepSubject(e.target.value)} placeholder="Just checking in..." />
                    </div>
                    <div>
                      <Label className="text-xs">Delay (days after previous)</Label>
                      <Input type="number" min={1} value={stepDelay} onChange={(e) => setStepDelay(Number(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Body HTML</Label>
                    <Textarea
                      value={stepBody}
                      onChange={(e) => setStepBody(e.target.value)}
                      placeholder="<p>Hi {{first_name}}, just following up...</p>"
                      rows={4}
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!stepSubject || !stepBody || addCadenceStep.isPending}
                    onClick={() => addCadenceStep.mutate()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Add Step
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline">
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
                          {event.type === "replied" && event.detail && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 italic">"{event.detail}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
