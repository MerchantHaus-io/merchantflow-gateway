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

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PREVIEWABLE_TYPES = [
  "application/pdf",
  DOCX_MIME,
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/html",
];

// Note: legacy ".doc" (binary Word) is intentionally excluded — mammoth only
// parses the OOXML ".docx" format, so .doc falls back to download.
function isPreviewable(contentType: string | null | undefined, fileName: string): boolean {
  if (contentType && PREVIEWABLE_TYPES.some((t) => contentType.startsWith(t))) return true;
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ["pdf", "docx", "png", "jpg", "jpeg", "gif", "webp", "svg", "txt", "html"].includes(
    ext || "",
  );
}

function isDocxFile(contentType: string | null | undefined, fileName: string): boolean {
  if (contentType === DOCX_MIME) return true;
  return fileName.split(".").pop()?.toLowerCase() === "docx";
}

// Wrap mammoth's HTML fragment in a minimal, readable document. Rendered inside
// a sandboxed iframe (no allow-scripts), so any markup in a malicious .docx is
// inert — this is the document equivalent of the native PDF/image viewers.
function buildDocxDocument(bodyHtml: string): string {
  const body = bodyHtml.trim() || "<p>This document appears to be empty.</p>";
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#fff;color:#1a1a1a}
  body{font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
       padding:40px 48px;max-width:820px;margin:0 auto}
  h1,h2,h3,h4{line-height:1.25;margin:1.4em 0 .5em}
  h1{font-size:1.6em}h2{font-size:1.35em}h3{font-size:1.15em}
  p{margin:.6em 0}img{max-width:100%;height:auto}
  table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.95em}
  td,th{border:1px solid #d0d0d0;padding:6px 10px;text-align:left;vertical-align:top}
  ul,ol{margin:.6em 0;padding-left:1.6em}a{color:#1d4ed8}
</style></head><body>${body}</body></html>`;
}

export const DocumentPreviewDialog = ({
  document: doc,
  open,
  onOpenChange,
  bucket = "opportunity-documents",
}: DocumentPreviewDialogProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
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

      // DOCX: convert to HTML client-side (mammoth) so no document content is
      // ever sent to a third-party viewer. Loaded lazily to keep it out of the
      // main bundle.
      if (isDocxFile(doc.content_type, doc.file_name)) {
        const arrayBuffer = await data.arrayBuffer();
        const mod = await import("mammoth/mammoth.browser");
        const convertToHtml = mod.convertToHtml ?? mod.default?.convertToHtml;
        const { value } = await convertToHtml({ arrayBuffer });
        setDocxHtml(buildDocxDocument(value));
      }

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
    if (!next) setDocxHtml(null);
    setError(false);
    onOpenChange(next);
  };

  const canPreview = doc ? isPreviewable(doc.content_type, doc.file_name) : false;
  const ext = doc?.file_name.split(".").pop()?.toLowerCase() || "";
  const isImage = doc?.content_type?.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const isPdf = doc?.content_type === "application/pdf" || ext === "pdf";
  const isDocx = doc ? isDocxFile(doc.content_type, doc.file_name) : false;

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
            ) : isDocx ? (
              docxHtml ? (
                <iframe
                  srcDoc={docxHtml}
                  title={doc?.file_name || "Document preview"}
                  sandbox=""
                  className="w-full h-full border-0 bg-white"
                />
              ) : null
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
