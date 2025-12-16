import { useEffect, useState, useRef, useMemo } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Document } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

/**
 * DocumentsPage lists all documents uploaded across opportunities. Users can
 * search by filename, download or delete files. Uploading new documents is
 * performed from within an opportunity's detail modal and is not supported
 * directly on this page.
 */
const DocumentsPage = () => {
  // State for all documents
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch documents on mount
    fetchDocuments();
  }, []);

  /**
   * Fetches all documents from the database. Results are sorted by
   * creation date descending so the newest documents appear first. Any
   * errors will trigger a toast notification.
   */
  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data);
      setSelectedDocuments(new Set());
    } else {
      toast.error("Failed to fetch documents");
    }
    setLoading(false);
  };

  /**
   * Placeholder handler for file uploads. Direct uploads are not
   * supported from this page. Users should upload documents from within an
   * opportunity. This function provides user feedback if triggered.
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    toast.error("Direct upload is not supported from this page.");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Generates a short-lived signed URL for the document to avoid exposing
   * public storage URLs. Opens the link in a new tab when available.
   */
  const handleDownload = async (doc: Document) => {
    const { data, error } = await supabase.storage
      .from("opportunity-documents")
      .createSignedUrl(doc.file_path, 60 * 10); // 10 minute expiry

    if (error) {
      toast.error("Failed to generate download link");
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleBulkDownload = async () => {
    const docsToDownload = documents.filter((doc) => selectedDocuments.has(doc.id));
    if (docsToDownload.length === 0) return;

    setIsDownloading(true);

    for (const doc of docsToDownload) {
      const { data, error } = await supabase.storage
        .from("opportunity-documents")
        .createSignedUrl(doc.file_path, 60 * 10);

      if (error || !data?.signedUrl) {
        toast.error(`Failed to generate download link for ${doc.file_name}`);
        continue;
      }

      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = doc.file_name;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
    }

    setIsDownloading(false);
    toast.success("Download links generated for selected documents");
  };

  /**
   * Deletes a document both from storage and the database. After a
   * successful deletion the document list is refreshed. Errors will
   * display toast notifications.
   */
  const handleDelete = async (doc: Document) => {
    // Remove the file from storage
    const { error: storageError } = await supabase.storage
      .from("opportunity-documents")
      .remove([doc.file_path]);
    if (storageError) {
      toast.error("Failed to delete file");
      return;
    }
    // Remove the database record
    const { error: dbError } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id);
    if (dbError) {
      toast.error("Failed to delete document record");
      return;
    }
    toast.success("Document deleted");
    fetchDocuments();
  };

  /**
   * Formats a file size in bytes into a human readable string.
   */
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Filter documents based on the search query
  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const q = searchQuery.toLowerCase();
        return doc.file_name.toLowerCase().includes(q);
      }),
    [documents, searchQuery]
  );

  useEffect(() => {
    setSelectedDocuments((prev) => {
      const validSelections = documents.filter((doc) => prev.has(doc.id)).map((doc) => doc.id);
      return new Set(validSelections);
    });
  }, [documents]);

  const toggleSelection = (id: string, checked: boolean | string) => {
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean | string) => {
    if (checked) {
      setSelectedDocuments(new Set(filteredDocs.map((doc) => doc.id)));
    } else {
      setSelectedDocuments(new Set());
    }
  };

  const allSelected = filteredDocs.length > 0 && filteredDocs.every((doc) => selectedDocuments.has(doc.id));
  const partiallySelected = selectedDocuments.size > 0 && !allSelected;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center px-4 md:px-6 border-b border-border gap-2">
            <SidebarTrigger className="md:hidden" />
            <h1 className="text-lg font-semibold text-foreground">Documents</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3 w-64"
                />
              </div>
              <Button
                onClick={handleBulkDownload}
                disabled={selectedDocuments.size === 0 || isDownloading}
              >
                <Download className="h-4 w-4 mr-2" />
                {isDownloading ? "Preparing..." : "Download selected"}
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="text-center py-16 text-muted-foreground">Loading documents...</div>
            ) : (
              <div className="space-y-2">
                {filteredDocs.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No documents found</p>
                    <p className="text-sm mt-2">
                      Try uploading documents within an opportunity to see them here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40">
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all documents"
                      />
                      <span className="text-sm text-muted-foreground">Select all</span>
                    </div>
                    {filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={selectedDocuments.has(doc.id)}
                            onCheckedChange={(checked) => toggleSelection(doc.id, checked)}
                            aria-label={`Select ${doc.file_name}`}
                          />
                          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(doc.file_size)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(doc)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(doc)}
                          >
                            <span className="sr-only">Delete</span>
                            {/* Inline SVG for trash icon to avoid extra dependency */}
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-destructive"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"
                              />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default DocumentsPage;