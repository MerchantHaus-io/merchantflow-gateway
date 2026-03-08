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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Eye,
  Trash2,
  CalendarIcon,
  Clock,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Outreach() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [csvUploadOpen, setCsvUploadOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [csvCampaignName, setCsvCampaignName] = useState("");
  const [csvSubject, setCsvSubject] = useState("");
  const [csvBodyHtml, setCsvBodyHtml] = useState("");
  const [csvFromName, setCsvFromName] = useState("Merchant Haus");
  const [csvFromEmail, setCsvFromEmail] = useState("outreach@merchanthaus.io");
  const [isUploading, setIsUploading] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [fromName, setFromName] = useState("Merchant Haus");
  const [fromEmail, setFromEmail] = useState("outreach@merchanthaus.io");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState("09:00");

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
      let scheduled_at: string | null = null;
      if (scheduledDate) {
        const [hours, minutes] = scheduledTime.split(":").map(Number);
        const dt = new Date(scheduledDate);
        dt.setHours(hours, minutes, 0, 0);
        scheduled_at = dt.toISOString();
      }

      const { error } = await supabase.from("outreach_campaigns").insert({
        name,
        subject,
        body_html: bodyHtml,
        from_name: fromName,
        from_email: fromEmail,
        created_by: user?.id || "",
        created_by_email: user?.email || "",
        scheduled_at,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setCreateOpen(false);
      setName("");
      setSubject("");
      setBodyHtml("");
      setScheduledDate(undefined);
      setScheduledTime("09:00");
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

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    file.text().then((text) => {
      const [headerLine, ...dataRows] = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (!headerLine) return;
      const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());
      const rows = dataRows.map((row) => {
        const cells = row.split(",");
        return headers.reduce<Record<string, string>>((acc, h, i) => {
          acc[h] = cells[i]?.trim() || "";
          return acc;
        }, {});
      });
      setCsvPreview({ headers, rows });
      if (!csvCampaignName) setCsvCampaignName(file.name.replace(/\.csv$/i, ""));
    });
  };

  const handleCsvUpload = async () => {
    if (!csvPreview.rows.length || !csvCampaignName || !csvSubject || !csvBodyHtml) return;
    setIsUploading(true);
    try {
      // Create campaign
      const { data: campaign, error: cErr } = await supabase.from("outreach_campaigns").insert({
        name: csvCampaignName,
        subject: csvSubject,
        body_html: csvBodyHtml,
        from_name: csvFromName,
        from_email: csvFromEmail,
        created_by: user?.id || "",
        created_by_email: user?.email || "",
        total_contacts: csvPreview.rows.length,
      }).select().single();
      if (cErr || !campaign) throw cErr || new Error("Failed to create campaign");

      // Map CSV headers to outreach_contacts fields
      const h = csvPreview.headers;
      const emailCol = h.find((c) => c === "email") || h.find((c) => c.includes("email")) || "";
      const firstNameCol = h.find((c) => c === "first_name") || h.find((c) => c.includes("first")) || "";
      const lastNameCol = h.find((c) => c === "last_name") || h.find((c) => c.includes("last")) || "";
      const companyCol = h.find((c) => c === "company") || h.find((c) => c.includes("company")) || h.find((c) => c.includes("business")) || "";

      const contacts = csvPreview.rows
        .filter((r) => r[emailCol]?.includes("@"))
        .map((r) => ({
          campaign_id: campaign.id,
          email: r[emailCol],
          first_name: r[firstNameCol] || null,
          last_name: r[lastNameCol] || null,
          company: r[companyCol] || null,
          status: "pending" as const,
        }));

      if (contacts.length > 0) {
        // Batch insert in chunks of 500
        for (let i = 0; i < contacts.length; i += 500) {
          const { error: insertErr } = await supabase.from("outreach_contacts").insert(contacts.slice(i, i + 500));
          if (insertErr) throw insertErr;
        }
        // Update total_contacts with valid count
        await supabase.from("outreach_campaigns").update({ total_contacts: contacts.length }).eq("id", campaign.id);
      }

      queryClient.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      setCsvUploadOpen(false);
      setCsvFile(null);
      setCsvPreview({ headers: [], rows: [] });
      setCsvCampaignName("");
      setCsvSubject("");
      setCsvBodyHtml("");
      toast.success(`Campaign created with ${contacts.length} contacts`);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "CSV upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const totalSent = campaigns.reduce((a, c) => a + (c.sent_count || 0), 0);
  const totalBounced = campaigns.reduce((a, c) => a + (c.bounced_count || 0), 0);
  const totalReplied = campaigns.reduce((a, c) => a + (c.replied_count || 0), 0);
  const totalConverted = campaigns.reduce((a, c) => a + (c.converted_count || 0), 0);

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary";
      case "scheduled": return "outline";
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
          <div className="flex gap-2">
            {/* CSV Upload Dialog */}
            <Dialog open={csvUploadOpen} onOpenChange={(open) => { setCsvUploadOpen(open); if (!open) { setCsvFile(null); setCsvPreview({ headers: [], rows: [] }); setCsvCampaignName(""); setCsvSubject(""); setCsvBodyHtml(""); } }}>
              <DialogTrigger asChild>
                <Button variant="outline"><Upload className="h-4 w-4 mr-2" />CSV Upload</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Import CSV as Campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Upload CSV</Label>
                    <Input type="file" accept=".csv" onChange={handleCsvFileChange} />
                    <p className="text-xs text-muted-foreground mt-1">CSV should include email, first_name, last_name, company columns</p>
                  </div>

                  {csvPreview.rows.length > 0 && (
                    <>
                      <div className="rounded-md border p-3 bg-muted/30">
                        <p className="text-sm font-medium">{csvPreview.rows.length} contacts detected</p>
                        <p className="text-xs text-muted-foreground">Columns: {csvPreview.headers.join(", ")}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Campaign Name</Label>
                          <Input value={csvCampaignName} onChange={(e) => setCsvCampaignName(e.target.value)} placeholder="Q1 CSV Upload" />
                        </div>
                        <div>
                          <Label>Subject Line</Label>
                          <Input value={csvSubject} onChange={(e) => setCsvSubject(e.target.value)} placeholder="Processing solutions for your business" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>From Name</Label>
                          <Input value={csvFromName} onChange={(e) => setCsvFromName(e.target.value)} />
                        </div>
                        <div>
                          <Label>From Email</Label>
                          <Input value={csvFromEmail} onChange={(e) => setCsvFromEmail(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label>Email Body (HTML)</Label>
                        <Textarea value={csvBodyHtml} onChange={(e) => setCsvBodyHtml(e.target.value)} placeholder="<p>Hi {{first_name}},</p>" rows={4} />
                        <p className="text-xs text-muted-foreground mt-1">Use {"{{first_name}}"}, {"{{last_name}}"}, {"{{company}}"} as merge tags</p>
                      </div>

                      {/* Preview table */}
                      <div className="rounded-lg border overflow-hidden max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {csvPreview.headers.slice(0, 5).map((h) => (
                                <TableHead key={h} className="text-xs">{h}</TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {csvPreview.rows.slice(0, 5).map((row, i) => (
                              <TableRow key={i}>
                                {csvPreview.headers.slice(0, 5).map((h) => (
                                  <TableCell key={h} className="text-xs py-1">{row[h] || "—"}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {csvPreview.rows.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center py-1">…and {csvPreview.rows.length - 5} more</p>
                        )}
                      </div>

                      <Button className="w-full" onClick={handleCsvUpload} disabled={isUploading || !csvCampaignName || !csvSubject || !csvBodyHtml}>
                        {isUploading ? "Creating campaign…" : `Create Campaign with ${csvPreview.rows.length} contacts`}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* New Campaign Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

                {/* Schedule */}
                <div>
                  <Label>Schedule (optional)</Label>
                  <div className="flex gap-2 mt-1">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal", !scheduledDate && "text-muted-foreground")}>
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  {scheduledDate && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Emails will send on {format(scheduledDate, "MMM d, yyyy")} at {scheduledTime}
                      </p>
                      <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={() => setScheduledDate(undefined)}>Clear</Button>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={() => createCampaign.mutate()}
                  disabled={!name || !subject || !bodyHtml || createCampaign.isPending}
                >
                  {scheduledDate ? "Schedule Campaign" : "Create Campaign"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
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
                      <TableHead>Schedule</TableHead>
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
                          <Badge variant={statusColor(c.status) as any}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {(c as any).scheduled_at ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date((c as any).scheduled_at), "MMM d, HH:mm")}
                            </span>
                          ) : "—"}
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
