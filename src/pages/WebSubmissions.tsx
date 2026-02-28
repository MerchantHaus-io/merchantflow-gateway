import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Archive, CheckCircle, ArrowRightCircle, Eye, X, FileText } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Tables } from "@/integrations/supabase/types";

type Application = Tables<"applications">;

function ApplicationDocsBadge({ applicationId }: { applicationId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const checkDocs = async () => {
      try {
        const { data } = await supabase.storage.from('opportunity-documents').list(`applications/${applicationId}`);
        setCount(data?.length ?? 0);
      } catch {
        setCount(0);
      }
    };
    checkDocs();
  }, [applicationId]);
  if (count === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="gap-1">
      <FileText className="h-3 w-3" />
      {count}
    </Badge>
  );
}

function ApplicationDocsDetail({ applicationId }: { applicationId: string }) {
  const [files, setFiles] = useState<{ name: string }[]>([]);
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.storage.from('opportunity-documents').list(`applications/${applicationId}`);
        setFiles((data ?? []).map(f => ({ name: f.name })));
      } catch { setFiles([]); }
    };
    load();
  }, [applicationId]);
  if (files.length === 0) return <p className="text-xs text-muted-foreground mt-1">No documents uploaded</p>;
  return (
    <div className="mt-1 space-y-1">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <FileText className="h-3 w-3 text-primary" />
          <span>{f.name}</span>
        </div>
      ))}
    </div>
  );
}
const DetailField = ({ label, value }: { label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
};

const DetailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h4 className="text-sm font-semibold text-primary">{title}</h4>
    <div className="grid grid-cols-2 gap-3">
      {children}
    </div>
  </div>
);

export default function WebSubmissions() {
  const [apps, setApps] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [isConverting, setIsConverting] = useState<string | null>(null);
  const [referralPrompt, setReferralPrompt] = useState<{ app: Application; isReferral: boolean; referredBy: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("applications")
      .select("*")
      .not("status", "in", '("approved","rejected")')
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Error fetching submissions",
        description: error.message,
      });
    } else {
      setApps(data || []);
    }
    setIsLoading(false);
  };

  const rejectApplication = async (id: string) => {
    const { error } = await supabase
      .from("applications")
      .update({ status: "rejected" })
      .eq("id", id);

    if (error) {
      toast({ variant: "destructive", title: "Reject failed", description: error.message });
    } else {
      toast({ title: "Submission rejected" });
      fetchApplications();
    }
  };

  const promptReferralAndConvert = (app: Application) => {
    setReferralPrompt({ app, isReferral: false, referredBy: '' });
  };

  const convertToPipeline = async (app: Application, referralSource?: string) => {
    setIsConverting(app.id);

    try {
      // 1. Create Account
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .insert({
          name: app.company_name || app.dba_name || app.full_name,
          status: "active",
          address1: app.address,
          address2: app.address2,
          city: app.city,
          state: app.state,
          zip: app.zip,
          website: app.website,
        })
        .select()
        .single();

      if (accountError) throw accountError;

      // 2. Create Contact
      const nameParts = app.full_name.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .insert({
          account_id: account.id,
          first_name: firstName,
          last_name: lastName,
          email: app.email,
          phone: app.phone,
        })
        .select()
        .single();

      if (contactError) throw contactError;

      // 3. Create Opportunity
      const isGatewayOnly = app.service_type === "gateway_only" || app.business_type === "Gateway Only";

      // Calculate progress to determine initial stage
      // (we'll compute it here before creating the opportunity)
      const { data: merchantData } = await supabase
        .from("merchants")
        .select("*")
        .eq("application_id", app.id)
        .maybeSingle();

      const m = merchantData;
      const wizardFormState: Record<string, unknown> = {
        dba_name: m?.dba_name || app.dba_name || app.company_name || "",
        product_description: m?.product_description || app.products || "",
        nature_of_business: m?.nature_of_business || app.nature_of_business || "",
        dba_contact_first_name: m?.dba_contact_first_name || firstName,
        dba_contact_last_name: m?.dba_contact_last_name || lastName,
        dba_contact_phone: m?.dba_contact_phone || app.phone || "",
        dba_contact_email: m?.dba_contact_email || app.email || "",
        dba_address_line1: m?.dba_address_line1 || app.address || "",
        dba_address_line2: m?.dba_address_line2 || app.address2 || "",
        dba_city: m?.dba_city || app.city || "",
        dba_state: m?.dba_state || app.state || "",
        dba_zip: m?.dba_zip || app.zip || "",
        legal_entity_name: m?.legal_entity_name || app.legal_name || app.company_name || "",
        federal_tax_id: m?.federal_tax_id || app.federal_tax_id || "",
        ownership_type: m?.ownership_type || app.business_structure || "",
        business_formation_date: m?.business_formation_date || app.date_established || "",
        state_incorporated: m?.state_incorporated || app.state_of_incorporation || "",
        legal_address_line1: m?.legal_address_line1 || app.address || "",
        legal_address_line2: m?.legal_address_line2 || app.address2 || "",
        legal_city: m?.legal_city || app.city || "",
        legal_state: m?.legal_state || app.state || "",
        legal_zip: m?.legal_zip || app.zip || "",
        monthly_volume: m?.monthly_volume || app.monthly_volume || "",
        average_transaction: m?.average_transaction || app.avg_ticket || "",
        high_ticket: m?.high_ticket || app.high_ticket || "",
        percent_swiped: m?.percent_swiped || app.in_person_percent || "",
        percent_keyed: m?.percent_keyed || app.keyed_percent || "",
        percent_moto: m?.percent_moto || "",
        percent_ecommerce: m?.percent_ecommerce || app.ecommerce_percent || "",
        percent_b2b: m?.percent_b2b || "",
        percent_b2c: m?.percent_b2c || "",
        sic_mcc_code: m?.sic_mcc_code || "",
        website_url: m?.website_url || app.website || "",
        documents: [],
        notes: app.notes || app.message || "",
      };

      const requiredFields = [
        "dba_name", "product_description", "nature_of_business",
        "dba_contact_first_name", "dba_contact_last_name",
        "dba_contact_phone", "dba_contact_email",
        "dba_address_line1", "dba_city", "dba_state", "dba_zip",
        "legal_entity_name", "federal_tax_id", "ownership_type",
        "business_formation_date", "state_incorporated",
        "legal_address_line1", "legal_city", "legal_state", "legal_zip",
        "monthly_volume", "average_transaction", "high_ticket",
        "percent_swiped", "percent_keyed", "percent_moto", "percent_ecommerce",
        "percent_b2c", "percent_b2b"
      ];
      const filled = requiredFields.filter(f => {
        const v = wizardFormState[f];
        return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
      }).length;
      const totalRequired = requiredFields.length + 1; // +1 for documents
      const progress = Math.round((filled / totalRequired) * 100);

      // 100% complete → Qualified + assigned to Yaseen; otherwise → Discovery
      const initialStage = progress >= 100 ? "qualified" : "discovery";
      const initialAssignee = progress >= 100 ? "support@merchanthaus.io" : null;

      const { data: opportunity, error: opportunityError } = await supabase
        .from("opportunities")
        .insert({
          account_id: account.id,
          contact_id: contact.id,
          stage: initialStage,
          status: "active",
          service_type: isGatewayOnly ? "gateway_only" : "processing",
          referral_source: referralSource || null,
          assigned_to: initialAssignee,
          username: isGatewayOnly ? (app.notes?.match(/Username:\s*([^.]+)/)?.[1]?.trim() || null) : null,
        })
        .select()
        .single();

      if (opportunityError) throw opportunityError;

      // Wizard state and progress already computed above — just persist
      await supabase
        .from("onboarding_wizard_states")
        .upsert({
          opportunity_id: opportunity.id,
          progress,
          step_index: 0,
          form_state: wizardFormState,
        } as never, { onConflict: "opportunity_id" });

      // 5. Populate normalized tables ONLY if they don't already exist (public form may have inserted them)
      if (!isGatewayOnly) {
        const { data: existingMerchant } = await supabase
          .from("merchants")
          .select("id")
          .eq("application_id", app.id)
          .maybeSingle();

        if (!existingMerchant) {
          await supabase.from("merchants").insert({
            application_id: app.id,
            dba_name: app.dba_name || app.company_name || null,
            nature_of_business: app.nature_of_business || null,
            dba_contact_first_name: firstName,
            dba_contact_last_name: lastName,
            dba_contact_phone: app.phone || null,
            dba_contact_email: app.email || null,
            dba_address_line1: app.address || null,
            dba_address_line2: app.address2 || null,
            dba_city: app.city || null,
            dba_state: app.state || null,
            dba_zip: app.zip || null,
            legal_entity_name: app.legal_name || null,
            federal_tax_id: app.federal_tax_id || null,
            ownership_type: app.business_structure || null,
            business_formation_date: app.date_established || null,
            state_incorporated: app.state_of_incorporation || null,
            legal_address_line1: app.address || null,
            legal_city: app.city || null,
            legal_state: app.state || null,
            legal_zip: app.zip || null,
            monthly_volume: app.monthly_volume || null,
            average_transaction: app.avg_ticket || null,
            high_ticket: app.high_ticket || null,
            percent_swiped: app.in_person_percent || null,
            percent_keyed: app.keyed_percent || null,
            percent_ecommerce: app.ecommerce_percent || null,
            website_url: app.website || null,
            product_description: app.products || null,
          });
        }

        const { data: existingPrincipals } = await supabase
          .from("principals")
          .select("id")
          .eq("application_id", app.id)
          .limit(1);

        if ((!existingPrincipals || existingPrincipals.length === 0) && app.owner_name) {
          const ownerParts = app.owner_name.trim().split(" ");
          await supabase.from("principals").insert({
            application_id: app.id,
            principal_first_name: ownerParts[0] || null,
            principal_last_name: ownerParts.slice(1).join(" ") || null,
            principal_title: app.owner_title || null,
            date_of_birth: app.owner_dob || null,
            ssn_last4: app.owner_ssn_last4 || null,
            principal_address_line1: app.owner_address || null,
            principal_city: app.owner_city || null,
            principal_state: app.owner_state || null,
            principal_zip: app.owner_zip || null,
          });
        }
      }

      // 6. Migrate uploaded documents from applications/{id}/ to opportunity
      try {
        const { data: storedFiles } = await supabase.storage
          .from('opportunity-documents')
          .list(`applications/${app.id}`);

        if (storedFiles && storedFiles.length > 0) {
          for (const file of storedFiles) {
            const oldPath = `applications/${app.id}/${file.name}`;
            const newPath = `${opportunity.id}/${file.name}`;

            // Copy file to opportunity path
            const { error: copyErr } = await supabase.storage
              .from('opportunity-documents')
              .copy(oldPath, newPath);

            if (!copyErr) {
              // Create document record linked to opportunity
              await supabase.from("documents").insert({
                opportunity_id: opportunity.id,
                file_name: file.name.replace(/^\d+_/, ''), // strip timestamp prefix
                file_path: newPath,
                content_type: file.metadata?.mimetype || null,
                file_size: file.metadata?.size || null,
                uploaded_by: app.email,
                document_type: file.name.toLowerCase().includes('void') ? 'Voided Check / Bank Confirmation Letter' : 'Bank Statement',
              });

              // Remove old file
              await supabase.storage.from('opportunity-documents').remove([oldPath]);
            }
          }
        }
      } catch (docMigrateErr) {
        console.error("Document migration (non-blocking):", docMigrateErr);
      }

      // 7. Delete the application entry
      await supabase
        .from("applications")
        .delete()
        .eq("id", app.id);

      toast({
        title: "Converted to Pipeline",
        description: `Created account, contact, opportunity, and pre-filled onboarding wizard for ${app.company_name || app.full_name}`,
      });

      fetchApplications();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Conversion failed",
        description: error.message,
      });
    } finally {
      setIsConverting(null);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "reviewed":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/40">Reviewed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <AppLayout pageTitle="Web Submissions">
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Incoming Applications</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center p-8 text-muted-foreground">
                No submissions found.
              </div>
            ) : (
              <Table>
                 <TableHeader>
                   <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Business Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Docs</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                <TableBody>
                  {apps.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell>
                        {new Date(app.created_at).toLocaleDateString()}
                      </TableCell>
                       <TableCell className="font-medium">
                         {app.company_name || app.dba_name || "Untitled"}
                       </TableCell>
                       <TableCell>
                         {(app.service_type === "gateway_only" || app.business_type === "Gateway Only") ? (
                           <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40">Gateway</Badge>
                         ) : (
                           <Badge className="bg-primary/20 text-primary border-primary/40">Processing</Badge>
                         )}
                       </TableCell>
                       <TableCell>
                        <div className="flex flex-col">
                          <span>{app.full_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {app.email}
                          </span>
                        </div>
                      </TableCell>
                       <TableCell>
                         {app.monthly_volume
                           ? `$${Number(app.monthly_volume).toLocaleString()}`
                           : "-"}
                       </TableCell>
                       <TableCell>
                         <ApplicationDocsBadge applicationId={app.id} />
                       </TableCell>
                       <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedApp(app)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {app.status === "pending" && (
                          <>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="outline">
                                  <Archive className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Reject Application</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to reject the application from <strong>{app.company_name || app.full_name}</strong>? This will remove it from the submissions list.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => rejectApplication(app.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    Reject
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" disabled={isConverting === app.id}>
                                  {isConverting === app.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                  ) : (
                                    <ArrowRightCircle className="h-4 w-4 mr-1" />
                                  )}
                                  Convert to Pipeline
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Convert to Pipeline</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will create an Account, Contact, and Opportunity for <strong>{app.company_name || app.full_name}</strong> and pre-fill the onboarding wizard. The submission will be removed from this list.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                 <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => promptReferralAndConvert(app)}>
                                    Convert
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                        {app.status === "approved" && (
                          <Badge className="bg-emerald-500/20 text-emerald-400">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            In Pipeline
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Modal */}
        <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Application Details</DialogTitle>
            </DialogHeader>
            {selectedApp && (
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-5">
                  {/* Status & Date */}
                   <div className="flex items-center justify-between">
                     {getStatusBadge(selectedApp.status)}
                     <div className="flex items-center gap-2">
                       {(selectedApp.service_type === "gateway_only" || selectedApp.business_type === "Gateway Only") ? (
                         <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40">Gateway Only</Badge>
                       ) : (
                         <Badge className="bg-primary/20 text-primary border-primary/40">Processing</Badge>
                       )}
                       <span className="text-xs text-muted-foreground">
                         Submitted {new Date(selectedApp.created_at).toLocaleString()}
                       </span>
                     </div>
                   </div>

                  <Separator />

                  {/* Business Profile */}
                  <DetailSection title="Business Profile">
                    <DetailField label="DBA Name" value={selectedApp.dba_name || selectedApp.company_name} />
                    <DetailField label="Legal Name" value={selectedApp.legal_name} />
                    <DetailField label="Products / Services" value={selectedApp.products} />
                    <DetailField label="Nature of Business" value={selectedApp.nature_of_business} />
                    <DetailField label="Business Type" value={selectedApp.business_type} />
                    <DetailField label="Website" value={selectedApp.website} />
                  </DetailSection>

                  {/* Business Address */}
                  {(selectedApp.address || selectedApp.city) && (
                    <>
                      <Separator />
                      <DetailSection title="Business Address">
                        <DetailField label="Address" value={[selectedApp.address, selectedApp.address2].filter(Boolean).join(", ")} />
                        <DetailField label="City / State / ZIP" value={[selectedApp.city, selectedApp.state, selectedApp.zip].filter(Boolean).join(", ")} />
                      </DetailSection>
                    </>
                  )}

                  <Separator />

                  {/* Contact Information */}
                  <DetailSection title="Contact Information">
                    <DetailField label="Contact Name" value={selectedApp.full_name} />
                    <DetailField label="Email" value={selectedApp.email} />
                    <DetailField label="Phone" value={selectedApp.phone} />
                  </DetailSection>

                  {/* Legal Information */}
                  {(selectedApp.federal_tax_id || selectedApp.business_structure || selectedApp.owner_name) && (
                    <>
                      <Separator />
                      <DetailSection title="Legal Information">
                        <DetailField label="Federal Tax ID (EIN)" value={selectedApp.federal_tax_id} />
                        <DetailField label="State of Incorporation" value={selectedApp.state_of_incorporation} />
                        <DetailField label="Business Structure" value={selectedApp.business_structure} />
                        <DetailField label="Date Established" value={selectedApp.date_established} />
                      </DetailSection>
                    </>
                  )}

                  {/* Owner Information */}
                  {selectedApp.owner_name && (
                    <>
                      <Separator />
                      <DetailSection title="Owner Information">
                        <DetailField label="Owner Name" value={selectedApp.owner_name} />
                        <DetailField label="Title" value={selectedApp.owner_title} />
                        <DetailField label="Date of Birth" value={selectedApp.owner_dob} />
                        <DetailField label="SSN (last 4)" value={selectedApp.owner_ssn_last4 ? `••••${selectedApp.owner_ssn_last4}` : null} />
                        <DetailField label="Home Address" value={selectedApp.owner_address} />
                        <DetailField label="City / State / ZIP" value={[selectedApp.owner_city, selectedApp.owner_state, selectedApp.owner_zip].filter(Boolean).join(", ")} />
                      </DetailSection>
                    </>
                  )}

                  {/* Processing Information */}
                  {(selectedApp.monthly_volume || selectedApp.avg_ticket || selectedApp.current_processor) && (
                    <>
                      <Separator />
                      <DetailSection title="Processing Information">
                        <DetailField label="Monthly Volume" value={selectedApp.monthly_volume ? `$${Number(selectedApp.monthly_volume).toLocaleString()}` : null} />
                        <DetailField label="Avg Ticket" value={selectedApp.avg_ticket ? `$${selectedApp.avg_ticket}` : null} />
                        <DetailField label="High Ticket" value={selectedApp.high_ticket ? `$${selectedApp.high_ticket}` : null} />
                        <DetailField label="Current Processor" value={selectedApp.current_processor} />
                        <DetailField label="Accepted Cards" value={selectedApp.accepted_cards} />
                      </DetailSection>

                      {(selectedApp.ecommerce_percent || selectedApp.in_person_percent || selectedApp.keyed_percent) && (
                        <div className="grid grid-cols-3 gap-3 mt-2">
                          <DetailField label="eCommerce %" value={selectedApp.ecommerce_percent ? `${selectedApp.ecommerce_percent}%` : null} />
                          <DetailField label="In-Person %" value={selectedApp.in_person_percent ? `${selectedApp.in_person_percent}%` : null} />
                          <DetailField label="Keyed %" value={selectedApp.keyed_percent ? `${selectedApp.keyed_percent}%` : null} />
                        </div>
                      )}
                    </>
                  )}

                  {/* Notes */}
                  {(selectedApp.notes || selectedApp.message) && (
                    <>
                      <Separator />
                      <div>
                        <span className="text-xs text-muted-foreground">Notes / Message</span>
                        <p className="mt-1 text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                          {selectedApp.notes || selectedApp.message}
                        </p>
                      </div>
                    </>
                  )}

                  {/* Uploaded Documents */}
                  <Separator />
                  <div>
                    <span className="text-xs text-muted-foreground">Uploaded Documents</span>
                    <ApplicationDocsDetail applicationId={selectedApp.id} />
                  </div>

                  {/* Actions */}
                  {selectedApp.status === "pending" && (
                    <div className="flex gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => {
                          rejectApplication(selectedApp.id);
                          setSelectedApp(null);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => {
                          promptReferralAndConvert(selectedApp);
                          setSelectedApp(null);
                        }}
                      >
                        <ArrowRightCircle className="h-4 w-4 mr-1" />
                        Convert to Pipeline
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
        {/* Referral Source Prompt */}
        <Dialog open={!!referralPrompt} onOpenChange={() => setReferralPrompt(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Lead Source</DialogTitle>
            </DialogHeader>
            {referralPrompt && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Was <strong>{referralPrompt.app.company_name || referralPrompt.app.full_name}</strong> referred by someone?
                </p>
                <div className="flex items-center gap-3">
                  <Button
                    variant={referralPrompt.isReferral ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReferralPrompt(prev => prev ? { ...prev, isReferral: true } : null)}
                  >
                    Yes, a referral
                  </Button>
                  <Button
                    variant={!referralPrompt.isReferral ? "default" : "outline"}
                    size="sm"
                    onClick={() => setReferralPrompt(prev => prev ? { ...prev, isReferral: false, referredBy: '' } : null)}
                  >
                    No
                  </Button>
                </div>
                {referralPrompt.isReferral && (
                  <div className="space-y-2">
                    <Label htmlFor="referredBy">Who referred them?</Label>
                    <Input
                      id="referredBy"
                      value={referralPrompt.referredBy}
                      onChange={(e) => setReferralPrompt(prev => prev ? { ...prev, referredBy: e.target.value } : null)}
                      placeholder="e.g. John Smith, Partner X"
                      autoFocus
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={() => setReferralPrompt(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      const source = referralPrompt.isReferral ? referralPrompt.referredBy : undefined;
                      const app = referralPrompt.app;
                      setReferralPrompt(null);
                      convertToPipeline(app, source || undefined);
                    }}
                  >
                    Convert to Pipeline
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
