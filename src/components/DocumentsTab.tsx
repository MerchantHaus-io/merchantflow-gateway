import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Upload, Download, Trash2, FileText, Loader2, Eye, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";

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
  "EIN",
  "SSN",
  "Unassigned",
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsTabProps {
  opportunityId: string;
}

export const DocumentsTab = ({ opportunityId }: DocumentsTabProps) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selectedDocType, setSelectedDocType] = useState("");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setPendingFiles(files);
      setShowUploadDialog(true);
    }
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setIsUploading(true);
    try {
      for (const file of pendingFiles) {
        const path = `${opportunityId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("opportunity-documents")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { error: dbError } = await supabase.from("documents").insert({
          opportunity_id: opportunityId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          content_type: file.type,
          uploaded_by: user?.email,
          document_type: selectedDocType,
        });
        if (dbError) throw dbError;
      }
      toast.success(`${pendingFiles.length} file(s) uploaded`);
      setPendingFiles([]);
      setShowUploadDialog(false);
      setSelectedDocType("Unassigned");
      fetchDocuments();
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

      {/* Pending upload confirmation */}
      {showUploadDialog && pendingFiles.length > 0 && (
        <div className="border border-border rounded-lg p-4 bg-muted/30 space-y-3">
          <p className="text-sm font-medium">{pendingFiles.length} file(s) ready to upload</p>
          <div className="text-xs text-muted-foreground">
            {pendingFiles.map(f => f.name).join(", ")}
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedDocType} onValueChange={setSelectedDocType}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Document type" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleUpload} disabled={isUploading || !selectedDocType}>
              {isUploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
              Upload
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setPendingFiles([]); setShowUploadDialog(false); }}>
              Cancel
            </Button>
          </div>
        </div>
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
                      {DOCUMENT_TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt} className="text-xs">{opt}</SelectItem>
                      ))}
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
