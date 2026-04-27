import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { Download, FileText, ChevronDown, ChevronRight, Eye, Upload, Search, Trash2, Folder, HardDrive, Tag } from "lucide-react";
import { DocumentUploadDialog } from "@/components/DocumentUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Document } from "@/types/opportunity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { format } from "date-fns";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";

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
  "VAR/Tear Sheet",
  "EIN",
  "SSN",
  "Supporting Documents",
  "Unassigned",
];

const DocumentsPage = () => {
  // State for all documents
  const [documents, setDocuments] = useState<DocumentWithOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedDocName, setSelectedDocName] = useState<string>("all");
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string> | null>(null);
  const [initialCollapseApplied, setInitialCollapseApplied] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentWithOpportunity | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

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
    setFetchError(null);
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
      setFetchError("Failed to load documents. Please try again.");
      toast.error("Failed to fetch documents");
    }
    setLoading(false);
  };

  /**
   * Opens a document in the inline preview dialog.
   */

  /**
   * Downloads a document as a file attachment.
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

  const handleBulkDownload = async (docsOverride?: DocumentWithOpportunity[]) => {
    const docsToDownload = docsOverride || documents.filter((doc) => selectedDocuments.has(doc.id));
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

  const handleDownloadAll = () => {
    if (filteredDocs.length === 0) return;
    handleBulkDownload(filteredDocs);
  };

  /**
   * Deletes a document both from storage and the database. After a
   * successful deletion the document list is refreshed. Errors will
   * display toast notifications.
   */
  const handleDelete = async (doc: Document) => {
    // Remove the database record first to avoid orphaned records
    const { error: dbError } = await supabase
      .from("documents")
      .delete()
      .eq("id", doc.id);
    if (dbError) {
      toast.error("Failed to delete document record");
      return;
    }
    // Then remove the file from storage
    const { error: storageError } = await supabase.storage
      .from("opportunity-documents")
      .remove([doc.file_path]);
    if (storageError) {
      console.warn("Document record deleted but file removal failed:", storageError);
      toast.warning("Document removed but file cleanup failed — an admin may need to clean up storage.");
    } else {
      toast.success("Document deleted");
    }
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

  // Collapse all accounts by default once groupedDocs is first available
  useEffect(() => {
    const keys = Object.keys(groupedDocs);
    if (keys.length > 0 && !initialCollapseApplied) {
      setCollapsedAccounts(new Set(keys));
      setInitialCollapseApplied(true);
    }
  }, [groupedDocs, initialCollapseApplied]);

  const toggleAccountCollapse = (key: string) => {
    setCollapsedAccounts((prev) => {
      const next = new Set(prev || []);
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

  // Stats for KPI cards
  const totalDocs = documents.length;
  const totalSize = useMemo(() => documents.reduce((sum, d) => sum + (d.file_size || 0), 0), [documents]);
  const unassignedCount = useMemo(() => documents.filter(d => !d.document_type || d.document_type === "Unassigned").length, [documents]);
  const accountCount = useMemo(() => {
    const ids = new Set<string>();
    documents.forEach(d => { if (d.opportunity?.account?.id) ids.add(d.opportunity.account.id); });
    return ids.size;
  }, [documents]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <PageHeader
          icon={FileText}
          title="Documents"
          color="primary"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={filteredDocs.length === 0 || isDownloading}
              >
                <Download className="h-4 w-4 mr-1" />
                {isDownloading && selectedDocuments.size === 0 ? "Preparing…" : "Download all"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkDownload()}
                disabled={selectedDocuments.size === 0 || isDownloading}
              >
                <Download className="h-4 w-4 mr-1" />
                {isDownloading && selectedDocuments.size > 0 ? "Preparing…" : `Download selected${selectedDocuments.size > 0 ? ` (${selectedDocuments.size})` : ""}`}
              </Button>
              <Button size="sm" onClick={() => setUploadDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Upload
              </Button>
            </div>
          }
        />
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
            <StatCard label="Documents" value={totalDocs} icon={FileText} color="primary" />
            <StatCard label="Accounts" value={accountCount} icon={Folder} color="teal" />
            <StatCard label="Unassigned Type" value={unassignedCount} icon={Tag} color="warning" />
            <StatCard label="Total Size" value={formatFileSize(totalSize)} icon={HardDrive} color="muted" />
          </div>

          {/* Filters toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{filteredDocs.length} {filteredDocs.length === 1 ? 'document' : 'documents'}</span>
              {(searchQuery || selectedDocName !== "all") && (
                <button
                  onClick={() => { setSearchQuery(""); setSelectedDocName("all"); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear filters ×
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-48 text-sm"
                />
              </div>
              <Select value={selectedDocName} onValueChange={setSelectedDocName}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All document types</SelectItem>
                  {DOCUMENT_TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results */}
          <Card className="border-border/60 overflow-hidden">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Grouped by account · Click row to preview · Document type editable inline</span>
                {filteredDocs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all documents"
                    />
                    <span className="text-xs text-muted-foreground">Select all</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-2">
        {fetchError ? (
          <QueryErrorCard message={fetchError} onRetry={() => { setLoading(true); fetchDocuments(); }} />
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
              <div className="space-y-2">
                {filteredDocs.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No documents found"
                    description={searchQuery || selectedDocName !== "all"
                      ? "Adjust your filters or upload a new document."
                      : "Upload documents here, or attach them from within an opportunity."}
                    actionLabel="Upload"
                    onAction={() => setUploadDialogOpen(true)}
                    size="sm"
                  />
                ) : (
                  <div className="space-y-3">
                    {Object.entries(groupedDocs).map(([key, group]) => {
                      const accountAllSelected =
                        group.docs.length > 0 && group.docs.every((doc) => selectedDocuments.has(doc.id));
                      const accountPartiallySelected =
                        group.docs.some((doc) => selectedDocuments.has(doc.id)) && !accountAllSelected;
                      const isCollapsed = collapsedAccounts ? collapsedAccounts.has(key) : true;

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
                                              onClick={() => setPreviewDoc(doc)}
                                              title="Preview"
                                            >
                                              <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleDownload(doc)}
                                              title="Download"
                                            >
                                              <Download className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => handleDelete(doc)}
                                              title="Delete"
                                            >
                                              <span className="sr-only">Delete</span>
                                              <Trash2 className="h-4 w-4 text-destructive" />
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
            </CardContent>
          </Card>
        </div>
      </div>

      <DocumentPreviewDialog
        document={previewDoc}
        open={!!previewDoc}
        onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}
      />

      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUploaded={fetchDocuments}
      />
    </AppLayout>
  );
};

export default DocumentsPage;