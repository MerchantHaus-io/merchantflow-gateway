import { useEffect, useState, useRef, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Download, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Document } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * DocumentsPage lists all documents uploaded across opportunities. Users can
 * search by filename, download or delete files. Uploading new documents is
 * performed from within an opportunity's detail modal and is not supported
 * directly on this page.
 */
type DocumentWithOpportunity = Document & {
  document_type?: string | null;
  opportunity?: {
    id: string;
    account?: {
      id: string;
      name: string | null;
    } | null;
  } | null;
};

const DOCUMENT_TYPE_OPTIONS = [
  "Passport/Drivers License",
  "Bank Statement",
  "Transaction History",
  "Articles of Organisation",
  "Voided Check / Bank Confirmation Letter",
  "EIN",
  "SSN",
  "Unassigned",
];

const DocumentsPage = () => {
  // State for all documents
  const [documents, setDocuments] = useState<DocumentWithOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedDocName, setSelectedDocName] = useState<string>("all");
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Fetch documents on mount
    fetchDocuments();

    // Subscribe to real-time changes on documents table
    const channel = supabase
      .channel('documents-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents'
        },
        (payload) => {
          console.log('Real-time document update:', payload);
          // Refresh documents when any change occurs
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /**
   * Fetches all documents from the database. Results are sorted by
   * creation date descending so the newest documents appear first. Any
   * errors will trigger a toast notification.
   */
  const fetchDocuments = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, opportunity_id, file_name, file_path, file_size, content_type, uploaded_by, created_at, document_type, opportunity:opportunities (id, account:accounts (id, name))"
      )
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
   * Downloads a document using fetch + blob to avoid ad blocker issues.
   */
  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("opportunity-documents")
        .download(doc.file_path);

      if (error || !data) {
        toast.error("Failed to download file");
        return;
      }

      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download file");
    }
  };

  const handleBulkDownload = async () => {
    const docsToDownload = documents.filter((doc) => selectedDocuments.has(doc.id));
    if (docsToDownload.length === 0) return;

    setIsDownloading(true);

    for (const doc of docsToDownload) {
      try {
        const { data, error } = await supabase.storage
          .from("opportunity-documents")
          .download(doc.file_path);

        if (error || !data) {
          toast.error(`Failed to download ${doc.file_name}`);
          continue;
        }

        const url = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url;
        link.download = doc.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Small delay between downloads
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        toast.error(`Failed to download ${doc.file_name}`);
      }
    }

    setIsDownloading(false);
    toast.success("Downloads complete");
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

  // Filter documents based on the search query and selected document type
  const filteredDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = doc.file_name.toLowerCase().includes(q);
        const matchesSelectedDocType = selectedDocName && selectedDocName !== "all"
          ? (doc.document_type || "Unassigned") === selectedDocName
          : true;
        return matchesSearch && matchesSelectedDocType;
      }),
    [documents, searchQuery, selectedDocName]
  );

  const handleUpdateDocType = async (docId: string, newType: string) => {
    const { error } = await supabase
      .from("documents")
      .update({ document_type: newType })
      .eq("id", docId);

    if (error) {
      toast.error("Failed to update document type");
      return;
    }

    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, document_type: newType } : doc))
    );
    toast.success("Document type updated");
  };

  const groupedDocs = useMemo(() => {
    const groups: Record<string, { label: string; docs: DocumentWithOpportunity[] }> = {};
    filteredDocs.forEach((doc) => {
      const accountId = doc.opportunity?.account?.id ?? "unassigned";
      const accountLabel = doc.opportunity?.account?.name ?? "Unassigned account";
      const key = `${accountId}-${accountLabel}`;
      if (!groups[key]) {
        groups[key] = { label: accountLabel, docs: [] };
      }
      groups[key].docs.push(doc);
    });
    // Sort docs within each group by created_at descending (newest first)
    Object.values(groups).forEach((group) => {
      group.docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return groups;
  }, [filteredDocs]);

  const toggleAccountCollapse = (key: string) => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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

  const toggleSelectAccount = (groupKey: string, checked: boolean | string) => {
    const docsInGroup = groupedDocs[groupKey]?.docs ?? [];
    setSelectedDocuments((prev) => {
      const next = new Set(prev);
      docsInGroup.forEach((doc) => {
        if (checked) {
          next.add(doc.id);
        } else {
          next.delete(doc.id);
        }
      });
      return next;
    });
  };

  return (
    <AppLayout
      pageTitle="Documents"
      headerActions={
        <>
          <Select value={selectedDocName} onValueChange={setSelectedDocName}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filter by document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All document types</SelectItem>
              {DOCUMENT_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </>
      }
    >
      <main className="flex-1 overflow-auto p-4 lg:p-6">
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
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40">
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all documents"
                      />
                      <span className="text-sm text-muted-foreground">Select all</span>
                    </div>
                    {Object.entries(groupedDocs).map(([key, group]) => {
                      const accountAllSelected =
                        group.docs.length > 0 && group.docs.every((doc) => selectedDocuments.has(doc.id));
                      const accountPartiallySelected =
                        group.docs.some((doc) => selectedDocuments.has(doc.id)) && !accountAllSelected;
                      const isCollapsed = collapsedAccounts.has(key);

                      return (
                        <Collapsible key={key} open={!isCollapsed} onOpenChange={() => toggleAccountCollapse(key)}>
                          <div className="border border-border/60 rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border/60">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={accountAllSelected ? true : accountPartiallySelected ? "indeterminate" : false}
                                  onCheckedChange={(checked) => toggleSelectAccount(key, checked)}
                                  aria-label={`Select all documents for ${group.label}`}
                                />
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="p-1 h-auto">
                                    {isCollapsed ? (
                                      <ChevronRight className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                                <div>
                                  <p className="text-sm font-semibold leading-tight">{group.label}</p>
                                  <p className="text-xs text-muted-foreground">Account/Card grouping</p>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {group.docs.length} document{group.docs.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <CollapsibleContent>
                              <div className="p-2">
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-xs text-muted-foreground border-b border-border/40">
                                      <th className="text-left py-2 px-2 w-8"></th>
                                      <th className="text-left py-2 px-2">File Name</th>
                                      <th className="text-left py-2 px-2 w-[180px]">Document Type</th>
                                      <th className="text-left py-2 px-2 w-32">Date Created</th>
                                      <th className="text-left py-2 px-2 w-20">Size</th>
                                      <th className="text-right py-2 px-2 w-24">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.docs.map((doc) => (
                                      <tr
                                        key={doc.id}
                                        className="border-b border-border/20 last:border-0 hover:bg-muted/30"
                                      >
                                        <td className="py-2 px-2">
                                          <Checkbox
                                            checked={selectedDocuments.has(doc.id)}
                                            onCheckedChange={(checked) => toggleSelection(doc.id, checked)}
                                            aria-label={`Select ${doc.file_name}`}
                                          />
                                        </td>
                                        <td className="py-2 px-2">
                                          <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <span className="text-sm font-medium truncate">{doc.file_name}</span>
                                          </div>
                                        </td>
                                        <td className="py-2 px-2">
                                          <Select
                                            value={doc.document_type || "Unassigned"}
                                            onValueChange={(value) => handleUpdateDocType(doc.id, value)}
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {DOCUMENT_TYPE_OPTIONS.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                  {type}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </td>
                                        <td className="py-2 px-2 text-sm text-muted-foreground">
                                          {format(new Date(doc.created_at), "MMM d, yyyy")}
                                        </td>
                                        <td className="py-2 px-2 text-sm text-muted-foreground">
                                          {formatFileSize(doc.file_size)}
                                        </td>
                                        <td className="py-2 px-2">
                                          <div className="flex items-center justify-end gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleDownload(doc)}
                                            >
                                              <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleDelete(doc)}
                                            >
                                              <span className="sr-only">Delete</span>
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
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default DocumentsPage;