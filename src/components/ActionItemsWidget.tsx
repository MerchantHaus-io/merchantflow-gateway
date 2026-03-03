import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ClipboardCheck, X, Plus, Trash2, ChevronDown, Paperclip, FileText, Image as ImageIcon, Download, ExternalLink } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { playNoticeBoardSound } from "@/hooks/useNotificationSound";

interface ActionItem {
  id: string;
  title: string;
  completed: boolean;
  created_by: string;
  created_by_email: string;
  assigned_to: string[];
  created_at: string;
  completed_at: string | null;
  sort_order: number;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
}

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function ActionItemsWidget() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<ActionItem[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Listen for external open event (from MobileAppDock)
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("openNoticeBoard", handler);
    return () => window.removeEventListener("openNoticeBoard", handler);
  }, []);

  // Notify dock of open/close state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(isOpen ? "dockAppOpened" : "dockAppClosed"));
  }, [isOpen]);
  const [newTitle, setNewTitle] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch items
  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("action_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (data) setItems(data as ActionItem[]);
  }, []);

  // Fetch profiles for tagging
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("id, email, full_name").then(({ data }) => {
      if (data) setProfiles(data);
    });
  }, [user]);

  // Subscribe to realtime
  useEffect(() => {
    if (!user) return;
    fetchItems();
    const channel = supabase
      .channel("action-items-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "action_items" }, () => {
        fetchItems();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchItems]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large. Maximum size is 10 MB.");
      return;
    }
    setPendingFile(file);
    // Reset input so re-selecting same file works
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Add item (with optional attachment)
  const addItem = async () => {
    if (!newTitle.trim() || !user) return;
    setIsUploading(true);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;
    let attachmentSize: number | null = null;

    try {
      if (pendingFile) {
        const ext = pendingFile.name.split(".").pop() || "bin";
        const path = `notice-board/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(path, pendingFile, { contentType: pendingFile.type });
        if (uploadError) throw uploadError;

        const { data: signedData } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

        attachmentUrl = signedData?.signedUrl || path;
        attachmentName = pendingFile.name;
        attachmentType = pendingFile.type;
        attachmentSize = pendingFile.size;
      }

      const { error } = await supabase.from("action_items").insert({
        title: newTitle.trim(),
        created_by: user.id,
        created_by_email: user.email || "",
        assigned_to: selectedUsers,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        attachment_type: attachmentType,
        attachment_size: attachmentSize,
      });
      if (error) throw error;

      // Also create a linked task with source 'notice'
      const assigneeName = selectedUsers.length > 0 ? selectedUsers[0] : (user.email || "");
      await supabase.from("tasks").insert({
        title: newTitle.trim(),
        assignee: assigneeName,
        created_by: user.email || "",
        source: "notice",
        status: "open",
        priority: "medium",
      });
      playNoticeBoardSound();
      setNewTitle("");
      setSelectedUsers([]);
      setPendingFile(null);
      setShowUserPicker(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add action item");
    } finally {
      setIsUploading(false);
    }
  };

  // Toggle completion
  const toggleItem = async (item: ActionItem) => {
    await supabase.from("action_items").update({
      completed: !item.completed,
      completed_at: !item.completed ? new Date().toISOString() : null,
    }).eq("id", item.id);
    playNoticeBoardSound();
  };

  // Delete item
  const deleteItem = async (id: string) => {
    await supabase.from("action_items").delete().eq("id", id);
  };

  const toggleUser = (email: string) => {
    setSelectedUsers((prev) =>
      prev.includes(email) ? prev.filter((u) => u !== email) : [...prev, email]
    );
  };

  const activeItems = items.filter((i) => !i.completed);
  const completedItems = items.filter((i) => i.completed);

  const getDisplayName = (email: string) => {
    const p = profiles.find((pr) => pr.email === email);
    return p?.full_name || email.split("@")[0];
  };

  if (!user) return null;

  const unreadCount = activeItems.length;

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Desktop: tab bar / Mobile: controlled by MobileAppDock (no FAB here) */}
      {!isMobile && !isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            "fixed bottom-0 left-6 z-50 w-[220px] h-12 rounded-t-xl flex items-center gap-3 px-4",
            "bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-800",
            "text-white shadow-xl hover:shadow-2xl transition-all duration-200 ease-out",
            "border border-b-0 border-slate-600"
          )}
          aria-label="Toggle notice board"
        >
          <ClipboardCheck className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">Notice Board</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-gold text-haus-charcoal text-xs font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      ) : null}

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed z-[61] bg-card border border-border shadow-2xl flex flex-col",
              !isMobile && "rounded-t-xl border-b-0"
            )}
            style={isMobile ? {
              width: "calc(100vw - 32px)",
              maxHeight: "min(520px, calc(100vh - 200px))",
              left: 16,
              bottom: "10rem",
            } : {
              width: 380,
              maxHeight: "min(520px, calc(100vh - 100px))",
              right: "auto",
              left: 24,
              bottom: 0,
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-gold" />
                <span className="label-caps text-foreground">Notice Board</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Add new item */}
            <div className="px-4 py-3 border-b border-border space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Add action item…"
                  className="flex-1 text-sm border-b border-haus-canvas"
                  onKeyDown={(e) => e.key === "Enter" && !isUploading && addItem()}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  title="Attach file"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" onClick={addItem} disabled={!newTitle.trim() || isUploading} className="bg-gold text-haus-charcoal hover:bg-gold/90 h-8 px-3">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Pending file preview */}
              {pendingFile && (
                <div className="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1.5 text-xs">
                  {pendingFile.type.startsWith("image/") ? (
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate flex-1">{pendingFile.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {(pendingFile.size / 1024).toFixed(0)} KB
                  </span>
                  <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Tag users */}
              <div>
                <button
                  onClick={() => setShowUserPicker(!showUserPicker)}
                  className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Tag users {selectedUsers.length > 0 && `(${selectedUsers.length})`}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showUserPicker && "rotate-180")} />
                </button>
                {showUserPicker && (
                  <div className="mt-2 max-h-28 overflow-y-auto space-y-1">
                    {profiles.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 cursor-pointer text-xs">
                        <Checkbox
                          checked={selectedUsers.includes(p.email || "")}
                          onCheckedChange={() => toggleUser(p.email || "")}
                        />
                        <span className="truncate">{p.full_name || p.email}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto">
              {activeItems.length === 0 && completedItems.length === 0 && (
                <div className="p-6 text-center text-muted-foreground text-sm">
                  No action items yet
                </div>
              )}

              {activeItems.map((item) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  onToggle={toggleItem}
                  onDelete={deleteItem}
                  getDisplayName={getDisplayName}
                  canDelete={item.created_by === user.id}
                />
              ))}

              {completedItems.length > 0 && (
                <>
                  <button
                    onClick={() => setCompletedCollapsed(!completedCollapsed)}
                    className="w-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground flex items-center gap-1 border-t border-border"
                  >
                    Completed ({completedItems.length})
                    <ChevronDown className={cn("h-3 w-3 transition-transform", !completedCollapsed && "rotate-180")} />
                  </button>
                  {!completedCollapsed && completedItems.map((item) => (
                    <ActionItemRow
                      key={item.id}
                      item={item}
                      onToggle={toggleItem}
                      onDelete={deleteItem}
                      getDisplayName={getDisplayName}
                      canDelete={item.created_by === user.id}
                    />
                  ))}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ActionItemRow({
  item,
  onToggle,
  onDelete,
  getDisplayName,
  canDelete,
}: {
  item: ActionItem;
  onToggle: (item: ActionItem) => void;
  onDelete: (id: string) => void;
  getDisplayName: (email: string) => string;
  canDelete: boolean;
}) {
  const isImage = item.attachment_type?.startsWith("image/");

  return (
    <div className={cn(
      "flex items-start gap-2 px-4 py-2.5 border-b border-border/50 group hover:bg-muted/30 transition-colors",
      item.completed && "opacity-60"
    )}>
      <Checkbox
        checked={item.completed}
        onCheckedChange={() => onToggle(item)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-tight", item.completed && "line-through text-muted-foreground")}>
          {item.title}
        </p>

        {/* Attachment display */}
        {item.attachment_url && (
          <div className="mt-1.5">
            {isImage ? (
              <a href={item.attachment_url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={item.attachment_url}
                  alt={item.attachment_name || "Attachment"}
                  className="max-w-full max-h-32 rounded-md border border-border object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                href={item.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-muted/50 hover:bg-muted rounded-md px-2 py-1 text-xs text-foreground transition-colors"
              >
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[160px]">{item.attachment_name || "File"}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </a>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground">
            {getDisplayName(item.created_by_email)}
          </span>
          {item.assigned_to?.length > 0 && (
            <>
              <span className="text-[10px] text-gold">→</span>
              {item.assigned_to.map((email) => (
                <Badge key={email} variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal">
                  {getDisplayName(email)}
                </Badge>
              ))}
            </>
          )}
        </div>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
