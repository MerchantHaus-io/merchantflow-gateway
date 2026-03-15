import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_TYPE_OPTIONS } from "@/components/DocumentsTab";
import { Upload, Plus, Building2, FileText, X, Loader2 } from "lucide-react";
import { autoClassifyDocuments } from "@/hooks/useAutoClassify";

interface Account {
  id: string;
  name: string;
}

interface Opportunity {
  id: string;
  account_id: string;
}

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: () => void;
}

export const DocumentUploadDialog = ({ open, onOpenChange, onUploaded }: DocumentUploadDialogProps) => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Account state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");

  // File state
  const [files, setFiles] = useState<{ file: File; type: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Fetch accounts on open
  useEffect(() => {
    if (open) {
      fetchAccounts();
      // Reset state
      setSelectedAccountId(null);
      setIsCreatingAccount(false);
      setNewAccountName("");
      setFiles([]);
      setAccountSearch("");
    }
  }, [open]);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    const { data } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("status", "active")
      .order("name");
    if (data) setAccounts(data);
    setLoadingAccounts(false);
  };

  const filteredAccounts = accounts.filter((a) =>
    a.name.toLowerCase().includes(accountSearch.toLowerCase())
  );

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      toast.error("Account name is required");
      return;
    }
    const { data, error } = await supabase
      .from("accounts")
      .insert({ name: newAccountName.trim() })
      .select("id, name")
      .single();
    if (error) {
      toast.error("Failed to create account");
      return;
    }
    setAccounts((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedAccountId(data.id);
    setIsCreatingAccount(false);
    setNewAccountName("");
    toast.success(`Account "${data.name}" created`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setFiles((prev) => [
      ...prev,
      ...selected.map((f) => ({ file: f, type: DOCUMENT_TYPE_OPTIONS[0] })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateFileType = (index: number, type: string) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, type } : f)));
  };

  const handleUpload = async () => {
    if (!selectedAccountId) {
      toast.error("Please select an account first");
      return;
    }
    if (files.length === 0) {
      toast.error("Please add at least one file");
      return;
    }

    setIsUploading(true);
    try {
      // Find or create an opportunity for this account
      let opportunityId: string;

      const { data: existingOpp } = await supabase
        .from("opportunities")
        .select("id")
        .eq("account_id", selectedAccountId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existingOpp) {
        opportunityId = existingOpp.id;
      } else {
        // Create a contact + opportunity for the account
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .insert({ account_id: selectedAccountId })
          .select("id")
          .single();
        if (contactErr || !contact) throw new Error("Failed to create contact");

        const { data: newOpp, error: oppErr } = await supabase
          .from("opportunities")
          .insert({
            account_id: selectedAccountId,
            contact_id: contact.id,
            stage: "discovery",
          })
          .select("id")
          .single();
        if (oppErr || !newOpp) throw new Error("Failed to create opportunity");
        opportunityId = newOpp.id;
      }

      // Upload each file
      let successCount = 0;
      for (const { file, type } of files) {
        const path = `${opportunityId}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("opportunity-documents")
          .upload(path, file);
        if (uploadError) {
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }
        const { error: dbError } = await supabase.from("documents").insert({
          opportunity_id: opportunityId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          content_type: file.type,
          uploaded_by: user?.email,
          document_type: type,
        });
        if (dbError) {
          toast.error(`Failed to save record for ${file.name}`);
          continue;
        }
        successCount++;
      }

      if (successCount > 0) {
        toast.success(`${successCount} file${successCount !== 1 ? "s" : ""} uploaded`);
        onUploaded?.();
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Step 1: Account Selection */}
          <div className="space-y-2">
            <Label>Account *</Label>
            {!isCreatingAccount ? (
              <div className="space-y-2">
                <Input
                  placeholder="Search accounts..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="text-sm"
                />
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts...
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-border rounded-md">
                    {filteredAccounts.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No accounts found
                      </div>
                    ) : (
                      filteredAccounts.map((account) => (
                        <button
                          key={account.id}
                          type="button"
                          onClick={() => setSelectedAccountId(account.id)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors hover:bg-muted/50 ${
                            selectedAccountId === account.id
                              ? "bg-primary/10 text-primary font-medium"
                              : ""
                          }`}
                        >
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {account.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingAccount(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  New Account
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Enter account name..."
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && handleCreateAccount()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreateAccount} disabled={!newAccountName.trim()}>
                    Create Account
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsCreatingAccount(false);
                      setNewAccountName("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {selectedAccount && !isCreatingAccount && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-sm">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="font-medium">{selectedAccount.name}</span>
              </div>
            )}
          </div>

          {/* Step 2: File Selection */}
          <div className="space-y-2">
            <Label>Documents *</Label>
            <div
              className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
              <p className="text-sm font-medium">Click to select files</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                PDF, PNG, JPG, DOCX up to 50MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.xlsx,.xls"
              />
            </div>

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-sm"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1 min-w-0">{item.file.name}</span>
                    <Select
                      value={item.type}
                      onValueChange={(val) => updateFileType(idx, val)}
                    >
                      <SelectTrigger className="h-7 text-xs w-40 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt} className="text-xs">
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => removeFile(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload button */}
          <Button
            className="w-full"
            onClick={handleUpload}
            disabled={!selectedAccountId || files.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : ""}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
