import { useEffect, useState, useRef } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Document } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch documents on mount
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Fetches all documents from the database. Results are sorted by
   * creation date descending so the newest documents appear first. Any
   * errors will trigger a toast notification.
   */
  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setDocuments(data);
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
   * Generates a public URL for a document and opens it in a new tab. If the
   * storage API fails to return a URL nothing happens.
   */
  const handleDownload = (doc: Document) => {
    const { data } = supabase.storage
      .from("opportunity-documents")
      .getPublicUrl(doc.file_path as string);
    if (data?.publicUrl) {
      window.open(data.publicUrl, "_blank");
    }
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
      .remove([doc.file_path as string]);
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
  const filteredDocs = documents.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return doc.file_name.toLowerCase().includes(q);
  });

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
                    {filteredDocs.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3 min-w-0">
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