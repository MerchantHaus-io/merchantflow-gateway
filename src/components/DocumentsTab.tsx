import { useState, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Download, Trash2, FileText, Loader2, Eye, CheckCircle2, XCircle, AlertTriangle, Mail } from "lucide-react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { suggestLabels, SuggestedLabel } from "@/lib/document-label-ai";
import { BulkUploadReview } from "@/components/BulkUploadReview";
import { autoClassifyDocuments } from "@/hooks/useAutoClassify";

interface Document {
  id: string;
  opportunity_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
  document_type: string | null;
}

export const DOCUMENT_TYPE_OPTIONS = [
  "Passport/Drivers License",
  "Bank Statement",
  "Transaction History",
  "Articles of Organisation",
  "Voided Check / Bank Confirmation Letter",
  "VAR/Tear Sheet",
  "EIN",
  "SSN",
];

/** Maximum number of documents allowed per label. Default is 1. */
const DOCUMENT_LABEL_LIMITS: Record<string, number> = {
  "Passport/Drivers License": 2,
  "Bank Statement": 3,
  "Transaction History": 3,
};
const DEFAULT_LABEL_LIMIT = 1;

/** Count how many docs already use each label */
function getLabelCounts(docs: Document[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const doc of docs) {
    const t = doc.document_type;
    if (t) counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

/** Check if a label is at its limit, optionally excluding a specific doc id (for re-assignment) */
function isLabelAtLimit(label: string, counts: Record<string, number>, excludeDocId?: string, docs?: Document[]): boolean {
  const max = DOCUMENT_LABEL_LIMITS[label] ?? DEFAULT_LABEL_LIMIT;
  let count = counts[label] || 0;
  // If we're changing a doc's label, don't count the doc being changed
  if (excludeDocId && docs) {
    const existing = docs.find(d => d.id === excludeDocId);
    if (existing?.document_type === label) count -= 1;
  }
  return count >= max;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Determine which document types are missing */
function getMissingDocuments(docs: Document[]): string[] {
  const counts = getLabelCounts(docs);
  const missing: string[] = [];
  for (const type of DOCUMENT_TYPE_OPTIONS) {
    const min = type === "Bank Statement" || type === "Transaction History" ? 3 : 1;
    const current = counts[type] || 0;
    if (current < min) {
      missing.push(type + (min > 1 ? ` (${current}/${min})` : ""));
    }
  }
  return missing;
}

interface DocumentsTabProps {
  opportunityId: string;
}

export const DocumentsTab = ({ opportunityId }: DocumentsTabProps) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isRequestingDocs, setIsRequestingDocs] = useState(false);
  const [bulkSuggestions, setBulkSuggestions] = useState<SuggestedLabel[] | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRequestMissingDocs = useCallback(async () => {
    setIsRequestingDocs(true);
    try {
      // Fetch opportunity → account + contact
      const { data: opp } = await supabase
        .from("opportunities")
        .select("account_id, contact_id")
        .eq("id", opportunityId)
        .single();
      if (!opp) throw new Error("Opportunity not found");

      const [{ data: account }, { data: contact }] = await Promise.all([
        supabase.from("accounts").select("name").eq("id", opp.account_id).single(),
        supabase.from("contacts").select("email, first_name").eq("id", opp.contact_id).single(),
      ]);

      if (!contact?.email) {
        toast.error("No contact email on file — cannot send request");
        return;
      }

      const missingDocs = getMissingDocuments(documents);

      // Send the docs request email
      const { error } = await supabase.functions.invoke("send-qualified-docs-request", {
        body: {
          opportunity_id: opportunityId,
          account_name: account?.name || "Your Account",
          contact_email: contact.email,
          contact_first_name: contact.first_name || "",
          missing_documents: missingDocs,
        },
      });
      if (error) throw error;

      // Notify onboarding & support internally
      const notifyEmails = ["onboarding@merchanthaus.io", "support@merchanthaus.io"];
      for (const email of notifyEmails) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (profile) {
          await supabase.from("notifications").insert({
            user_id: profile.id,
            user_email: email,
            title: "Document Request Sent",
            message: `Missing docs email sent to ${contact.first_name || ""} (${contact.email}) for ${account?.name || "account"}`,
            type: "info",
            link: `/opportunities/${opportunityId}`,
          });
        }
      }

      toast.success("Document request email sent to client");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send document request");
    } finally {
      setIsRequestingDocs(false);
    }
  }, [opportunityId, documents]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("created_at", { ascending: false });
    if (!error) setDocuments((data as Document[]) || []);
    setIsLoading(false);
  };

  // Fetch on mount
  useState(() => { fetchDocuments(); });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      const suggestions = suggestLabels(files);
      setBulkSuggestions(suggestions);
    }
    // Reset input so same files can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBulkUpload = async (assignments: { file: File; type: string }[]) => {
    setIsUploading(true);
    try {
      let successCount = 0;
      const uploadedDocIds: string[] = [];
      for (const { file, type } of assignments) {
        // Validate label limit
        const currentCount = getLabelCounts(documents)[type] || 0;
        const max = DOCUMENT_LABEL_LIMITS[type] ?? DEFAULT_LABEL_LIMIT;
        if (currentCount >= max) {
          toast.error(`"${type}" is at its limit (${max}/${max}) — skipping ${file.name}`);
          continue;
        }

        const path = `${opportunityId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("opportunity-documents")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { data: docRow, error: dbError } = await supabase.from("documents").insert({
          opportunity_id: opportunityId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          content_type: file.type,
          uploaded_by: user?.email,
          document_type: type,
        }).select("id").single();
        if (dbError) throw dbError;
        successCount++;
        // Queue AI classification for unassigned docs
        if (docRow && (!type || type === "Unassigned")) {
          uploadedDocIds.push(docRow.id);
        }
      }
      toast.success(`${successCount} file${successCount !== 1 ? "s" : ""} uploaded`);
      setBulkSuggestions(null);
      fetchDocuments();
      // Fire-and-forget AI classification for unassigned docs
      if (uploadedDocIds.length > 0) {
        autoClassifyDocuments(uploadedDocIds, (_docId, _label) => {
          fetchDocuments(); // Refresh to show new labels
        });
      }
    } catch {
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    const { data } = await supabase.storage.from("opportunity-documents").createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (doc: Document) => {
    await supabase.storage.from("opportunity-documents").remove([doc.file_path]);
    await supabase.from("documents").delete().eq("id", doc.id);
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    toast.success("Document deleted");
  };

  const handleTypeChange = async (docId: string, type: string) => {
    await supabase.from("documents").update({ document_type: type }).eq("id", docId);
    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, document_type: type } : d));
  };

  const labelCounts = useMemo(() => getLabelCounts(documents), [documents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG, DOCX up to 50MB</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.xlsx,.xls"
        />
      </div>

      {/* Request Missing Docs Button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={handleRequestMissingDocs}
        disabled={isRequestingDocs}
      >
        {isRequestingDocs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
        Request Missing Documents from Client
      </Button>

      {/* Bulk upload review with AI suggestions */}
      {bulkSuggestions && bulkSuggestions.length > 0 && (
        <BulkUploadReview
          suggestions={bulkSuggestions}
          labelCounts={labelCounts}
          labelLimits={DOCUMENT_LABEL_LIMITS}
          defaultLimit={DEFAULT_LABEL_LIMIT}
          isUploading={isUploading}
          onUpload={handleBulkUpload}
          onCancel={() => setBulkSuggestions(null)}
        />
      )}

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No documents uploaded yet
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{formatFileSize(doc.file_size)}</span>
                  <Select
                    value={doc.document_type || "Unassigned"}
                    onValueChange={(val) => handleTypeChange(doc.id, val)}
                  >
                    <SelectTrigger className="h-5 text-[10px] px-1.5 py-0 border-none bg-transparent w-auto gap-0.5 text-muted-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map(opt => {
                        const atLimit = isLabelAtLimit(opt, labelCounts, doc.id, documents);
                        const max = DOCUMENT_LABEL_LIMITS[opt] ?? DEFAULT_LABEL_LIMIT;
                        return (
                          <SelectItem key={opt} value={opt} className="text-xs" disabled={atLimit}>
                            {opt}{atLimit ? ` (${max}/${max})` : ''}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPreviewDoc(doc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Preview</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(doc)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      <DocumentPreviewDialog
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
      />
    </div>
  );
};

export default DocumentsTab;
