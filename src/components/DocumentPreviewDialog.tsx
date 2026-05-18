import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, X, Loader2, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export interface PreviewableDocument {
  id: string;
  file_name: string;
  file_path: string;
  content_type?: string | null;
  file_size?: number | null;
}

interface DocumentPreviewDialogProps {
  document: PreviewableDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucket?: string;
}

const PREVIEWABLE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/html",
];

function isPreviewable(contentType: string | null | undefined, fileName: string): boolean {
  if (contentType && PREVIEWABLE_TYPES.some((t) => contentType.startsWith(t))) return true;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "html"].includes(ext || "");
}

export const DocumentPreviewDialog = ({
  document: doc,
  open,
  onOpenChange,
  bucket = "opportunity-documents",
}: DocumentPreviewDialogProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadPreview = async () => {
    if (!doc) return;
    setLoading(true);
    setError(false);
    try {
      const { data, error: dlError } = await supabase.storage
        .from(bucket)
        .download(doc.file_path);
      if (dlError || !data) throw dlError;
      const ct = doc.content_type || "application/octet-stream";
      const blob = new Blob([data], { type: ct });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch {
      setError(true);
      toast.error("Failed to load preview");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc) return;
    try {
      const { data, error: dlError } = await supabase.storage
        .from(bucket)
        .download(doc.file_path);
      if (dlError || !data) throw dlError;
      const url = URL.createObjectURL(data);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = doc.file_name;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  };

  const handleOpenExternal = () => {
    if (blobUrl) window.open(blobUrl, "_blank");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setError(false);
    onOpenChange(next);
  };

  const canPreview = doc ? isPreviewable(doc.content_type, doc.file_name) : false;
  const ext = doc?.file_name.split(".").pop()?.toLowerCase() || "";
  const isImage = doc?.content_type?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isPdf = doc?.content_type === "application/pdf" || ext === "pdf";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (!blobUrl && !loading) loadPreview();
        }}
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm font-medium truncate pr-4">
            {doc?.file_name || "Document Preview"}
          </DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            {blobUrl && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleOpenExternal}>
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleDownload}>
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        </DialogHeader>

        {/* Preview area */}
        <div className="flex-1 min-h-0 bg-muted/30">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-40" />
              <p className="text-sm">Preview unavailable</p>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" /> Download instead
              </Button>
            </div>
          )}
          {!loading && !error && blobUrl && canPreview && (
            isImage ? (
              <div className="flex items-center justify-center h-full p-4">
                <img
                  src={blobUrl}
                  alt={doc?.file_name}
                  className="max-w-full max-h-full object-contain rounded"
                />
              </div>
            ) : isPdf ? (
              <object
                data={blobUrl}
                type="application/pdf"
                className="w-full h-full"
              >
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                  <FileText className="h-10 w-10 opacity-40" />
                  <p className="text-sm">PDF preview not supported in this browser</p>
                  <Button size="sm" variant="outline" onClick={handleDownload}>
                    <Download className="h-3 w-3 mr-1" /> Download PDF
                  </Button>
                </div>
              </object>
            ) : (
              <iframe
                src={blobUrl}
                title={doc?.file_name || "Preview"}
                className="w-full h-full border-0"
              />
            )
          )}
          {!loading && !error && blobUrl && !canPreview && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-40" />
              <p className="text-sm">This file type cannot be previewed</p>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="h-3 w-3 mr-1" /> Download file
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentPreviewDialog;
